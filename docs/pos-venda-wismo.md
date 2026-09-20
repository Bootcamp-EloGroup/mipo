# Pós-venda WISMO — régua de entrega e motor de status

Este documento registra o que foi construído na Fase 1 do pós-venda e serve de guia para quem vai fazer o frontend do chatbot.

WISMO é "Where Is My Order" — a pergunta "cadê meu pedido?". Ela representa **10.765 tickets, 30,04% do atendimento** e R$ 159,7 mil de custo operacional observado, com CSAT 2,99 contra a média geral de 3,24 ([evidencias.md](evidencias.md)).

## Estado atual

| Camada | Situação |
|---|---|
| Régua de SLA derivada dos dados | pronta |
| Motor determinístico de status | pronto, 45 testes |
| Migration e tabelas | pronta, **não aplicada em banco nenhum** |
| Script de importação | pronto, validado em dry-run contra o case |
| Rotas HTTP | prontas |
| **Interface de chat** | **não existe** |
| **Agente / IA** | **não existe, e não é necessário para funcionar** |

---

## 1. O problema de dado, e como ele foi resolvido

A tabela `orders` só tinha `source_order_key`, `ordered_at`, `channel` e `payment_status`. Sem prazo, sem transportadora, sem status. A primeira ideia foi gerar o status de forma sintética determinística a partir do número do pedido — descartada, porque "o hash decidiu" não se defende numa apresentação.

Duas colunas reais que não estavam sendo importadas resolveram isso:

| Coluna | Base | Realidade |
|---|---|---|
| `tempo_entrega_real` | vendas.csv | **Real** — 27.758 linhas, zero nulos, média 8,30 dias, valores de 1 a 18 |
| `canal` | vendas.csv | **Real** — 7 canais, já importado em `orders.channel` |
| `estado` | clientes.csv | **Real** — 27 UFs |

Com isso o status deixa de ser inventado e passa a ser **derivado**: mede-se quanto as entregas realmente levaram e usa-se isso como régua.

### A descoberta que definiu o desenho

A hipótese inicial era geográfica: "cliente do Acre espera mais que o de São Paulo". **Foi testada e é falsa nesta base.**

| UF | n | p75 |
|---|---:|---:|
| PI | 11.816 | 12 |
| CE | 6.194 | 12 |
| SP | 945 | 12 |
| **AC** | **628** | **12** |
| PR | 29 | 9 |
| AP | 5 | 11 |

Todo estado bem amostrado converge para exatamente 12. Os desvios só aparecem onde n < 60 — é ruído amostral, não sinal. Acre e São Paulo têm o mesmo prazo, com amostra suficiente nos dois.

**O sinal existe, mas no canal:**

| Canal | n | p50 | p75 | p90 |
|---|---:|---:|---:|---:|
| **Marketplace** | 6.040 | 12 | **15** | 17 |
| Google Ads | 5.504 | 7 | **11** | 13 |
| Instagram Ads | 4.965 | 7 | **11** | 13 |
| Orgânico | 3.246 | 7 | **11** | 13 |
| TikTok Ads | 2.928 | 7 | **11** | 13 |
| Email Marketing | 2.812 | 7 | **11** | 13 |
| Influenciador | 2.263 | 8 | **11** | 13 |

Marketplace é 4 dias mais lento no p75. Os outros seis são idênticos. O efeito foi testado contra confundimento com geografia: aparece **dentro de cada estado**, com delta mediano de +4 dias, e a fatia de Marketplace é uniforme (~22%) em todas as UFs. É efeito de canal limpo.

Isso conecta com o que o [evidencias.md](evidencias.md) já documentava por outro caminho: Marketplace tem frete de 4,90% contra 0,95% e margem menor. Agora se sabe que também entrega mais devagar.

---

## 2. A lógica atual

### A escada de réguas

Quatro degraus, do mais específico ao mais geral. O primeiro que tiver **pelo menos um** pedido de histórico vence:

```
1. canal      -> onde existe sinal real
2. estado     -> rede de segurança se o canal for novo
3. região     -> rede de segurança se o estado não tiver histórico
4. nacional   -> último recurso, sempre existe
```

Não há corte de amostra mínima. Um canal com 1 pedido vence um estado com 6.194 — por decisão de projeto: **especificidade vence volume**. Isso contraria o `minimum_sample_size: 30` que o checkout usa em [`src/services/mipo.ts`](../src/services/mipo.ts), e é intencional. Em vez de bloquear, o tamanho da amostra e um rótulo de confiança viajam na evidência.

