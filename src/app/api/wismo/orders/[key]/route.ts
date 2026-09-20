import { apiError } from "@/src/lib/api-response";
import { getActiveWismoRuleSet, getLatestCompletedRunId, getOrderByKey, getRulerMatrix } from "@/src/server/wismo";
import { evaluateDeliveryStatus, projectOrderAt } from "@/src/services/wismo";

export async function GET(request: Request, context: RouteContext<"/api/wismo/orders/[key]">) {
  try {
    const key = (await context.params).key;
    const order = await getOrderByKey(key);
    if (!order) return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
    const raw = new URL(request.url).searchParams.get("asOf");
    let asOf: Date | undefined;
    if (raw !== null) {
      asOf = new Date(raw);
      if (Number.isNaN(asOf.getTime()) || asOf.getTime() < Date.parse(order.orderedAt)) return Response.json({ error: "Data de referência inválida para este pedido." }, { status: 400 });
    }
    const runId = await getLatestCompletedRunId();
    if (!runId) return Response.json({ error: "Nenhuma importação concluída encontrada." }, { status: 409 });
    const [rule, matrix] = await Promise.all([getActiveWismoRuleSet(), getRulerMatrix(runId)]);
    const evaluated = asOf ? projectOrderAt(order, asOf) : order;
    const status = evaluateDeliveryStatus(evaluated, matrix.rulersFor(order.channel, order.customerState), asOf ?? new Date(), rule.thresholds);
    return Response.json({ order, ruleVersion: rule.version, status: { ...status, evidence: { ...status.evidence, asOf: asOf?.toISOString() } } });
  } catch (error) { return apiError(error); }
}
