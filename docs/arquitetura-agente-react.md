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

## Execução

1. `/api/mipo/evaluate` calcula e persiste a intervenção determinística.
2. O storefront mostra imediatamente essa mensagem.
3. `/api/mipo/explain` valida que a intervenção pertence à sessão anônima.
4. O orquestrador exige a sequência `get_product_evidence` → `calculate_mipo_risk` → `get_allowed_actions` → `final_answer`.
5. Cada ação do modelo é validada antes de executar uma tool.
6. EloAgents é chamado primeiro. Falha, timeout ou JSON inválido tornam Groq o provedor dos passos restantes da execução, evitando repetir uma falha já observada.
7. Na resposta final, o agente escolhe uma mensagem entre as alternativas autorizadas para o risco observado. A política valida ação, justificativa e mensagem; qualquer violação preserva a mensagem determinística.

O loop aceita no máximo quatro passos. Repetição, mudança de ordem ou encerramento antecipado são rejeitados.
Cada passo recebe somente as observações estruturadas acumuladas e a próxima ação esperada; respostas anteriores do modelo não são reapresentadas como instruções.

## Contrato dos provedores

- EloAgents: endpoint OpenAI-compatible configurado por `ELOAGENTS_BASE_URL`; JSON Schema estrito mais validação local. O modelo validado para este contrato é `gpt-54-mini`, sem prefixo de provedor.
- Groq: Chat Completions com JSON Schema estrito e validação local adicional.
- Nenhum SDK ou framework de agentes é necessário.

## Persistência e privacidade

`mipo_agent_runs` armazena resultado consolidado, provedor, modelo, versões, latência e motivo de rejeição. `mipo_agent_steps` registra apenas nome da tool, status, duração e observação estruturada mínima. Prompt bruto, segredo, identificador pessoal e raciocínio interno não são persistidos.

O hash de cache inclui contexto permitido, política e prompt. Uma execução por intervenção torna o endpoint idempotente. As tabelas herdam a exclusão da intervenção; portanto, o reset demonstrativo continua restrito às sessões marcadas como demo.

## Limites

- Tamanho é atributo sintético explícito; métricas quantitativas continuam observadas ou derivadas dos CSVs.
- A mensagem gerada não pode conter números, criar desconto, urgência ou promessa.
- `insufficient_evidence` nunca autoriza recomendação.
- Métricas operacionais da IA não representam impacto financeiro ou redução de devoluções.