Com os dados atuais a escada sempre para no degrau 1, porque os 7 canais têm milhares de pedidos. Os degraus 2 a 4 são rede de segurança para um canal novo.

### Os três números da régua

| Percentil | Papel |
|---|---|
| p50 | mediana, exibida como contexto |
| **p75** | **prazo prometido** — 3 em cada 4 pedidos chegam dentro dele |
| p90 | base do limiar de escalonamento |

`critical_days = max(p90, p75 + critical_extra_days)`

O piso existe para que uma régua degenerada (p50 = p75 = p90, caso de amostra 1) não tenha banda de escalonamento com largura zero. `critical_extra_days = 2` foi calibrado medindo a banda real: `p90 − p75` é exatamente 2 em todos os escopos, então o piso **nunca alarga** uma régua bem amostrada — só protege as finas.

### Rótulo de confiança

| Amostra | Rótulo |
|---|---|
| ≥ 30 | `alta` |
| 5 a 29 | `media` |
| < 5 | `baixa` |

Nunca bloqueia nada. Só torna a qualidade da evidência auditável. Com os dados atuais nenhum escopo cai em `baixa`.

### Os dois eixos do status

Fase e sinalizador são independentes. Um pedido pode estar *em transporte E atrasado*, ou *entregue com atraso*.

```
fase:   preparing  ->  in_transit  ->  delivered
flag:   on_time    |   late
```

**Ramo entregue** (`actualDeliveryDays !== null`):
- `actual <= p75` → `on_time`
- `actual > p75` → `late`, `daysLate = actual - p75`
- `actual >= critical` → também `criticalBreach: true`
- `escalate` é **sempre false** — não há o que escalar num pedido entregue. `criticalBreach` carrega o sinal retrospectivo.

**Ramo em voo** (`actualDeliveryDays === null`):
- `elapsed < preparation_days (2)` → `preparing`, senão `in_transit`
- `elapsed <= p75` → `on_time`, senão `late`
- `elapsed >= critical` → `escalate: true`

### Data de referência (`asOf`)

Todo pedido da base é de 2023/2024 e **já foi entregue**. Sem um recurso extra, os cenários em voo nunca seriam demonstráveis.

`projectOrderAt` resolve isso: com uma data de referência anterior à entrega, o pedido **genuinamente ainda não tinha sido entregue naquele instante**. É recorte temporal de um fato, não simulação.

```ts
if (asOf >= orderedAt + actualDeliveryDays) -> continua entregue
else                                        -> actualDeliveryDays vira null, cai no ramo em voo
```

> **Regra inegociável:** com `asOf` ativo a interface **nunca** pode dizer "hoje". Tem que deixar explícito que está reproduzindo o pedido no dia N da jornada dele.

### O que o motor não faz

**Não existe nenhum dado de evento de rastreio nesta base.** Nenhuma coluna de transportadora, scan, localização ou histórico de status. O motor só declara fase, prazo prometido, tempo decorrido e a evidência por trás do prazo. Há um teste que falha se alguma mensagem citar transportadora, "último evento", "saiu para entrega" ou rastreio.

---

## 3. Exemplo passo a passo

Dois pedidos reais do case. **Mesmo estado, mesmo tempo de entrega, canais diferentes.**

| | ORD-033198 | ORD-029209 |
|---|---|---|
| Canal | Marketplace | Orgânico |
| Estado | CE | CE |
| Entrega real | 13 dias | 13 dias |

### ORD-033198 — Marketplace

```
1. busca o pedido       -> canal=Marketplace, UF=CE, actual=13
2. escada, degrau 1     -> régua do canal "Marketplace"? SIM (n=6.040) -> PARA
                           fallbackChain = ["channel"]
3. aplica a régua       -> p75=15, crítico=max(17, 15+2)=17
4. decide               -> 13 <= 15  ->  NO PRAZO, daysLate=0, breach=false
```

> "Seu pedido foi entregue em 13 dias, dentro do prazo de 15 dias estimado para o canal Marketplace a partir do histórico."

### ORD-029209 — Orgânico

```
2. escada, degrau 1     -> régua do canal "Orgânico"? SIM (n=3.246) -> PARA
3. aplica a régua       -> p75=11, crítico=max(13, 11+2)=13
4. decide               -> 13 > 11   ->  ATRASADO, daysLate=2
                           13 >= 13  ->  VIOLAÇÃO CRÍTICA
```

