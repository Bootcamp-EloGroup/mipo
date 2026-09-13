import type { Product, ProductVariant } from "@/src/domain/commerce";

export type RiskResult = {
  risk: "size" | "quality" | "stock" | "none";
  level: "high" | "medium" | "low";
  evidence: string;
  message: string;
  recommendedVariant?: ProductVariant;
  alternativeProductId?: string;
};

export function evaluateCheckoutRisk(product: Product, selected: ProductVariant): RiskResult {
  const betterSize = product.variants
    .filter((variant) => (variant.inventory_quantity ?? 0) > 0)
    .filter((variant) => selected.returnRate - variant.returnRate >= 0.08)
    .sort((a, b) => a.returnRate - b.returnRate)[0];

  if (selected.returnRate >= 0.25 && betterSize) {
    return {
      risk: "size",
      level: "high",
      evidence: `${Math.round(selected.returnRate * 100)}% de devoluções observadas neste tamanho; ${Math.round(betterSize.returnRate * 100)}% no ${betterSize.size}.`,
      message: `Este modelo costuma vestir menor. O tamanho ${betterSize.size} pode oferecer um ajuste melhor.`,
      recommendedVariant: betterSize,
    };
  }

  if (selected.defectRate >= 0.1 && product.alternativeProductId) {
    return {
      risk: "quality",
      level: "high",
      evidence: `${Math.round(selected.defectRate * 100)}% de ocorrências de qualidade observadas nesta variação.`,
      message: "Encontramos uma alternativa de construção semelhante e menor incidência observada.",
      alternativeProductId: product.alternativeProductId,
    };
  }

  if ((selected.inventory_quantity ?? 0) <= 3) {
    return {
      risk: "stock",
      level: "medium",
      evidence: `${selected.inventory_quantity ?? 0} unidades disponíveis nesta demonstração.`,
      message: "Estoque reduzido para esta escolha. A disponibilidade pode mudar.",
    };
  }

  return {
    risk: "none",
    level: "low",
    evidence: "Não identificamos uma alternativa claramente melhor com os dados disponíveis.",
    message: "Sua escolha está alinhada ao histórico observado deste produto.",
  };
}
