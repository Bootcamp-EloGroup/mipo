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

`POST /api/wismo/events` recebe somente os dados controlados pelo cliente: `id` UUID, `orderCode`, `requestHuman?`, `resolution?` e `rating?`. Status, desfecho, motivo de escalonamento e origem são recalculados no servidor. O mesmo `id` atualiza o atendimento sem permitir que outra sessão assuma o registro.

- `DATA_SOURCE=local`: guarda em memória do processo (até 500 eventos), útil para demo e testes.
- `DATA_SOURCE=supabase`: persiste em `wismo_service_events`, protegida por RLS e sem acesso para `anon` ou `authenticated`; as rotas de servidor usam exclusivamente a service role.
- O painel e o resumo de avaliações leem até os 5.000 eventos mais recentes. Códigos de pedido são mascarados antes de sair do servidor.

## Simulador de impacto

Entradas: volume de tickets, % resolvido pelo assistente, custo médio por ticket. Saída sempre rotulada como **Cenário** (`potentialCostAvoidedCents`), nunca como economia capturada.

## Pós-atendimento: pendência e avaliação

Quando o assistente resolve o pedido (sem escalonar), o chat faz duas perguntas em sequência:

1. "Ainda há alguma pendência ou todos os problemas foram solucionados?" Se o cliente responde **pendência** (ou clica em "Falar com o atendimento" nesse momento), o caso é escalado para atendimento humano.
2. "De 1 a 5, qual nota você dá para este atendimento?" (1 = muito ruim, 5 = muito bom).

As respostas entram no mesmo `WismoEventInput` como campos **opcionais**: `resolution` (`solved | pending`) e `rating` (inteiro de 1 a 5). Reenviar o atendimento sem esses campos não apaga o que já foi respondido. O painel mostra "Sem pendência após o atendimento", "Avaliação média" e as colunas Pendência e Nota. Casos escalados automaticamente pelo motor e pedidos não encontrados não recebem essas perguntas. Os dados são de demonstração e não representam satisfação real de clientes.