> "Seu pedido foi entregue em 13 dias, 2 dias além do prazo de 11 dias estimado para o canal Orgânico. Isso ficou acima do limiar de 13 dias usado para acionar o time responsável."

**Os mesmos 13 dias produzem veredictos opostos** — corretamente, porque um cliente foi prometido 15 dias e o outro 11. Pela lógica geográfica anterior os dois usariam a régua do CE (p75=12) e sairiam idênticos, apagando uma diferença que existe de verdade.

### Canal novo, sem histórico

```
2. escada, degrau 1     -> régua do canal "WhatsApp"? NÃO
   escada, degrau 2     -> régua do estado "CE"? SIM (n=6.194) -> usa esta
                           fallbackChain = ["channel", "state"]
3. aplica a régua       -> p75=12, crítico=14
4. decide               -> 13 > 12 -> atrasado, 1 dia | 13 < 14 -> sem breach
```

---

## 4. Contrato das requisições

Todas as rotas retornam erro no formato `{ "error": "mensagem em pt-BR" }`.

### `GET /api/wismo/orders/:orderKey`

A rota principal do chat. `:orderKey` é o `source_order_key` (ex: `ORD-033198`).

**Query string opcional:** `asOf` — data ISO 8601. Reproduz o pedido naquele instante.

**200 — resposta completa:**

```json
{
  "order": {
    "id": "8f2a...-...",
    "orderKey": "ORD-033198",
    "orderedAt": "2023-01-03T16:29:37.000Z",
    "channel": "Marketplace",
    "customerState": "CE",
    "actualDeliveryDays": 13
  },
  "ruleVersion": "2026-09-20.v1",
  "status": {
    "phase": "delivered",
    "flag": "on_time",
    "daysLate": 0,
    "escalate": false,
    "criticalBreach": false,
    "deliveredAt": "2023-01-16T16:29:37.000Z",
    "ruler": {
      "id": "3c91...-...",
      "scope": "channel",
      "scopeKey": "Marketplace",
      "p50Days": 12,
      "p75Days": 15,
      "p90Days": 17,
      "sampleSize": 6040
    },
    "evidence": {
      "scope": "channel",
      "scopeKey": "Marketplace",
      "fallbackChain": ["channel"],
      "sampleSize": 6040,
      "confidence": "alta",
      "p50Days": 12,
      "p75Days": 15,
      "p90Days": 17,
      "criticalDays": 17,
      "promisedAt": "2023-01-18T16:29:37.000Z",
      "criticalAt": "2023-01-20T16:29:37.000Z",
      "elapsedDays": 13,
      "deliveredAtOrigin": "derived",
      "quantitativeOrigin": "observed_or_derived_from_csv",
      "source": "tempo_entrega_real"
    },
    "message": "Seu pedido foi entregue em 13 dias, dentro do prazo de 15 dias estimado para o canal Marketplace a partir do histórico."
  }
}
```

**Vocabulário dos campos:**

| Campo | Valores | Significado |
|---|---|---|
| `status.phase` | `preparing` \| `in_transit` \| `delivered` | fase da jornada |
| `status.flag` | `on_time` \| `late` | dentro ou fora do prazo prometido |
| `status.daysLate` | inteiro ≥ 0 | dias além do p75 |
| `status.escalate` | booleano | precisa de humano **agora** (só em voo) |
| `status.criticalBreach` | booleano | ultrapassou o limiar crítico |
| `status.deliveredAt` | ISO ou ausente | só quando `phase = delivered`; é **derivado** de `orderedAt + actualDeliveryDays`, não observado |
| `evidence.fallbackChain` | array de escopos | por quais degraus a escada passou antes de parar |
| `evidence.confidence` | `alta` \| `media` \| `baixa` | qualidade da amostra |
| `evidence.promisedAt` | ISO | data prometida = `orderedAt + p75` |
| `evidence.criticalAt` | ISO | `orderedAt + criticalDays` |
| `evidence.asOf` | ISO, **só presente se enviado** | data de referência usada |
| `status.message` | string pt-BR | mensagem determinística, pronta para exibir |

**Erros:**

| Código | Quando | Corpo |
|---|---|---|
| 400 | `asOf` malformado ou anterior a `orderedAt` | `"Data de referência inválida para este pedido."` |
| 404 | pedido não existe | `"Pedido não encontrado."` |
| 409 | nenhuma importação concluída | `"Nenhuma importação concluída encontrada."` |
| 503 | Supabase indisponível / `DATA_SOURCE` não configurado | mensagem do `DataSourceUnavailableError` |

