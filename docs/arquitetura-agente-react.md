# Arquitetura do agente ReAct MIPO

## Responsabilidade

O agente escolhe uma estratégia de comunicação dentro das ações liberadas pelo motor MIPO. Ele não calcula fórmulas por conta própria, não altera risco ou variantes e não acessa livremente banco, internet ou dados de sessão.

## Execução

1. `/api/mipo/evaluate` calcula e persiste a intervenção determinística.
2. O storefront mostra imediatamente essa mensagem.
3. `/api/mipo/explain` valida que a intervenção pertence à sessão anônima.
4. O orquestrador exige a sequência `get_product_evidence` → `calculate_mipo_risk` → `get_allowed_actions` → `final_answer`.
5. Cada ação do modelo é validada antes de executar uma tool.
6. EloAgents é chamado primeiro em cada passo. Falha, timeout ou JSON inválido acionam Groq.
7. A resposta final passa por política de ação, fidelidade, tamanho e linguagem. Uma violação preserva a mensagem determinística.

O loop aceita no máximo quatro passos. Repetição, mudança de ordem ou encerramento antecipado são rejeitados.

## Contrato dos provedores

- EloAgents: endpoint OpenAI-compatible configurado por `ELOAGENTS_BASE_URL`; JSON mode mais validação local.
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
