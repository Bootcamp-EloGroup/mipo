import "server-only";
import type { AgentAnswer,AgentContext } from "@/src/domain/agent";

export async function runPythonAgent(context:AgentContext):Promise<AgentAnswer>{
  const base=process.env.MIPO_PYTHON_AGENT_URL;
  if(!base)throw new Error("python_agent_not_configured");
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),Number(process.env.MIPO_PYTHON_AGENT_TIMEOUT_MS??30000));
  try{
    const response=await fetch(`${base.replace(/\/$/,"")}/v1/explain`,{method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json",...(process.env.MIPO_PYTHON_AGENT_TOKEN?{Authorization:`Bearer ${process.env.MIPO_PYTHON_AGENT_TOKEN}`}:{})},body:JSON.stringify(context)});
    if(!response.ok)throw new Error(`python_agent_${response.status}`);
    return await response.json() as AgentAnswer;
  }finally{clearTimeout(timeout);}
}