> **Atenção para o frontend:** `order.actualDeliveryDays` vem **sem projeção**, mesmo com `asOf` ativo. Reproduzindo o pedido no dia 4, esse campo ainda vale 13. **Não exiba esse campo quando `asOf` estiver em uso** — ele revela o futuro. Use `status.evidence.elapsedDays`, que respeita a projeção. Ver "próximos passos".

### `GET /api/wismo/sla`

Devolve a régua inteira. É o endpoint que **prova** de onde vêm os números — serve para uma tela de transparência ou para o painel do gestor.

**200:**

```json
{
  "ruleVersion": "2026-09-20.v1",
  "thresholds": {
    "preparationDays": 2,
    "criticalExtraDays": 2,
    "highConfidenceSample": 30,
    "mediumConfidenceSample": 5,
    "escalationGraceDays": 0
  },
  "rulers": [
    {
      "id": "3c91...",
      "scope": "channel",
      "scopeKey": "Marketplace",
      "p50Days": 12,
      "p75Days": 15,
      "p90Days": 17,
      "sampleSize": 6040,
      "confidence": "alta",
      "criticalDays": 17
    }
  ],
  "coverage": {
    "uncoveredStates": [],
    "thinScopes": [],
    "p75Min": 9,
    "p75Max": 13,
    "p75Distinct": 4
  }
}
```

`rulers` traz os 40 escopos (7 canais + 27 estados + 5 regiões + 1 nacional). `coverage` é o diagnóstico: `uncoveredStates` lista UFs sem régua, `thinScopes` os escopos com amostra abaixo do corte de confiança média.

### `POST /api/wismo/assessments`

Reconstrói a classificação retrospectiva dos pedidos históricos. **Operação administrativa**, não faz parte do fluxo do cliente.

**Corpo obrigatório:** `{ "confirm": "RECONSTRUIR" }`

**200:**

```json
{
  "processed": 27758,
  "deliveredOnTime": 20841,
  "deliveredLate": 6917,
  "criticalBreaches": 2104,
  "byScope": { "channel": 27758, "state": 0, "region": 0, "national": 0 },
  "ruleVersion": "2026-09-20.v1"
}
```

> Os números acima são ilustrativos do formato. Os reais só aparecem depois de rodar contra o banco.

**Erros:** 400 sem a frase de confirmação; 409 se `DATA_SOURCE` não for `supabase`.

---

## 5. Modelo de dados

Migration: [`202609200001_wismo_logistics_sla.sql`](../supabase/migrations/202609200001_wismo_logistics_sla.sql). Todas as tabelas com RLS habilitada e sem policies — só `service_role` acessa, pelo padrão já usado no resto do projeto.

| Tabela | Papel |
|---|---|
| `brazilian_states` | 27 UFs + região IBGE, referência estática |
| `logistics_sla` | a régua: escopo, chave, p50/p75/p90, amostra, preso ao `import_run_id` |
| `wismo_rule_sets` | política editável (`preparation_days`, `critical_extra_days`, cortes de confiança), ativado por índice único parcial em `is_active` |
| `order_delivery_assessments` | classificação retrospectiva, uma linha por `(pedido, import_run, rule_set)` |
| `orders` (+3 colunas) | `customer_key`, `customer_state`, `actual_delivery_days` — todas nullable |

**Separação deliberada:** `logistics_sla` guarda **observação** (percentis medidos). `wismo_rule_sets` guarda **política** (limiares escolhidos). `critical_days` **não é armazenado** — é calculado na leitura, porque é política aplicada a observação. Guardá-lo congelaria política dentro de uma tabela de observação.

A chave única de `order_delivery_assessments` inclui `rule_set_id` de propósito: ativar uma régua nova e reconstruir **não sobrescreve** a classificação anterior, então dá para dizer "sob a v1 estava no prazo, sob a v2 está atrasado".

---

## 6. Como rodar

