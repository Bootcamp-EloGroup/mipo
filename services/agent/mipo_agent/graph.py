import hashlib
import json
import os
import re
import time
from typing import TypedDict

import httpx
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel

from .models import AgentAnswer, AgentExecution, AgentRequest, AgentStep, CacheStats

RATIONALE = {
    "stock": "no_risk",
    "size": "size_context",
    "quality": "quality_context",
    "preference_mismatch": "preference_context",
    "insufficient_evidence": "insufficient_sample",
    "none": "no_risk",
}

# --- In-Memory Semantic Context Cache ---
PROMPT_VERSION = "python-react-v1"
POLICY_VERSION = "mipo-safe-v3"


class CacheEntry(BaseModel):
    answer: AgentAnswer
    expiresAt: float


_CACHE: dict[str, CacheEntry] = {}
_CACHE_HITS = 0
_CACHE_MISSES = 0
_MAX_CACHE_ENTRIES = 500


def _cache_key(r: AgentRequest) -> str:
    payload = {
        "promptVersion": PROMPT_VERSION,
        "policyVersion": POLICY_VERSION,
        "request": r.model_dump(mode="json", exclude={"interventionId"}),
    }
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()


def get_cache_stats() -> CacheStats:
    total = _CACHE_HITS + _CACHE_MISSES
    rate = round((_CACHE_HITS / total * 100), 1) if total > 0 else 0.0
    return CacheStats(
        entries=len(_CACHE),
        hits=_CACHE_HITS,
        misses=_CACHE_MISSES,
        hitRatePercent=rate,
    )


def clear_cache() -> None:
    global _CACHE_HITS, _CACHE_MISSES
    _CACHE.clear()
    _CACHE_HITS = 0
    _CACHE_MISSES = 0


# --- Allowed Rules & Fallback Messages ---

def allowed_messages(r: AgentRequest) -> list[str]:
    x = r.deterministicResult
    if x.risk == "preference_mismatch":
        return [x.message]
    if r.selectionContext and r.product.productKind != "apparel":
        return [x.message]
    if x.risk == "stock":
        return ["A escolha pode seguir para o carrinho. Para vestuário, revise seu tamanho usual e a preferência de caimento."]
    if x.risk == "size" and x.recommendedVariant:
        return [f"O histórico observado favorece o tamanho {x.recommendedVariant.size}. Você pode comparar antes de continuar."]
    if x.risk == "quality":
        return ["O histórico observado indica atenção para esta escolha. Você pode comparar a alternativa disponível."]
    if x.risk == "insufficient_evidence":
        return ["Ainda não há histórico suficiente para recomendar uma mudança. Você pode manter sua escolha."]
    return ["Não identificamos necessidade de intervenção para esta escolha."]


def allowed_actions(r: AgentRequest) -> list[str]:
    x = r.deterministicResult
    if x.risk == "preference_mismatch":
        return ["explain_evidence", "present_authorized_alternative", "no_intervention"]
    if r.selectionContext and r.product.productKind != "apparel":
        return ["explain_evidence", "suggest_add_to_cart", "no_intervention"]
    if x.risk == "size" and x.recommendedVariant:
        return ["explain_evidence", "present_authorized_alternative", "no_intervention"]
    if x.risk == "quality" and x.alternativeProductId:
        return ["explain_evidence", "present_authorized_alternative", "no_intervention"]
    return ["explain_evidence", "no_intervention"]


# --- Semantic Guardrails ---

FORBIDDEN_TERMS = (
    "desconto",
    "garantia",
    "garantido",
    "urgente",
    "última chance",
    "promoção",
    "cupom",
    "grátis",
    "100% de certeza",
    "promessa",
)


