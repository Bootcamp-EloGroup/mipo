import "server-only";
import {
  WISMO_DATA_ORIGINS,
  WISMO_OUTCOMES,
  WISMO_STATUSES,
  emptyWismoDashboard,
  isValidOrderCode,
  normalizeOrderCode,
  type WismoDashboardData,
  type WismoEvent,
  type WismoEventInput,
  type WismoStatus,
} from "@/src/domain/wismo";
import { DataSourceUnavailableError, dataSource } from "@/src/lib/supabase-rest";

export class WismoEventNotFoundError extends Error {}

type StoredEvent = WismoEvent & { sessionId: string };
type Parsed = { ok: true; value: WismoEventInput } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_EVENTS = 500;
const RECENT_LIMIT = 20;
const UNAVAILABLE = "O registro de atendimentos WISMO no Supabase depende da migration wismo_core (Frente 1) e ainda não foi habilitado.";

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
  return { ok: true, value: { id: data.id.toLowerCase(), orderCode, status: data.status, outcome: data.outcome, dataOrigin: data.dataOrigin, ...(escalationReason ? { escalationReason } : {}) } };
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
  store.set(input.id, { ...input, sessionId, occurredAt: existing?.occurredAt ?? timestamp, updatedAt: timestamp });
}

export async function getWismoDashboardData(): Promise<WismoDashboardData> {
  if (dataSource() !== "local") return emptyWismoDashboard(UNAVAILABLE);
  const events = [...localStore().values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const count = (outcome: WismoEvent["outcome"]) => events.filter((event) => event.outcome === outcome).length;
  const resolved = count("resolved");
  const escalated = count("escalated");
  const byStatus = WISMO_STATUSES.map((status: WismoStatus) => ({ status, count: events.filter((event) => event.status === status && event.outcome !== "not_found").length })).filter((item) => item.count > 0);
  return {
    available: true,
    total: events.length,
    resolved,
    escalated,
    notFound: count("not_found"),
    botResolutionRate: resolved + escalated > 0 ? resolved / (resolved + escalated) : null,
    byStatus,
    recent: events.slice(0, RECENT_LIMIT).map(({ id, occurredAt, orderCode, status, outcome, escalationReason, dataOrigin }) => ({ id, occurredAt, orderCode, status, outcome, escalationReason, dataOrigin })),
  };
}