```bash
# 1. schema
corepack pnpm supabase:push:dry && corepack pnpm supabase:push

# 2. régua + preenchimento de orders (dry-run primeiro, sem credenciais)
corepack pnpm data:import-logistics -- --sales <vendas.csv> --customers <clientes.csv>
corepack pnpm data:import-logistics -- --sales <vendas.csv> --customers <clientes.csv> --apply

# 3. classificação retrospectiva
curl -X POST localhost:3000/api/wismo/assessments \
  -H 'content-type: application/json' -d '{"confirm":"RECONSTRUIR"}'

# 4. consulta
curl localhost:3000/api/wismo/orders/ORD-033198
curl "localhost:3000/api/wismo/orders/ORD-033198?asOf=2023-01-07T00:00:00Z"
```

`DATA_SOURCE=local` funciona sem banco, com fixtures em [`src/data/deliveries.ts`](../src/data/deliveries.ts) — suficiente para desenvolver o frontend inteiro antes de o Supabase estar configurado.

**O script de logística nunca toca o importador do case.** Ele intersecta com os pedidos que já existem no banco e só atualiza colunas novas. Há um teste em [`tests/security-boundary.test.ts`](../tests/security-boundary.test.ts) que falha se alguém mover essa lógica para dentro de `import-case-data.mjs` — isso protegeria o pré-venda de ter suas taxas de devolução alteradas silenciosamente.

---

## 7. Próximos passos

### 7.1 Frontend — o que precisa ser construído

Nada de interface existe ainda. O backend está pronto e estável.

**Componente de chat** (`src/components/wismo-chat.tsx`)

- Histórico de mensagens, campo de entrada, estados de carregamento
- Identificação do pedido: por enquanto o cliente digita o código (`ORD-033198`). Interpretar texto livre é decisão do item 7.2
- Chamar `GET /api/wismo/orders/:key` e exibir `status.message` **diretamente** — ela já vem pronta e em pt-BR, não precisa ser reescrita no cliente

**Cliente HTTP** (`src/services/wismo-api.ts`)

Espelhar o formato de [`src/services/commerce-api.ts`](../src/services/commerce-api.ts), que já existe: um objeto com métodos finos sobre `fetch`, sem lógica.

**Estados que precisam de tratamento visual**

| Situação | Sinal na resposta |
|---|---|
| Pedido não encontrado | 404 |
| Em preparação | `phase: "preparing"` |
| Em transporte, no prazo | `phase: "in_transit"`, `flag: "on_time"` |
| Atrasado em voo | `flag: "late"`, `escalate: false` |
| Escalonamento | `escalate: true` |
| Entregue no prazo | `phase: "delivered"`, `flag: "on_time"` |
| Entregue com atraso | `phase: "delivered"`, `flag: "late"` |

**Exibição da evidência**

O diferencial do produto é mostrar **por que** o sistema chegou àquela conclusão. Sugestão de um bloco expansível com:

- de onde veio o prazo: `evidence.scopeKey` + `evidence.sampleSize` ("prazo de 15 dias, baseado em 6.040 entregas pelo Marketplace")
- o rótulo `evidence.confidence`
- `evidence.fallbackChain` quando tiver mais de um elemento — mostra que a régua específica não existia e por qual degrau se caiu

**Três regras que a interface precisa respeitar**

1. **Nunca inventar rastreio.** Não existe localização, transportadora ou "último evento" nesta base. Não crie um campo visual que sugira isso.
2. **Nunca dizer "hoje" com `asOf` ativo.** Ver 7.3.
3. **Não exibir `order.actualDeliveryDays` quando `asOf` estiver em uso.** Use `status.evidence.elapsedDays`.

**Painel do gestor** — [`src/domain/dashboard.ts`](../src/domain/dashboard.ts) não tem nenhum campo WISMO hoje. Precisa de cards de resolvidos/escalados e uma fila de pedidos críticos, ordenada por quanto cada um passou do `criticalDays`. Essa fila é literalmente o "Motor de Priorização" do nome do projeto operando.

### 7.2 Agente do chatbot

**O chatbot funciona sem agente nenhum.** O motor determinístico já produz a mensagem final. Construa a interface primeiro, contra o motor puro, e decida o agente depois.

Um detalhe importante: [`arquitetura-agente-react.md`](arquitetura-agente-react.md) descreve um loop ReAct com validação por passo e limite de 4 passos que **não existe no código**. O que existe em [`services/agent/`](../services/agent/) é um grafo linear com uma única chamada ao modelo no fim, que escolhe entre no máximo 2 frases pré-aprovadas com validação por comparação exata de string.

Há dois trabalhos possíveis para um modelo aqui, com valores bem diferentes:

