import type { BrazilRegion, DeliveryFlag, DeliveryPhase, DeliveryRuler, DeliveryRulerSet, SlaConfidence, SlaScope, WismoOrder, WismoStatus, WismoThresholds } from "@/src/domain/wismo";

const DAY = 86_400_000;

export const defaultWismoThresholds: WismoThresholds = { preparationDays: 2, criticalExtraDays: 2, highConfidenceSample: 30, mediumConfidenceSample: 5, escalationGraceDays: 0 };

const regionLabel: Record<BrazilRegion, string> = { norte: "Norte", nordeste: "Nordeste", centro_oeste: "Centro-Oeste", sudeste: "Sudeste", sul: "Sul" };
const phaseLabel: Record<DeliveryPhase, string> = { preparing: "em preparação", in_transit: "em transporte", delivered: "entregue" };

const days = (value: number) => `${value} ${value === 1 ? "dia" : "dias"}`;
const dayMonth = (iso: string) => { const date = new Date(iso); return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`; };

function scopeLabel(ruler: DeliveryRuler): string {
  if (ruler.scope === "channel") return `o canal ${ruler.scopeKey}`;
  if (ruler.scope === "state") return `o estado ${ruler.scopeKey}`;
  if (ruler.scope === "region") return `a região ${regionLabel[ruler.scopeKey as BrazilRegion] ?? ruler.scopeKey}`;
  return "o Brasil";
}

export function confidenceOf(sampleSize: number, thresholds: WismoThresholds = defaultWismoThresholds): SlaConfidence {
  if (sampleSize >= thresholds.highConfidenceSample) return "alta";
  if (sampleSize >= thresholds.mediumConfidenceSample) return "media";
  return "baixa";
}

export function criticalDaysOf(ruler: DeliveryRuler, thresholds: WismoThresholds = defaultWismoThresholds): number {
  return Math.max(ruler.p90Days, ruler.p75Days + thresholds.criticalExtraDays);
}

export function resolveRuler(rulers: DeliveryRulerSet): { ruler: DeliveryRuler; chain: SlaScope[] } {
  const chain: SlaScope[] = ["channel"];
  if (rulers.channel && rulers.channel.sampleSize >= 1) return { ruler: rulers.channel, chain };
  chain.push("state");
  if (rulers.state && rulers.state.sampleSize >= 1) return { ruler: rulers.state, chain };
  chain.push("region");
  if (rulers.region && rulers.region.sampleSize >= 1) return { ruler: rulers.region, chain };
  chain.push("national");
  return { ruler: rulers.national, chain };
}

export function projectOrderAt(order: WismoOrder, asOf: Date): WismoOrder {
  if (order.actualDeliveryDays === null) return order;
  const deliveredMs = Date.parse(order.orderedAt) + order.actualDeliveryDays * DAY;
  return asOf.getTime() >= deliveredMs ? order : { ...order, actualDeliveryDays: null };
}

export function evaluateDeliveryStatus(order: WismoOrder, rulers: DeliveryRulerSet, now: Date = new Date(), thresholds: WismoThresholds = defaultWismoThresholds): WismoStatus {
  const { ruler, chain } = resolveRuler(rulers);
  const criticalDays = criticalDaysOf(ruler, thresholds);
  const orderedMs = Date.parse(order.orderedAt);
  const promisedAt = new Date(orderedMs + ruler.p75Days * DAY).toISOString();
  const criticalAt = new Date(orderedMs + criticalDays * DAY).toISOString();
  const base = { scope: ruler.scope, scopeKey: ruler.scopeKey, fallbackChain: chain, sampleSize: ruler.sampleSize, confidence: confidenceOf(ruler.sampleSize, thresholds), p50Days: ruler.p50Days, p75Days: ruler.p75Days, p90Days: ruler.p90Days, criticalDays, promisedAt, criticalAt, quantitativeOrigin: "observed_or_derived_from_csv" as const, source: "tempo_entrega_real" as const };

  if (order.actualDeliveryDays !== null) {
    const elapsedDays = order.actualDeliveryDays;
    const deliveredAt = new Date(orderedMs + elapsedDays * DAY).toISOString();
    const flag: DeliveryFlag = elapsedDays <= ruler.p75Days ? "on_time" : "late";
    const daysLate = Math.max(0, elapsedDays - ruler.p75Days);
    const criticalBreach = elapsedDays >= criticalDays;
    const message = flag === "on_time"
      ? `Seu pedido foi entregue em ${days(elapsedDays)}, dentro do prazo de ${days(ruler.p75Days)} estimado para ${scopeLabel(ruler)} a partir do histórico.`
      : `Seu pedido foi entregue em ${days(elapsedDays)}, ${days(daysLate)} além do prazo de ${days(ruler.p75Days)} estimado para ${scopeLabel(ruler)}.${criticalBreach ? ` Isso ficou acima do limiar de ${days(criticalDays)} usado para acionar o time responsável.` : ""}`;
    return { phase: "delivered", flag, daysLate, escalate: false, criticalBreach, deliveredAt, ruler, evidence: { ...base, elapsedDays, deliveredAtOrigin: "derived" }, message };
  }

  const elapsedDays = Math.max(0, Math.floor((now.getTime() - orderedMs) / DAY));
  const phase: DeliveryPhase = elapsedDays < thresholds.preparationDays ? "preparing" : "in_transit";
  const flag: DeliveryFlag = elapsedDays <= ruler.p75Days ? "on_time" : "late";
  const daysLate = Math.max(0, elapsedDays - ruler.p75Days);
  const escalate = elapsedDays >= criticalDays + thresholds.escalationGraceDays;
  const message = flag === "on_time"
    ? `Seu pedido está ${phaseLabel[phase]}. A previsão de entrega é ${dayMonth(promisedAt)}.`
    : `Seu pedido está ${phaseLabel[phase]} e já passou ${days(daysLate)} do prazo previsto (${dayMonth(promisedAt)}).${escalate ? " Vamos acionar o time responsável." : ""}`;
  return { phase, flag, daysLate, escalate, criticalBreach: escalate, ruler, evidence: { ...base, elapsedDays }, message };
}
