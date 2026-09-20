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

/** Resposta do cliente à pergunta "ainda há alguma pendência?" feita após o atendimento. */
export const WISMO_RESOLUTIONS = ["solved", "pending"] as const;
export type WismoResolution = (typeof WISMO_RESOLUTIONS)[number];
export const WISMO_RESOLUTION_LABELS: Record<WismoResolution, string> = { solved: "Sem pendência", pending: "Com pendência" };

/** Nota do atendimento, de 1 (muito ruim) a 5 (muito bom). */
export const WISMO_RATINGS = [1, 2, 3, 4, 5] as const;
export type WismoRating = (typeof WISMO_RATINGS)[number];
export const isWismoRating = (value: unknown): value is WismoRating => typeof value === "number" && (WISMO_RATINGS as readonly number[]).includes(value);

const ORDER_CODE = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
export const normalizeOrderCode = (value: string): string => value.trim().toUpperCase();
export const isValidOrderCode = (value: string): boolean => ORDER_CODE.test(value);

/** Corpo de `POST /api/wismo/events`. Reenviar o mesmo `id` atualiza o atendimento. */
export type WismoEventInput = {
  /** UUID gerado no cliente, um por consulta de pedido. */
  id: string;
  orderCode: string;
  /** Ação explícita do cliente; o servidor ainda recalcula status e origem. */
  requestHuman?: boolean;
  /** Opcional: resposta do cliente após o atendimento. */
  resolution?: WismoResolution;
  /** Opcional: nota de 1 a 5 dada pelo cliente. */
  rating?: WismoRating;
};

export type WismoEvent = WismoEventInput & {
  status: WismoStatus;
  outcome: WismoOutcome;
  escalationReason?: string;
  dataOrigin: WismoDataOrigin;
  occurredAt: string;
  updatedAt: string;
};

export type WismoDashboardData = {
  /** false quando o registro de atendimentos não está habilitado no modo de dados atual. */
  available: boolean;
  reason?: string;
  /** true só nos dados fictícios de prévia (`?wismo=exemplo`). */
  sample?: boolean;
  total: number;
  resolved: number;
  escalated: number;
  notFound: number;
  /** resolvidos / (resolvidos + escalados); pedidos não encontrados ficam de fora. */
  botResolutionRate: number | null;
  /** Clientes que responderam "sem pendência" / "ainda há pendência" após o atendimento. */
  feedbackSolved: number;
  feedbackPending: number;
  ratedCount: number;
  /** Média das notas de 1 a 5; null sem avaliações. */
  averageRating: number | null;
  byStatus: Array<{ status: WismoStatus; count: number }>;
  recent: Array<Pick<WismoEvent, "id" | "occurredAt" | "orderCode" | "status" | "outcome" | "escalationReason" | "dataOrigin" | "resolution" | "rating">>;
};

export const emptyWismoDashboard = (reason?: string): WismoDashboardData => ({
  available: false,
  reason,
  total: 0,
  resolved: 0,
  escalated: 0,
  notFound: 0,
  botResolutionRate: null,
  feedbackSolved: 0,
  feedbackPending: 0,
  ratedCount: 0,
  averageRating: null,
  byStatus: [],
  recent: [],
});

/** Janelas de tempo (móveis, contadas a partir de agora) do gráfico de notas. */
export const WISMO_RANGES = ["24h", "7d", "30d", "all"] as const;
export type WismoRange = (typeof WISMO_RANGES)[number];
export const WISMO_RANGE_LABELS: Record<WismoRange, string> = { "24h": "24 horas", "7d": "7 dias", "30d": "30 dias", all: "Tudo" };
export const isWismoRange = (value: unknown): value is WismoRange => typeof value === "string" && (WISMO_RANGES as readonly string[]).includes(value);

const RANGE_MS: Record<Exclude<WismoRange, "all">, number> = { "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000 };

/** Janela pré-definida ou período livre (`from` e `to` em ISO 8601). */
export type WismoRatingsQuery = { range: WismoRange } | { from: string; to: string };

export type WismoRatingsSummary = {
  range: WismoRange | "custom";
  from?: string;
  to?: string;
  ratedCount: number;
  /** Média das notas na janela; null sem avaliações. */
  averageRating: number | null;
  distribution: Array<{ rating: WismoRating; count: number }>;
  /** Respostas à pergunta de pendência dentro da janela. */
  feedbackSolved: number;
  feedbackPending: number;
};

export type WismoRatingsResponse = WismoRatingsSummary & { available: boolean; reason?: string; sample?: boolean };

type RatedEvent = { occurredAt: string; rating?: number; resolution?: string };

function buildSummary(events: ReadonlyArray<RatedEvent>, range: WismoRatingsSummary["range"], startMs: number, endMs: number): WismoRatingsSummary {
  const inWindow = events.filter((event) => {
    const time = Date.parse(event.occurredAt);
    return time >= startMs && time <= endMs;
  });
  const rated = inWindow.filter((event) => isWismoRating(event.rating));
  const total = rated.reduce((sum, event) => sum + (event.rating ?? 0), 0);
  return {
    range,
    ratedCount: rated.length,
    averageRating: rated.length > 0 ? total / rated.length : null,
    distribution: WISMO_RATINGS.map((rating) => ({ rating, count: rated.filter((event) => event.rating === rating).length })),
    feedbackSolved: inWindow.filter((event) => event.resolution === "solved").length,
    feedbackPending: inWindow.filter((event) => event.resolution === "pending").length,
  };
}

/** Notas (1 a 5) e respostas de pendência dos atendimentos ocorridos dentro da janela. */
export function summarizeRatings(events: ReadonlyArray<RatedEvent>, query: WismoRatingsQuery, now: Date = new Date()): WismoRatingsSummary {
  if ("range" in query) {
    const start = query.range === "all" ? Number.NEGATIVE_INFINITY : now.getTime() - RANGE_MS[query.range];
    return buildSummary(events, query.range, start, now.getTime());
  }
  return { ...buildSummary(events, "custom", Date.parse(query.from), Date.parse(query.to)), from: query.from, to: query.to };
}

/** Lê `range` ou `from`+`to` (ISO 8601) da URL de `GET /api/wismo/ratings`. */
export function parseRatingsQuery(params: URLSearchParams): { ok: true; value: WismoRatingsQuery } | { ok: false; error: string } {
  const from = params.get("from");
  const to = params.get("to");
  if (from !== null || to !== null) {
    if (from === null || to === null) return { ok: false, error: "Informe as datas inicial e final." };
    const start = Date.parse(from);
    const end = Date.parse(to);
    if (Number.isNaN(start) || Number.isNaN(end)) return { ok: false, error: "Data inválida." };
    if (start > end) return { ok: false, error: "A data inicial não pode ser depois da final." };
    return { ok: true, value: { from: new Date(start).toISOString(), to: new Date(end).toISOString() } };
  }
  const range = params.get("range") ?? "all";
  return isWismoRange(range) ? { ok: true, value: { range } } : { ok: false, error: "Janela de tempo inválida." };
}
