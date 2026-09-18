import type { Product, ProductVariant, SelectionContext, Size } from "@/src/domain/commerce";
import { getProductDecisionProfile } from "./product-profile";

export type RiskResult = {
  risk: "size" | "quality" | "preference_mismatch" | "none" | "insufficient_evidence";
  outcome: "good_match" | "partial_match" | "attention" | "insufficient_evidence";
  level: "high" | "medium" | "low";
  score: number;
  evidenceCoverage: number;
  evidence: string;
  message: string;
  recommendedVariant?: ProductVariant;
  alternativeProductId?: string;
  matchedPreferences?: string[];
  mismatchedPreferences?: string[];
};

export type FitPreference = "fitted" | "regular" | "loose";
export type MipoThresholds = { highReturnRate: number; minimumImprovement: number; lowStockQuantity?: number; minimumSampleSize: number };
const sizeOrder = { P: 0, M: 1, G: 2, GG: 3 } as const;
const defaultThresholds: MipoThresholds = { highReturnRate: 0.25, minimumImprovement: 0.08, lowStockQuantity: 3, minimumSampleSize: 30 };

export function evaluateSelectionContext(product: Product, selected: ProductVariant, context: SelectionContext): RiskResult {
  const base = evaluateCheckoutRisk(product, selected);
  const profile = getProductDecisionProfile(product);
  const answers = Object.values(context.answers ?? { preference: context.preference });
  const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const accepted = profile.acceptedPreferences.map(normalized);
  const matchedPreferences = answers.filter((answer) => accepted.some((item) => normalized(answer).includes(item) || item.includes(normalized(answer))));
  const mismatchedPreferences = answers.filter((answer) => !matchedPreferences.includes(answer));
  const coverage = Math.min(1, (answers.length + profile.attributes.length) / Math.max(2, profile.questions.length + profile.attributes.length));
  const kind = product.productKind === "beauty" ? "beleza" : product.productKind === "accessory" ? "acessório" : "lifestyle";
  if (profile.attributes.some((attribute) => /não informado/i.test(attribute))) return { ...base, risk: "insufficient_evidence", outcome: "insufficient_evidence", level: "low", score: 0, evidenceCoverage: Number(coverage.toFixed(2)), evidence: "O catálogo não informa um atributo essencial para comparar esta preferência com segurança.", message: "Ainda não há dados suficientes sobre este produto para validar a compatibilidade.", matchedPreferences, mismatchedPreferences };
  if (mismatchedPreferences.length) return { ...base, risk: "preference_mismatch", outcome: "attention", level: "medium", score: Math.max(35, 100 - mismatchedPreferences.length * 35), evidenceCoverage: Number(coverage.toFixed(2)), evidence: `A preferência ${mismatchedPreferences.join(", ")} não aparece entre os atributos declarados deste produto.`, message: `Atenção: esta escolha não está totalmente alinhada ao que você descreveu para ${kind}.`, alternativeProductId: product.alternativeProductId, matchedPreferences, mismatchedPreferences };
  if (!answers.length) return { ...base, outcome: "insufficient_evidence", risk: "insufficient_evidence", level: "low", score: 0, evidenceCoverage: 0, evidence: "Nenhuma preferência suficiente foi informada para comparar com os atributos do produto.", message: "Ainda precisamos de mais uma preferência para orientar sua escolha." };
  return { ...base, outcome: matchedPreferences.length === answers.length ? "good_match" : "partial_match", risk: "none", level: "low", score: Math.round(70 + coverage * 30), evidenceCoverage: Number(coverage.toFixed(2)), evidence: `Atributos do catálogo: ${profile.attributes.join(", ")}. Preferências consideradas: ${answers.join(", ")}.`, message: `A escolha combina com as preferências informadas para ${kind}. Você pode seguir com esta variação.`, matchedPreferences, mismatchedPreferences };
}