**a) Interpretar pergunta em texto livre — útil e novo.** "cadê meu pedido", "pedi dia 3 e não chegou", "meu pedido sumiu". O checkout nunca precisou disso porque a entrada era um seletor. Duas abordagens:
- regra simples primeiro: regex para extrair `ORD-\d+` e palavras-chave. Resolve a maioria e não tem custo, latência nem risco
- modelo depois, se a regra provar insuficiente

**b) Escolher a redação da resposta — valor marginal.** É o que o agente do checkout faz hoje. A mensagem determinística já é clara.

**Custo de fazer (a) com o agente atual:** o grafo é ~80% acoplado ao checkout. `AgentRequest` tem `extra="forbid"`, `AgentAnswer` tem Literals fechados, e `mipo_agent_runs.intervention_id` é FK NOT NULL para `mipo_interventions` — um fluxo WISMO não tem intervenção para apontar. Exigiria extrair o loop de provedores de `graph.py` e migrar o schema de auditoria.

**Recomendação:** regra simples no início. Se for usar modelo, ele pode interpretar a pergunta, mas **nunca** decidir status, prazo ou escalonamento — isso continua determinístico, como já é no checkout.

### 7.3 Escolha da data de consulta

Este é o recurso que torna os cenários em voo demonstráveis sem criar pedido falso. Merece desenho explícito.

**Como funciona hoje:** `GET /api/wismo/orders/:key?asOf=<ISO>`. Sem o parâmetro, avalia na data atual e todo pedido histórico sai como entregue.

**O que falta decidir e construir:**

1. **Onde fica o controle.** Não pode parecer parte da experiência do cliente. Sugestão: um painel de demonstração separado, visualmente distinto — barra superior, cor diferente, rótulo "modo demonstração".

2. **Como o controle se apresenta.** Um seletor de data cru é ruim: exige o usuário saber a data do pedido. Melhor um **slider de dias desde o pedido** (0 até `actualDeliveryDays + alguns dias`), convertido para ISO antes de chamar a API. O usuário arrasta e vê o status evoluir — preparação → transporte → atrasado → escalado → entregue. Isso é a demonstração inteira num gesto.

3. **O rótulo obrigatório.** Com `asOf` ativo, a interface tem que dizer algo como *"reproduzindo o pedido no dia 4 da jornada"*. Nunca "hoje". A resposta traz `evidence.asOf` justamente para a interface poder afirmar isso com o valor que o servidor realmente usou.

4. **Pendência do backend:** hoje a rota devolve `order.actualDeliveryDays` sem projeção. Duas saídas — omitir o campo quando `asOf` estiver presente, ou devolver o pedido já projetado. A segunda é mais limpa. Precisa ser decidido antes de a interface depender do formato.

5. **Escolher os pedidos da demo.** Vale pré-selecionar 3 ou 4 códigos reais que cubram os cenários interessantes — um Marketplace no prazo, um Orgânico com violação crítica, um bem lento. O par `ORD-033198` / `ORD-029209` já é um ótimo começo: mesmo estado, mesmos 13 dias, veredictos opostos.

**Fase 2, registrada mas não implementada:** pedido criado ao vivo no checkout. Bloqueado porque `orders.import_run_id` é `not null`. A mudança limpa é torná-lo nullable e adicionar `origin data_origin not null default 'provided'`, filtrando `origin = 'provided'` em toda query de "último run completo". Não resolver com uma linha sentinela em `data_import_runs` — isso envenenaria o seletor de run e a janela de datas do painel.

---

## 8. Limites que precisam ser verbalizados

- **Não existe rastreio.** Nenhuma localização, transportadora ou evento. O sistema responde fase, prazo e decorrido — nada mais.
- **A régua por estado é plana.** AC e SP dão p75=12 igual, com 628 e 945 pedidos. A geografia foi testada e não tem sinal; o canal tem. Se perguntarem na apresentação, essa é a resposta.
- **Tempo de entrega não prediz devolução.** A taxa por faixa é 14,27% / 15,35% / 14,87% / 14,91% — plana. E pedidos devolvidos por "Atraso na entrega" têm média de 8,66 dias contra 8,29 dos não devolvidos. **Não afirme que reduzir atraso reduz devolução** — esta base não sustenta.
- **A classificação é retrospectiva.** Diz quantos pedidos históricos passaram do prazo. Não é economia capturada nem redução comprovada.
- **`deliveredAt` é derivado**, não observado: o CSV traz uma duração, não um instante de entrega.
