import type { FitPreference, MipoThresholds, RiskResult } from "@/src/services/mipo";
import type { Product, ProductVariant } from "@/src/domain/commerce";

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
};

export type AgentAnswer = {
  action: AgentAction;
  message: string;
  rationaleCode: "stock_context" | "size_context" | "quality_context" | "insufficient_sample" | "no_risk";
  provider: AgentProvider;
  model: string;
  status: "eloagents_succeeded" | "groq_succeeded" | "deterministic_fallback" | "rejected_by_policy" | "cache_hit";
};

export type AgentTurn =
  | { type: "tool_call"; tool: "get_product_evidence" | "calculate_mipo_risk" | "get_allowed_actions"; arguments: Record<string, never> }
  | { type: "final_answer"; action: AgentAction; message: string; rationaleCode: AgentAnswer["rationaleCode"] };
