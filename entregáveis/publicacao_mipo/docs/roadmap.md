# Roadmap cronologico de desenvolvimento - MIPO

## Objetivo

Desenvolver um MVP demonstravel do **MIPO (Motor Inteligente de Priorizacao Operacional)** em duas semanas, com dois fluxos principais:

- **Pre-compra:** assistente no checkout para reduzir devolucoes evitaveis.
- **Pos-compra:** chatbot WISMO para reduzir tickets de rastreamento e escalar excecoes.

O MVP deve provar o fluxo:

```text
dados -> deteccao de risco/status -> recomendacao/resposta -> registro -> painel -> impacto estimado
```

---

## Dia 0 - Alinhamento do escopo tecnico

Antes de desenvolver, a equipe deve fechar o recorte tecnico e funcional do MVP.

O produto nao sera uma plataforma completa de e-commerce, atendimento ou estoque. Ele sera uma demonstracao integrada com dados controlados. O escopo tecnico deve ficar restrito a:

- uma base local mockada ou derivada dos CSVs;
- regras deterministicas para risco e WISMO;
- interface navegavel;
- persistencia simples dos eventos;
- painel operacional;
- simulador de impacto.

Decisoes que precisam estar fechadas:

- o MVP usara dados locais, nao integracoes reais;
- o chatbot sera de WISMO, nao atendimento generico;
- o motor de risco sera baseado em regras, nao ML;
- impacto financeiro sera estimado, nao economia comprovada;
- ruptura de SKU entra como criterio de priorizacao e roadmap, nao como fluxo principal.

Arquitetura alvo:

```text
mock-data
   -> services de risco e WISMO
   -> telas de checkout/chatbot
   -> event store local
   -> painel do gestor
   -> simulador
```

Sugestao de stack:

| Camada | Opcao recomendada para MVP |
|---|---|
| Frontend | React ou Next.js |
| Dados | JSON local, SQLite ou estado em memoria |
| Regras | TypeScript/JavaScript ou Python |
| API | Opcional; pode ser service local no frontend |
| Persistencia | JSON/LocalStorage/SQLite |
| Graficos | Recharts ou cards/tabelas simples |
| IA generativa | Opcional, apenas para texto explicativo |

---

## Dia 1 - Preparacao dos dados e cenarios da demo

O primeiro passo pratico e construir uma massa pequena e controlada. A demo nao deve depender da base inteira nem de tratamento pesado durante a apresentacao.

### 1.1 Criar dados de produto

Criar uma estrutura `products` com produtos suficientes para cobrir os cenarios:

- produto com risco de tamanho errado;
- produto com risco de defeito;
- produto com baixa disponibilidade;
- produto sem risco;
- produto similar para recomendacao alternativa.

Exemplo de entidade:

```json
{
  "productId": "PROD-001",
  "skuId": "SKU-001-M",
  "name": "Calca Wide Leg Preta",
  "category": "Moda",
  "size": "M",
  "price": 189.9,
  "stockAvailable": 2,
  "returnRate": 0.34,
  "mainReturnReason": "tamanho_pequeno",
  "alternativeSkuId": "SKU-001-G",
  "similarProductId": "PROD-002"
}
```

### 1.2 Criar dados de devolucao

Criar uma estrutura `returnHistory` com:

- taxa de devolucao por produto;
- taxa por tamanho;
- motivo principal;
- frete reverso medio;
- margem exposta estimada.

Os numeros de sustentacao devem vir do relatorio de evidencias:

- taxa de devolucao aprovada: 14,88%;
- devolucoes por tamanho errado: 911;
- devolucoes por defeito: 919;
- defeito + tamanho: 50,29% das devolucoes;
- receita associada a devolucoes: R$ 2,50 mi;
- margem exposta: R$ 1,35 mi.

### 1.3 Criar dados de pedido e tracking

Criar uma estrutura `orders` com pelo menos cinco cenarios:

- pedido dentro do prazo;
- pedido atrasado;
- pedido sem atualizacao;
- pedido entregue;
- pedido inexistente ou inconclusivo.

Exemplo:

```json
{
  "orderId": "ORD-1001",
  "customerName": "Cliente Demo",
  "status": "em_transporte",
  "promisedDate": "2026-09-15",
  "lastTrackingEvent": "Saiu do centro de distribuicao",
  "lastTrackingDate": "2026-09-10T14:00:00",
  "isLate": false,
  "needsEscalation": false
}
```

### 1.4 Criar estrutura de eventos

Definir um event store local para registrar:

- eventos de checkout;
- eventos de chatbot;
- escalonamentos;
- impacto estimado.

Modelo comum:

