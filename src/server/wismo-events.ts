import "server-only";
import {
  WISMO_RESOLUTIONS,
  WISMO_STATUSES,
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
import { dataSource, supabaseRest } from "@/src/lib/supabase-rest";
import { getActiveWismoRuleSet, getLatestCompletedRunId, getOrderByKey, getRulerMatrix } from "@/src/server/wismo";
import { evaluateDeliveryStatus } from "@/src/services/wismo";

export class WismoEventNotFoundError extends Error {}

type StoredEvent = WismoEvent & { sessionId: string };
type DbEvent = {
  id: string;
  session_id: string;
  order_code: string;
  request_human: boolean;
  status: WismoStatus;
  outcome: WismoEvent["outcome"];
  escalation_reason: string | null;
  data_origin: WismoEvent["dataOrigin"];
  resolution: WismoResolution | null;
  rating: WismoRating | null;
  occurred_at: string;
  updated_at: string;
};
type Parsed = { ok: true; value: WismoEventInput } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_EVENTS = 500;
const SUPABASE_READ_LIMIT = 5000;
const RECENT_LIMIT = 20;

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
  if (["status", "outcome", "dataOrigin", "escalationReason"].some((field) => data[field] !== undefined)) {
    return { ok: false, error: "Status, resultado e origem são calculados pelo servidor." };
  }
  if (data.requestHuman !== undefined && typeof data.requestHuman !== "boolean") return { ok: false, error: "Solicitação de atendimento inválida." };
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
      ...(data.requestHuman === true ? { requestHuman: true } : {}),
      ...(resolution ? { resolution } : {}),
      ...(rating ? { rating } : {}),
    },
  };
}

export async function recordWismoEvent(sessionId: string, input: WismoEventInput, now: Date = new Date()): Promise<void> {
  const timestamp = now.toISOString();
  const authoritative = await resolveWismoEvent(input.orderCode, input.requestHuman === true, now);
  if (dataSource() === "supabase") {
    const existing = (await supabaseRest<DbEvent[]>(`wismo_service_events?id=eq.${encodeURIComponent(input.id)}&select=*&limit=1`))[0];
    if (existing && (existing.session_id !== sessionId || existing.order_code !== input.orderCode)) {
      throw new WismoEventNotFoundError("Atendimento não encontrado para esta sessão.");
    }
    const resolution = input.resolution ?? existing?.resolution ?? null;
    const rating = input.rating ?? existing?.rating ?? null;
    await supabaseRest("wismo_service_events?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
      body: JSON.stringify({
        id: input.id,
        session_id: sessionId,
        order_code: input.orderCode,
        request_human: input.requestHuman === true,
        status: authoritative.status,
        outcome: authoritative.outcome,
        escalation_reason: authoritative.escalationReason ?? null,
        data_origin: authoritative.dataOrigin,
        resolution,
        rating,
        occurred_at: existing?.occurred_at ?? timestamp,
        updated_at: timestamp,
      }),
    });
    return;
  }
  const store = localStore();
  const existing = store.get(input.id);
  if (existing && existing.sessionId !== sessionId) throw new WismoEventNotFoundError("Atendimento não encontrado para esta sessão.");
  if (!existing && store.size >= MAX_EVENTS) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  // Reenvios do mesmo atendimento sem resposta/nota não apagam o que o cliente já respondeu.
  const resolution = input.resolution ?? existing?.resolution;
  const rating = input.rating ?? existing?.rating;
  store.set(input.id, { ...input, ...authoritative, ...(resolution ? { resolution } : {}), ...(rating ? { rating } : {}), sessionId, occurredAt: existing?.occurredAt ?? timestamp, updatedAt: timestamp });
}

async function resolveWismoEvent(orderCode: string, requestHuman: boolean, now: Date): Promise<Pick<WismoEvent, "status" | "outcome" | "escalationReason" | "dataOrigin">> {
  const runId = await getLatestCompletedRunId();
  if (!runId) return { status: "inconclusive", outcome: "not_found", dataOrigin: dataSource() === "local" ? "mock" : "observed" };
  const order = await getOrderByKey(orderCode, runId);
  if (!order) return { status: "inconclusive", outcome: "not_found", dataOrigin: dataSource() === "local" ? "mock" : "observed" };
  const [rule, matrix] = await Promise.all([getActiveWismoRuleSet(), getRulerMatrix(runId)]);
  const result = evaluateDeliveryStatus(order, matrix.rulersFor(order.channel, order.customerState), now, rule.thresholds);
  const status: WismoStatus = result.phase === "delivered" ? "delivered" : result.flag === "late" ? "delayed" : "on_time";
  const escalated = requestHuman || result.escalate;
  return {
    status,
    outcome: escalated ? "escalated" : "resolved",
    ...(escalated ? { escalationReason: requestHuman ? "Atendimento humano solicitado pelo cliente." : result.message } : {}),
    dataOrigin: dataSource() === "local" ? "mock" : "observed",
  };
}

export async function getWismoDashboardData(): Promise<WismoDashboardData> {
  const events = dataSource() === "local"
    ? [...localStore().values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    : (await supabaseRest<DbEvent[]>(`wismo_service_events?select=*&order=occurred_at.desc&limit=${SUPABASE_READ_LIMIT}`)).map(fromDbEvent);
  return summarizeDashboard(events);
}

function summarizeDashboard(events: WismoEvent[]): WismoDashboardData {
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
    recent: events.slice(0, RECENT_LIMIT).map(({ id, occurredAt, orderCode, status, outcome, escalationReason, dataOrigin, resolution, rating }) => ({ id, occurredAt, orderCode: `${orderCode.slice(0, 3)}•••${orderCode.slice(-2)}`, status, outcome, escalationReason, dataOrigin, resolution, rating })),
  };
}

/** Notas e respostas de pendência dentro de uma janela de tempo. */
export async function getWismoRatingsSummary(query: WismoRatingsQuery, now: Date = new Date()): Promise<WismoRatingsResponse> {
  const events = dataSource() === "local"
    ? [...localStore().values()]
    : (await supabaseRest<DbEvent[]>(`wismo_service_events?select=*&order=occurred_at.desc&limit=${SUPABASE_READ_LIMIT}`)).map(fromDbEvent);
  return { available: true, ...summarizeRatings(events, query, now) };
}

function fromDbEvent(row: DbEvent): WismoEvent {
  return {
    id: row.id,
    orderCode: row.order_code,
    ...(row.request_human ? { requestHuman: true } : {}),
    status: row.status,
    outcome: row.outcome,
    ...(row.escalation_reason ? { escalationReason: row.escalation_reason } : {}),
    dataOrigin: row.data_origin,
    ...(row.resolution ? { resolution: row.resolution } : {}),
    ...(row.rating ? { rating: row.rating } : {}),
    occurredAt: row.occurred_at,
    updatedAt: row.updated_at,
  };
}
