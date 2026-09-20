import "server-only";
import {
  WISMO_DATA_ORIGINS,
  WISMO_OUTCOMES,
  WISMO_RESOLUTIONS,
  WISMO_STATUSES,
  emptyWismoDashboard,
  isValidOrderCode,
  isWismoRating,
  normalizeOrderCode,
  summarizeRatings,
  type WismoDashboardData,
  type WismoEvent,
  type WismoEventInput,
  type WismoRating,
  type WismoRatingsQuery,
  type WismoRatingsResponse,
  type WismoResolution,
  type WismoStatus,
} from "@/src/domain/wismo-chat";
import { DataSourceUnavailableError, dataSource } from "@/src/lib/supabase-rest";

export class WismoEventNotFoundError extends Error {}

type StoredEvent = WismoEvent & { sessionId: string };
type Parsed = { ok: true; value: WismoEventInput } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_EVENTS = 500;
const RECENT_LIMIT = 20;
const UNAVAILABLE = "O registro de atendimentos WISMO no Supabase depende de uma tabela de atendimentos que ainda não existe (a combinar com a Frente 1) e não foi habilitado.";

/** Armazenamento em memória do modo local, compartilhado entre as rotas do mesmo processo. */
const holder = globalThis as typeof globalThis & { __mipoWismoEvents?: Map<string, StoredEvent> };
const localStore = () => (holder.__mipoWismoEvents ??= new Map<string, StoredEvent>());

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);

export function parseWismoEventInput(body: unknown): Parsed {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Corpo da requisição inválido." };
  const data = body as Record<string, unknown>;
  if (typeof data.id !== "string" || !UUID.test(data.id)) return { ok: false, error: "id do atendimento deve ser um UUID." };
  const orderCode = typeof data.orderCode === "string" ? normalizeOrderCode(data.orderCode) : "";
  if (!isValidOrderCode(orderCode)) return { ok: false, error: "Código do pedido inválido." };
  if (!isOneOf(WISMO_STATUSES, data.status)) return { ok: false, error: "Status WISMO inválido." };
  if (!isOneOf(WISMO_OUTCOMES, data.outcome)) return { ok: false, error: "Resultado do atendimento inválido." };
  if (!isOneOf(WISMO_DATA_ORIGINS, data.dataOrigin)) return { ok: false, error: "Origem dos dados inválida." };
  let escalationReason: string | undefined;
  if (data.escalationReason !== undefined && data.escalationReason !== null) {
    if (typeof data.escalationReason !== "string" || data.escalationReason.length > 200) return { ok: false, error: "Motivo de escalonamento inválido." };
    escalationReason = data.escalationReason.trim() || undefined;
  }
  let resolution: WismoResolution | undefined;
  if (data.resolution !== undefined && data.resolution !== null) {
    if (!isOneOf(WISMO_RESOLUTIONS, data.resolution)) return { ok: false, error: "Resposta de pendência inválida." };
    resolution = data.resolution;
  }
  let rating: WismoRating | undefined;
  if (data.rating !== undefined && data.rating !== null) {
    if (!isWismoRating(data.rating)) return { ok: false, error: "A nota deve ser um número inteiro de 1 a 5." };
    rating = data.rating;
  }
  return {
    ok: true,
    value: {
      id: data.id.toLowerCase(),
      orderCode,
      status: data.status,
      outcome: data.outcome,
      dataOrigin: data.dataOrigin,
      ...(escalationReason ? { escalationReason } : {}),
      ...(resolution ? { resolution } : {}),
      ...(rating ? { rating } : {}),
    },
  };
}

export async function recordWismoEvent(sessionId: string, input: WismoEventInput, now: Date = new Date()): Promise<void> {
  if (dataSource() !== "local") throw new DataSourceUnavailableError(UNAVAILABLE);
  const store = localStore();
  const existing = store.get(input.id);
  if (existing && existing.sessionId !== sessionId) throw new WismoEventNotFoundError("Atendimento não encontrado para esta sessão.");
  if (!existing && store.size >= MAX_EVENTS) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  const timestamp = now.toISOString();
  // Reenvios do mesmo atendimento sem resposta/nota não apagam o que o cliente já respondeu.
  const resolution = input.resolution ?? existing?.resolution;
  const rating = input.rating ?? existing?.rating;
  store.set(input.id, { ...input, ...(resolution ? { resolution } : {}), ...(rating ? { rating } : {}), sessionId, occurredAt: existing?.occurredAt ?? timestamp, updatedAt: timestamp });
}

export async function getWismoDashboardData(): Promise<WismoDashboardData> {
  if (dataSource() !== "local") return emptyWismoDashboard(UNAVAILABLE);
  const events = [...localStore().values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const count = (outcome: WismoEvent["outcome"]) => events.filter((event) => event.outcome === outcome).length;
  const resolved = count("resolved");
  const escalated = count("escalated");
  const byStatus = WISMO_STATUSES.map((status: WismoStatus) => ({ status, count: events.filter((event) => event.status === status && event.outcome !== "not_found").length })).filter((item) => item.count > 0);
  const rated = events.filter((event) => event.rating !== undefined);
  return {
    available: true,
    total: events.length,
    resolved,
    escalated,
    notFound: count("not_found"),
    botResolutionRate: resolved + escalated > 0 ? resolved / (resolved + escalated) : null,
    feedbackSolved: events.filter((event) => event.resolution === "solved").length,
    feedbackPending: events.filter((event) => event.resolution === "pending").length,
    ratedCount: rated.length,
    averageRating: rated.length > 0 ? rated.reduce((sum, event) => sum + (event.rating ?? 0), 0) / rated.length : null,
    byStatus,
    recent: events.slice(0, RECENT_LIMIT).map(({ id, occurredAt, orderCode, status, outcome, escalationReason, dataOrigin, resolution, rating }) => ({ id, occurredAt, orderCode, status, outcome, escalationReason, dataOrigin, resolution, rating })),
  };
}

/** Notas e respostas de pendência dentro de uma janela de tempo (modo local; o Supabase depende da tabela de atendimentos). */
export async function getWismoRatingsSummary(query: WismoRatingsQuery, now: Date = new Date()): Promise<WismoRatingsResponse> {
  if (dataSource() !== "local") return { available: false, reason: UNAVAILABLE, ...summarizeRatings([], query, now) };
  return { available: true, ...summarizeRatings([...localStore().values()], query, now) };
}