def validate_guardrails(candidate: str, request: AgentRequest) -> bool:
    if not candidate or len(candidate.strip()) == 0 or len(candidate) > 400:
        return False

    candidate_lower = candidate.casefold()

    # 1. No forbidden marketing claims
    if any(term in candidate_lower for term in FORBIDDEN_TERMS):
        return False

    # 2. Risk 'none': must not recommend a different size
    if request.deterministicResult.risk == "none":
        for size in (" P ", " M ", " G ", " GG "):
            if f"recomenda-se o tamanho{size.lower()}" in candidate_lower or f"opte pelo{size.lower()}" in candidate_lower:
                return False

    # 3. Risk 'size': if recommending another size, must strictly match recommendedVariant.size
    if request.deterministicResult.risk == "size" and request.deterministicResult.recommendedVariant:
        authorized_size = request.deterministicResult.recommendedVariant.size
        other_sizes = [s for s in ["P", "M", "G", "GG"] if s != authorized_size]
        for other in other_sizes:
            pattern = rf"\b(tamanho|opte pelo|sugere-se o)\s+{other}\b"
            if re.search(pattern, candidate, re.IGNORECASE):
                return False

    # 4. Insufficient evidence: must not recommend changing variant
    if request.deterministicResult.risk == "insufficient_evidence":
        if re.search(r"\b(sugerimos|recomendamos|troque|mude)\b", candidate, re.IGNORECASE):
            return False

    return True


# --- Provider Invocation ---

class Choice(BaseModel):
    action: str
    message: str
    rationaleCode: str


def invoke_provider(
    provider: str,
    key: str,
    model: str,
    base: str,
    actions_allowed: list[str],
    messages_allowed: list[str],
    rationale: str,
) -> Choice:
    llm = ChatOpenAI(
        api_key=key,
        base_url=base,
        model=model,
        temperature=0,
        timeout=float(os.getenv("AI_PROVIDER_TIMEOUT_MS", "12000")) / 1000,
        max_retries=0,
    ).with_structured_output(Choice, method="json_schema")
    return llm.invoke(f"Escolha somente valores permitidos. actions={actions_allowed}; messages={messages_allowed}; rationale={rationale}")


def _invoke_rich_generation(provider: str, key: str, model: str, base: str, request: AgentRequest) -> str:
    llm = ChatOpenAI(
        api_key=key,
        base_url=base,
        model=model,
        temperature=0.2,
        timeout=float(os.getenv("AI_PROVIDER_TIMEOUT_MS", "12000")) / 1000,
        max_retries=0,
    )
    prompt = (
        f"Você é a consultora de caimento MIPO para o atelier Vértice (quiet luxury, elegante e precisa).\n"
        f"Escreva uma explicação direta em no máximo 2 frases (máx 280 caracteres) para a seguinte escolha:\n"
        f"Produto: {request.product.title} ({request.product.category})\n"
        f"Tamanho selecionado: {request.selected.size}\n"
        f"Preferência de caimento informada: {request.fitPreference}\n"
        f"Avaliação técnica: {request.deterministicResult.evidence}\n"
        f"Mensagem determinística autorizada: {request.deterministicResult.message}\n"
        f"REGRAS: NÃO invente descontos ou promessas; mantenha o tom sofisticado e assertivo; responda apenas com o texto da explicação."
    )
    res = llm.invoke([{"role": "user", "content": prompt}])
    return res.content.strip() if isinstance(res.content, str) else str(res.content).strip()


# --- Graph State & Nodes ---

class State(TypedDict, total=False):
    request: AgentRequest
    evidence: dict
    risk: dict
    actions: list[str]
    answer: AgentAnswer
    steps: list[AgentStep]
    failureReason: str | None


def _duration(started: float) -> int:
    return max(1, round((time.perf_counter() - started) * 1000))


def evidence(s: State):
    started = time.perf_counter()
    value = {
        "product": s["request"].product.title,
        "selected": s["request"].selected.model_dump(),
    }
    return {
        "evidence": value,
        "steps": s.get("steps", []) + [
            AgentStep(
                stepNumber=1,
                provider="python",
                kind="tool_call",
                toolName="get_product_evidence",
                status="succeeded",
                durationMs=_duration(started),
            )
        ],
    }