```json
{
  "eventId": "EVT-001",
  "eventType": "checkout_intervention",
  "source": "checkout",
  "riskType": "devolucao_por_tamanho",
  "riskLevel": "alto",
  "recommendedAction": "recomendar_tamanho_acima",
  "customerDecision": "accepted",
  "estimatedImpact": 22.5,
  "createdAt": "2026-09-11T10:00:00"
}
```

Entrega do dia:

- arquivo ou modulo `mockData`;
- entidades principais definidas;
- cenarios da demo congelados.

---

## Dia 2 - Implementacao do motor de risco do checkout

Depois dos dados, a prioridade e criar o servico que transforma produto/tamanho em risco e recomendacao.

### 2.1 Criar funcao principal

Implementar uma funcao com assinatura semelhante a:

```ts
evaluateCheckoutRisk(input: {
  skuId: string;
  selectedSize: string;
  quantity: number;
}): CheckoutRiskResult
```

Retorno esperado:

```ts
type CheckoutRiskResult = {
  shouldIntervene: boolean;
  riskLevel: "low" | "medium" | "high";
  riskType: "size" | "defect" | "stock" | "expectation" | "none";
  evidence: EvidenceItem[];
  recommendedAction: RecommendationAction;
  customerMessage: string;
  managerExplanation: string;
  estimatedImpact: number;
};
```

### 2.2 Implementar regras

Regras minimas:

```text
Se taxa de devolucao do tamanho selecionado >= limite
e motivo principal = tamanho pequeno
e tamanho acima disponivel
entao recomendar tamanho acima.
```

```text
Se produto tem motivo principal = defeito
e existe produto similar
entao sugerir produto similar ou confirmacao consciente.
```

```text
Se estoque disponivel <= limite
entao alertar baixa disponibilidade e sugerir alternativa.
```

```text
Se nenhum risco relevante
entao seguir checkout normal.
```

### 2.3 Definir evidencias explicaveis

Cada recomendacao deve carregar evidencias, por exemplo:

```json
[
  {
    "label": "Taxa de devolucao do tamanho M",
    "value": "34%",
    "interpretation": "acima do limite definido para intervencao"
  },
  {
    "label": "Motivo dominante",
    "value": "tamanho pequeno",
    "interpretation": "sugere recomendacao de tamanho acima"
  }
]
```

Entrega do dia:

- motor de risco funcional;
- testes manuais para 4 cenarios;
- retorno estruturado pronto para o frontend.

---

## Dia 3 - Implementacao do checkout inteligente

Com o motor pronto, criar a experiencia visual do cliente.

### 3.1 Criar tela de produto

A tela deve exibir:

- nome do produto;
- preco;
- categoria;
- tamanhos disponiveis;
- estoque/disponibilidade;
- botao de adicionar ao carrinho.

### 3.2 Conectar tela ao motor de risco

Ao selecionar tamanho ou adicionar ao carrinho:

```text
selectedSku -> evaluateCheckoutRisk -> recomendacao ou checkout normal
```

### 3.3 Criar componente de recomendacao

O componente deve exibir:

- titulo curto;
- mensagem para cliente;
- evidencia simplificada;
- botao para aceitar;
- botao para continuar mesmo assim.

Exemplo:

```text
Este modelo costuma ter forma menor.
Clientes que escolheram M devolveram este item com mais frequencia por ajuste apertado.
Recomendamos o tamanho G.

[Usar tamanho G] [Continuar com M]
```

### 3.4 Implementar decisoes do cliente

Se aceitar:

- atualizar SKU/tamanho no carrinho;
- registrar evento `accepted`.

Se ignorar:

- manter SKU/tamanho original;
- registrar evento `ignored`.

Entrega do dia:

- fluxo pre-compra navegavel;
- recomendacao visivel;
- aceite/recusa funcionando.

---

## Dia 4 - Registro de intervencoes e event store

Neste ponto, toda acao da experiencia do cliente precisa virar dado operacional.

### 4.1 Criar event store

Pode ser implementado de forma simples:

- array em memoria;
- LocalStorage;
- JSON local;
- SQLite, se houver backend.

Para MVP, LocalStorage ou estado global ja resolve.

### 4.2 Criar evento de checkout

Campos minimos:

```ts
type CheckoutInterventionEvent = {
  eventId: string;
  productId: string;
  originalSkuId: string;
  recommendedSkuId?: string;
  riskType: string;
  riskLevel: string;
  evidence: EvidenceItem[];
  recommendedAction: string;
  customerDecision: "accepted" | "ignored";
  estimatedImpact: number;
  createdAt: string;
};
```

### 4.3 Disponibilizar eventos para o painel

