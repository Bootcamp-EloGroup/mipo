# Runtime e avaliação do agente MIPO

## Desenvolvimento

```bash
uv sync --dev
uv run uvicorn mipo_agent.main:app --reload
```

Endpoints:

- `GET /health`: processo vivo;
- `GET /ready`: grafo carregado, sem chamar providers;
- `POST /v1/explain`: executa ou reaproveita uma intervenção concluída.

Se `MIPO_PYTHON_AGENT_TOKEN` estiver configurado, `/v1/explain` exige `Authorization: Bearer <token>`. O orçamento total usa `MIPO_AGENT_TOTAL_TIMEOUT_MS`; os providers continuam limitados individualmente por `AI_PROVIDER_TIMEOUT_MS`.

## Avaliação offline

```bash
uv run mipo-eval run --adapter offline
```

Esse é o gate obrigatório: não acessa rede, executa os 22 casos de `evals/cases.jsonl` e exige aprovação integral dos verificadores determinísticos.

## Avaliação HTTP

Com o FastAPI em execução:

```bash
uv run mipo-eval run --adapter http --url http://127.0.0.1:8000
```

O token é lido de `MIPO_PYTHON_AGENT_TOKEN`. Esse modo valida serialização, autenticação, timeout e o contrato HTTP.
Use `--tag provider_failure` para um smoke local sem credenciais externas.

## Smoke externo

```bash
uv run mipo-eval run --adapter live --provider eloagents --confirm-external-calls
uv run mipo-eval run --adapter live --provider groq --confirm-external-calls
```

O comando exige confirmação explícita porque pode consumir cotas de EloAgents e Groq. Use apenas casos sintéticos. O resultado é evidência de conectividade e aderência naquele momento, não uma medida de impacto do MIPO.

## Saídas

Os arquivos `evals/results/report.json` e `report.md` são locais e ignorados pelo Git. Eles contêm gates, latências e providers, mas não armazenam prompt bruto, credenciais, PII ou raciocínio interno.

## Diagnóstico

1. `/health` falhou: processo indisponível;
2. `/ready` falhou: runtime ou grafo não carregou;
3. `401`: token ausente ou divergente;
4. `504 agent_timeout`: orçamento total excedido;
5. `deterministic_fallback`: consulte provider, modelo e `failureReason` na auditoria;
6. `audit_failed` no log: a resposta ao usuário foi preservada, mas a persistência deve ser reparada.
