import type { Product, ProductVariant } from "@/src/domain/commerce";

export type RiskResult = {
  risk: "size" | "quality" | "stock" | "none" | "insufficient_evidence";
  level: "high" | "medium" | "low";
  score: number;
  evidenceCoverage: number;
  evidence: string;
  message: string;
  recommendedVariant?: ProductVariant;
  alternativeProductId?: string;
};

export type FitPreference = "fitted" | "regular" | "loose";
export type MipoThresholds = { highReturnRate: number; minimumImprovement: number; lowStockQuantity: number; minimumSampleSize: number };
const sizeOrder = { P: 0, M: 1, G: 2, GG: 3 } as const;
const defaultThresholds: MipoThresholds = { highReturnRate: 0.25, minimumImprovement: 0.08, lowStockQuantity: 3, minimumSampleSize: 30 };

function scoreRisk(selected: ProductVariant, betterSize: ProductVariant | undefined, thresholds: MipoThresholds): { score:number; coverage:number } {
  const returnSignal = Math.min(1, selected.returnRate / Math.max(thresholds.highReturnRate, 0.01));
  const qualitySignal = Math.min(1, selected.defectRate / 0.2);
  const sampleSignal = Math.min(1, (selected.salesCount ?? 0) / thresholds.minimumSampleSize);
  const alternativeSignal = betterSize ? Math.min(1, Math.max(0, (selected.returnRate - betterSize.returnRate) / 0.25)) : 0;
  const score = Math.round(100 * (0.35 * returnSignal + 0.2 * qualitySignal + 0.15 * sampleSignal + 0.3 * alternativeSignal));
  const coverage = [selected.returnRate !== undefined, selected.defectRate !== undefined, selected.salesCount !== undefined, Boolean(betterSize)].filter(Boolean).length / 4;
  return { score, coverage: Number(coverage.toFixed(2)) };
}

export function evaluateCheckoutRisk(product: Product, selected: ProductVariant, fitPreference: FitPreference = "regular", thresholds: MipoThresholds = defaultThresholds): RiskResult {
  const betterSize = product.variants
    .filter((variant) => (variant.inventory_quantity ?? 0) > 0)
    .filter((variant) => (variant.salesCount ?? 0) >= thresholds.minimumSampleSize)
    .filter((variant) => selected.returnRate - variant.returnRate >= thresholds.minimumImprovement)
    .filter((variant) => fitPreference === "regular" || (fitPreference === "fitted" ? sizeOrder[variant.size] <= sizeOrder[selected.size] : sizeOrder[variant.size] >= sizeOrder[selected.size]))
    .sort((a, b) => a.returnRate - b.returnRate)[0];
  const score = scoreRisk(selected, betterSize, thresholds);

  if ((selected.inventory_quantity ?? 0) <= thresholds.lowStockQuantity) {
    const outOfStock = (selected.inventory_quantity ?? 0) === 0;
    return {
      risk: "stock",
      level: outOfStock ? "high" : "medium",
      score: Math.max(score.score, outOfStock ? 90 : 60),
      evidenceCoverage: score.coverage,
      evidence: outOfStock ? "Saldo disponível igual a zero no snapshot importado." : `${selected.inventory_quantity ?? 0} unidades disponíveis no snapshot importado.`,
      message: outOfStock ? "Este tamanho está esgotado no momento." : "Estoque reduzido para esta escolha. A disponibilidade pode mudar.",
    };
  }

  if (selected.returnRate >= thresholds.highReturnRate && (selected.salesCount ?? 0) >= thresholds.minimumSampleSize && betterSize) {
    return {
      risk: "size",
      level: "high",
      score: score.score,
      evidenceCoverage: score.coverage,
      evidence: selected.evidenceOrigin === "synthetic" ? `Cenário demonstrativo: ${Math.round(selected.returnRate * 100)}% nesta variação e ${Math.round(betterSize.returnRate * 100)}% no ${betterSize.size}.` : `${Math.round(selected.returnRate * 100)}% de devoluções observadas nesta variação; ${Math.round(betterSize.returnRate * 100)}% no ${betterSize.size}.`,
      message: `Considerando o cenário e sua preferência de caimento, o tamanho ${betterSize.size} pode oferecer um ajuste melhor.`,
      recommendedVariant: betterSize,
    };
  }

  const provisionalAlternative = product.variants.some((variant) =>
    (variant.inventory_quantity ?? 0) > 0 && selected.returnRate - variant.returnRate >= thresholds.minimumImprovement
  );
  if (selected.returnRate >= thresholds.highReturnRate && ((selected.salesCount ?? 0) < thresholds.minimumSampleSize || provisionalAlternative)) {
    return {
      risk: "insufficient_evidence",
      level: "low",
      score: score.score,
      evidenceCoverage: score.coverage,
      evidence: `Histórico disponível: ${selected.salesCount ?? 0} vendas; mínimo exigido pela regra: ${thresholds.minimumSampleSize}.`,
      message: "Ainda não há histórico suficiente para sugerir outro tamanho com segurança.",
    };
  }

  if (selected.defectRate >= 0.1 && product.alternativeProductId) {
    return {
      risk: "quality",
      level: "high",
      score: score.score,
      evidenceCoverage: score.coverage,
      evidence: `${Math.round(selected.defectRate * 100)}% de ocorrências de qualidade observadas nesta variação.`,
      message: "Encontramos uma alternativa de construção semelhante e menor incidência observada.",
      alternativeProductId: product.alternativeProductId,
    };
  }

  return {
    risk: "none",
    level: "low",
    score: score.score,
    evidenceCoverage: score.coverage,
    evidence: "Não identificamos uma alternativa claramente melhor com os dados disponíveis.",
    message: "Sua escolha está alinhada ao histórico observado deste produto.",
  };
}