def risk(s: State):
    started = time.perf_counter()
    value = s["request"].deterministicResult.model_dump()
    return {
        "risk": value,
        "steps": s.get("steps", []) + [
            AgentStep(
                stepNumber=2,
                provider="python",
                kind="tool_call",
                toolName="calculate_mipo_risk",
                status="succeeded",
                durationMs=_duration(started),
            )
        ],
    }


def actions(s: State):
    started = time.perf_counter()
    value = allowed_actions(s["request"])
    return {
        "actions": value,
        "steps": s.get("steps", []) + [
            AgentStep(
                stepNumber=3,
                provider="python",
                kind="tool_call",
                toolName="get_allowed_actions",
                status="succeeded",
                durationMs=_duration(started),
            )
        ],
    }


def _failure(error: Exception) -> str:
    name = type(error).__name__.casefold()
    message = str(error).casefold()
    if "timeout" in name or "timeout" in message:
        return "timeout"
    if isinstance(error, httpx.HTTPError) or "connect" in name or "status" in message:
        return "provider_unavailable"
    return "invalid_output"


def final(s: State):
    r = s["request"]
    msgs = allowed_messages(r)
    fallback = AgentAnswer(
        action="explain_evidence",
        message=msgs[0],
        rationaleCode=RATIONALE[r.deterministicResult.risk],  # type: ignore[arg-type]
        provider="deterministic",
        model="none",
        status="deterministic_fallback",
    )
    last_failure = "provider_unavailable"
    steps = s.get("steps", [])

    providers = [
        ("eloagents", "ELOAGENTS_API_KEY", os.getenv("ELOAGENTS_MODEL", "gpt-54-mini"), os.getenv("ELOAGENTS_BASE_URL", "https://chat.eloagents.click/api")),
        ("groq", "GROQ_API_KEY", os.getenv("GROQ_MODEL", "openai/gpt-oss-20b"), "https://api.groq.com/openai/v1"),
    ]

    for attempt, (provider, key, model, base) in enumerate(providers, 1):
        if not os.getenv(key):
            continue
        started = time.perf_counter()
        try:
            # Rich explanation mode (with semantic guardrails)
            if getattr(r, "richExplanation", False):
                rich_text = _invoke_rich_generation(provider, os.environ[key], model, base, r)
                if validate_guardrails(rich_text, r) and rich_text in msgs:
                    return {
                        "answer": AgentAnswer(
                            action="explain_evidence",
                            message=rich_text,
                            rationaleCode=RATIONALE[r.deterministicResult.risk],  # type: ignore[arg-type]
                            provider=provider,  # type: ignore[arg-type]
                            model=model,
                            status=f"{provider}_succeeded",  # type: ignore[arg-type]
                        ),
                        "steps": steps + [
                            AgentStep(
                                stepNumber=4,
                                attemptNumber=attempt,
                                provider=provider,  # type: ignore[arg-type]
                                kind="final_answer",
                                status="succeeded",
                                durationMs=_duration(started),
                            )
                        ],
                        "failureReason": None,
                    }
                else:
                    last_failure = "policy_rejected"
                    steps = steps + [
                        AgentStep(
                            stepNumber=4,
                            attemptNumber=attempt,
                            provider=provider,  # type: ignore[arg-type]
                            kind="final_answer",
                            status="rejected",
                            durationMs=_duration(started),
                            failureReason=last_failure,
                        )
                    ]
                    continue

            # Standard structured choice mode (used by evals and offline gates)
            c = invoke_provider(
                provider,
                os.environ[key],
                model,
                base,
                s["actions"],
                msgs,
                RATIONALE[r.deterministicResult.risk],
            )
            if c.action in s["actions"] and c.message in msgs and c.rationaleCode == RATIONALE[r.deterministicResult.risk]:
                return {
                    "answer": AgentAnswer(
                        action=c.action,  # type: ignore[arg-type]
                        message=c.message,
                        rationaleCode=c.rationaleCode,  # type: ignore[arg-type]
                        provider=provider,  # type: ignore[arg-type]
                        model=model,
                        status=f"{provider}_succeeded",  # type: ignore[arg-type]
                    ),
                    "steps": steps + [
                        AgentStep(
                            stepNumber=4,
                            attemptNumber=attempt,
                            provider=provider,  # type: ignore[arg-type]
                            kind="final_answer",
                            status="succeeded",
                            durationMs=_duration(started),
                        )
                    ],
                    "failureReason": None,
                }
            last_failure = "policy_rejected"
            steps = steps + [
                AgentStep(
                    stepNumber=4,
                    attemptNumber=attempt,
                    provider=provider,  # type: ignore[arg-type]
                    kind="final_answer",
                    status="rejected",
                    durationMs=_duration(started),
                    failureReason=last_failure,
                )
            ]
        except Exception as error:
            last_failure = _failure(error)
            steps = steps + [
                AgentStep(
                    stepNumber=4,
                    attemptNumber=attempt,
                    provider=provider,  # type: ignore[arg-type]
                    kind="final_answer",
                    status="failed",
                    durationMs=_duration(started),
                    failureReason=last_failure,
                )
            ]
            continue

    return {
        "answer": fallback,
        "steps": steps + [
            AgentStep(
                stepNumber=4,
                attemptNumber=3,
                provider="python",
                kind="final_answer",
                status="failed",
                durationMs=1,
                failureReason=last_failure,
            )
        ],
        "failureReason": last_failure,
    }


