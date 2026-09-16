import "server-only";

export type ProviderName = "eloagents" | "groq";
export type ProviderMessage = { role: "system" | "user" | "assistant"; content: string };
type ExpectedTurn = "get_product_evidence" | "calculate_mipo_risk" | "get_allowed_actions" | "final_answer";

type ProviderConfig = { name: ProviderName; baseUrl: string; apiKey: string; model: string };

function config(name: ProviderName): ProviderConfig | null {
  if (name === "eloagents") {
    const apiKey = process.env.ELOAGENTS_API_KEY; const model = process.env.ELOAGENTS_MODEL;
    if (!apiKey || !model) return null;
    return { name, apiKey, model, baseUrl: (process.env.ELOAGENTS_BASE_URL ?? "https://chat.eloagents.click/api").replace(/\/$/, "") };
  }
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  return { name, apiKey, model: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b", baseUrl: "https://api.groq.com/openai/v1" };
}

function strictFormat(expected:ExpectedTurn){
  const nullableFields=expected==="final_answer"?{tool:{type:"null"},action:{type:"string",enum:["explain_evidence","present_authorized_alternative","suggest_add_to_cart","no_intervention"]},message:{type:"string"},rationaleCode:{type:"string",enum:["stock_context","size_context","quality_context","insufficient_sample","no_risk"]}}:{tool:{type:"string",enum:[expected]},action:{type:"null"},message:{type:"null"},rationaleCode:{type:"null"}};
  return {type:"json_schema",json_schema:{name:`mipo_react_${expected}`,strict:true,schema:{type:"object",properties:{type:{type:"string",enum:[expected==="final_answer"?"final_answer":"tool_call"]},...nullableFields,arguments:{type:"object",properties:{},additionalProperties:false}},required:["type","tool","arguments","action","message","rationaleCode"],additionalProperties:false}}};
}

export async function callProvider(name: ProviderName, messages: ProviderMessage[], timeoutMs: number, expected:ExpectedTurn="final_answer"): Promise<{content:string;model:string;latencyMs:number}> {
  const provider = config(name); if (!provider) throw new Error(`${name}_not_configured`);
  const started = Date.now(); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const responseFormat=name==="groq"?strictFormat(expected):{type:"json_object"};
    const response = await fetch(`${provider.baseUrl}/chat/completions`, { method:"POST", signal:controller.signal, headers:{ Authorization:`Bearer ${provider.apiKey}`, "Content-Type":"application/json" }, body:JSON.stringify({ model:provider.model, temperature:0.1, max_completion_tokens:1024, ...(name==="groq"?{reasoning_effort:"low",tool_choice:"none"}:{}), messages, response_format:responseFormat }) });
    if (!response.ok) throw new Error(`${name}_${response.status}`);
    const body = await response.json() as { choices?:Array<{message?:{content?:string}}> };
    const content = body.choices?.[0]?.message?.content; if (!content) throw new Error(`${name}_empty_response`);
    return { content, model:provider.model, latencyMs:Date.now()-started };
  } finally { clearTimeout(timeout); }
}
