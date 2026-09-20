import argparse
import os
from pathlib import Path
from typing import Sequence

from .adapters import HttpAgentAdapter
from .core import LiveGraphAdapter, OfflineGraphAdapter, evaluate_suite, load_cases, write_report


DEFAULT_CORPUS = Path(__file__).parents[2] / "evals" / "cases.jsonl"
DEFAULT_OUTPUT = Path(__file__).parents[2] / "evals" / "results"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="mipo-eval", description="Avalia o agente MIPO sem confundir qualidade operacional com impacto de negócio.")
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("run")
    run.add_argument("--adapter", choices=("offline", "http", "live"), default="offline")
    run.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    run.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    run.add_argument("--url", default=os.getenv("MIPO_PYTHON_AGENT_URL", "http://127.0.0.1:8000"))
    run.add_argument("--repetitions", type=int, default=1)
    run.add_argument("--confirm-external-calls", action="store_true")
    run.add_argument("--provider", choices=("eloagents", "groq"))
    run.add_argument("--tag", help="Executa somente casos que contenham a tag informada.")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.adapter == "live" and not args.confirm_external_calls:
        print("Execução live bloqueada: use --confirm-external-calls para autorizar chamadas aos providers.")
        return 2
    if args.adapter == "live" and not args.provider:
        print("Execução live requer --provider eloagents ou --provider groq.")
        return 2
    cases = load_cases(args.corpus)
    if args.tag:
        cases = [case for case in cases if args.tag in case.tags]
        if not cases:
            print(f"Nenhum caso encontrado para a tag: {args.tag}")
            return 2
    if args.adapter == "offline":
        adapter = OfflineGraphAdapter()
    elif args.adapter == "http":
        adapter = HttpAgentAdapter(args.url, token=os.getenv("MIPO_PYTHON_AGENT_TOKEN"))
    else:
        adapter = LiveGraphAdapter(args.provider)
        cases = [next(case for case in cases if "critical" in case.tags and not case.expected.mustFallback)]
    report = evaluate_suite(cases, adapter, repetitions=args.repetitions)
    json_path, markdown_path = write_report(report, args.output)
    print(f"Casos: {report.summary.cases} | aprovados: {report.summary.passed} | reprovados: {report.summary.failed}")
    print(f"Relatórios: {json_path} | {markdown_path}")
    return 0 if report.summary.failed == 0 else 1