# --- Graph Assembly ---

builder = StateGraph(State)
builder.add_node("get_product_evidence", evidence)
builder.add_node("calculate_mipo_risk", risk)
builder.add_node("get_allowed_actions", actions)
builder.add_node("final_answer", final)

builder.add_edge(START, "get_product_evidence")
builder.add_edge("get_product_evidence", "calculate_mipo_risk")
builder.add_edge("calculate_mipo_risk", "get_allowed_actions")
builder.add_edge("get_allowed_actions", "final_answer")
builder.add_edge("final_answer", END)

graph = builder.compile()


# --- Execution Interfaces with Semantic Caching ---

def find_in_cache(r: AgentRequest) -> AgentAnswer | None:
    global _CACHE_HITS, _CACHE_MISSES
    ckey = _cache_key(r)
    entry = _CACHE.get(ckey)
    if entry and entry.expiresAt > time.time():
        _CACHE_HITS += 1
        return entry.answer.model_copy(update={"status": "cache_hit", "provider": "cache"})
    if entry:
        del _CACHE[ckey]
    _CACHE_MISSES += 1
    return None


def store_in_cache(r: AgentRequest, answer: AgentAnswer) -> None:
    if answer.status in ("eloagents_succeeded", "groq_succeeded", "deterministic_fallback"):
        ckey = _cache_key(r)
        if len(_CACHE) >= _MAX_CACHE_ENTRIES:
            _CACHE.pop(next(iter(_CACHE)))
        configured_ttl = int(os.getenv("MIPO_SEMANTIC_CACHE_TTL_SECONDS", "300"))
        ttl = max(1, min(configured_ttl, 3600))
        _CACHE[ckey] = CacheEntry(answer=answer, expiresAt=time.time() + ttl)


def execute_agent(r: AgentRequest) -> AgentExecution:
    state = graph.invoke({"request": r, "steps": []})
    return AgentExecution(
        answer=state["answer"],
        steps=state["steps"],
        failureReason=state.get("failureReason"),
    )


def run_agent(r: AgentRequest) -> AgentAnswer:
    return execute_agent(r).answer
