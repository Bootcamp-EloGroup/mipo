from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ..models import AgentAnswer, AgentRequest, Risk


class ExpectedOutcome(BaseModel):
    model_config = ConfigDict(extra="forbid")

    risk: Risk
    allowedActions: list[str] = Field(min_length=1)
    rationaleCode: Literal[
        "stock_context",
        "size_context",
        "quality_context",
        "insufficient_sample",
        "no_risk",
    ]
    mustFallback: bool = False


class EvaluationCase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    tags: list[str]
    request: AgentRequest
    expected: ExpectedOutcome


class EvaluationResult(BaseModel):
    caseId: str
    passed: bool
    gates: dict[str, bool]
    answer: AgentAnswer
    durationMs: int
    failureReason: str | None = None


class EvaluationSummary(BaseModel):
    cases: int
    passed: int
    failed: int


class EvaluationMetrics(BaseModel):
    latencyP50Ms: int
    latencyP95Ms: int
    providerCounts: dict[str, int]
    policyRejections: int


class EvaluationReport(BaseModel):
    schemaVersion: Literal[1] = 1
    startedAt: str
    adapter: str
    promptVersion: str = "python-react-v1"
    policyVersion: str = "mipo-safe-v2"
    summary: EvaluationSummary
    metrics: EvaluationMetrics
    results: list[EvaluationResult]
