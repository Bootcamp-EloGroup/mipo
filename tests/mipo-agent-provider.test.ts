import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only",()=>({}));

describe("adaptador dos provedores do agente",()=>{
  beforeEach(()=>{vi.unstubAllGlobals();process.env.ELOAGENTS_API_KEY="test-only";process.env.ELOAGENTS_MODEL="test-model";process.env.ELOAGENTS_BASE_URL="https://elo.test/api";process.env.GROQ_API_KEY="test-only";process.env.GROQ_MODEL="openai/gpt-oss-20b";});

  it("usa JSON simples no EloAgents e nunca envia a chave no corpo",async()=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'{"type":"tool_call"}'}}]}),{status:200}));vi.stubGlobal("fetch",fetchMock);
    const {callProvider}=await import("../src/server/mipo-agent-provider"); await callProvider("eloagents",[{role:"user",content:"teste"}],100);
    const [url,init]=fetchMock.mock.calls[0]; const body=JSON.parse(String(init.body));
    expect(url).toBe("https://elo.test/api/chat/completions"); expect(body.response_format).toEqual({type:"json_object"}); expect(String(init.body)).not.toContain("test-only");
  });

  it("exige JSON Schema estrito no fallback Groq",async()=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'{"type":"tool_call"}'}}]}),{status:200}));vi.stubGlobal("fetch",fetchMock);
    const {callProvider}=await import("../src/server/mipo-agent-provider"); await callProvider("groq",[{role:"user",content:"teste"}],100,"get_product_evidence");
    const body=JSON.parse(String(fetchMock.mock.calls[0][1].body)); expect(body.response_format.json_schema.strict).toBe(true); expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
    expect(body.response_format.json_schema.name).toBe("mipo_react_get_product_evidence");
    expect(body.response_format.json_schema.schema.properties.tool.enum).toEqual(["get_product_evidence"]);
    expect(body.max_completion_tokens).toBe(1024); expect(body.reasoning_effort).toBe("low"); expect(body.tool_choice).toBe("none");
  });

  it("interrompe uma chamada que ultrapassa o timeout",async()=>{
    vi.stubGlobal("fetch",vi.fn((_url,_init)=>new Promise((_resolve,reject)=>setTimeout(()=>reject(new DOMException("aborted","AbortError")),30))));
    const {callProvider}=await import("../src/server/mipo-agent-provider"); await expect(callProvider("eloagents",[{role:"user",content:"teste"}],5)).rejects.toThrow();
  });
});
