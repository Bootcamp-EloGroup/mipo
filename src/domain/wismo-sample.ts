import type { WismoDashboardData } from "@/src/domain/wismo-chat";

/**
 * Dados FICTÍCIOS, só para visualizar o bloco WISMO no painel sem precisar
 * gerar atendimentos. Aparecem apenas com `?wismo=exemplo` na URL do painel e
 * sempre com o aviso "dados de exemplo". Não representam atendimentos reais.
 */
export const WISMO_SAMPLE_DASHBOARD: WismoDashboardData = {
  available: true,
  sample: true,
  total: 12,
  resolved: 7,
  escalated: 4,
  notFound: 1,
  botResolutionRate: 7 / 11,
  feedbackSolved: 6,
  feedbackPending: 3,
  ratedCount: 8,
  averageRating: 33 / 8,
  byStatus: [
    { status: "on_time", count: 4 },
    { status: "delayed", count: 2 },
    { status: "no_update", count: 2 },
    { status: "delivered", count: 2 },
    { status: "inconclusive", count: 1 },
  ],
  recent: [
    { id: "00000000-0000-4000-8000-0000000000a1", occurredAt: "2026-09-20T16:40:00.000Z", orderCode: "ORD-1001", status: "on_time", outcome: "resolved", dataOrigin: "mock", resolution: "solved", rating: 5 },
    { id: "00000000-0000-4000-8000-0000000000a2", occurredAt: "2026-09-20T16:22:00.000Z", orderCode: "ORD-1002", status: "delayed", outcome: "escalated", escalationReason: "Cliente informou pendência após o atendimento", dataOrigin: "mock", resolution: "pending", rating: 3 },
    { id: "00000000-0000-4000-8000-0000000000a3", occurredAt: "2026-09-20T15:58:00.000Z", orderCode: "ORD-1003", status: "no_update", outcome: "escalated", escalationReason: "Sem atualização há 7 dias", dataOrigin: "mock", resolution: "pending", rating: 2 },
    { id: "00000000-0000-4000-8000-0000000000a4", occurredAt: "2026-09-20T15:31:00.000Z", orderCode: "ORD-1004", status: "delivered", outcome: "resolved", dataOrigin: "mock", resolution: "solved", rating: 5 },
    { id: "00000000-0000-4000-8000-0000000000a5", occurredAt: "2026-09-20T14:47:00.000Z", orderCode: "ORD-9999", status: "inconclusive", outcome: "not_found", dataOrigin: "mock" },
    { id: "00000000-0000-4000-8000-0000000000a6", occurredAt: "2026-09-20T14:10:00.000Z", orderCode: "ORD-1005", status: "inconclusive", outcome: "escalated", escalationReason: "Rastreamento inconclusivo", dataOrigin: "mock", resolution: "pending", rating: 4 },
    { id: "00000000-0000-4000-8000-0000000000a7", occurredAt: "2026-09-20T13:36:00.000Z", orderCode: "ORD-1002", status: "delayed", outcome: "resolved", dataOrigin: "mock", resolution: "solved", rating: 4 },
    { id: "00000000-0000-4000-8000-0000000000a8", occurredAt: "2026-09-20T12:05:00.000Z", orderCode: "ORD-1001", status: "on_time", outcome: "resolved", dataOrigin: "mock", resolution: "solved", rating: 5 },
  ],
};

/** Avaliações fictícias espalhadas por ~70 dias, para a prévia mostrar a mudança de janela. */
const SAMPLE_RATINGS: Array<[daysAgo: number, rating: number]> = [
  [0.1, 5], [0.3, 4], [0.6, 5], [1.5, 4], [2, 3], [3, 5], [4, 2], [5, 4], [6, 5], [8, 4],
  [10, 3], [13, 5], [17, 4], [21, 2], [25, 5], [28, 4], [40, 3], [55, 5], [70, 4],
];

export function sampleRatedEvents(now: Date = new Date()): Array<{ occurredAt: string; rating: number; resolution: "solved" | "pending" }> {
  return SAMPLE_RATINGS.map(([daysAgo, rating]) => ({ occurredAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(), rating, resolution: rating >= 4 ? "solved" : "pending" }));
}
