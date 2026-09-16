from mipo_agent.graph import allowed_actions,run_agent
from mipo_agent.models import AgentRequest
def fixture():return AgentRequest.model_validate({"interventionId":"i","product":{"id":"p","title":"Camisa","category":"Moda","variants":[{"id":"v","size":"GG","returnRate":0,"defectRate":0,"inventory_quantity":3}]},"selected":{"id":"v","size":"GG","returnRate":0,"defectRate":0,"inventory_quantity":3},"fitPreference":"regular","thresholds":{"highReturnRate":.25,"minimumImprovement":.08,"lowStockQuantity":3,"minimumSampleSize":30},"deterministicResult":{"risk":"stock","level":"medium","evidence":"snapshot","message":"Estoque reduzido para esta escolha. A disponibilidade pode mudar."}})
def test_stock(monkeypatch):
 monkeypatch.delenv("ELOAGENTS_API_KEY",raising=False);monkeypatch.delenv("GROQ_API_KEY",raising=False);r=fixture();assert "suggest_add_to_cart" in allowed_actions(r);assert run_agent(r).status=="deterministic_fallback"
