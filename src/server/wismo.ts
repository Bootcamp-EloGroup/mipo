import "server-only";
import { createHash } from "node:crypto";
import states from "@/src/data/brazilian-states.json";
import { demoOrders, demoRulers } from "@/src/data/deliveries";
import type { BrazilRegion, DeliveryRuler, DeliveryRulerSet, WismoOrder, WismoThresholds } from "@/src/domain/wismo";
import { dataSource, supabaseRest } from "@/src/lib/supabase-rest";
import { criticalDaysOf, evaluateDeliveryStatus } from "@/src/services/wismo";

type DbRule = { id: string; version: string; preparation_days: number; critical_extra_days: number; high_confidence_sample: number; medium_confidence_sample: number; escalation_grace_days: number };
type DbSla = { id: string; scope: DeliveryRuler["scope"]; scope_key: string; p50_days: number; p75_days: number; p90_days: number; sample_size: number };
type DbOrder = { id: string; source_order_key: string; ordered_at: string; customer_state: string | null; actual_delivery_days: number | null };

const regionByUf = new Map((states as Array<{ uf: string; region: BrazilRegion }>).map((state) => [state.uf, state.region]));

export type WismoRuleSet = { id: string; version: string; thresholds: WismoThresholds };
export type RulerLookup = { rulersFor: (uf: string | null) => DeliveryRulerSet; all: DeliveryRuler[] };

const toRuler = (row: DbSla): DeliveryRuler => ({ id: row.id, scope: row.scope, scopeKey: row.scope_key, p50Days: row.p50_days, p75Days: row.p75_days, p90Days: row.p90_days, sampleSize: row.sample_size });

export async function getActiveWismoRuleSet(): Promise<WismoRuleSet> {
  if (dataSource() === "local") return { id: "local", version: "2026-09-20.v1", thresholds: { preparationDays: 2, criticalExtraDays: 3, highConfidenceSample: 30, mediumConfidenceSample: 5, escalationGraceDays: 0 } };
  const rows = await supabaseRest<DbRule[]>("wismo_rule_sets?is_active=eq.true&select=*&limit=1");
  if (!rows[0]) throw new Error("Nenhum conjunto de regras WISMO ativo.");
  const rule = rows[0];
  return { id: rule.id, version: rule.version, thresholds: { preparationDays: rule.preparation_days, criticalExtraDays: rule.critical_extra_days, highConfidenceSample: rule.high_confidence_sample, mediumConfidenceSample: rule.medium_confidence_sample, escalationGraceDays: rule.escalation_grace_days } };
}

export async function getLatestCompletedRunId(): Promise<string | undefined> {
  if (dataSource() === "local") return "local";
  const rows = await supabaseRest<Array<{ id: string }>>("data_import_runs?status=eq.completed&select=id&order=finished_at.desc.nullslast&limit=1");
  return rows[0]?.id;
}

export async function getRulerMatrix(runId: string): Promise<RulerLookup> {
  const all = dataSource() === "local" ? demoRulers : (await supabaseRest<DbSla[]>(`logistics_sla?import_run_id=eq.${runId}&select=*`)).map(toRuler);
  const national = all.find((ruler) => ruler.scope === "national");
  if (!national) throw new Error("Nenhuma régua logística para a importação mais recente.");
  const byScope = new Map(all.map((ruler) => [`${ruler.scope}:${ruler.scopeKey}`, ruler]));
  return {
    all,
    rulersFor: (uf) => {
      const region = uf ? regionByUf.get(uf) : undefined;
      return { state: uf ? byScope.get(`state:${uf}`) : undefined, region: region ? byScope.get(`region:${region}`) : undefined, national };
    },
  };
}

export async function getOrderByKey(key: string): Promise<(WismoOrder & { id: string }) | undefined> {
  if (dataSource() === "local") { const order = demoOrders.find((item) => item.orderKey === key); return order ? { ...order, id: `local-${key}` } : undefined; }
  const rows = await supabaseRest<DbOrder[]>(`orders?source_order_key=eq.${encodeURIComponent(key)}&select=id,source_order_key,ordered_at,customer_state,actual_delivery_days&limit=1`);
  const row = rows[0];
  return row ? { id: row.id, orderKey: row.source_order_key, orderedAt: row.ordered_at, customerState: row.customer_state, actualDeliveryDays: row.actual_delivery_days } : undefined;
}

export async function rebuildDeliveryAssessments(): Promise<{ processed: number; deliveredOnTime: number; deliveredLate: number; criticalBreaches: number; byScope: Record<string, number>; ruleVersion: string }> {
  const runId = await getLatestCompletedRunId();
  if (!runId) throw new Error("Nenhuma importação concluída encontrada.");
  const [rule, matrix] = await Promise.all([getActiveWismoRuleSet(), getRulerMatrix(runId)]);
  const summary = { processed: 0, deliveredOnTime: 0, deliveredLate: 0, criticalBreaches: 0, byScope: { state: 0, region: 0, national: 0 } as Record<string, number>, ruleVersion: rule.version };

  for (let offset = 0; ; offset += 1000) {
    const page = await supabaseRest<DbOrder[]>(`orders?import_run_id=eq.${runId}&actual_delivery_days=not.is.null&select=id,source_order_key,ordered_at,customer_state,actual_delivery_days&order=source_order_key.asc&limit=1000&offset=${offset}`);
    const rows = page.map((row) => {
      const order: WismoOrder = { orderKey: row.source_order_key, orderedAt: row.ordered_at, customerState: row.customer_state, actualDeliveryDays: row.actual_delivery_days };
      const status = evaluateDeliveryStatus(order, matrix.rulersFor(row.customer_state), new Date(), rule.thresholds);
      summary.processed += 1;
      summary.byScope[status.ruler.scope] += 1;
      if (status.flag === "on_time") summary.deliveredOnTime += 1; else summary.deliveredLate += 1;
      if (status.criticalBreach) summary.criticalBreaches += 1;
      return { id: assessmentId(row.id, runId, rule.id), order_id: row.id, sla_id: status.ruler.id, rule_set_id: rule.id, import_run_id: runId, applied_scope: status.ruler.scope, sample_size: status.ruler.sampleSize, promised_days: status.ruler.p75Days, critical_days: criticalDaysOf(status.ruler, rule.thresholds), actual_delivery_days: row.actual_delivery_days, delivery_phase: status.phase, delivery_flag: status.flag, days_late: status.daysLate, is_critical_breach: status.criticalBreach, evidence: status.evidence };
    });
    for (let index = 0; index < rows.length; index += 500) {
      await supabaseRest("order_delivery_assessments?on_conflict=order_id,import_run_id,rule_set_id", { method: "POST", headers: { Prefer: "return=minimal,resolution=merge-duplicates" }, body: JSON.stringify(rows.slice(index, index + 500)) });
    }
    if (page.length < 1000) break;
  }
  return summary;
}

function assessmentId(orderId: string, runId: string, ruleSetId: string): string {
  const hash = createHash("sha256").update(`assessment:${orderId}:${runId}:${ruleSetId}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
