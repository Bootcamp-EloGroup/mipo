import "server-only";
import { parseAgentAnswer, type AgentAnswer, type AgentContext } from "@/src/domain/agent";
import type { Product, CartLine, Size } from "@/src/domain/commerce";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResponse = {
  reply: string;
  suggestedAction?: {
    type: "select_size" | "view_product";
    productId?: string;
    size?: Size;
    label?: string;
  };
};

export type CartAuditResult = {
  status: "aligned" | "attention";
  headline: string;
  advice: string;
  careTips: string[];
};

function getPythonAgentConfig() {
  const base = process.env.MIPO_PYTHON_AGENT_URL;
  if (!base) return null;
  const configuredTimeout = Number(process.env.MIPO_PYTHON_AGENT_TIMEOUT_MS ?? 30000);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? Math.min(configuredTimeout, 60000) : 30000;
  return {
    url: base.replace(/\/$/, ""),
    timeoutMs,
    headers: {
      "Content-Type": "application/json",
      ...(process.env.MIPO_PYTHON_AGENT_TOKEN ? { Authorization: `Bearer ${process.env.MIPO_PYTHON_AGENT_TOKEN}` } : {}),
    },
  };
}

export async function runPythonAgent(
  context: AgentContext,
  options?: { richExplanation?: boolean }
): Promise<AgentAnswer> {
  const config = getPythonAgentConfig();
  if (!config) throw new Error("python_agent_not_configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const payload = {
      ...context,
      richExplanation: options?.richExplanation ?? false,
    };
    const response = await fetch(`${config.url}/v1/explain`, {
      method: "POST",
      signal: controller.signal,
      headers: config.headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`python_agent_${response.status}`);
    return parseAgentAnswer(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

export async function chatWithPythonAgent(
  messages: ChatMessage[],
  productContext?: Product | null,
  cartContext?: CartLine[] | null
): Promise<ChatResponse> {
  const config = getPythonAgentConfig();
  if (!config) throw new Error("python_agent_not_configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.url}/v1/chat`, {
      method: "POST",
      signal: controller.signal,
      headers: config.headers,
      body: JSON.stringify({
        messages,
        productContext: productContext ?? null,
        cartContext: cartContext ?? null,
      }),
    });
    if (!response.ok) throw new Error(`python_agent_chat_${response.status}`);
    return (await response.json()) as ChatResponse;
  } finally {
    clearTimeout(timeout);
  }
}

export async function auditCartWithPythonAgent(items: CartLine[]): Promise<CartAuditResult> {
  const config = getPythonAgentConfig();
  if (!config) throw new Error("python_agent_not_configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.url}/v1/audit-cart`, {
      method: "POST",
      signal: controller.signal,
      headers: config.headers,
      body: JSON.stringify({ items }),
    });
    if (!response.ok) throw new Error(`python_agent_audit_${response.status}`);
    return (await response.json()) as CartAuditResult;
  } finally {
    clearTimeout(timeout);
  }
}
