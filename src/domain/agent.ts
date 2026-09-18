import type { FitPreference, MipoThresholds, RiskResult } from "@/src/services/mipo";
import type { Product, ProductVariant, SelectionContext } from "@/src/domain/commerce";

export const AGENT_ACTIONS = ["explain_evidence", "present_authorized_alternative", "suggest_add_to_cart", "no_intervention"] as const;
export type AgentAction = typeof AGENT_ACTIONS[number];
export type AgentProvider = "eloagents" | "groq" | "deterministic" | "cache";

export type AgentContext = {
  interventionId: string;
  product: Product;
  selected: ProductVariant;
  fitPreference: FitPreference;
  thresholds: MipoThresholds;
  deterministicResult: RiskResult;
  selectionContext?: SelectionContext;
};

export type AgentAnswer = {
  action: AgentAction;
  message: string;
  rationaleCode: "size_context" | "quality_context" | "preference_context" | "insufficient_sample" | "no_risk";
  provider: AgentProvider;
  model: string;
  status: "eloagents_succeeded" | "groq_succeeded" | "deterministic_fallback" | "rejected_by_policy" | "cache_hit";
};

export type AgentTurn =
  | { type: "tool_call"; tool: "get_product_evidence" | "calculate_mipo_risk" | "get_allowed_actions"; arguments: Record<string, never> }
  | { type: "final_answer"; action: AgentAction; message: string; rationaleCode: AgentAnswer["rationaleCode"] };

const rationaleCodes = new Set<AgentAnswer["rationaleCode"]>(["size_context", "quality_context", "preference_context", "insufficient_sample", "no_risk"]);
const providers = new Set<AgentAnswer["provider"]>(["eloagents", "groq", "deterministic", "cache"]);
const statuses = new Set<AgentAnswer["status"]>(["eloagents_succeeded", "groq_succeeded", "deterministic_fallback", "rejected_by_policy", "cache_hit"]);

/** Valida a resposta externa antes que ela alcance o cliente. */
export function parseAgentAnswer(value: unknown): AgentAnswer {
  if (!value || typeof value !== "object") throw new Error("agent_invalid_output");
  const answer = value as Record<string, unknown>;
  if (!AGENT_ACTIONS.includes(answer.action as AgentAction)) throw new Error("agent_invalid_action");
  if (typeof answer.message !== "string" || answer.message.length === 0 || answer.message.length > 500) throw new Error("agent_invalid_message");
  if (!rationaleCodes.has(answer.rationaleCode as AgentAnswer["rationaleCode"])) throw new Error("agent_invalid_rationale");
  if (!providers.has(answer.provider as AgentAnswer["provider"])) throw new Error("agent_invalid_provider");
  if (typeof answer.model !== "string" || answer.model.length === 0 || answer.model.length > 160) throw new Error("agent_invalid_model");
  if (!statuses.has(answer.status as AgentAnswer["status"])) throw new Error("agent_invalid_status");
  return {
    action: answer.action as AgentAction,
    message: answer.message,
    rationaleCode: answer.rationaleCode as AgentAnswer["rationaleCode"],
    provider: answer.provider as AgentAnswer["provider"],
    model: answer.model,
    status: answer.status as AgentAnswer["status"],
  };
}
