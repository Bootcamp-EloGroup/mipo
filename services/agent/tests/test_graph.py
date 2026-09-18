import pytest
from mipo_agent.graph import Choice,allowed_actions,allowed_messages,execute_agent,run_agent
from mipo_agent.models import AgentRequest
def fixture():return AgentRequest.model_validate({"interventionId":"i","product":{"id":"p","title":"Camisa","category":"Moda","variants":[{"id":"v","size":"GG","returnRate":0,"defectRate":0,"inventory_quantity":3}]},"selected":{"id":"v","size":"GG","returnRate":0,"defectRate":0,"inventory_quantity":3},"fitPreference":"regular","thresholds":{"highReturnRate":.25,"minimumImprovement":.08,"lowStockQuantity":3,"minimumSampleSize":30},"deterministicResult":{"risk":"none","level":"low","evidence":"Nenhum limiar foi atingido.","message":"Não identificamos necessidade de intervenção para esta escolha."}})
def test_standard_choice_does_not_use_inventory(monkeypatch):
 monkeypatch.delenv("ELOAGENTS_API_KEY",raising=False);monkeypatch.delenv("GROQ_API_KEY",raising=False);r=fixture();assert "suggest_add_to_cart" not in allowed_actions(r);assert run_agent(r).status=="deterministic_fallback"

@pytest.mark.parametrize(("risk","level","rationale","actions"),[
 ("size","high","size_context",["explain_evidence","present_authorized_alternative","no_intervention"]),
 ("quality","high","quality_context",["explain_evidence","present_authorized_alternative","no_intervention"]),
 ("insufficient_evidence","low","insufficient_sample",["explain_evidence","no_intervention"]),
 ("none","low","no_risk",["explain_evidence","no_intervention"]),
])
def test_risk_contracts(monkeypatch,risk,level,rationale,actions):
 monkeypatch.delenv("ELOAGENTS_API_KEY",raising=False);monkeypatch.delenv("GROQ_API_KEY",raising=False)
 data=fixture().model_dump();data["deterministicResult"].update({"risk":risk,"level":level,"recommendedVariant":data["selected"] if risk=="size" else None,"alternativeProductId":"p2" if risk=="quality" else None});data["product"]["alternativeProductId"]="p2" if risk=="quality" else None
 request=AgentRequest.model_validate(data);answer=run_agent(request)
 assert answer.rationaleCode==rationale
 assert allowed_actions(request)==actions
 assert answer.message in allowed_messages(request) or answer.message==request.deterministicResult.message

def test_execution_trace_has_observed_tool_durations(monkeypatch):
 monkeypatch.delenv("ELOAGENTS_API_KEY",raising=False);monkeypatch.delenv("GROQ_API_KEY",raising=False)
 execution=execute_agent(fixture())
 assert [step.toolName for step in execution.steps[:3]]==["get_product_evidence","calculate_mipo_risk","get_allowed_actions"]
 assert all(step.durationMs>0 for step in execution.steps)

def test_eloagents_failure_is_audited_before_groq_success(monkeypatch):
 from mipo_agent import graph as graph_module
 monkeypatch.setenv("ELOAGENTS_API_KEY","fake");monkeypatch.setenv("GROQ_API_KEY","fake")
 calls=[]
 def invoke(provider,*_args):
  calls.append(provider)
  if provider=="eloagents":raise TimeoutError("provider timeout")
  request=fixture();return Choice(action="explain_evidence",message=allowed_messages(request)[0],rationaleCode="no_risk")
 monkeypatch.setattr(graph_module,"invoke_provider",invoke)
 execution=execute_agent(fixture())
 assert calls==["eloagents","groq"]
 assert execution.answer.status=="groq_succeeded"
 assert [(step.provider,step.status,step.failureReason) for step in execution.steps[3:]]==[("eloagents","failed","timeout"),("groq","succeeded",None)]