Criar um service:

```ts
getCheckoutEvents(): CheckoutInterventionEvent[]
```

Tambem criar agregacoes:

- total de intervencoes;
- recomendacoes aceitas;
- recomendacoes ignoradas;
- taxa de aceite;
- impacto potencial acumulado.

Entrega do dia:

- eventos sendo registrados;
- agregacoes basicas disponiveis;
- base para o painel pronta.

---

## Dia 5 - Implementacao do chatbot WISMO

O chatbot deve ser um fluxo por regras, focado apenas em status de pedido.

### 5.1 Criar interface do chat

Elementos minimos:

- campo para digitar pergunta ou numero do pedido;
- historico de mensagens;
- resposta do bot;
- botao/opcao de escalonamento quando necessario.

### 5.2 Criar servico WISMO

Assinatura sugerida:

```ts
handleWismoQuery(input: {
  orderId: string;
  message: string;
}): WismoResponse
```

Retorno:

```ts
type WismoResponse = {
  status: "resolved" | "escalated" | "not_found";
  customerMessage: string;
  orderStatus?: string;
  lastTrackingEvent?: string;
  promisedDate?: string;
  escalationReason?: string;
};
```

### 5.3 Implementar regras

Pedido dentro do prazo:

```text
Responder status + ultimo evento + previsao.
```

Pedido atrasado:

```text
Explicar atraso + informar proximo passo + registrar atencao.
```

Pedido sem atualizacao:

```text
Explicar ausencia de atualizacao + escalar com contexto.
```

Pedido entregue:

```text
Informar entrega + oferecer suporte caso cliente conteste.
```

Pedido nao encontrado:

```text
Solicitar revisao do numero do pedido.
```

### 5.4 Registrar eventos WISMO

Campos minimos:

```ts
type WismoEvent = {
  eventId: string;
  orderId: string;
  status: "resolved" | "escalated" | "not_found";
  customerMessage: string;
  escalationReason?: string;
  createdAt: string;
};
```

Entrega do dia:

- chatbot WISMO funcionando;
- pelo menos 5 cenarios testaveis;
- eventos WISMO sendo registrados.

---

## Dia 6 - Painel do gestor

Com checkout e WISMO gerando eventos, construir o painel.

### 6.1 Criar cards de resumo

Cards minimos:

- intervencoes no checkout;
- recomendacoes aceitas;
- taxa de aceite;
- WISMO resolvidos pelo bot;
- WISMO escalados;
- impacto estimado.

### 6.2 Criar tabelas operacionais

Tabelas minimas:

- eventos de checkout;
- eventos WISMO;
- produtos com maior risco;
- pedidos escalados.

### 6.3 Criar detalhe de caso

Para uma intervencao de checkout:

- produto original;
- recomendacao;
- evidencias;
- decisao;
- impacto estimado;
- limite da estimativa.

Para WISMO:

- pedido;
- status;
- ultimo evento;
- resposta enviada;
- resolvido ou escalado;
- motivo do escalonamento.

Entrega do dia:

- painel consumindo eventos reais da demo;
- cards e tabelas atualizando conforme interacoes.

---

## Dia 7 - Simulador de impacto

O simulador deve mostrar potencial, nao economia garantida.

### 7.1 Criar premissas editaveis

Premissas para devolucoes:

- compras impactadas;
- percentual de compras em risco;
- taxa de aceite da recomendacao;
- reducao esperada de devolucao apos aceite;
- frete reverso medio.

Premissas para WISMO:

- volume de tickets WISMO;
- taxa de resolucao pelo bot;
- custo medio por ticket;
- percentual de casos que ainda escalam.

### 7.2 Implementar formulas

Exemplo:

```text
compras_em_risco = compras_impactadas * taxa_risco
clientes_que_aceitam = compras_em_risco * taxa_aceite
devolucoes_evitaveis = clientes_que_aceitam * reducao_devolucao
frete_potencial = devolucoes_evitaveis * frete_reverso_medio
```

```text
tickets_resolvidos = tickets_wismo * taxa_resolucao_bot
custo_potencial = tickets_resolvidos * custo_medio_ticket
```

### 7.3 Comunicar limites

Sempre exibir:

- "impacto estimado";
- "potencialmente evitado";
- "depende de validacao em producao";
- "nao representa economia capturada".

Entrega do dia:

- simulador funcionando;
- premissas editaveis;
- resultados atualizados dinamicamente.

---

## Dia 8 - Integracao da jornada completa

Este dia conecta as partes e remove quebras entre telas.

### 8.1 Definir navegacao

Fluxo sugerido:

