# Evidências da avaliação do agente

Data da execução: 16 de setembro de 2026.

## Gate offline

- corpus sintético: 22 casos;
- resultado: 22 aprovados e nenhum reprovado;
- cobertura funcional: estoque, tamanho, qualidade, ausência de risco, evidência insuficiente, entradas adversariais e falhas de provider;
- chamadas externas: nenhuma.

## Smokes externos

| Provider | Modelo | Caso | Resultado | Latência observada |
|---|---|---|---|---:|
| EloAgents | `gpt-54-mini` | `stock-at-limit` | aprovado | 4.525 ms |
| Groq | `openai/gpt-oss-20b` | `stock-at-limit` | aprovado | 1.162 ms |

Cada smoke executou uma única entrada sintética e validou contrato, ação, justificativa e mensagem autorizada. Os resultados comprovam conectividade e aderência naquele momento; não demonstram disponibilidade futura, superioridade entre providers, redução de devoluções ou impacto financeiro.

Os relatórios completos permaneceram locais e não contêm credenciais, PII, prompt bruto ou raciocínio interno.

## Contrato HTTP local

O FastAPI foi iniciado sem credenciais de provider e protegido por Bearer. O `HttpAgentAdapter` executou quatro cenários marcados como `provider_failure`; todos retornaram `200`, passaram pelos gates esperados e utilizaram fallback determinístico. O processo foi encerrado após o teste.

## Integração Next.js → Python → Supabase

Uma nova intervenção de estoque percorreu `POST /api/mipo/evaluate` e `POST /api/mipo/explain`, ambos com resposta `200`. EloAgents respondeu com `gpt-54-mini`; a execução remota registrou 3.458 ms e quatro etapas auditadas:

1. `get_product_evidence`: 1 ms;
2. `calculate_mipo_risk`: 1 ms;
3. `get_allowed_actions`: 1 ms;
4. `final_answer`: 3.448 ms.

Os tempos rápidos das tools refletem operações locais em memória; não devem ser interpretados como resolução temporal mais precisa que um milissegundo. A execução usou dados demonstrativos e não comprova impacto comercial.
