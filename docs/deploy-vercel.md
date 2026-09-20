# Deploy do MIPO na Vercel

O deploy completo usa dois projetos Vercel conectados ao mesmo repositório:

1. **`mipo-agent`** — FastAPI, com Root Directory `services/agent`;
2. **`mipo-web`** — Next.js, com Root Directory `.`.

O agente deve ser publicado primeiro porque sua URL HTTPS será configurada no projeto web. Não use `127.0.0.1` ou `localhost` em produção.

Para fazer o processo de forma interativa e repetir com segurança quando necessário, execute na raiz:

```bash
./scripts/setup-vercel.sh
```

O wizard não grava secrets no Git. Ele usa `.env.local` e as variáveis criptografadas dos projetos Vercel.

## Pré-requisitos

- branch `main` publicada no GitHub;
- projeto Supabase já migrado;
- conta Vercel conectada ao GitHub;
- token aleatório forte, compartilhado apenas entre web e agente;
- ao menos um provedor de modelo, ou `AI_EXPLANATIONS_ENABLED=false`.

## Projeto 1 — agente FastAPI

Importe o repositório na Vercel e configure:

| Configuração | Valor |
|---|---|
| Project Name | `mipo-agent` |
| Framework Preset | FastAPI |
| Root Directory | `services/agent` |
| Production Branch | `main` |

Variáveis do agente:

| Variável | Ambiente | Sensível | Observação |
|---|---|---:|---|
| `MIPO_PYTHON_AGENT_TOKEN` | Preview + Production | sim | Token forte; deve ser igual no projeto web |
| `SUPABASE_URL` | Preview + Production | não | URL do projeto Supabase |
| `SUPABASE_SECRET_KEY` | Preview + Production | sim | Secret key somente server-side |
| `ELOAGENTS_BASE_URL` | Preview + Production | não | `https://chat.eloagents.click/api` |
| `ELOAGENTS_API_KEY` | Preview + Production | sim | Primário; opcional se usar somente Groq |
| `ELOAGENTS_MODEL` | Preview + Production | não | `gpt-54-mini` |
| `GROQ_API_KEY` | Preview + Production | sim | Fallback; opcional se EloAgents estiver ativo |
| `GROQ_MODEL` | Preview + Production | não | `openai/gpt-oss-20b` |
| `AI_PROVIDER_TIMEOUT_MS` | Preview + Production | não | `12000` |
| `MIPO_AGENT_TOTAL_TIMEOUT_MS` | Preview + Production | não | `30000` |
| `MIPO_SEMANTIC_CACHE_TTL_SECONDS` | Preview + Production | não | `300` |

Depois do deploy, valide:

```bash
curl -fsS https://SEU-AGENTE.vercel.app/health
curl -fsS https://SEU-AGENTE.vercel.app/ready
```

Copie a URL HTTPS do agente, sem barra final.

## Projeto 2 — aplicação Next.js

Importe novamente o mesmo repositório:

| Configuração | Valor |
|---|---|
| Project Name | `mipo-web` |
| Framework Preset | Next.js |
| Root Directory | `.` |
| Production Branch | `main` |

Variáveis da aplicação:

| Variável | Ambiente | Sensível | Valor recomendado |
|---|---|---:|---|
| `DATA_SOURCE` | Preview + Production | não | `supabase` |
| `NEXT_PUBLIC_DATA_SOURCE` | Preview + Production | não | `supabase` |
| `MIPO_DEMO_MODE` | Preview + Production | não | `true` para o case |
| `SUPABASE_URL` | Preview + Production | não | URL do projeto Supabase |
| `SUPABASE_SECRET_KEY` | Preview + Production | sim | Secret key somente server-side |
| `AI_EXPLANATIONS_ENABLED` | Preview + Production | não | `true` após o agente estar saudável |
| `MIPO_PYTHON_AGENT_URL` | Preview + Production | não | URL HTTPS do `mipo-agent`, sem barra final |
| `MIPO_PYTHON_AGENT_TOKEN` | Preview + Production | sim | Mesmo token configurado no agente |
| `MIPO_PYTHON_AGENT_TIMEOUT_MS` | Preview + Production | não | `30000` |
| `MIPO_EXPERIMENT_ENABLED` | Preview + Production | não | `false` até aprovar o piloto |

Nunca use o prefixo `NEXT_PUBLIC_` em secrets.

Após o deploy, valide:

```bash
curl -fsS https://SEU-WEB.vercel.app/api/health
curl -fsS https://SEU-WEB.vercel.app/api/products
curl -fsS https://SEU-WEB.vercel.app/api/dashboard
```

Abra também `/`, `/painel` e `/api/health`.

## Ordem segura de ativação

1. Publique o agente com token e ao menos um provedor configurado.
2. Valide `/health` e `/ready` no agente.
3. Publique a aplicação inicialmente com `AI_EXPLANATIONS_ENABLED=false`.
4. Valide catálogo, sacola, checkout e painel.
5. Configure a URL e o mesmo token do agente no projeto web.
6. Altere `AI_EXPLANATIONS_ENABLED=true` e faça um novo deploy.
7. Valide explicação, concierge e auditoria da sacola.
8. Mantenha `MIPO_EXPERIMENT_ENABLED=false` até o início formal do piloto.

## Rollback

Na Vercel, abra **Deployments**, escolha o último deployment saudável e use **Promote to Production**. Se apenas o agente falhar, defina `AI_EXPLANATIONS_ENABLED=false` no projeto web e redeploy; o motor determinístico continuará funcionando.

## Referências oficiais

- [FastAPI na Vercel](https://vercel.com/docs/frameworks/backend/fastapi)
- [Monorepos](https://vercel.com/docs/monorepos)
- [Configuração de projetos](https://vercel.com/docs/project-configuration)
- [Variáveis de ambiente](https://vercel.com/docs/environment-variables)
- [Deploy pela CLI](https://vercel.com/docs/projects/deploy-from-cli)
