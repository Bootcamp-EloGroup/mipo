import asyncio
import hmac
import logging
import os
import time

from fastapi import FastAPI,Header,HTTPException
from .graph import execute_agent
from .models import AgentAnswer,AgentRequest
from .audit import find_existing,persist

app=FastAPI(title="MIPO Agent",version="0.1.0")
logger=logging.getLogger("mipo_agent")
@app.get("/health")
def health():return {"status":"ok"}

@app.get("/ready")
def ready():return {"status":"ready","graph":"loaded"}

def _authorize(authorization:str|None)->None:
 token=os.getenv("MIPO_PYTHON_AGENT_TOKEN")
 if not token:return
 expected=f"Bearer {token}"
 if authorization is None or not hmac.compare_digest(authorization,expected):raise HTTPException(status_code=401,detail="unauthorized")

@app.post("/v1/explain",response_model=AgentAnswer)
async def explain(request:AgentRequest,authorization:str|None=Header(default=None))->AgentAnswer:
 _authorize(authorization)
 existing=await asyncio.to_thread(find_existing,request)
 if existing:return existing
 started=time.perf_counter();timeout=max(1,int(os.getenv("MIPO_AGENT_TOTAL_TIMEOUT_MS","30000")))/1000
 try:execution=await asyncio.wait_for(asyncio.to_thread(execute_agent,request),timeout=timeout)
 except TimeoutError as error:raise HTTPException(status_code=504,detail="agent_timeout") from error
 try:await asyncio.to_thread(persist,request,execution,started)
 except Exception:logger.exception("audit_failed")
 return execution.answer
