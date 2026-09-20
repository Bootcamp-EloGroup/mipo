# Análises de dados — case Vértice / MIPO

Esta pasta reúne as análises que fundamentaram o **MIPO (Motor Inteligente de Priorização Operacional)**.

## Escopo executável atual

O produto executável está concentrado na jornada **pré-compra**: avaliação
determinística de produto/tamanho, explicação controlada, decisão do cliente,
auditoria e painel. O concierge de moda e a auditoria de sacola são capacidades
experimentais de demonstração e não substituem o núcleo determinístico.

O fluxo pós-compra **WISMO permanece no backlog**. Os números históricos de
atendimento sustentam sua prioridade futura, mas a aplicação ainda não consulta
pedido/tracking, não responde prazo e não registra resolução ou escalonamento WISMO.

## Ordem de leitura

1. [`analises/01_exploracao_inicial.ipynb`](analises/01_exploracao_inicial.ipynb) — exploração inicial das frentes de vendas, margem, devoluções, atendimento, estoque e clientes.
2. [`analises/02_validacao_metodologica.ipynb`](analises/02_validacao_metodologica.ipynb) — revisão de qualidade, robustez, limitações e viabilidade de modelos.
3. [`analises/03_margem_e_issue_tree.ipynb`](analises/03_margem_e_issue_tree.ipynb) — investigação focada em margem, priorização e issue tree.

## Síntese dos resultados

- 24.454 pedidos aprovados válidos e 3.639 devoluções: taxa observada de 14,88%.
- Defeito e tamanho errado somam 1.830 ocorrências, ou 50,29% das devoluções.
- WISMO representa 10.765 tickets, ou 30,04% do atendimento válido.
- O experimento temporal de risco de devolução obteve ROC-AUC 0,497; portanto, ML é **NO-GO** para o MVP.
- Estoque é um retrato pontual. Valores associados a SKUs críticos representam exposição, não perda histórica comprovada.

## Limites de interpretação

- Valores financeiros são históricos ou estimados; não representam economia capturada pelo MIPO.
- Associação estatística não demonstra causalidade.
- A base de estoque não é uma série temporal.
- A IA generativa pode explicar evidências, mas regras e cálculos determinísticos sustentam decisões.

## Dados

As bases CSV não estão incluídas porque contêm identificadores e textos em nível de cliente/pedido. Consulte [`data/README.md`](data/README.md) para o contrato esperado.

## Documentação complementar

- [`docs/evidencias.md`](docs/evidencias.md) — relatório rastreável de evidências.
- [`docs/roadmap.md`](docs/roadmap.md) — roadmap técnico em ordem de dependências.
- [`docs/mvp.md`](docs/mvp.md) — definição funcional e técnica do MVP.

## E-commerce e Supabase

O storefront Vértice funciona em dois modos explícitos:

- `DATA_SOURCE=local`: fixtures públicas para desenvolvimento visual.
- `DATA_SOURCE=supabase`: catálogo, estoque, carrinho anônimo e decisões MIPO persistidos no projeto remoto.

Não existe fallback silencioso entre os modos. O checkout permanece exclusivamente visual e não cria pedido ou cobrança.

### Configuração do zero

```bash
corepack pnpm install
./scripts/setup-supabase.sh
corepack pnpm dev
```

O assistente cria `.env.local`, orienta a criação do `mipo-dev`, executa o dry-run das migrations e pede confirmação antes de qualquer escrita. Credenciais secretas não devem ser enviadas pelo chat ou commitadas.

Para configuração manual, copie `.env.example` para `.env.local`, use uma Secret key somente no servidor e execute:

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

### Ingestão do case

O comando é dry-run por padrão:

```bash
corepack pnpm data:import -- \
  --sales /caminho/vendas.csv \
  --inventory /caminho/estoque.csv
```

Depois de revisar o resumo, grave no Supabase com `--apply`. O importador calcula SHA-256 dos dois arquivos, rejeita conteúdo repetido, coloca linhas inválidas em quarentena e só torna uma execução utilizável quando ela chega ao estado `completed`.

Os atributos de tamanho e cor inexistentes nos CSVs são armazenados com origem `synthetic`. Estoque é registrado como snapshot com data derivada da importação, nunca como série histórica.

### API server-side

- `GET /api/products` e `GET /api/products/:id`
- `GET /api/cart`, `DELETE /api/cart`
- `POST /api/cart/items`
- `PATCH /api/cart/items/:id`, `DELETE /api/cart/items/:id`
- `POST /api/mipo/evaluate`
- `POST /api/mipo/explain`
- `POST /api/mipo/decisions`
- `GET /api/dashboard`

Todas as tabelas têm RLS habilitada e não concedem acesso a `anon` ou `authenticated`. A aplicação acessa a Data API apenas pelas rotas do Next.js.

## Painel e demonstração

O painel agregado fica em `/painel`, sem identificadores completos de sessão ou dados pessoais. O catálogo diferencia explicitamente tipo de produto e significado da variante; a experiência atual seleciona somente itens de `Moda` para o fluxo de tamanho.

Consulte [`docs/roteiro-demonstracao.md`](docs/roteiro-demonstracao.md). Para remover apenas sessões criadas explicitamente com `MIPO_DEMO_MODE=true`, execute `corepack pnpm data:reset-demo`; catálogo e histórico estão fora do escopo da função.

## Agente ReAct

Com `AI_EXPLANATIONS_ENABLED=true`, a avaliação determinística aparece imediatamente e o frontend solicita uma explicação enriquecida em segundo plano. O agente executa, em ordem, as tools `get_product_evidence`, `calculate_mipo_risk` e `get_allowed_actions`; somente então pode produzir `final_answer`. EloAgents é o provedor primário, Groq é o fallback e a mensagem determinística preserva a experiência se ambos falharem.

Configure somente no servidor: `ELOAGENTS_API_KEY`, `ELOAGENTS_MODEL` e `GROQ_API_KEY`. O agente não acessa livremente o banco ou a internet, não mantém memória do usuário e não pode alterar risco, variante, estoque ou elegibilidade calculados pelo motor MIPO. Execuções e passos são auditados sem prompt bruto ou raciocínio interno.

### Runtime Python

O agente roda em FastAPI + LangGraph e mantém um contrato estreito com a rota Next.js. Inicie com `cd services/agent && uv sync --dev && uv run uvicorn mipo_agent.main:app --reload` e mantenha `MIPO_PYTHON_AGENT_URL=http://127.0.0.1:8000`. Se o processo Python estiver indisponível, a rota preserva a mensagem determinística; não existe um segundo agente em TypeScript.

O desenho técnico e seus limites estão em [`docs/arquitetura-agente-react.md`](docs/arquitetura-agente-react.md).

O próximo incremento planejado — corpus de avaliação, gates de segurança, métricas operacionais e hardening do runtime — está especificado em [`docs/specs/avaliacao-e-prontidao-agente.md`](docs/specs/avaliacao-e-prontidao-agente.md).

### Avaliação do agente

O gate padrão é totalmente offline e não requer credenciais:

```bash
cd services/agent
uv sync --dev
uv run mipo-eval run --adapter offline
```

Ele executa 22 cenários sintéticos e grava relatórios ignorados pelo Git em `services/agent/evals/results/`. O adapter HTTP valida o processo FastAPI completo. O modo `live` só executa com `--confirm-external-calls`; um smoke externo não substitui os gates determinísticos nem comprova impacto de negócio.

Os últimos resultados sanitizados estão em [`docs/evidencias-avaliacao-agente.md`](docs/evidencias-avaliacao-agente.md).
