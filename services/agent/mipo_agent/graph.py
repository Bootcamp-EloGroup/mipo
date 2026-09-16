import os
from typing import TypedDict
from langchain_openai import ChatOpenAI
from langgraph.graph import END,START,StateGraph
from pydantic import BaseModel
from .models import AgentAnswer,AgentRequest
RATIONALE={"stock":"stock_context","size":"size_context","quality":"quality_context","insufficient_evidence":"insufficient_sample","none":"no_risk"}
def allowed_messages(r:AgentRequest)->list[str]:
 x=r.deterministicResult
 if x.risk=="stock": return ["O estoque desta escolha está reduzido. A disponibilidade pode mudar.","Há poucas unidades disponíveis para esta escolha. Considere essa informação antes de continuar."]
 if x.risk=="size" and x.recommendedVariant: return [f"O histórico observado favorece o tamanho {x.recommendedVariant.size}. Você pode comparar antes de continuar."]
 if x.risk=="quality": return ["O histórico observado indica atenção para esta escolha. Você pode comparar a alternativa disponível."]
 if x.risk=="insufficient_evidence": return ["Ainda não há histórico suficiente para recomendar uma mudança. Você pode manter sua escolha."]
 return ["Não identificamos necessidade de intervenção para esta escolha."]
def allowed_actions(r:AgentRequest)->list[str]:
 x=r.deterministicResult
 if x.risk=="size" and x.recommendedVariant:return ["explain_evidence","present_authorized_alternative","no_intervention"]
 if x.risk=="quality" and x.alternativeProductId:return ["explain_evidence","present_authorized_alternative","no_intervention"]
 if x.risk=="stock" and (r.selected.inventory_quantity or 0)>0:return ["explain_evidence","suggest_add_to_cart","no_intervention"]
 return ["explain_evidence","no_intervention"]
class Choice(BaseModel):
 action:str; message:str; rationaleCode:str
class State(TypedDict,total=False):
 request:AgentRequest; evidence:dict; risk:dict; actions:list[str]; answer:AgentAnswer
def evidence(s:State):return {"evidence":{"product":s["request"].product.title,"selected":s["request"].selected.model_dump()}}
def risk(s:State):return {"risk":s["request"].deterministicResult.model_dump()}
def actions(s:State):return {"actions":allowed_actions(s["request"])}
def final(s:State):
 r=s["request"]; msgs=allowed_messages(r); fallback=AgentAnswer(action="explain_evidence",message=r.deterministicResult.message,rationaleCode=RATIONALE[r.deterministicResult.risk],provider="deterministic",model="none",status="deterministic_fallback")
 for provider,key,model,base in [("eloagents","ELOAGENTS_API_KEY",os.getenv("ELOAGENTS_MODEL","gpt-54-mini"),os.getenv("ELOAGENTS_BASE_URL","https://chat.eloagents.click/api")),("groq","GROQ_API_KEY",os.getenv("GROQ_MODEL","openai/gpt-oss-20b"),"https://api.groq.com/openai/v1")]:
  if not os.getenv(key):continue
  try:
   llm=ChatOpenAI(api_key=os.environ[key],base_url=base,model=model,temperature=0,timeout=float(os.getenv("AI_PROVIDER_TIMEOUT_MS","12000"))/1000,max_retries=0).with_structured_output(Choice,method="json_schema")
   c=llm.invoke(f"Escolha somente valores permitidos. actions={s['actions']}; messages={msgs}; rationale={RATIONALE[r.deterministicResult.risk]}")
   if c.action in s["actions"] and c.message in msgs and c.rationaleCode==RATIONALE[r.deterministicResult.risk]:return {"answer":AgentAnswer(action=c.action,message=c.message,rationaleCode=c.rationaleCode,provider=provider,model=model,status=f"{provider}_succeeded")}
  except Exception:continue
 return {"answer":fallback}
b=StateGraph(State);b.add_node("get_product_evidence",evidence);b.add_node("calculate_mipo_risk",risk);b.add_node("get_allowed_actions",actions);b.add_node("final_answer",final);b.add_edge(START,"get_product_evidence");b.add_edge("get_product_evidence","calculate_mipo_risk");b.add_edge("calculate_mipo_risk","get_allowed_actions");b.add_edge("get_allowed_actions","final_answer");b.add_edge("final_answer",END);graph=b.compile()
def run_agent(r:AgentRequest)->AgentAnswer:return graph.invoke({"request":r})["answer"]