```text
Painel -> Produto/Checkout -> Evento -> Painel
Painel -> Chatbot -> Evento -> Painel
Painel -> Simulador
```

### 8.2 Sincronizar estado

Garantir que:

- checkout registra evento;
- painel le evento;
- chatbot registra evento;
- painel le evento;
- simulador usa premissas coerentes;
- dados nao somem durante a demo.

### 8.3 Tratar estados vazios

Criar estados para:

- nenhum evento ainda;
- nenhum WISMO escalado;
- nenhum risco detectado;
- pedido nao encontrado;
- produto sem alternativa.

Entrega do dia:

- demo ponta a ponta funcionando;
- estado compartilhado consistente.

---

## Dia 9 - Polimento visual e UX

Com a demo funcional, melhorar clareza e apresentacao.

### 9.1 Polir checkout

- melhorar card de produto;
- deixar recomendacao clara;
- evitar tom alarmista;
- destacar acao primaria;
- mostrar evidencia sem excesso tecnico.

### 9.2 Polir chatbot

- deixar mensagens curtas;
- padronizar tom;
- mostrar status e previsao;
- deixar escalonamento claro;
- evitar parecer chatbot generico.

### 9.3 Polir painel

- priorizar cards principais;
- organizar tabelas;
- destacar impacto estimado;
- mostrar limites;
- evitar visual de dashboard abstrato.

### 9.4 Polir simulador

- organizar premissas;
- destacar resultados;
- explicar que e cenario;
- evitar "economia garantida".

Entrega do dia:

- MVP com cara de produto;
- textos revisados;
- visual pronto para apresentacao.

---

## Dia 10 - Roteiro, validacao e congelamento

Ultimo dia deve ser usado para reduzir risco de apresentacao.

### 10.1 Criar roteiro de demo

Ordem recomendada:

```text
1. Problema-raiz e issue tree.
2. Evidencias: devolucao, WISMO, ruptura.
3. Por que priorizamos devolucao + WISMO.
4. Demo pre-compra.
5. Demo pos-compra.
6. Painel do gestor.
7. Simulador de impacto.
8. Limites e roadmap.
```

### 10.2 Testar fluxo completo

Testar:

- checkout com recomendacao aceita;
- checkout com recomendacao ignorada;
- checkout sem risco;
- chatbot dentro do prazo;
- chatbot atrasado;
- chatbot sem atualizacao;
- escalonamento;
- painel atualizado;
- simulador funcionando.

### 10.3 Preparar plano B

Criar:

- prints das telas principais;
- video curto da demo, se possivel;
- dados congelados;
- roteiro impresso;
- backup do projeto.

Entrega do dia:

- versao final congelada;
- demo ensaiada;
- plano B pronto.

---

## Dependencias tecnicas entre etapas

```text
Dados mockados
  -> motor de risco
      -> checkout
          -> eventos de checkout
              -> painel

Pedidos mockados
  -> motor WISMO
      -> chatbot
          -> eventos WISMO
              -> painel

Eventos + premissas
  -> simulador
      -> narrativa de impacto
```

---

## Artefatos tecnicos esperados

Ao final do desenvolvimento, o projeto deve conter artefatos equivalentes a:

```text
src/
  data/
    products.json
    orders.json
    return-history.json
  services/
    checkout-risk.ts
    recommendation.ts
    wismo.ts
    impact-simulator.ts
    event-store.ts
  components/
    ProductPage
    RecommendationCard
    WismoChat
    ManagerDashboard
    ImpactSimulator
  pages/
    checkout
    chatbot
    dashboard
```

Se o projeto for feito sem React/Next, a mesma separacao ainda vale conceitualmente:

```text
dados
regras
telas
eventos
simulador
demo
```

---

## Criterios tecnicos de pronto

O MVP esta pronto quando:

- o checkout detecta risco e exibe recomendacao;
- aceitar recomendacao altera o carrinho;
- ignorar recomendacao mantem o carrinho;
- cada decisao gera evento;
- o chatbot responde ao menos cinco cenarios WISMO;
- casos criticos sao escalados com contexto;
- eventos aparecem no painel;
- simulador recalcula impacto ao alterar premissas;
- dados da demo ficam congelados;
- o fluxo completo roda sem editar codigo durante a apresentacao.

---

## Limites que devem aparecer na entrega

- O MVP usa regras, nao modelo preditivo de devolucao.
- O chatbot e focado em WISMO.
- Ruptura e usada como priorizacao, nao como perda historica comprovada.
- Impacto financeiro e estimado.
- Nao ha integracao real com ERP/WMS/TMS.
- Nao ha reposicao automatica.
- Nao ha otimizacao automatica de marketing.

