import "server-only";
import type { Product, ProductVariant, CartLine, Size } from "@/src/domain/commerce";
import type { RiskResult, FitPreference } from "@/src/services/mipo";

const CATALOG_KNOWLEDGE = `
Catálogo Vértice (Edição 06 - Atelier Cotidiano):
1. Vestido Aurora: Linho solar terracota (100% linho puro pré-encolhido), comprimento midi, corte evasê, decote quadrado estruturado. Sem elastano (zero stretch). Por não esticar, se a cliente estiver entre tamanhos ou tiver busto volumoso, recomendamos um tamanho acima (M em vez de P). Taxa histórica de troca de 32% no tamanho P por aperto no busto.
2. Vestido Sereno: Algodão encorpado azul marinho profundo (100% algodão penteado), caimento reto minimalista, fendas laterais discretas, zíper invisível dorsal. Tecido firme e estruturado.
3. Blusa Trama: Tricot artesanal areia (fio 100% algodão ecológico), trama aberta respirável, corte relaxed com ombro deslocado. Caimento solto e fluido. Lavagem delicada à mão em água fria, secagem na horizontal.
4. Calça Eixo: Alfaiataria fluida verde oliva (viscose com lã fria), cós alto com pregas duplas frontais, caimento amplo e reto tipo pantalona sutil. Veste o tamanho exato na cintura.
5. Jaqueta Lume: Sarja utilitária açafrão (100% algodão pesado), botões em chifre natural, bolsos frontais alfaiatados, caimento reto estruturado. Excelente sobreposição sobre a Blusa Trama ou Vestido Sereno.
6. Casaco Órbita: Tricot pesado vinho borgonha (blend lã natural e algodão), modelagem cocoon envolvente e alongada. Modelagem intencionalmente generosa; tamanho P veste confortavelmente quem usa M.
7. Blush Bruma: Textura creme-pó pêssego translúcido, pigmentos minerais, acabamento luminoso natural "pele viçosa".
8. Balm Luz: Hidratação labial profunda nude rosado, manteiga de karité orgânica e óleos botânicos, acabamento acetinado.
`;

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

