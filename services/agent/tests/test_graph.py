import pytest
from mipo_agent.graph import allowed_actions,allowed_messages,run_agent
from mipo_agent.models import AgentRequest
def fixture():return AgentRequest.model_validate({"interventionId":"i","product":{"id":"p","title":"Camisa","category":"Moda","variants":[{"id":"v","size":"GG","returnRate":0,"defectRate":0,"inventory_quantity":3}]},"selected":{"id":"v","size":"GG","returnRate":0,"defectRate":0,"inventory_quantity":3},"fitPreference":"regular","thresholds":{"highReturnRate":.25,"minimumImprovement":.08,"lowStockQuantity":3,"minimumSampleSize":30},"deterministicResult":{"risk":"stock","level":"medium","evidence":"snapshot","message":"Estoque reduzido para esta escolha. A disponibilidade pode mudar."}})
def test_stock(monkeypatch):
 monkeypatch.delenv("ELOAGENTS_API_KEY",raising=False);monkeypatch.delenv("GROQ_API_KEY",raising=False);r=fixture();assert "suggest_add_to_cart" in allowed_actions(r);assert run_agent(r).status=="deterministic_fallback"

@pytest.mark.parametrize(("risk","level","rationale","actions"),[
 ("stock","medium","stock_context",["explain_evidence","suggest_add_to_cart","no_intervention"]),
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
