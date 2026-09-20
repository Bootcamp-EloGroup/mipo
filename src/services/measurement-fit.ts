import type { BodyMeasurements, MeasurementFitAssessment, Product, Size, SizeGuide } from "@/src/domain/commerce";
import type { FitPreference } from "@/src/services/mipo";

const sizes: Size[] = ["P", "M", "G", "GG"];

export const VERTICE_SIZE_GUIDE: SizeGuide = {
  label: "Grade geral Vértice",
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

function guide(productId: string, label: string, version: string, ranges: SizeGuide["ranges"]): SizeGuide {
  return { productId, label, version, origin: "synthetic", unit: "cm", ranges };
}

/** Grades demonstrativas versionadas. Substituir por ficha técnica homologada antes do uso comercial. */
export const VERTICE_PRODUCT_SIZE_GUIDES: Record<string, SizeGuide> = {
  prod_aurora: guide("prod_aurora", "Vestido Aurora · modelagem acinturada", "aurora-demo-2026.1", {
    P:{bust:[82,88],waist:[64,70],hip:[91,97]}, M:{bust:[89,95],waist:[71,77],hip:[98,104]}, G:{bust:[96,102],waist:[78,85],hip:[105,112]}, GG:{bust:[103,111],waist:[86,94],hip:[113,121]},
  }),
  prod_sereno: guide("prod_sereno", "Vestido Sereno · modelagem fluida", "sereno-demo-2026.1", {
    P:{bust:[84,90],waist:[66,73],hip:[94,101]}, M:{bust:[91,97],waist:[74,81],hip:[102,109]}, G:{bust:[98,105],waist:[82,89],hip:[110,117]}, GG:{bust:[106,114],waist:[90,98],hip:[118,126]},
  }),
  prod_trama: guide("prod_trama", "Blusa Trama · modelagem reta", "trama-demo-2026.1", {
    P:{bust:[82,89],waist:[64,72]}, M:{bust:[90,97],waist:[73,80]}, G:{bust:[98,105],waist:[81,88]}, GG:{bust:[106,114],waist:[89,97]},
  }),
  prod_eixo: guide("prod_eixo", "Calça Eixo · cintura alta", "eixo-demo-2026.1", {
    P:{waist:[64,70],hip:[91,97]}, M:{waist:[71,77],hip:[98,104]}, G:{waist:[78,84],hip:[105,111]}, GG:{waist:[85,93],hip:[112,120]},
  }),
  prod_lume: guide("prod_lume", "Jaqueta Lume · sobreposição regular", "lume-demo-2026.1", {
    P:{bust:[84,91],waist:[66,74]}, M:{bust:[92,99],waist:[75,82]}, G:{bust:[100,107],waist:[83,90]}, GG:{bust:[108,116],waist:[91,99]},
  }),
  prod_orbita: guide("prod_orbita", "Casaco Órbita · modelagem ampla", "orbita-demo-2026.1", {
    P:{bust:[86,94],waist:[68,76]}, M:{bust:[95,103],waist:[77,85]}, G:{bust:[104,112],waist:[86,94]}, GG:{bust:[113,122],waist:[95,104]},
  }),
};

export function sizeGuideForProduct(product: Product): SizeGuide {
  const guideIdByHandle: Record<string, string> = { "vestido-aurora":"prod_aurora", "vestido-sereno":"prod_sereno", "blusa-trama":"prod_trama", "calca-eixo":"prod_eixo", "jaqueta-lume":"prod_lume", "casaco-orbita":"prod_orbita" };
  return VERTICE_PRODUCT_SIZE_GUIDES[product.id] ?? VERTICE_PRODUCT_SIZE_GUIDES[guideIdByHandle[product.handle]] ?? VERTICE_SIZE_GUIDE;
}

const metricLabels = { bust: "busto", waist: "cintura", hip: "quadril" } as const;
export const measurementLimits: Record<keyof BodyMeasurements, [number, number]> = { bust: [70, 160], waist: [50, 150], hip: [75, 180] };

export function measurementFieldError(metric: keyof BodyMeasurements, value: number | undefined): string | undefined {
  if (value === undefined || !Number.isFinite(value)) return `Informe a medida de ${metricLabels[metric]}.`;
  const [min, max] = measurementLimits[metric];
  return value < min || value > max ? `Confira a medida: use um valor entre ${min} e ${max} cm.` : undefined;
}

export function guideRange(metric: keyof BodyMeasurements, guide: SizeGuide = VERTICE_SIZE_GUIDE): [number, number] {
  const values = sizes.flatMap((size) => guide.ranges[size][metric] ?? []);
  return [Math.min(...values), Math.max(...values)];
}

export function requiredMeasurements(product: Product): Array<keyof BodyMeasurements> {
  const value = `${product.category} ${product.subcategory ?? ""} ${product.title}`.toLocaleLowerCase("pt-BR");
  if (/calça|saia|short|bermuda/.test(value)) return ["waist", "hip"];
  if (/vestido|macacão/.test(value)) return ["bust", "waist", "hip"];
  return ["bust", "waist"];
}

export function validateMeasurements(measurements: BodyMeasurements): string[] {
  return (Object.keys(measurementLimits) as Array<keyof BodyMeasurements>).flatMap((metric) => {
    const value = measurements[metric];
    if (value === undefined) return [];
    const error = measurementFieldError(metric, value);
    return error ? [`${metricLabels[metric][0].toUpperCase()}${metricLabels[metric].slice(1)}: ${error}`] : [];
  });
}

export function evaluateMeasurementFit(product: Product, measurements: BodyMeasurements, fitPreference: FitPreference = "regular", guide: SizeGuide = sizeGuideForProduct(product)): MeasurementFitAssessment {
  const required = requiredMeasurements(product);
  const provided = required.filter((metric) => measurements[metric] !== undefined);
  const validationErrors = validateMeasurements(measurements);
  const sizeComparisons = sizes.map((size) => {
    const available = product.variants.some((variant) => variant.size === size && variant.inventory_quantity !== 0);
    const deltas = required.flatMap((metric) => {
      const value = measurements[metric]; const range = guide.ranges[size][metric];
      return value === undefined || !range ? [] : [value < range[0] ? value - range[0] : value > range[1] ? value - range[1] : 0];
    });
    const maxDelta = deltas.length ? Math.max(...deltas) : Number.POSITIVE_INFINITY;
    const minDelta = deltas.length ? Math.min(...deltas) : Number.NEGATIVE_INFINITY;
    const fit = deltas.every((delta) => delta === 0) ? "balanced" : maxDelta > 0 && maxDelta <= 4 ? "fitted" : minDelta < 0 && minDelta >= -6 ? "roomy" : "outside";
    const note = !available ? "Esgotado" : fit === "balanced" ? "Dentro da grade" : fit === "fitted" ? "Mais rente" : fit === "roomy" ? "Mais amplo" : "Fora da faixa";
    return { size, fit, available, note } as const;
  });
  const base = { guideVersion: guide.version, guideOrigin: guide.origin, guideLabel: guide.label, sizeComparisons, requiredMeasurements: required, providedMeasurements: provided, limitingMeasurements: [] as Array<keyof BodyMeasurements>, compatibleSizes: [] as Size[], expectedFit: fitPreference };
  if (validationErrors.length || provided.length !== required.length) return { ...base, status: "insufficient_evidence", coverage: provided.length / required.length, evidence: validationErrors[0] ?? `Informe ${required.filter((metric) => !provided.includes(metric)).map((metric) => metricLabels[metric]).join(" e ")}.` };

  const positions = required.map((metric) => {
    const value = measurements[metric]!;
    const index = sizes.findIndex((size) => value >= guide.ranges[size][metric]![0] && value <= guide.ranges[size][metric]![1]);
    return { metric, index, value };
  });
  if (positions.some(({ index }) => index < 0)) {
    const outside = positions.filter(({ index }) => index < 0).map(({ metric, value }) => { const [low, high] = guideRange(metric, guide); return `${metricLabels[metric]} ${value < low ? "abaixo" : "acima"} da referência ${low}–${high} cm`; });
    return { ...base, status: "out_of_range", coverage: 1, limitingMeasurements: positions.filter(({ index }) => index < 0).map(({ metric }) => metric), evidence: `${outside.join("; ")}. Confira como medir ou converse com a MIPO; não vamos estimar um tamanho sem referência.` };
  }

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
    guideLabel: assessment.guideLabel,
    sizeComparisons: assessment.sizeComparisons,
  };
}
