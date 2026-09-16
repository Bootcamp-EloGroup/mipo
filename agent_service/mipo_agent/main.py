from fastapi import FastAPI
from .graph import run_agent
from .models import AgentAnswer,AgentRequest
app=FastAPI(title="MIPO Agent",version="0.1.0")
@app.get("/health")
def health():return {"status":"ok"}
@app.post("/v1/explain",response_model=AgentAnswer)
def explain(request:AgentRequest)->AgentAnswer:return run_agent(request)
