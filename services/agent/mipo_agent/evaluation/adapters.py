import httpx

from ..models import AgentAnswer, AgentRequest
from .models import EvaluationCase


class HttpAgentAdapter:
    name = "http"

    def __init__(self, base_url: str, *, token: str | None = None, timeout_seconds: float = 35, client: httpx.Client | None = None):
        self._token = token
        self._client = client or httpx.Client(base_url=base_url.rstrip("/"), timeout=timeout_seconds)

    def explain(self, request: AgentRequest, _case: EvaluationCase) -> AgentAnswer:
        headers = {"Authorization": f"Bearer {self._token}"} if self._token else {}
        response = self._client.post("/v1/explain", headers=headers, json=request.model_dump())
        response.raise_for_status()
        return AgentAnswer.model_validate(response.json())
