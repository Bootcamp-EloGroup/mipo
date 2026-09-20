/**
 * Contrato compartilhado do fluxo WISMO ("onde está meu pedido?").
 *
 * A interface (chat, painel e simulador) depende apenas destes tipos. O motor
 * de regras e a consulta ao banco (Frente 1) devem devolver `WismoStatusResponse`
 * em `GET /api/wismo/status?order=<código>`.
 */

export const WISMO_STATUSES = ["on_time", "delayed", "no_update", "delivered", "inconclusive"] as const;
export type WismoStatus = (typeof WISMO_STATUSES)[number];

export const WISMO_OUTCOMES = ["resolved", "escalated", "not_found"] as const;
export type WismoOutcome = (typeof WISMO_OUTCOMES)[number];

/**
 * observed: dado do CSV real; synthetic: derivado e marcado como tal;
 * mock: cenário fixo usado apenas pela interface de demonstração.
 */
export const WISMO_DATA_ORIGINS = ["observed", "synthetic", "mock"] as const;
export type WismoDataOrigin = (typeof WISMO_DATA_ORIGINS)[number];

export const WISMO_STATUS_LABELS: Record<WismoStatus, string> = {
  on_time: "Dentro do prazo",
  delayed: "Atrasado",
  no_update: "Sem atualização",
  delivered: "Entregue",
  inconclusive: "Inconclusivo",
};

export const WISMO_OUTCOME_LABELS: Record<WismoOutcome, string> = {
  resolved: "Resolvido pelo bot",
  escalated: "Escalado",
  not_found: "Pedido não encontrado",
};

export type WismoStatusResponse = {
  /** false quando o código não corresponde a nenhum pedido. */
  found: boolean;
  orderCode: string;
  status: WismoStatus;
  customerMessage: string;
  orderStatusLabel?: string;
  carrier?: string;
  lastTrackingEvent?: string;
  /** ISO 8601. */
  lastTrackingAt?: string;
  /** Data (AAAA-MM-DD) ou ISO 8601. */
  promisedDate?: string;
  daysWithoutUpdate?: number;
  needsEscalation: boolean;
  escalationReason?: string;
  dataOrigin: WismoDataOrigin;
};

/** Resultado do atendimento a partir da resposta do motor. */
export function outcomeFor(response: Pick<WismoStatusResponse, "found" | "needsEscalation">): WismoOutcome {
  if (!response.found) return "not_found";
  return response.needsEscalation ? "escalated" : "resolved";
}

const ORDER_CODE = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
export const normalizeOrderCode = (value: string): string => value.trim().toUpperCase();
export const isValidOrderCode = (value: string): boolean => ORDER_CODE.test(value);

/** Corpo de `POST /api/wismo/events`. Reenviar o mesmo `id` atualiza o atendimento. */
export type WismoEventInput = {
  /** UUID gerado no cliente, um por consulta de pedido. */
  id: string;
  orderCode: string;
  status: WismoStatus;
  outcome: WismoOutcome;
  escalationReason?: string;
  dataOrigin: WismoDataOrigin;
};

export type WismoEvent = WismoEventInput & { occurredAt: string; updatedAt: string };

export type WismoDashboardData = {
  /** false quando o registro de atendimentos não está habilitado no modo de dados atual. */
  available: boolean;
  reason?: string;
  total: number;
  resolved: number;
  escalated: number;
  notFound: number;
  /** resolvidos / (resolvidos + escalados); pedidos não encontrados ficam de fora. */
  botResolutionRate: number | null;
  byStatus: Array<{ status: WismoStatus; count: number }>;
  recent: Array<Pick<WismoEvent, "id" | "occurredAt" | "orderCode" | "status" | "outcome" | "escalationReason" | "dataOrigin">>;
};

export const emptyWismoDashboard = (reason?: string): WismoDashboardData => ({
  available: false,
  reason,
  total: 0,
  resolved: 0,
  escalated: 0,
  notFound: 0,
  botResolutionRate: null,
  byStatus: [],
  recent: [],
});
