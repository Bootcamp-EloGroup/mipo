import "server-only";
import { AGENT_ACTIONS, type AgentAction, type AgentContext, type AgentTurn } from "../domain/agent";

export function allowedActions(context: AgentContext): AgentAction[] {
  const result = context.deterministicResult;
  if (result.risk === "size" && result.recommendedVariant) return ["explain_evidence", "present_authorized_alternative", "no_intervention"];
  if (result.risk === "quality" && result.alternativeProductId) return ["explain_evidence", "present_authorized_alternative", "no_intervention"];
  if (result.risk === "stock" && (context.selected.inventory_quantity ?? 0) > 0) return ["explain_evidence", "suggest_add_to_cart", "no_intervention"];
  if (result.risk === "insufficient_evidence") return ["explain_evidence", "no_intervention"];
  return ["explain_evidence", "no_intervention"];
}

export function parseAgentTurn(raw: string): AgentTurn {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const value = JSON.parse(cleaned) as Record<string, unknown>;
  if (value.type === "tool_call" && ["get_product_evidence", "calculate_mipo_risk", "get_allowed_actions"].includes(String(value.tool))) {
    return { type: "tool_call", tool: value.tool as Extract<AgentTurn,{type:"tool_call"}>["tool"], arguments: {} };
  }
  if (value.type === "final_answer" && AGENT_ACTIONS.includes(value.action as AgentAction) && typeof value.message === "string" && ["stock_context","size_context","quality_context","insufficient_sample","no_risk"].includes(String(value.rationaleCode))) return value as AgentTurn;
  throw new Error("Saída do agente fora do contrato.");
}

const forbidden = /(?:última chance|compre agora|garantid[oa]|desconto|promoção|vai acabar|imperdível)/i;

export function validateFinalAnswer(turn: Extract<AgentTurn, {type:"final_answer"}>, context: AgentContext): string | null {
  if (!allowedActions(context).includes(turn.action)) return "action_not_allowed";
  const expectedRationale = {stock:"stock_context",size:"size_context",quality:"quality_context",insufficient_evidence:"insufficient_sample",none:"no_risk"}[context.deterministicResult.risk];
  if(turn.rationaleCode!==expectedRationale)return "invalid_rationale";
  const message = turn.message.trim();
  if (message.length < 12 || message.length > 240) return "invalid_length";
  if (forbidden.test(message)) return "forbidden_claim";
  if (/\d/.test(message)) return "unverified_number";
  if (context.deterministicResult.risk === "insufficient_evidence" && /(?:recomend|tamanho\s+[PMGG]{1,2}|troque|prefira)/i.test(message)) return "recommendation_without_evidence";
  const sizes = [...message.matchAll(/\b(P|M|G|GG)\b/g)].map((match) => match[1]);
  const allowedSizes = new Set<string>([context.selected.size, context.deterministicResult.recommendedVariant?.size].filter((size):size is NonNullable<typeof size>=>Boolean(size)));
  if (sizes.some((size) => !allowedSizes.has(size))) return "unknown_size";
  return null;
}
