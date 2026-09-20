from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


Risk = Literal["size", "quality", "preference_mismatch", "none", "insufficient_evidence"]


class Variant(BaseModel):
    id: str
    size: Literal["P", "M", "G", "GG"] | None = None
    returnRate: float
    defectRate: float
    inventory_quantity: int | None = None
    salesCount: int | None = None
    evidenceOrigin: Literal["provided", "derived", "synthetic"] | None = None


class TextileProfile(BaseModel):
    material: str
    composition: str | None = None
    elasticity: Literal["none", "low", "medium", "high", "unknown"] = "unknown"
    structure: Literal["fluid", "balanced", "structured", "unknown"] = "unknown"
    drape: str | None = None
    care: list[str] = Field(default_factory=list)
    origin: Literal["provided", "derived", "synthetic"]
    evidence: list[str] = Field(default_factory=list)


class Product(BaseModel):
    id: str
    title: str
    category: str
    variants: list[Variant]
    productKind: str | None = None
    variantAttribute: str | None = None
    alternativeProductId: str | None = None
    description: str | None = None
    textileProfile: TextileProfile | None = None


class Thresholds(BaseModel):
    highReturnRate: float
    minimumImprovement: float
    lowStockQuantity: int
    minimumSampleSize: int


class RiskResult(BaseModel):
    risk: Risk
    level: Literal["high", "medium", "low"]
    evidence: str
    message: str
    recommendedVariant: Variant | None = None
    alternativeProductId: str | None = None
    outcome: Literal["good_match", "partial_match", "attention", "insufficient_evidence"] = "good_match"
    matchedPreferences: list[str] = Field(default_factory=list)
    mismatchedPreferences: list[str] = Field(default_factory=list)


class AgentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    interventionId: str
    product: Product
    selected: Variant
    fitPreference: Literal["fitted", "regular", "loose"]
    thresholds: Thresholds
    deterministicResult: RiskResult
    selectionContext: dict[str, object] | None = None
    richExplanation: bool = False
    usualSize: Literal["P", "M", "G", "GG"] | str | None = None


class AgentAnswer(BaseModel):
    action: Literal["explain_evidence", "present_authorized_alternative", "suggest_add_to_cart", "no_intervention"]
    message: str
    rationaleCode: Literal["size_context", "quality_context", "preference_context", "insufficient_sample", "no_risk"]
    provider: Literal["eloagents", "groq", "deterministic", "cache"]
    model: str
    status: Literal["eloagents_succeeded", "groq_succeeded", "deterministic_fallback", "rejected_by_policy", "cache_hit"]


class AgentStep(BaseModel):
    stepNumber: int
    attemptNumber: int = 1
    provider: Literal["python", "eloagents", "groq", "cache"]
    kind: Literal["tool_call", "final_answer"]
    toolName: str | None = None
    status: Literal["succeeded", "failed", "rejected"]
    durationMs: int
    failureReason: str | None = None


class AgentExecution(BaseModel):
    answer: AgentAnswer
    steps: list[AgentStep]
    failureReason: Literal["timeout", "provider_unavailable", "invalid_output", "policy_rejected"] | None = None


# --- Conversational Concierge Models ---

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1200)


class SuggestedAction(BaseModel):
    type: Literal["select_size", "view_product"]
    productId: str | None = None
    size: Literal["P", "M", "G", "GG"] | None = None
    label: str | None = None


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messages: list[ChatMessage] = Field(min_length=1, max_length=12)
    productContext: Product | None = None
    cartContext: list[dict[str, object]] | None = None


class ChatResponse(BaseModel):
    reply: str
    suggestedAction: SuggestedAction | None = None
    provider: Literal["eloagents", "groq", "deterministic"] = "deterministic"
    model: str = "concierge"


# --- Cart Audit Models ---

class CartItem(BaseModel):
    id: str
    productId: str
    variantId: str
    title: str
    size: Literal["P", "M", "G", "GG"] | str | None = None
    quantity: int = 1
    unitPrice: int = 0
    color: str | None = None
    mipoDecision: Literal["accepted", "kept_original", "not_required", "pending"] | None = None


class CartAuditRequest(BaseModel):
    items: list[CartItem]


class CartAuditResponse(BaseModel):
    status: Literal["aligned", "attention"]
    headline: str
    advice: str
    careTips: list[str]
    provider: str = "deterministic"


# --- Cache Stats Model ---

class CacheStats(BaseModel):
    entries: int
    hits: int
    misses: int
    hitRatePercent: float
