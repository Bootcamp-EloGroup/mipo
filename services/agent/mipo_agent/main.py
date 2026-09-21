import asyncio
import hmac
import logging
import os
import time
from pathlib import Path

from dotenv import load_dotenv

# Load .env and .env.local from the monorepo root so the agent inherits
# API keys (ELOAGENTS, GROQ, SUPABASE, etc.) that Next.js loads natively.
# Skip loading during pytest to keep unit test suites deterministic and offline.
if "PYTEST_CURRENT_TEST" not in os.environ and "PYTEST_VERSION" not in os.environ:
    _project_root = Path(__file__).resolve().parents[3]  # mipo_agent/ → agent/ → services/ → root
    load_dotenv(_project_root / ".env", override=False)
    load_dotenv(_project_root / ".env.local", override=False)

from fastapi import FastAPI, Header, HTTPException, Response

from .audit import find_existing, persist
from .cart_audit import audit_cart_coherence
from .concierge import handle_concierge_chat
from .graph import clear_cache, execute_agent, find_in_cache, get_cache_stats, store_in_cache
from .models import (
    AgentAnswer,
    AgentRequest,
    CacheStats,
    CartAuditRequest,
    CartAuditResponse,
    ChatRequest,
    ChatResponse,
)

app = FastAPI(title="MIPO Agent", version="0.2.0")
logger = logging.getLogger("mipo_agent")


def _authorize(authorization: str | None) -> None:
    token = os.getenv("MIPO_PYTHON_AGENT_TOKEN")
    if not token:
        return
    expected = f"Bearer {token}"
    if authorization is None or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready():
    return {"status": "ready", "graph": "loaded"}


@app.get("/v1/cache", response_model=CacheStats)
def cache_stats(authorization: str | None = Header(default=None)):
    _authorize(authorization)
    return get_cache_stats()


@app.post("/v1/cache/clear")
def cache_clear(authorization: str | None = Header(default=None)):
    _authorize(authorization)
    clear_cache()
    return {"status": "cleared"}


@app.post("/v1/explain", response_model=AgentAnswer)
async def explain(
    request: AgentRequest,
    response: Response,
    authorization: str | None = Header(default=None),
) -> AgentAnswer:
    _authorize(authorization)

    # 1. Check idempotency in persistent audit store (Supabase)
    existing = await asyncio.to_thread(find_existing, request)
    if existing:
        return existing

    # 2. Check in-memory semantic context cache (enabled for rich explanations or when explicitly configured)
    use_semantic_cache = request.richExplanation or os.getenv("MIPO_ENABLE_SEMANTIC_CACHE", "false").lower() == "true"
    if use_semantic_cache:
        cached = find_in_cache(request)
        if cached:
            return cached

    # 3. Execute LangGraph agent
    started = time.perf_counter()
    timeout = max(1, int(os.getenv("MIPO_AGENT_TOTAL_TIMEOUT_MS", "30000"))) / 1000
    try:
        execution = await asyncio.wait_for(asyncio.to_thread(execute_agent, request), timeout=timeout)
    except TimeoutError as error:
        raise HTTPException(status_code=504, detail="agent_timeout") from error

    # 4. Save to in-memory semantic cache
    if use_semantic_cache:
        store_in_cache(request, execution.answer)

    # 5. Persist run & steps to audit store
    try:
        await asyncio.to_thread(persist, request, execution, started)
    except Exception:
        response.headers["X-MIPO-Audit-Status"] = "audit_failed"
        logger.exception("audit_failed", extra={"failure_reason": "audit_failed"})

    return execution.answer


@app.post("/v1/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    authorization: str | None = Header(default=None),
) -> ChatResponse:
    _authorize(authorization)
    return await asyncio.to_thread(handle_concierge_chat, request)


@app.post("/v1/audit-cart", response_model=CartAuditResponse)
async def audit_cart(
    request: CartAuditRequest,
    authorization: str | None = Header(default=None),
) -> CartAuditResponse:
    _authorize(authorization)
    return await asyncio.to_thread(audit_cart_coherence, request)
