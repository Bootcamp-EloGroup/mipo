import "server-only";

import type { CartLine, Product, Size } from "@/src/domain/commerce";
import { auditCartWithPythonAgent, chatWithPythonAgent } from "@/src/server/mipo-python-agent";

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

/** O processo Python é a única implementação ativa do concierge. */
export async function chatWithMipo(
  messages: ChatMessage[],
  productContext?: Product | null,
  cartContext?: CartLine[] | null,
): Promise<ChatResponse> {
  if (process.env.MIPO_PYTHON_AGENT_URL) {
    try {
      return await chatWithPythonAgent(messages, productContext, cartContext);
    } catch (error) {
      console.warn("MIPO Python concierge unavailable; using safe local fallback", error);
    }
  }

  const productReference = productContext ? ` sobre ${productContext.title}` : "";
  return {
    reply: `A consultoria detalhada${productReference} está temporariamente indisponível. Você pode continuar com a seleção atual ou tentar novamente em instantes.`,
  };
}

export type CartAuditResult = {
  status: "aligned" | "attention";
  headline: string;
  advice: string;
  careTips: string[];
};

/** Sem o serviço Python, não inferimos composição, cuidado ou combinação. */
export async function auditCart(items: CartLine[]): Promise<CartAuditResult> {
  if (process.env.MIPO_PYTHON_AGENT_URL) {
    try {
      return await auditCartWithPythonAgent(items);
    } catch (error) {
      console.warn("MIPO Python cart audit unavailable; using safe local fallback", error);
    }
  }

  if (!items.length) {
    return { status: "aligned", headline: "Sacola vazia", advice: "Nenhum item adicionado para análise.", careTips: [] };
  }

  const pending = items.filter((item) => item.mipoDecision === "pending");
  if (pending.length) {
    return { status: "attention", headline: "Há uma decisão assistida pendente", advice: "Revise o caimento da peça sinalizada antes de concluir a escolha.", careTips: [] };
  }

  return {
    status: "aligned",
    headline: "Seleção revisada item a item",
    advice: "Cada peça mantém sua própria escolha. Tamanhos diferentes entre produtos não representam, por si só, uma inconsistência.",
    careTips: [],
  };
}
