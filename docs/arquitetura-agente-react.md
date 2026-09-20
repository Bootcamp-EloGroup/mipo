# Arquitetura do agente ReAct MIPO

## Organização do código

- `src/app`: páginas e rotas HTTP do Next.js.
- `src/components`: storefront e painel.
- `src/domain`: contratos compartilhados do ecommerce e do agente.
- `src/server`: adapters e implementações executadas somente no servidor.
- `src/services`: regras determinísticas e clientes usados pela aplicação.
- `services/agent`: processo Python com FastAPI, Pydantic e LangGraph.
- `supabase`: migrations e funções do banco.

O Next.js é o dono da sessão e da experiência web. O processo Python fica atrás da interface `explain(context) -> answer`; detalhes de LangGraph e dos provedores não atravessam esse seam.

## Responsabilidade

O agente escolhe uma estratégia de comunicação dentro das ações liberadas pelo motor MIPO. Ele não calcula fórmulas por conta própria, não altera risco ou variantes e não acessa livremente banco, internet ou dados de sessão.

## Execução e endpoints unificados

O serviço Python centraliza as capacidades de inteligência artificial da aplicação através de contratos estritos:

1. `POST /v1/explain`: Executa a orquestração LangGraph (`get_product_evidence` → `calculate_mipo_risk` → `get_allowed_actions` → `final_answer`). Suporta cache semântico em memória (`< 1ms`) para contextos recorrentes e geração explicativa com validação por Guardrails Semânticos (bloqueando termos de desconto, promessas irreais ou tamanhos divergentes do motor determinístico).
2. `POST /v1/chat`: MIPO Concierge experimental do atelier Vértice. Interpreta dúvidas sobre medidas, silhueta e composição de look, gerando sugestões de ação estruturadas (`select_size` e `view_product`) validadas contra o catálogo e o contexto mantidos pelo servidor. Não representa o fluxo WISMO, que permanece no backlog.
3. `POST /v1/audit-cart`: Auditoria multi-item da sacola para detecção de disparidade de tamanhos em peças de vestuário e geração de guia de conservação têxtil (linho, tricot, alfaiataria, cosméticos).
4. `GET /v1/cache` e `POST /v1/cache/clear`: Observabilidade e controle do cache de contexto do agente.

O Next.js consulta primariamente o serviço Python via [`mipo-python-agent.ts`](../src/server/mipo-python-agent.ts). Em caso de indisponibilidade ou execução offline, mantém fallback transparente e seguro para as regras locais do atelier.

As rotas web usam [`mipo-assistant.ts`](../src/server/mipo-assistant.ts) como
adaptador fino. Catálogo, prompts, parsing e ações do concierge pertencem ao
serviço Python; o fallback TypeScript não replica essas políticas nem sugere
ações quando o serviço está indisponível.

## Contrato dos provedores e guardrails

- EloAgents: endpoint OpenAI-compatible configurado por `ELOAGENTS_BASE_URL`; JSON Schema estrito mais validação local. Modelo validado: `gpt-54-mini`.
- Groq: fallback com Chat Completions e validação local estrita.
- Guardrails Semânticos: a resposta final precisa pertencer ao conjunto de mensagens autorizadas pelo motor determinístico. Termos comerciais proibidos, tamanhos divergentes ou texto livre não autorizado provocam fallback determinístico.

## Persistência e privacidade

`mipo_agent_runs` armazena resultado consolidado, provedor, modelo, versões, latência e motivo de rejeição. `mipo_agent_steps` registra apenas nome da tool, status, duração e observação estruturada mínima. Prompt bruto, segredo, identificador pessoal e raciocínio interno não são persistidos.

O cache semântico em memória usa hash canônico de todo o contexto que pode alterar a resposta, incluindo evidência, mensagem, variantes, seleção e versões de prompt/política. As entradas expiram por TTL. Uma execução por intervenção torna o endpoint idempotente. As tabelas herdam a exclusão da intervenção; portanto, o reset demonstrativo continua restrito às sessões marcadas como demo.

## Limites

- Tamanho é atributo sintético explícito; métricas quantitativas continuam observadas ou derivadas dos CSVs.
- A mensagem gerada não pode conter números, criar desconto, urgência ou promessa.
- `insufficient_evidence` nunca autoriza recomendação.
- Métricas operacionais da IA não representam impacto financeiro ou redução de devoluções.
