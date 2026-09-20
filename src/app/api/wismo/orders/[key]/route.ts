import { apiError } from "@/src/lib/api-response";
import { getActiveWismoRuleSet, getLatestCompletedRunId, getOrderByKey, getRulerMatrix } from "@/src/server/wismo";
import { evaluateDeliveryStatus, projectOrderAt } from "@/src/services/wismo";

export async function GET(request: Request, context: RouteContext<"/api/wismo/orders/[key]">) {
  try {
    const key = (await context.params).key;
    const runId = await getLatestCompletedRunId();
    if (!runId) return Response.json({ error: "Nenhuma importação concluída encontrada." }, { status: 409 });
    const order = await getOrderByKey(key, runId);
    if (!order) return Response.json({ error: "Pedido não encontrado na importação mais recente." }, { status: 404 });
    const raw = new URL(request.url).searchParams.get("asOf");
    let asOf: Date | undefined;
    if (raw !== null) {
      asOf = new Date(raw);
      if (Number.isNaN(asOf.getTime()) || asOf.getTime() < Date.parse(order.orderedAt)) return Response.json({ error: "Data de referência inválida para este pedido." }, { status: 400 });
    }
    const [rule, matrix] = await Promise.all([getActiveWismoRuleSet(), getRulerMatrix(runId)]);
    const evaluated = asOf ? projectOrderAt(order, asOf) : order;
    const status = evaluateDeliveryStatus(evaluated, matrix.rulersFor(order.channel, order.customerState), asOf ?? new Date(), rule.thresholds);
    const publicOrder = asOf ? { ...evaluated, actualDeliveryDays: null } : evaluated;
    return Response.json({ order: publicOrder, ruleVersion: rule.version, status: { ...status, evidence: { ...status.evidence, asOf: asOf?.toISOString() } } });
  } catch (error) { return apiError(error); }
}
