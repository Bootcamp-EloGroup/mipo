# WISMO — Interface e Experiência (Frente 2)

Documento de contrato entre a **Frente 2** (interface, eventos, painel e simulador) e a **Frente 1** (dados e motor de regras). A regra de negócio continua sendo determinística: a interface apenas **exibe** o que o motor devolve e **registra** o atendimento.

## O que a Frente 2 entrega

| Peça | Arquivo |
| --- | --- |
| Tela de identificação do pedido | `src/app/pedido/page.tsx` |
| Conversa simulada, badges e escalonamento | `src/components/wismo-chat.tsx` |
| Tipos e contrato do domínio | `src/domain/wismo-chat.ts` |
| Registro de atendimentos | `POST/GET /api/wismo/events` (`src/server/wismo-events.ts`) |
| Indicadores no painel gerencial | `src/components/wismo-operations.tsx` |
| Simulador de impacto (cenário) | `src/domain/wismo-impact.ts`, `src/components/wismo-impact-simulator.tsx` |
| Mock de demonstração | `src/services/wismo-mock.ts` |
| Tradução motor → interface | `src/services/wismo-adapter.ts` |

## Como a interface consome o motor de regras (Frente 1)

A interface chama `GET /api/wismo/orders/:orderKey` (ex.: `ORD-033198`) e traduz a resposta em `src/services/wismo-adapter.ts`. Nenhuma regra é reimplementada aqui.

| Motor (Frente 1) | Interface (`WismoStatusResponse`) |
| --- | --- |
| `status.phase = delivered` | `delivered` |
| `flag = late` (não entregue) | `delayed` |
| `flag = on_time` (não entregue) | `on_time` |
| `status.escalate` | `needsEscalation` (+ motivo com dias de atraso e limiar crítico) |
| `status.message` | `customerMessage` |
| `status.evidence.promisedAt` | `promisedDate` |
| HTTP 404 | `found: false`, sem escalonar |

`no_update` (sem atualização de rastreio) e `carrier`/`lastTracking*` só existem nos cenários mock: o motor atual não tem eventos de rastreio. Se a Frente 1 passar a ter esses dados, basta estender o adaptador.

## Como a interface usa o mock

Para demonstrar sem dados (ou sem banco), defina `NEXT_PUBLIC_WISMO_SOURCE=mock` no `.env.local`. A interface passa a usar `mockWismoStatus` (pedidos de exemplo `ORD-1001` a `ORD-1005`, um por status). **Sem a variável, a interface chama o motor real** — não há fallback silencioso entre mock e dados reais.

## Registro de atendimentos

`POST /api/wismo/events` recebe `WismoEventInput` (`id` UUID, `orderCode`, `status`, `outcome`, `escalationReason?`, `dataOrigin`). O mesmo `id` atualiza o atendimento (ex.: cliente pede atendimento humano depois de receber a resposta). Desfechos: `resolved | escalated | not_found`.

- `DATA_SOURCE=local`: guarda em memória do processo (até 500 eventos), útil para demo e testes.
- `DATA_SOURCE=supabase`: responde indisponível de forma explícita até existir uma tabela de atendimentos (ainda não existe; combinar com a Frente 1). Não há simulação de persistência.

Pontos a alinhar na integração: definir a tabela de atendimentos e mapear `WismoEvent` para ela; o servidor deve **recalcular** o status a partir do pedido em vez de confiar no status enviado pelo cliente.

## Simulador de impacto

Entradas: volume de tickets, % resolvido pelo assistente, custo médio por ticket. Saída sempre rotulada como **Cenário** (`potentialCostAvoidedCents`), nunca como economia capturada.
