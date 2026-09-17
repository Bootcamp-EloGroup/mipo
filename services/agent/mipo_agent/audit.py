import hashlib,json,os,time
import httpx
from .models import AgentAnswer,AgentExecution,AgentRequest

def _configuration()->tuple[str,str]|None:
 url=os.getenv("SUPABASE_URL");key=os.getenv("SUPABASE_SECRET_KEY")
 return (url,key) if url and key else None

def find_existing(request:AgentRequest)->AgentAnswer|None:
 configuration=_configuration()
 if not configuration:return None
 url,key=configuration
 headers={"apikey":key,"Authorization":f"Bearer {key}"}
 params={"intervention_id":f"eq.{request.interventionId}","status":"neq.pending","select":"status,provider,model,action,message,rationale_code","limit":"1"}
 with httpx.Client(timeout=10) as client:
  response=client.get(f"{url}/rest/v1/mipo_agent_runs",headers=headers,params=params);response.raise_for_status();rows=response.json()
 if not rows:return None
 row=rows[0]
 return AgentAnswer(action=row["action"],message=row["message"],rationaleCode=row["rationale_code"],provider=row["provider"],model=row["model"],status=row["status"])

def persist(request:AgentRequest,execution:AgentExecution,started:float)->None:
 configuration=_configuration()
 if not configuration:return
 url,key=configuration
 headers={"apikey":key,"Authorization":f"Bearer {key}","Content-Type":"application/json","Prefer":"return=representation"}
 answer=execution.answer;context_hash=hashlib.sha256(request.model_dump_json().encode()).hexdigest()
 run={"intervention_id":request.interventionId,"context_hash":context_hash,"status":answer.status,"provider":answer.provider,"model":answer.model,"action":answer.action,"message":answer.message,"rationale_code":answer.rationaleCode,"prompt_version":"python-react-v1","policy_version":"mipo-safe-v2","latency_ms":round((time.perf_counter()-started)*1000),"rejection_reason":execution.failureReason,"completed_at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())}
 with httpx.Client(timeout=10) as client:
  existing=client.get(f"{url}/rest/v1/mipo_agent_runs",headers=headers,params={"intervention_id":f"eq.{request.interventionId}","select":"id","limit":"1"});existing.raise_for_status()
  if existing.json():return
  response=client.post(f"{url}/rest/v1/mipo_agent_runs",headers=headers,json=run);response.raise_for_status();run_id=response.json()[0]["id"]
  steps=[{"run_id":run_id,"step_number":step.stepNumber,"attempt_number":step.attemptNumber,"provider":step.provider,"kind":step.kind,"tool_name":step.toolName,"status":step.status,"duration_ms":step.durationMs,"observation_summary":{"executor":"langgraph","failureReason":step.failureReason}} for step in execution.steps]
  if steps:steps[-1]["observation_summary"].update({"action":answer.action,"rationaleCode":answer.rationaleCode})
  client.post(f"{url}/rest/v1/mipo_agent_steps",headers={**headers,"Prefer":"return=minimal"},content=json.dumps(steps)).raise_for_status()
