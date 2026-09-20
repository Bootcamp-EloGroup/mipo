import time

from fastapi.testclient import TestClient

from mipo_agent.evaluation import load_cases
from mipo_agent.main import app


def request_payload():
    return load_cases("evals/cases.jsonl")[0].request.model_dump()


def test_readiness_does_not_call_external_providers():
    response = TestClient(app).get("/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready", "graph": "loaded"}


def test_optional_bearer_token_is_enforced(monkeypatch):
    monkeypatch.setenv("MIPO_PYTHON_AGENT_TOKEN", "local-secret")
    client = TestClient(app)

    assert client.post("/v1/explain", json=request_payload()).status_code == 401
    assert client.post("/v1/explain", json=request_payload(), headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.post("/v1/explain", json=request_payload(), headers={"Authorization": "Bearer local-secret"}).status_code == 200


def test_completed_intervention_is_returned_without_running_graph(monkeypatch):
    from mipo_agent import main
    from mipo_agent.models import AgentAnswer

    cached = AgentAnswer(action="explain_evidence", message="Mensagem já auditada.", rationaleCode="no_risk", provider="eloagents", model="cached", status="eloagents_succeeded")
    monkeypatch.setattr(main, "find_existing", lambda _request: cached)
    monkeypatch.setattr(main, "execute_agent", lambda _request: (_ for _ in ()).throw(AssertionError("graph_must_not_run")))

    response = TestClient(app).post("/v1/explain", json=request_payload())

    assert response.status_code == 200
    assert response.json()["message"] == "Mensagem já auditada."


def test_total_timeout_returns_controlled_error(monkeypatch):
    from mipo_agent import main

    monkeypatch.setenv("MIPO_AGENT_TOTAL_TIMEOUT_MS", "5")
    monkeypatch.setattr(main, "find_existing", lambda _request: None)
    monkeypatch.setattr(main, "execute_agent", lambda _request: time.sleep(0.05))

    response = TestClient(app).post("/v1/explain", json=request_payload())

    assert response.status_code == 504
    assert response.json()["detail"] == "agent_timeout"


def test_audit_failure_does_not_break_the_customer_experience(monkeypatch,caplog):
    from mipo_agent import main
    from mipo_agent.graph import execute_agent

    monkeypatch.setattr(main, "find_existing", lambda _request: None)
    monkeypatch.setattr(main, "execute_agent", execute_agent)
    monkeypatch.setattr(main, "persist", lambda *_args: (_ for _ in ()).throw(RuntimeError("database unavailable")))

    response = TestClient(app).post("/v1/explain", json=request_payload())

    assert response.status_code == 200
    assert "audit_failed" in caplog.text
    assert response.headers["X-MIPO-Audit-Status"] == "audit_failed"
