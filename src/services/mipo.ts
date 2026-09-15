import type { Product, ProductVariant } from "@/src/domain/commerce";

export type RiskResult = {
  risk: "size" | "quality" | "stock" | "none";
  level: "high" | "medium" | "low";
  evidence: string;
  message: string;
  recommendedVariant?: ProductVariant;
  alternativeProductId?: string;
};

export type FitPreference = "fitted" | "regular" | "loose";
export type MipoThresholds = { highReturnRate: number; minimumImprovement: number; lowStockQuantity: number };
const sizeOrder = { P: 0, M: 1, G: 2, GG: 3 } as const;
const defaultThresholds: MipoThresholds = { highReturnRate: 0.25, minimumImprovement: 0.08, lowStockQuantity: 3 };

export function evaluateCheckoutRisk(product: Product, selected: ProductVariant, fitPreference: FitPreference = "regular", thresholds: MipoThresholds = defaultThresholds): RiskResult {
  const betterSize = product.variants
    .filter((variant) => (variant.inventory_quantity ?? 0) > 0)
    .filter((variant) => selected.returnRate - variant.returnRate >= thresholds.minimumImprovement)
    .filter((variant) => fitPreference === "regular" || (fitPreference === "fitted" ? sizeOrder[variant.size] <= sizeOrder[selected.size] : sizeOrder[variant.size] >= sizeOrder[selected.size]))
    .sort((a, b) => a.returnRate - b.returnRate)[0];

  if (selected.returnRate >= thresholds.highReturnRate && betterSize) {
    return {
      risk: "size",
      level: "high",
      evidence: selected.evidenceOrigin === "synthetic" ? `Cenário demonstrativo: ${Math.round(selected.returnRate * 100)}% nesta variação e ${Math.round(betterSize.returnRate * 100)}% no ${betterSize.size}.` : `${Math.round(selected.returnRate * 100)}% de devoluções observadas nesta variação; ${Math.round(betterSize.returnRate * 100)}% no ${betterSize.size}.`,
      message: `Considerando o cenário e sua preferência de caimento, o tamanho ${betterSize.size} pode oferecer um ajuste melhor.`,
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

  if ((selected.inventory_quantity ?? 0) <= thresholds.lowStockQuantity) {
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
