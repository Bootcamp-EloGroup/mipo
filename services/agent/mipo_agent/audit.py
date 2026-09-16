import hashlib,json,os,time
import httpx
from .models import AgentAnswer,AgentRequest

def persist(request:AgentRequest,answer:AgentAnswer,started:float)->None:
 url=os.getenv("SUPABASE_URL");key=os.getenv("SUPABASE_SECRET_KEY")
 if not url or not key:return
 headers={"apikey":key,"Authorization":f"Bearer {key}","Content-Type":"application/json","Prefer":"return=representation"}
 context_hash=hashlib.sha256(request.model_dump_json().encode()).hexdigest()
 run={"intervention_id":request.interventionId,"context_hash":context_hash,"status":answer.status,"provider":answer.provider,"model":answer.model,"action":answer.action,"message":answer.message,"rationale_code":answer.rationaleCode,"prompt_version":"python-react-v1","policy_version":"mipo-safe-v2","latency_ms":round((time.perf_counter()-started)*1000),"completed_at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())}
 with httpx.Client(timeout=10) as client:
  existing=client.get(f"{url}/rest/v1/mipo_agent_runs",headers=headers,params={"intervention_id":f"eq.{request.interventionId}","select":"id","limit":"1"});existing.raise_for_status()
  if existing.json():return
  response=client.post(f"{url}/rest/v1/mipo_agent_runs",headers=headers,json=run);response.raise_for_status();run_id=response.json()[0]["id"]
  tools=["get_product_evidence","calculate_mipo_risk","get_allowed_actions"]
  steps=[{"run_id":run_id,"step_number":i+1,"attempt_number":1,"provider":"python","kind":"tool_call","tool_name":tool,"status":"succeeded","duration_ms":0,"observation_summary":{"executor":"langgraph"}} for i,tool in enumerate(tools)]
  steps.append({"run_id":run_id,"step_number":4,"attempt_number":1,"provider":answer.provider if answer.provider!="deterministic" else "python","kind":"final_answer","tool_name":None,"status":"succeeded","duration_ms":run["latency_ms"],"observation_summary":{"action":answer.action,"rationaleCode":answer.rationaleCode}})
  client.post(f"{url}/rest/v1/mipo_agent_steps",headers={**headers,"Prefer":"return=minimal"},content=json.dumps(steps)).raise_for_status()
