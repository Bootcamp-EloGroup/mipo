import type { BodyMeasurements, MeasurementFitAssessment, Product, Size, SizeGuide } from "@/src/domain/commerce";
import type { FitPreference } from "@/src/services/mipo";

const sizes: Size[] = ["P", "M", "G", "GG"];

export const VERTICE_SIZE_GUIDE: SizeGuide = {
  version: "vertice-demo-2026.1",
  origin: "synthetic",
  unit: "cm",
  ranges: {
    P: { bust: [82, 88], waist: [64, 70], hip: [92, 98] },
    M: { bust: [89, 95], waist: [71, 77], hip: [99, 105] },
    G: { bust: [96, 102], waist: [78, 84], hip: [106, 112] },
    GG: { bust: [103, 110], waist: [85, 92], hip: [113, 120] },
  },
};

const metricLabels = { bust: "busto", waist: "cintura", hip: "quadril" } as const;

export function requiredMeasurements(product: Product): Array<keyof BodyMeasurements> {
  const value = `${product.category} ${product.subcategory ?? ""} ${product.title}`.toLocaleLowerCase("pt-BR");
  if (/calça|saia|short|bermuda/.test(value)) return ["waist", "hip"];
  if (/vestido|macacão/.test(value)) return ["bust", "waist", "hip"];
  return ["bust", "waist"];
}

export function validateMeasurements(measurements: BodyMeasurements): string[] {
  const limits: Record<keyof BodyMeasurements, [number, number]> = { bust: [60, 160], waist: [45, 150], hip: [70, 180] };
  return (Object.keys(limits) as Array<keyof BodyMeasurements>).flatMap((metric) => {
    const value = measurements[metric];
    if (value === undefined) return [];
    const [min, max] = limits[metric];
    return !Number.isFinite(value) || value < min || value > max ? [`Informe ${metricLabels[metric]} entre ${min} e ${max} cm.`] : [];
  });
}

export function evaluateMeasurementFit(product: Product, measurements: BodyMeasurements, fitPreference: FitPreference = "regular", guide: SizeGuide = VERTICE_SIZE_GUIDE): MeasurementFitAssessment {
  const required = requiredMeasurements(product);
  const provided = required.filter((metric) => measurements[metric] !== undefined);
  const validationErrors = validateMeasurements(measurements);
  const base = { guideVersion: guide.version, guideOrigin: guide.origin, requiredMeasurements: required, providedMeasurements: provided, limitingMeasurements: [] as Array<keyof BodyMeasurements>, compatibleSizes: [] as Size[], expectedFit: fitPreference };
  if (validationErrors.length || provided.length !== required.length) return { ...base, status: "insufficient_evidence", coverage: provided.length / required.length, evidence: validationErrors[0] ?? `Informe ${required.filter((metric) => !provided.includes(metric)).map((metric) => metricLabels[metric]).join(" e ")}.` };

  const positions = required.map((metric) => {
    const value = measurements[metric]!;
    const index = sizes.findIndex((size) => value >= guide.ranges[size][metric]![0] && value <= guide.ranges[size][metric]![1]);
    return { metric, index, value };
  });
  if (positions.some(({ index }) => index < 0)) return { ...base, status: "out_of_range", coverage: 1, limitingMeasurements: positions.filter(({ index }) => index < 0).map(({ metric }) => metric), evidence: "Uma ou mais medidas estão fora da grade demonstrativa P–GG. Não vamos estimar um tamanho sem referência." };

  const indexes = positions.map(({ index }) => index);
  const min = Math.min(...indexes); const max = Math.max(...indexes);
  const limitingMeasurements = positions.filter(({ index }) => index === max).map(({ metric }) => metric);
  const compatibleSizes = [...new Set(indexes.map((index) => sizes[index]))];
  const preferredIndex = fitPreference === "fitted" ? min : max;
  const preferredSize = sizes[preferredIndex];
  const availablePreferred = product.variants.some((variant) => variant.size === preferredSize && variant.inventory_quantity !== 0);
  const recommendedSize = availablePreferred ? preferredSize : undefined;
  const status = min === max ? "recommended" : "between_sizes";
  const textile = product.textileProfile;
  const textileNote = textile ? `${textile.composition ?? textile.material}, elasticidade ${textile.elasticity}` : "perfil têxtil não informado";
  const evidence = status === "recommended"
    ? `As medidas informadas convergem para ${preferredSize}. Referência: ${textileNote}.`
    : `As medidas abrangem ${compatibleSizes.join(" e ")}; ${limitingMeasurements.map((metric) => metricLabels[metric]).join(" e ")} orienta a opção ${preferredSize}. Referência: ${textileNote}.`;
  return { ...base, status, coverage: 1, compatibleSizes, recommendedSize, limitingMeasurements, evidence };
}

export function measurementAssessmentSummary(assessment: MeasurementFitAssessment) {
  return {
    status: assessment.status,
    compatibleSizes: assessment.compatibleSizes,
    recommendedSize: assessment.recommendedSize,
    limitingMeasurements: assessment.limitingMeasurements,
    requiredMeasurements: assessment.requiredMeasurements,
    providedMeasurements: assessment.providedMeasurements,
    expectedFit: assessment.expectedFit,
    coverage: assessment.coverage,
    evidence: assessment.evidence,
    guideVersion: assessment.guideVersion,
    guideOrigin: assessment.guideOrigin,
  };
}
