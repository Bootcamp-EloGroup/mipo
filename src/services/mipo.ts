import type { BodyMeasurements, MeasurementFitAssessment, Product, ProductVariant, SelectionContext, Size } from "@/src/domain/commerce";
import { getProductDecisionProfile } from "./product-profile";
import { evaluateMeasurementFit } from "./measurement-fit";

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
  measurementAssessment?: MeasurementFitAssessment;
};

export type FitPreference = "fitted" | "regular" | "loose";
export type MipoThresholds = { highReturnRate: number; minimumImprovement: number; lowStockQuantity?: number; minimumSampleSize: number };
export type CheckoutEvaluationContext = {
  fitPreference?: FitPreference;
  usualSize?: Size | null;
  measurements?: BodyMeasurements;
  thresholds?: MipoThresholds;
};
const sizeOrder = { P: 0, M: 1, G: 2, GG: 3 } as const;
const defaultThresholds: MipoThresholds = { highReturnRate: 0.25, minimumImprovement: 0.08, lowStockQuantity: 3, minimumSampleSize: 30 };

export function evaluateCheckout(product: Product, selected: ProductVariant, context: CheckoutEvaluationContext = {}): RiskResult {
  const base = evaluateCheckoutRisk(product, selected, context.fitPreference, context.thresholds, context.usualSize);
  if (!context.measurements || !selected.size) return base;
  const assessment = evaluateMeasurementFit(product, context.measurements, context.fitPreference);
  if (base.risk === "quality") return { ...base, measurementAssessment: assessment, evidence: `${base.evidence} ${assessment.evidence}` };
  if (assessment.status === "insufficient_evidence" || assessment.status === "out_of_range") {
    return { ...base, measurementAssessment: assessment, evidenceCoverage: Math.min(base.evidenceCoverage, assessment.coverage), evidence: `${assessment.evidence} ${base.evidence}`, message: assessment.evidence };
  }
  if (!assessment.recommendedSize) {
    return { ...base, measurementAssessment: assessment, evidence: `${assessment.evidence} O tamanho de referência está sem estoque.`, message: "A grade indica uma referência, mas ela está indisponível. Mantenha sua escolha apenas se o caimento descrito fizer sentido para você." };
  }
  const recommendedVariant = product.variants.find((variant) => variant.size === assessment.recommendedSize && variant.inventory_quantity !== 0);
  const matchesSelection = selected.size === assessment.recommendedSize;
  if (matchesSelection) return { ...base, risk: "none", outcome: "good_match", level: "low", score: Math.max(base.score, 90), evidenceCoverage: Math.max(base.evidenceCoverage, assessment.coverage), evidence: assessment.evidence, message: `Suas medidas sustentam o tamanho ${selected.size}. ${assessment.status === "between_sizes" ? "A preferência de caimento foi usada para orientar a escolha entre tamanhos." : "As medidas convergem para esta referência."}`, measurementAssessment: assessment };
  return { ...base, risk: "size", outcome: "attention", level: "medium", score: Math.max(base.score, 85), evidenceCoverage: Math.max(base.evidenceCoverage, assessment.coverage), evidence: assessment.evidence, message: assessment.status === "between_sizes" ? `Suas medidas ficam entre ${assessment.compatibleSizes.join(" e ")}. Para o caimento ${assessment.expectedFit === "loose" ? "mais solto" : assessment.expectedFit === "fitted" ? "mais ajustado" : "equilibrado"}, a referência mais segura é ${assessment.recommendedSize}.` : `As medidas informadas apontam para o tamanho ${assessment.recommendedSize}.`, recommendedVariant, measurementAssessment: assessment };
}

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

  const betterSize = product.variants
    .filter((variant): variant is ProductVariant & { size: Size } => Boolean(variant.size))
    .filter((variant) => (variant.salesCount ?? 0) >= thresholds.minimumSampleSize)
    .filter((variant) => selected.returnRate - variant.returnRate >= thresholds.minimumImprovement)
    .filter((variant) => fitPreference === "regular" || (fitPreference === "fitted" ? sizeOrder[variant.size] <= sizeOrder[selectedSize] : sizeOrder[variant.size] >= sizeOrder[selectedSize]))
    .sort((a, b) => a.returnRate - b.returnRate)[0];
  const score = scoreRisk(selected, betterSize, thresholds);

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

  if (selected.returnRate >= thresholds.highReturnRate && (selected.salesCount ?? 0) >= thresholds.minimumSampleSize && betterSize) {
    const isUsualSameAsSelected = Boolean(usualSize && usualSize === selectedSize);
    return {
      risk: "size",
      outcome: "attention",
      level: "high",
      score: score.score,
      evidenceCoverage: score.coverage,
      evidence: selected.evidenceOrigin === "synthetic"
        ? `Cenário demonstrativo: ${Math.round(selected.returnRate * 100)}% nesta variação e ${Math.round(betterSize.returnRate * 100)}% no ${betterSize.size}.`
        : `${Math.round(selected.returnRate * 100)}% de devoluções observadas nesta variação; ${Math.round(betterSize.returnRate * 100)}% no ${betterSize.size}.`,
      message: isUsualSameAsSelected
        ? `Mesmo sendo seu tamanho habitual (${usualSize}), esta modelagem apresenta alta taxa de devoluções (${Math.round(selected.returnRate * 100)}%). O tamanho ${betterSize.size} oferece ajuste superior.`
        : `Considerando o histórico da peça e sua preferência de caimento, o tamanho ${betterSize.size} oferece um ajuste melhor do que o ${selectedSize}.`,
      recommendedVariant: betterSize,
    };
  }

  // Nuanced evaluation when usualSize is informed
  if (usualSize && usualVariant) {
    const sizeDiff = sizeOrder[selectedSize] - sizeOrder[usualSize];

    // Intentional size-up (loose fit preference OR avoiding high returns on usualSize)
    const intentionalSizeUp = sizeDiff > 0 && (fitPreference === "loose" || usualVariant.returnRate >= thresholds.highReturnRate);
    if (intentionalSizeUp) {
      return {
        risk: "none",
        outcome: "good_match",
        level: "low",
        score: Math.max(score.score, 88),
        evidenceCoverage: Math.max(score.coverage, 0.8),
        evidence: `Você costuma usar ${usualSize}, mas selecionou ${selectedSize} alinhado à busca por maior fluidez e às proporções da peça.`,
        message: usualVariant.returnRate >= thresholds.highReturnRate
          ? `Ótima decisão: embora você costume vestir ${usualSize}, este modelo tem maior histórico de trocas no ${usualSize}. O tamanho ${selectedSize} garante caimento sem aperto.`
          : `Escolha alinhada: você costuma usar ${usualSize} e prefere caimento mais solto. O tamanho ${selectedSize} entrega a silhueta relaxada desejada.`,
      };
    }

    // Intentional size-down (fitted preference)
    const intentionalSizeDown = sizeDiff < 0 && fitPreference === "fitted";
    if (intentionalSizeDown) {
      return {
        risk: "none",
        outcome: "good_match",
        level: "low",
        score: Math.max(score.score, 88),
        evidenceCoverage: Math.max(score.coverage, 0.8),
        evidence: `Você costuma usar ${usualSize}, mas escolheu ${selectedSize} para obter um visual mais ajustado ao corpo.`,
        message: `Escolha intencional: como você busca caimento ajustado, optar pelo ${selectedSize} em vez do ${usualSize} proporciona a linha precisa desejada.`,
      };
    }

    // Sizes match perfectly
    if (selectedSize === usualSize) {
      const fitLabel = fitPreference === "fitted" ? "mais ajustado" : fitPreference === "loose" ? "mais solto" : "regular";
      return {
        risk: "none",
        outcome: "good_match",
        level: "low",
        score: Math.max(score.score, 92),
        evidenceCoverage: Math.max(score.coverage, 0.85),
        evidence: `Tamanho selecionado (${selectedSize}) alinhado ao seu tamanho habitual (${usualSize}); histórico de satisfação de ${Math.round((1 - selected.returnRate) * 100)}%.`,
        message: fitPreference === "regular"
          ? `Excelente escolha: o tamanho ${selectedSize} corresponde à sua referência habitual e a modelagem é consistente e fiel às medidas.`
          : `Tamanho habitual ${selectedSize} confirmado com preferência ${fitLabel}. A peça respeita suas proporções.`,
      };
    }

    // Genuine unaligned divergence (e.g. regular fit, but user picked a different size)
    if (Math.abs(sizeDiff) >= 1) {
      const direction = sizeDiff > 0 ? "maior" : "menor";
      return {
        risk: "size",
        outcome: "attention",
        level: "medium",
        score: 65,
        evidenceCoverage: 0.75,
        evidence: `Você informou tamanho habitual ${usualSize}, mas selecionou ${selectedSize} (1 número ${direction}) com preferência regular.`,
        message: `Você costuma usar ${usualSize}, mas selecionou ${selectedSize}. Se desejar o caimento padrão da peça, o tamanho ${usualSize} é sua referência mais segura.`,
        recommendedVariant: usualVariant,
      };
    }
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

  return {
    risk: "none",
    outcome: "good_match",
    level: "low",
    score: score.score,
    evidenceCoverage: score.coverage,
    evidence: "Não identificamos necessidade de alteração com os dados disponíveis.",
    message: "Sua escolha está alinhada ao histórico observado deste produto.",
  };
}
