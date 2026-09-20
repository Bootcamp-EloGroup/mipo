import json

import httpx

from mipo_agent.evaluation import HttpAgentAdapter, load_cases
from mipo_agent.evaluation.cli import main


def test_http_adapter_uses_contract_and_optional_token():
    case = load_cases("evals/cases.jsonl")[0]

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer test-token"
        assert request.url.path == "/v1/explain"
        return httpx.Response(200, json={
            "action": "explain_evidence",
            "message": "Não identificamos necessidade de intervenção para esta escolha.",
            "rationaleCode": "no_risk",
            "provider": "eloagents",
            "model": "fake",
            "status": "eloagents_succeeded",
        })

    client = httpx.Client(transport=httpx.MockTransport(handler), base_url="http://agent")
    answer = HttpAgentAdapter("http://agent", token="test-token", client=client).explain(case.request, case)

    assert answer.provider == "eloagents"


def test_offline_cli_writes_report(tmp_path):
    exit_code = main(["run", "--adapter", "offline", "--output", str(tmp_path)])

    assert exit_code == 0
    assert json.loads((tmp_path / "report.json").read_text())["summary"]["failed"] == 0


def test_live_cli_requires_explicit_confirmation(tmp_path):
    exit_code = main(["run", "--adapter", "live", "--output", str(tmp_path)])

    assert exit_code == 2
    assert not (tmp_path / "report.json").exists()


def test_live_cli_requires_an_explicit_provider(tmp_path):
    exit_code = main(["run", "--adapter", "live", "--confirm-external-calls", "--output", str(tmp_path)])

    assert exit_code == 2


def test_cli_can_filter_cases_by_tag(tmp_path):
    exit_code = main(["run", "--adapter", "offline", "--tag", "provider_failure", "--output", str(tmp_path)])

    assert exit_code == 0
    assert json.loads((tmp_path / "report.json").read_text())["summary"]["cases"] == 4
