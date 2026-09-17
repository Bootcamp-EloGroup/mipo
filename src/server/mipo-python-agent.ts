import "server-only";
import { parseAgentAnswer, type AgentAnswer, type AgentContext } from "@/src/domain/agent";

export async function runPythonAgent(context:AgentContext):Promise<AgentAnswer>{
  const base=process.env.MIPO_PYTHON_AGENT_URL;
  if(!base)throw new Error("python_agent_not_configured");
  const configuredTimeout=Number(process.env.MIPO_PYTHON_AGENT_TIMEOUT_MS??30000);const timeoutMs=Number.isFinite(configuredTimeout)&&configuredTimeout>0?Math.min(configuredTimeout,60000):30000;
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(`${base.replace(/\/$/,"")}/v1/explain`,{method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json",...(process.env.MIPO_PYTHON_AGENT_TOKEN?{Authorization:`Bearer ${process.env.MIPO_PYTHON_AGENT_TOKEN}`}:{})},body:JSON.stringify(context)});
    if(!response.ok)throw new Error(`python_agent_${response.status}`);
    return parseAgentAnswer(await response.json());
  }finally{clearTimeout(timeout);}
}
