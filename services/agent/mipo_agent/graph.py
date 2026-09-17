import os,time
from typing import TypedDict
import httpx
from langchain_openai import ChatOpenAI
from langgraph.graph import END,START,StateGraph
from pydantic import BaseModel
from .models import AgentAnswer,AgentExecution,AgentRequest,AgentStep
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
def invoke_provider(provider:str,key:str,model:str,base:str,actions_allowed:list[str],messages_allowed:list[str],rationale:str)->Choice:
 llm=ChatOpenAI(api_key=key,base_url=base,model=model,temperature=0,timeout=float(os.getenv("AI_PROVIDER_TIMEOUT_MS","12000"))/1000,max_retries=0).with_structured_output(Choice,method="json_schema")
 return llm.invoke(f"Escolha somente valores permitidos. actions={actions_allowed}; messages={messages_allowed}; rationale={rationale}")
class State(TypedDict,total=False):
 request:AgentRequest; evidence:dict; risk:dict; actions:list[str]; answer:AgentAnswer; steps:list[AgentStep]; failureReason:str|None
def _duration(started:float)->int:return max(1,round((time.perf_counter()-started)*1000))
def evidence(s:State):
 started=time.perf_counter();value={"product":s["request"].product.title,"selected":s["request"].selected.model_dump()}
 return {"evidence":value,"steps":s.get("steps",[])+[AgentStep(stepNumber=1,provider="python",kind="tool_call",toolName="get_product_evidence",status="succeeded",durationMs=_duration(started))]}
def risk(s:State):
 started=time.perf_counter();value=s["request"].deterministicResult.model_dump()
 return {"risk":value,"steps":s.get("steps",[])+[AgentStep(stepNumber=2,provider="python",kind="tool_call",toolName="calculate_mipo_risk",status="succeeded",durationMs=_duration(started))]}
def actions(s:State):
 started=time.perf_counter();value=allowed_actions(s["request"])
 return {"actions":value,"steps":s.get("steps",[])+[AgentStep(stepNumber=3,provider="python",kind="tool_call",toolName="get_allowed_actions",status="succeeded",durationMs=_duration(started))]}
def _failure(error:Exception)->str:
 name=type(error).__name__.casefold();message=str(error).casefold()
 if "timeout" in name or "timeout" in message:return "timeout"
 if isinstance(error,httpx.HTTPError) or "connect" in name or "status" in message:return "provider_unavailable"
 return "invalid_output"
def final(s:State):
 r=s["request"]; msgs=allowed_messages(r); fallback=AgentAnswer(action="explain_evidence",message=r.deterministicResult.message,rationaleCode=RATIONALE[r.deterministicResult.risk],provider="deterministic",model="none",status="deterministic_fallback");last_failure="provider_unavailable";steps=s.get("steps",[])
 for attempt,(provider,key,model,base) in enumerate([("eloagents","ELOAGENTS_API_KEY",os.getenv("ELOAGENTS_MODEL","gpt-54-mini"),os.getenv("ELOAGENTS_BASE_URL","https://chat.eloagents.click/api")),("groq","GROQ_API_KEY",os.getenv("GROQ_MODEL","openai/gpt-oss-20b"),"https://api.groq.com/openai/v1")],1):
  if not os.getenv(key):continue
  started=time.perf_counter()
  try:
   c=invoke_provider(provider,os.environ[key],model,base,s["actions"],msgs,RATIONALE[r.deterministicResult.risk])
   if c.action in s["actions"] and c.message in msgs and c.rationaleCode==RATIONALE[r.deterministicResult.risk]:return {"answer":AgentAnswer(action=c.action,message=c.message,rationaleCode=c.rationaleCode,provider=provider,model=model,status=f"{provider}_succeeded"),"steps":steps+[AgentStep(stepNumber=4,attemptNumber=attempt,provider=provider,kind="final_answer",status="succeeded",durationMs=_duration(started))],"failureReason":None}
   last_failure="policy_rejected";steps=steps+[AgentStep(stepNumber=4,attemptNumber=attempt,provider=provider,kind="final_answer",status="rejected",durationMs=_duration(started),failureReason=last_failure)]
  except Exception as error:
   last_failure=_failure(error);steps=steps+[AgentStep(stepNumber=4,attemptNumber=attempt,provider=provider,kind="final_answer",status="failed",durationMs=_duration(started),failureReason=last_failure)];continue
 return {"answer":fallback,"steps":steps+[AgentStep(stepNumber=4,attemptNumber=3,provider="python",kind="final_answer",status="failed",durationMs=1,failureReason=last_failure)],"failureReason":last_failure}
b=StateGraph(State);b.add_node("get_product_evidence",evidence);b.add_node("calculate_mipo_risk",risk);b.add_node("get_allowed_actions",actions);b.add_node("final_answer",final);b.add_edge(START,"get_product_evidence");b.add_edge("get_product_evidence","calculate_mipo_risk");b.add_edge("calculate_mipo_risk","get_allowed_actions");b.add_edge("get_allowed_actions","final_answer");b.add_edge("final_answer",END);graph=b.compile()
def execute_agent(r:AgentRequest)->AgentExecution:
 state=graph.invoke({"request":r,"steps":[]})
 return AgentExecution(answer=state["answer"],steps=state["steps"],failureReason=state.get("failureReason"))
def run_agent(r:AgentRequest)->AgentAnswer:return execute_agent(r).answer
