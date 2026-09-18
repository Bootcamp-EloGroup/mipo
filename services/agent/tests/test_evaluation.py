import json
from pathlib import Path

from mipo_agent.evaluation import (
    OfflineGraphAdapter,
    evaluate_case,
    evaluate_suite,
    load_cases,
    write_report,
)


CASES = Path(__file__).parents[1] / "evals" / "cases.jsonl"


def test_corpus_is_valid_and_covers_the_spec():
    cases = load_cases(CASES)

    assert len(cases) >= 22
    assert {case.expected.risk for case in cases} == {
        "size",
        "quality",
        "insufficient_evidence",
        "none",
    }
    assert sum("adversarial" in case.tags for case in cases) >= 4
    assert sum("provider_failure" in case.tags for case in cases) >= 4


def test_offline_case_is_checked_through_the_public_seam():
    case = load_cases(CASES)[0]
    result = evaluate_case(case, OfflineGraphAdapter())

    assert result.passed
    assert all(result.gates.values())
    assert result.answer.rationaleCode == case.expected.rationaleCode
    assert result.durationMs >= 0


def test_suite_writes_reproducible_sanitized_reports(tmp_path):
    cases = load_cases(CASES)
    report = evaluate_suite(cases, OfflineGraphAdapter())
    json_path, markdown_path = write_report(report, tmp_path)

    serialized = json.loads(json_path.read_text())
    markdown = markdown_path.read_text()
    assert serialized["schemaVersion"] == 1
    assert serialized["summary"] == {"cases": len(cases), "passed": len(cases), "failed": 0}
    assert "ELOAGENTS_API_KEY" not in markdown
    assert "SUPABASE_SECRET_KEY" not in markdown


def test_failing_provider_scenarios_use_the_expected_fallback():
    cases = [case for case in load_cases(CASES) if "provider_failure" in case.tags]
    report = evaluate_suite(cases, OfflineGraphAdapter())

    assert report.summary.failed == 0
    assert all(result.answer.status == "deterministic_fallback" for result in report.results)
