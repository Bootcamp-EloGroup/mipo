import "server-only";

import type { DashboardFilters, ManagerDashboardData } from "@/src/domain/manager-dashboard";
import { emptyManagerDashboard } from "@/src/domain/manager-dashboard";
import { dataSource, supabaseRest } from "@/src/lib/supabase-rest";

type Wire = Record<string, unknown>;
const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const maybe = (value: unknown): number | null => value === null || value === undefined ? null : num(value);
const rows = <T>(value: unknown, map: (row: Wire) => T): T[] => Array.isArray(value) ? value.map((row) => map(row as Wire)) : [];

export function normalizeDashboardData(payload: Wire): ManagerDashboardData {
  const fallback = emptyManagerDashboard();
  const e = (payload.executive ?? {}) as Wire;
  const c = (payload.customers ?? {}) as Wire;
  const s = (payload.service ?? {}) as Wire;
  const m = (payload.mipo ?? {}) as Wire;
  const a = (payload.agent ?? {}) as Wire;
  const f = (payload.filters ?? {}) as Wire;
  const w = (payload.historicalWindow ?? {}) as Wire;
  const o = (payload.options ?? {}) as Wire;
  return {
    generatedAt: String(payload.generatedAt ?? fallback.generatedAt),
    filters: { from: f.from ? String(f.from) : null, to: f.to ? String(f.to) : null, channel: f.channel ? String(f.channel) : null, category: f.category ? String(f.category) : null, origin: f.origin === "demo" || f.origin === "historical" ? f.origin : "all" },
    historicalWindow: { from: w.from ? String(w.from) : null, to: w.to ? String(w.to) : null },
    options: { channels: rows(o.channels, (r) => ({ value: String(r.value) })), categories: rows(o.categories, (r) => ({ value: String(r.value) })) },
    scenarioBasis: fallback.scenarioBasis,
    executive: {
      source: "historical", revenueCents: num(e.revenueCents ?? e.revenue_cents), marginCents: num(e.marginCents ?? e.margin_cents), orders: num(e.orders), returns: num(e.returns), criticalSkus: num(e.criticalSkus ?? e.critical_skus), inventoryExposureCents: num(e.inventoryExposureCents ?? e.inventory_exposure_cents),
      monthly: rows(e.monthly, (r) => ({ month: String(r.month), revenueCents: num(r.revenue_cents), marginCents: num(r.margin_cents), orders: num(r.orders), returns: num(r.returns) })),
      channels: rows(e.channels, (r) => ({ channel: String(r.channel), revenueCents: num(r.revenue_cents), marginCents: num(r.margin_cents), orders: num(r.orders), returns: num(r.returns) })),
      products: rows(e.products, (r) => ({ product: String(r.product), category: String(r.category), revenueCents: num(r.revenue_cents), marginCents: num(r.margin_cents), returns: num(r.returns) })),
      inventory: rows(e.inventory, (r) => ({ status: String(r.status), skuCount: num(r.sku_count), exposureCents: num(r.exposure_cents) })),
    },
    customers: {
      source: "snapshot", total: num(c.total), segments: rows(c.segments, (r) => ({ label: String(r.label), customers: num(r.customers), averageLtvCents: num(r.average_ltv_cents), averageOrders: num(r.average_orders) })), loyalty: rows(c.loyalty, (r) => ({ label: String(r.label), customers: num(r.customers) })), states: rows(c.states, (r) => ({ label: String(r.label), customers: num(r.customers) })), devices: rows(c.devices, (r) => ({ label: String(r.label), customers: num(r.customers) })),
    },
    service: {
      source: "historical", tickets: num(s.tickets), wismo: num(s.wismo), csat: maybe(s.csat), firstResponseMinutes: maybe(s.firstResponseMinutes ?? s.first_response_minutes), costCents: num(s.costCents ?? s.cost_cents), backlog: num(s.backlog),
      weekly: rows(s.weekly, (r) => ({ week: String(r.week), tickets: num(r.tickets), wismo: num(r.wismo), csat: maybe(r.csat) })), categories: rows(s.categories, (r) => ({ label: String(r.label), tickets: num(r.tickets), wismo: num(r.wismo) })),
    },
    mipo: {
      source: m.source === "demo" ? "demo" : "historical", evaluated: num(m.evaluated), actionable: num(m.actionable), decided: num(m.decided), accepted: num(m.accepted), risks: rows(m.risks, (r) => ({ label: String(r.label), count: num(r.count) })), daily: rows(m.daily, (r) => ({ day: String(r.day), interventions: num(r.interventions), accepted: num(r.accepted) })),
      recent: rows(m.recent, (r) => ({ id: String(r.id), occurredAt: String(r.occurred_at), product: String(r.product), category: String(r.category), selectedSize: String(r.selected_size), recommendedSize: r.recommended_size ? String(r.recommended_size) : null, risk: String(r.risk) as ManagerDashboardData["mipo"]["recent"][number]["risk"], level: String(r.level) as "high" | "medium" | "low", score: r.score === null || r.score === undefined ? null : num(r.score), evidence: String(r.evidence ?? ""), ruleVersion: String(r.rule_version), decision: String(r.decision) as ManagerDashboardData["mipo"]["recent"][number]["decision"], origin: r.origin === "demo" ? "demo" : "historical", agentStatus: r.agent_status ? String(r.agent_status) : null })),
    },
    agent: { source: a.source === "demo" ? "demo" : "historical", total: num(a.total), eloagents: num(a.eloagents), groq: num(a.groq), fallback: num(a.fallback), cacheHits: num(a.cacheHits ?? a.cache_hits), rejected: num(a.rejected), timeouts: num(a.timeouts), averageLatencyMs: maybe(a.averageLatencyMs ?? a.average_latency_ms), providers: rows(a.providers, (r) => ({ label: String(r.label), count: num(r.count) })) },
  };
}

export async function getManagerDashboardData(filters: DashboardFilters): Promise<ManagerDashboardData> {
  if (dataSource() !== "supabase") return { ...emptyManagerDashboard(), filters };
  const [payload, inventory] = await Promise.all([
    supabaseRest<Wire>("rpc/get_manager_dashboard", { method: "POST", body: JSON.stringify({ p_from: filters.from, p_to: filters.to, p_channel: filters.channel, p_category: filters.category, p_origin: filters.origin }) }),
    supabaseRest<Wire>("rpc/get_manager_inventory_kpis", { method: "POST", body: JSON.stringify({ p_category: filters.category }) }),
  ]);
  const normalized = normalizeDashboardData(payload ?? {});
  normalized.executive.criticalSkus = num(inventory.criticalSkus ?? inventory.critical_skus);
  normalized.executive.inventoryExposureCents = num(inventory.inventoryExposureCents ?? inventory.inventory_exposure_cents);
  normalized.scenarioBasis = {
    eligibleInterventions: normalized.mipo.actionable,
    observedReturnRate: normalized.executive.orders > 0 ? normalized.executive.returns / normalized.executive.orders : null,
    averageMarginPerOrderCents: normalized.executive.orders > 0 ? normalized.executive.marginCents / normalized.executive.orders : null,
    averageReturnCostCents: null,
  };
  return normalized;
}
