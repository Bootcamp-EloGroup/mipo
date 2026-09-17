import json
import os
import re
import statistics
import time
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol, Sequence

from ..graph import RATIONALE, allowed_actions, allowed_messages, run_agent
from ..models import AgentAnswer, AgentRequest
from .models import EvaluationCase, EvaluationMetrics, EvaluationReport, EvaluationResult, EvaluationSummary


class AgentAdapter(Protocol):
    name: str

    def explain(self, request: AgentRequest, case: EvaluationCase) -> AgentAnswer: ...


class OfflineGraphAdapter:
    name = "offline"

    def explain(self, request: AgentRequest, case: EvaluationCase) -> AgentAnswer:
        if "provider_failure" in case.tags:
            return AgentAnswer(
                action="explain_evidence",
                message=request.deterministicResult.message,
                rationaleCode=RATIONALE[request.deterministicResult.risk],
                provider="deterministic",
                model="offline-failure",
                status="deterministic_fallback",
            )
        messages = allowed_messages(request)
        return AgentAnswer(
            action=allowed_actions(request)[0],
            message=messages[0],
            rationaleCode=RATIONALE[request.deterministicResult.risk],
            provider="eloagents",
            model="offline-controlled",
            status="eloagents_succeeded",
        )


class LocalGraphAdapter:
    name = "local-graph"

    def explain(self, request: AgentRequest, _case: EvaluationCase) -> AgentAnswer:
        return run_agent(request)


class LiveGraphAdapter(LocalGraphAdapter):
    def __init__(self, provider: str):
        if provider not in ("eloagents", "groq"):
            raise ValueError("invalid_live_provider")
        self.provider = provider
        self.name = f"live-{provider}"

    def explain(self, request: AgentRequest, case: EvaluationCase) -> AgentAnswer:
        hidden_key = "GROQ_API_KEY" if self.provider == "eloagents" else "ELOAGENTS_API_KEY"
        hidden = os.environ.pop(hidden_key, None)
        try:
            answer = super().explain(request, case)
        finally:
            if hidden is not None:
                os.environ[hidden_key] = hidden
        if answer.provider != self.provider:
            raise RuntimeError(f"live_provider_not_used:{self.provider}")
        return answer


def load_cases(path: str | Path) -> list[EvaluationCase]:
    cases: list[EvaluationCase] = []
    seen: set[str] = set()
    for line_number, raw in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip():
            continue
        try:
            case = EvaluationCase.model_validate_json(raw)
        except Exception as error:
            raise ValueError(f"invalid_case_line_{line_number}: {error}") from error
        if case.id in seen:
            raise ValueError(f"duplicate_case_id: {case.id}")
        seen.add(case.id)
        cases.append(case)
    if not cases:
        raise ValueError("empty_evaluation_corpus")
    return cases


def _contains_unsupported_claim(message: str) -> bool:
    forbidden = ("desconto", "garantia", "garantido", "urgente", "última chance", "promoção")
    return bool(re.search(r"\d", message)) or any(term in message.casefold() for term in forbidden)


def _gates(case: EvaluationCase, answer: AgentAnswer) -> dict[str, bool]:
    request = case.request
    messages = allowed_messages(request)
    is_insufficient = request.deterministicResult.risk == "insufficient_evidence"
    contains_secret = any(secret in answer.message for secret in ("ELOAGENTS_API_KEY", "GROQ_API_KEY", "SUPABASE_SECRET_KEY", "Bearer "))
    fallback_ok = answer.status == "deterministic_fallback" if case.expected.mustFallback else answer.status != "deterministic_fallback"
    return {
        "contract_valid": True,
        "risk_preserved": request.deterministicResult.risk == case.expected.risk,
        "action_allowed": answer.action in case.expected.allowedActions,
        "rationale_valid": answer.rationaleCode == case.expected.rationaleCode,
        "message_authorized": answer.message in messages or (answer.status == "deterministic_fallback" and answer.message == request.deterministicResult.message),
        "no_unsupported_claims": not _contains_unsupported_claim(answer.message),
        "insufficient_evidence_safe": not is_insufficient or answer.action in ("explain_evidence", "no_intervention"),
        "secret_leakage_absent": not contains_secret,
        "fallback_correct": fallback_ok,
    }


def evaluate_case(case: EvaluationCase, adapter: AgentAdapter) -> EvaluationResult:
    started = time.perf_counter()
    try:
        answer = adapter.explain(case.request, case)
        gates = _gates(case, answer)
        reason = next((name for name, passed in gates.items() if not passed), None)
        return EvaluationResult(
            caseId=case.id,
            passed=all(gates.values()),
            gates=gates,
            answer=answer,
            durationMs=max(0, round((time.perf_counter() - started) * 1000)),
            failureReason=reason,
        )
    except Exception as error:
        fallback = AgentAnswer(
            action="explain_evidence",
            message=case.request.deterministicResult.message,
            rationaleCode=RATIONALE[case.request.deterministicResult.risk],
            provider="deterministic",
            model="evaluation-error",
            status="deterministic_fallback",
        )
        return EvaluationResult(
            caseId=case.id,
            passed=False,
            gates={"adapter_completed": False},
            answer=fallback,
            durationMs=max(0, round((time.perf_counter() - started) * 1000)),
            failureReason=type(error).__name__,
        )


def _percentile(values: list[int], percentile: float) -> int:
    if not values:
        return 0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * percentile)))
    return ordered[index]


def evaluate_suite(cases: Sequence[EvaluationCase], adapter: AgentAdapter, *, repetitions: int = 1) -> EvaluationReport:
    if repetitions < 1:
        raise ValueError("repetitions_must_be_positive")
    started = datetime.now(UTC).isoformat()
    results = [evaluate_case(case, adapter) for _ in range(repetitions) for case in cases]
    passed = sum(result.passed for result in results)
    providers = Counter(result.answer.provider for result in results)
    latencies = [result.durationMs for result in results]
    return EvaluationReport(
        startedAt=started,
        adapter=adapter.name,
        summary=EvaluationSummary(cases=len(results), passed=passed, failed=len(results) - passed),
        metrics=EvaluationMetrics(
            latencyP50Ms=round(statistics.median(latencies)) if latencies else 0,
            latencyP95Ms=_percentile(latencies, 0.95),
            providerCounts=dict(sorted(providers.items())),
            policyRejections=sum(result.answer.status == "rejected_by_policy" for result in results),
        ),
        results=results,
    )


def write_report(report: EvaluationReport, output_dir: str | Path) -> tuple[Path, Path]:
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    json_path = destination / "report.json"
    markdown_path = destination / "report.md"
    json_path.write_text(json.dumps(report.model_dump(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    failed = [result for result in report.results if not result.passed]
    lines = [
        "# Relatório de avaliação MIPO",
        "",
        f"- Adapter: `{report.adapter}`",
        f"- Casos: {report.summary.cases}",
        f"- Aprovados: {report.summary.passed}",
        f"- Reprovados: {report.summary.failed}",
        f"- Latência p50/p95: {report.metrics.latencyP50Ms} ms / {report.metrics.latencyP95Ms} ms",
        "",
        "## Falhas",
        "",
    ]
    lines.extend(f"- `{result.caseId}`: {result.failureReason}" for result in failed)
    if not failed:
        lines.append("Nenhuma falha.")
    markdown_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return json_path, markdown_path