function scoreRisk(selected: ProductVariant, betterSize: ProductVariant | undefined, thresholds: MipoThresholds): { score:number; coverage:number } {
  const returnSignal = Math.min(1, selected.returnRate / Math.max(thresholds.highReturnRate, 0.01));
  const qualitySignal = Math.min(1, selected.defectRate / 0.2);
  const sampleSignal = Math.min(1, (selected.salesCount ?? 0) / thresholds.minimumSampleSize);
  const alternativeSignal = betterSize ? Math.min(1, Math.max(0, (selected.returnRate - betterSize.returnRate) / 0.25)) : 0;
  const score = Math.round(100 * (0.35 * returnSignal + 0.2 * qualitySignal + 0.15 * sampleSignal + 0.3 * alternativeSignal));
  const coverage = [selected.returnRate !== undefined, selected.defectRate !== undefined, selected.salesCount !== undefined, Boolean(betterSize)].filter(Boolean).length / 4;
  return { score, coverage: Number(coverage.toFixed(2)) };
}

export function evaluateCheckoutRisk(product: Product, selected: ProductVariant, fitPreference: FitPreference = "regular", thresholds: MipoThresholds = defaultThresholds, usualSize?: Size | null): RiskResult {
  if (!selected.size) return { risk: "none", outcome: "good_match", level: "low", score: 0, evidenceCoverage: 0, evidence: "Esta variação não possui grade de tamanho; a assistência de caimento não se aplica.", message: "Escolha a variação que combina com você." };
  const selectedSize = selected.size;
  const usualVariant = usualSize ? product.variants.find((variant) => variant.size === usualSize) : undefined;
  if (usualVariant && usualSize !== selectedSize) return {
    risk: "size", outcome: "attention", level: "medium", score: 65, evidenceCoverage: 0.75,
    evidence: `Você informou que costuma usar ${usualSize}, mas selecionou ${selectedSize}. A comparação considera sua preferência declarada e o histórico das variantes.`,
    message: `Você costuma usar ${usualSize}. Vale comparar esse tamanho antes de finalizar para manter sua referência habitual.`,
    recommendedVariant: usualVariant,
  };
  const betterSize = product.variants
    .filter((variant): variant is ProductVariant & { size: Size } => Boolean(variant.size))
    .filter((variant) => (variant.salesCount ?? 0) >= thresholds.minimumSampleSize)
    .filter((variant) => selected.returnRate - variant.returnRate >= thresholds.minimumImprovement)
    .filter((variant) => fitPreference === "regular" || (fitPreference === "fitted" ? sizeOrder[variant.size] <= sizeOrder[selectedSize] : sizeOrder[variant.size] >= sizeOrder[selectedSize]))
    .sort((a, b) => a.returnRate - b.returnRate)[0];
  const score = scoreRisk(selected, betterSize, thresholds);

  if (selected.returnRate >= thresholds.highReturnRate && (selected.salesCount ?? 0) >= thresholds.minimumSampleSize && betterSize) {
    return {
      risk: "size",
      outcome: "attention",
      level: "high",
      score: score.score,
      evidenceCoverage: score.coverage,
      evidence: selected.evidenceOrigin === "synthetic" ? `Cenário demonstrativo: ${Math.round(selected.returnRate * 100)}% nesta variação e ${Math.round(betterSize.returnRate * 100)}% no ${betterSize.size}.` : `${Math.round(selected.returnRate * 100)}% de devoluções observadas nesta variação; ${Math.round(betterSize.returnRate * 100)}% no ${betterSize.size}.`,
      message: `Considerando o cenário e sua preferência de caimento, o tamanho ${betterSize.size} pode oferecer um ajuste melhor.`,
      recommendedVariant: betterSize,
    };
  }

  const provisionalAlternative = product.variants.some((variant) =>
    selected.returnRate - variant.returnRate >= thresholds.minimumImprovement
  );
  if (selected.returnRate >= thresholds.highReturnRate && ((selected.salesCount ?? 0) < thresholds.minimumSampleSize || provisionalAlternative)) {
    return {
      risk: "insufficient_evidence",
      outcome: "insufficient_evidence",
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
      outcome: "attention",
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
    outcome: "good_match",
    level: "low",
    score: score.score,
    evidenceCoverage: score.coverage,
    evidence: "Não identificamos uma alternativa claramente melhor com os dados disponíveis.",
    message: "Sua escolha está alinhada ao histórico observado deste produto.",
  };
}
