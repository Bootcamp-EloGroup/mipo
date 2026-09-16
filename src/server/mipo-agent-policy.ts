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

export function authorizedMessages(context:AgentContext):string[]{
  const result=context.deterministicResult;
  if(result.risk==="stock")return [
    "O estoque desta escolha está reduzido. A disponibilidade pode mudar.",
    "Há poucas unidades disponíveis para esta escolha. Considere essa informação antes de continuar.",
  ];
  if(result.risk==="size"&&result.recommendedVariant)return [
    `O histórico observado favorece o tamanho ${result.recommendedVariant.size}. Você pode comparar antes de continuar.`,
    `Há uma alternativa de tamanho sustentada pelo histórico observado: ${result.recommendedVariant.size}.`,
  ];
  if(result.risk==="quality")return [
    "O histórico observado indica atenção para esta escolha. Você pode comparar a alternativa disponível.",
    "Há uma alternativa autorizada pelo histórico observado para você comparar antes de continuar.",
  ];
  if(result.risk==="insufficient_evidence")return [
    "Ainda não há histórico suficiente para recomendar uma mudança. Você pode manter sua escolha.",
    "Os dados disponíveis ainda são insuficientes para sugerir outra opção.",
  ];
  return [
    "Não identificamos necessidade de intervenção para esta escolha.",
    "A evidência observada não indica uma mudança para esta escolha.",
  ];
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
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ .,;:!?()'-]+$/.test(message)) return "unsupported_characters";
  if (context.deterministicResult.risk === "insufficient_evidence" && /(?:recomend|tamanho\s+[PMGG]{1,2}|troque|prefira)/i.test(message)) return "recommendation_without_evidence";
  const sizes = [...message.matchAll(/\b(P|M|G|GG)\b/g)].map((match) => match[1]);
  const allowedSizes = new Set<string>([context.selected.size, context.deterministicResult.recommendedVariant?.size].filter((size):size is NonNullable<typeof size>=>Boolean(size)));
  if (sizes.some((size) => !allowedSizes.has(size))) return "unknown_size";
  if(!authorizedMessages(context).includes(message))return "message_not_allowed";
  return null;
}