async function callEloAgentsLlm(messages: ChatMessage[], temperature = 0.4): Promise<string> {
  const apiKey = process.env.ELOAGENTS_API_KEY;
  if (!apiKey) throw new Error("eloagents_key_missing");
  const model = process.env.ELOAGENTS_MODEL ?? "gpt-54-mini";
  const baseUrl = (process.env.ELOAGENTS_BASE_URL ?? "https://chat.eloagents.click/api").replace(/\/$/, "");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: 450,
      }),
    });

    if (!res.ok) {
      throw new Error(`eloagents_http_${res.status}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("eloagents_empty_response");
    }
    return content.trim();
  } finally {
    clearTimeout(timeout);
  }
}

import { chatWithPythonAgent, auditCartWithPythonAgent } from "@/src/server/mipo-python-agent";

/**
 * Conversational Assistant for Vértice Atelier.
 * Provides fit guidance, styling recommendations, fabric care tips, and answers questions.
 */
export async function chatWithMipo(
  messages: ChatMessage[],
  productContext?: Product | null,
  cartContext?: CartLine[] | null
): Promise<ChatResponse> {
  if (process.env.MIPO_PYTHON_AGENT_URL) {
    try {
      return await chatWithPythonAgent(messages, productContext, cartContext);
    } catch {
      // Fallback to internal atelier reasoning if python agent is offline
    }
  }
  const contextBlock = `[CONTEXTO & DIRETRIZES DO ATELIER VÉRTICE:
Você é a "MIPO Concierge", a consultora oficial de estilo, caimento e curadoria do atelier autoral Vértice.
Seu papel é orientar clientes com precisão, sofisticação e cordialidade sobre caimento, tecidos nobres, combinações e cuidados.
Diretrizes:
- Voz: Quiet luxury, elegante, atenta aos detalhes, em português impecável.
- Seja assertiva e concisa (2 a 3 parágrafos curtos).
- Considere as propriedades reais dos tecidos (linho não estica, tricot se molda, casaco cocoon é amplo).
- Se indicar um tamanho específico (P, M, G ou GG), inclua no texto: [SUGESTÃO: TAMANHO_<P|M|G|GG>].
- Se sugerir uma peça complementar para compor look, inclua: [SUGESTÃO: PRODUTO_<ID_DO_PRODUTO>].

Catálogo Vértice:
${CATALOG_KNOWLEDGE}

${productContext ? `Peça Atual em Foco:
Produto: "${productContext.title}" (${productContext.category}).
Descrição: ${productContext.description}.
Variações: ${productContext.variants.map((v) => `${v.size ?? v.title} (R$ ${(v.price / 100).toFixed(2)})`).join(", ")}.
` : ""}
${cartContext && cartContext.length > 0 ? `Sacola Atual:
${cartContext.map((c) => `- ${c.title} (tam: ${c.size ?? "padrão"}, qtd: ${c.quantity})`).join("\n")}
` : ""}]`;

  // Prepend context to the user turn so proxy cannot overwrite it
  const formattedMessages: ChatMessage[] = messages.map((m, idx) => {
    if (idx === messages.length - 1 && m.role === "user") {
      return {
        role: "user",
        content: `${contextBlock}\n\nMensagem do cliente: ${m.content}`,
      };
    }
    return m;
  });

  try {
    const rawReply = await callEloAgentsLlm(formattedMessages.slice(-6), 0.4);

    let cleanedReply = rawReply;
    let suggestedAction: ChatResponse["suggestedAction"] = undefined;

    // Detect [SUGESTÃO: TAMANHO_X]
    const sizeMatch = cleanedReply.match(/\[SUGESTÃO:\s*TAMANHO_([PMG]|GG)\]/i);
    if (sizeMatch) {
      const size = sizeMatch[1].toUpperCase() as Size;
      suggestedAction = {
        type: "select_size",
        size,
        productId: productContext?.id,
        label: `Selecionar tamanho ${size}`,
      };
      cleanedReply = cleanedReply.replace(/\[SUGESTÃO:\s*TAMANHO_([PMG]|GG)\]/i, "").trim();
    }

    // Detect [SUGESTÃO: PRODUTO_X]
    const prodMatch = cleanedReply.match(/\[SUGESTÃO:\s*PRODUTO_([a-zA-Z0-9_-]+)\]/i);
    if (prodMatch) {
      const prodId = prodMatch[1].toLowerCase();
      suggestedAction = {
        type: "view_product",
        productId: prodId,
        label: `Ver produto sugerido`,
      };
      cleanedReply = cleanedReply.replace(/\[SUGESTÃO:\s*PRODUTO_([a-zA-Z0-9_-]+)\]/i, "").trim();
    }

    return {
      reply: cleanedReply,
      suggestedAction,
    };
  } catch (error) {
    console.warn("MIPO Chat LLM unavailable, using intelligent atelier fallback:", error);

    // Contextual fallback response
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content.toLowerCase() ?? "";

    if (productContext?.id === "prod_vestido_aurora" || lastUserMsg.includes("aurora") || lastUserMsg.includes("linho")) {
      return {
        reply: "O Vestido Aurora é confeccionado em 100% linho puro pré-encolhido sem elastano. Como a fibra natural é nobre e rígida no busto, se você costuma variar entre P e M ou prefere liberdade respirável, o tamanho M é a escolha ideal para o caimento fluido perfeito.",
        suggestedAction: { type: "select_size", size: "M", productId: "prod_vestido_aurora", label: "Selecionar tamanho M" },
      };
    }

    if (productContext?.id === "prod_calca_eixo" || lastUserMsg.includes("eixo") || lastUserMsg.includes("calça")) {
      return {
        reply: "A Calça Eixo possui corte de alfaiataria em viscose com lã fria e pregas frontais. O cós é ajustado na cintura alta e as pernas caem amplas. Para combinar, a Blusa Trama em tom areia compõe uma harmonia impecável.",
        suggestedAction: { type: "view_product", productId: "prod_blusa_trama", label: "Ver Blusa Trama" },
      };
    }

    if (lastUserMsg.includes("tamanho") || lastUserMsg.includes("medida") || lastUserMsg.includes("veste")) {
      return {
        reply: "Para garantir o caimento ideal em peças autorais da Vértice: as modelagens em linho e algodão estruturado são fiéis à numeração mas sem elastano. Se busca caimento mais ajustado, siga seu tamanho habitual; para mais fluidez, opte por um tamanho acima.",
      };
    }

    return {
      reply: "No atelier Vértice, priorizamos matérias-primas puras como linho solar, tricot em algodão ecológico e lã fria. Como posso ajudar com seu caimento, medidas ou combinação de peças hoje?",
    };
  }
}

/**
 * Intelligent Fit Explanation for Product Details.
 * Generates an articulate, fabric-aware rationale for a size or variant recommendation.
 */
export async function explainFitDecision(
  product: Product,
  selected: ProductVariant,
  fitPreference: FitPreference,
  result: RiskResult,
  usualSize?: Size | null
): Promise<{ message: string; provider: "eloagents" | "deterministic"; model: string }> {
  const isUsualMatch = Boolean(usualSize && usualSize === selected.size);
  const sizeDifference = usualSize && selected.size ? `${usualSize} habitual vs ${selected.size} selecionado` : "não informado";

  const promptMessages: ChatMessage[] = [
    {
      role: "user",
      content: `[DIRETRIZ DE CAIMENTO MIPO - ATELIER VÉRTICE:
Você é o consultor de caimento MIPO.
Sua tarefa é escrever a explicação de caimento para o card de assistência na página do produto.
REGRAS RÍGIDAS:
- Responda DIRETAMENTE com a explicação final, em no máximo 2 frases elegantes e objetivas (máximo 280 caracteres).
- NÃO inclua introduções como "Claro", "Aqui está", nem saudações, nem perguntas no final.
- Se o tamanho selecionado (${selected.size}) for IGUAL ao habitual (${usualSize}), valide a escolha destacando como a fibra e o corte da peça comportam as medidas.
- Se o tamanho divergir do habitual mas for INTENCIONAL (ex: preferência de caimento ${fitPreference}, ou peça sem elastano que veste melhor um número acima), valide e elogie a escolha consciente!
- NÃO conteste a escolha apenas porque os tamanhos diferem: analise a intenção e a fibra do tecido.
- Se houver recomendação alternativa (tamanho ${result.recommendedVariant?.size ?? "nenhum"}), fundamente com base nas devoluções reais e modelagem.

Catálogo:
${CATALOG_KNOWLEDGE}]

Dados da Escolha:
Peça: ${product.title} (${product.category})
Variação selecionada: ${selected.size ?? selected.title} (taxa de devolução: ${Math.round(selected.returnRate * 100)}%)
Tamanho habitual informado: ${usualSize ?? "não informado"} (${isUsualMatch ? "idêntico ao selecionado" : sizeDifference})
Caimento desejado: ${fitPreference === "fitted" ? "mais ajustado" : fitPreference === "loose" ? "mais solto" : "regular"}
Avaliação determinística: ${result.message}
Evidência técnica: ${result.evidence}`,
    },
  ];

  try {
    let text = await callEloAgentsLlm(promptMessages, 0.3);
    // Strip possible prefixes or wrapping quotes
    text = text.replace(/^(claro|aqui está|certamente|com certeza)[^:\n]*[:\n-]+\s*/i, "");
    text = text.replace(/^["']|["']$/g, "").trim();
    if (text.length > 480) {
      text = text.slice(0, 477) + "...";
    }
    return {
      message: text || result.message,
      provider: "eloagents",
      model: process.env.ELOAGENTS_MODEL ?? "gpt-54-mini",
    };
  } catch {
    return {
      message: result.message,
      provider: "deterministic",
      model: "deterministic_engine",
    };
  }
}

/**
 * Multi-item Cart Coherence & Care Audit.
 * Evaluates the entire cart for sizing consistency, garment pairing, and fabric care instructions.
 */
export async function auditCart(items: CartLine[]): Promise<{
  status: "aligned" | "attention";
  headline: string;
  advice: string;
  careTips: string[];
}> {
  if (process.env.MIPO_PYTHON_AGENT_URL) {
    try {
      return await auditCartWithPythonAgent(items);
    } catch {
      // Fallback to local audit logic if python agent is offline
    }
  }
  if (!items || items.length === 0) {
    return {
      status: "aligned",
      headline: "Sacola vazia",
      advice: "Nenhum item adicionado para análise de coerência.",
      careTips: [],
    };
  }

  const apparelItems = items.filter((item) => Boolean(item.size));
  const sizes = apparelItems.map((item) => item.size as Size);
  const uniqueSizes = Array.from(new Set(sizes));

  // Check for size disparity in apparel
  const hasMultipleDifferentSizes = uniqueSizes.length > 1;

  // Fabric care tips based on items in cart
  const careTips: string[] = [];
  const titles = items.map((i) => i.title.toLowerCase()).join(" ");

  if (titles.includes("aurora") || titles.includes("linho")) {
    careTips.push("Linho puro: lavar preferencialmente à mão com sabão neutro e passar levemente úmido.");
  }
  if (titles.includes("trama") || titles.includes("órbita") || titles.includes("tricot")) {
    careTips.push("Tricot artesanal: secar na horizontal sobre uma toalha; nunca pendurar no varal para não deformar a trama.");
  }
  if (titles.includes("eixo") || titles.includes("alfaiataria") || titles.includes("lume")) {
    careTips.push("Alfaiataria e sarja pesada: passar a ferro morno com pano protetor para manter a textura impecável.");
  }
  if (titles.includes("bruma") || titles.includes("balm") || titles.includes("luz")) {
    careTips.push("Beleza botânica: conservar ao abrigo do calor e da luz solar direta.");
  }

  // If only 1 item
  if (items.length === 1) {
    return {
      status: "aligned",
      headline: "Seleção harmoniosa e consistente",
      advice: `Você selecionou ${items[0].title}${items[0].size ? ` no tamanho ${items[0].size}` : ""}. A peça segue a modelagem autoral Vértice.`,
      careTips,
    };
  }

  // If customer has different sizes across tops/bottoms
  if (hasMultipleDifferentSizes) {
    return {
      status: "attention",
      headline: "Atenção à variação de tamanhos na sacola",
      advice: `Identificamos peças em tamanhos diferentes (${uniqueSizes.join(" e ")}). Se você prefere caimento uniforme entre parte de cima e de baixo, vale confirmar com a MIPO Concierge antes de finalizar.`,
      careTips,
    };
  }

  return {
    status: "aligned",
    headline: "Composição harmônica e tamanhos alinhados",
    advice: `Todas as peças de vestuário estão no tamanho ${uniqueSizes[0] || "padrão"}, proporcionando proporção equilibrada e visual coeso.`,
    careTips,
  };
}
