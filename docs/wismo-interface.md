# WISMO — Interface e Experiência (Frente 2)

Documento de contrato entre a **Frente 2** (interface, eventos, painel e simulador) e a **Frente 1** (dados e motor de regras). A regra de negócio continua sendo determinística: a interface apenas **exibe** o que o motor devolve e **registra** o atendimento.

## O que a Frente 2 entrega

| Peça | Arquivo |
| --- | --- |
| Tela de identificação do pedido | `src/app/pedido/page.tsx` |
| Conversa simulada, badges e escalonamento | `src/components/wismo-chat.tsx` |
| Tipos e contrato do domínio | `src/domain/wismo.ts` |
| Registro de atendimentos | `POST/GET /api/wismo/events` (`src/server/wismo-events.ts`) |
| Indicadores no painel gerencial | `src/components/wismo-operations.tsx` |
| Simulador de impacto (cenário) | `src/domain/wismo-impact.ts`, `src/components/wismo-impact-simulator.tsx` |
| Mock provisório do motor | `src/services/wismo-mock.ts` |

## Contrato que a Frente 1 precisa cumprir

`GET /api/wismo/status?order=<codigo>` deve responder com `WismoStatusResponse` (ver `src/domain/wismo.ts`):

- `found`, `orderCode`, `status`, `customerMessage`, `needsEscalation`, `dataOrigin` (obrigatórios);
- `orderStatusLabel`, `carrier`, `lastTrackingEvent`, `lastTrackingAt`, `promisedDate`, `daysWithoutUpdate`, `escalationReason` (opcionais).
- `status`: `on_time | delayed | no_update | delivered | inconclusive`.
- `dataOrigin`: `observed | synthetic | mock`.
- Pedido inexistente: `found: false`, sem escalonar (a interface registra o desfecho `not_found`).

Regra sugerida: `no_update` e `inconclusive` devem vir com `needsEscalation: true` e `escalationReason`.

## Como a interface usa o mock

Enquanto a Frente 1 não publica a rota, defina `NEXT_PUBLIC_WISMO_SOURCE=mock` no `.env.local`. A interface passa a usar `mockWismoStatus` (pedidos de exemplo `ORD-1001` a `ORD-1005`, um por status). **Sem a variável, a interface chama a rota real** — não há fallback silencioso entre mock e dados reais.

## Registro de atendimentos

`POST /api/wismo/events` recebe `WismoEventInput` (`id` UUID, `orderCode`, `status`, `outcome`, `escalationReason?`, `dataOrigin`). O mesmo `id` atualiza o atendimento (ex.: cliente pede atendimento humano depois de receber a resposta). Desfechos: `resolved | escalated | not_found`.

- `DATA_SOURCE=local`: guarda em memória do processo (até 500 eventos), útil para demo e testes.
- `DATA_SOURCE=supabase`: responde indisponível de forma explícita até existir a tabela `wismo_tickets` (migration `wismo_core`, Frente 1). Não há simulação de persistência.

Pontos a alinhar na integração: mapear `WismoEvent` para as colunas de `wismo_tickets`; o servidor deve **recalcular** o status a partir do pedido em vez de confiar no status enviado pelo cliente.

## Simulador de impacto

Entradas: volume de tickets, % resolvido pelo assistente, custo médio por ticket. Saída sempre rotulada como **Cenário** (`potentialCostAvoidedCents`), nunca como economia capturada.
