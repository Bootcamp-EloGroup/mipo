import { describe, expect, it } from "vitest";
import { products } from "../src/data/products";
import { evaluateCheckout } from "../src/services/mipo";
import { evaluateMeasurementFit, measurementAssessmentSummary, measurementFieldError, requiredMeasurements, sizeGuideForProduct } from "../src/services/measurement-fit";

describe("measurement fit", () => {
  it("usa busto, cintura e quadril para vestidos", () => {
    expect(requiredMeasurements(products[0])).toEqual(["bust", "waist", "hip"]);
    const result = evaluateMeasurementFit(products[0], { bust: 92, waist: 74, hip: 102 });
    expect(result.status).toBe("recommended");
    expect(result.recommendedSize).toBe("M");
  });

  it("expõe conflito entre medidas sem ocultar os candidatos", () => {
    const result = evaluateMeasurementFit(products[0], { bust: 92, waist: 81, hip: 109 }, "regular");
    expect(result.status).toBe("between_sizes");
    expect(result.compatibleSizes).toEqual(["M", "G"]);
    expect(result.recommendedSize).toBe("G");
    expect(result.limitingMeasurements).toEqual(["waist", "hip"]);
  });

  it("usa a preferência apenas como desempate seguro", () => {
    const fitted = evaluateMeasurementFit(products[0], { bust: 92, waist: 81, hip: 109 }, "fitted");
    const loose = evaluateMeasurementFit(products[0], { bust: 92, waist: 81, hip: 109 }, "loose");
    expect(fitted.recommendedSize).toBe("M");
    expect(loose.recommendedSize).toBe("G");
  });

  it("não estima tamanho fora da grade", () => {
    const result = evaluateMeasurementFit(products[0], { bust: 130, waist: 110, hip: 145 });
    expect(result.status).toBe("out_of_range");
    expect(result.recommendedSize).toBeUndefined();
  });

  it("orienta a correção de valores corporais improváveis", () => {
    expect(measurementFieldError("waist", 46)).toMatch(/50 e 150 cm/);
    expect(measurementFieldError("hip", 70)).toMatch(/75 e 180 cm/);
    expect(measurementFieldError("bust", 92)).toBeUndefined();
  });

  it("identifica quais referências estão fora da grade", () => {
    const result = evaluateMeasurementFit(products[0], { bust: 70, waist: 64, hip: 92 });
    expect(result.status).toBe("out_of_range");
    expect(result.evidence).toMatch(/busto abaixo da referência 82–111 cm/i);
    expect(result.evidence).toMatch(/Confira como medir/i);
  });

  it("integra a recomendação no resultado determinístico", () => {
    const product = products[0];
    const result = evaluateCheckout(product, product.variants[0], { measurements: { bust: 92, waist: 74, hip: 102 } });
    expect(result.risk).toBe("size");
    expect(result.recommendedVariant?.size).toBe("M");
    expect(result.measurementAssessment?.guideOrigin).toBe("synthetic");
  });

  it("não inclui os valores corporais no resumo persistível", () => {
    const assessment = evaluateMeasurementFit(products[0], { bust: 92, waist: 74, hip: 102 });
    const persisted = JSON.stringify(measurementAssessmentSummary(assessment));
    expect(persisted).not.toContain("92");
    expect(persisted).not.toContain("74");
    expect(persisted).not.toContain("102");
  });

  it("usa grade específica e expõe comparação visual sem delegar o cálculo à IA", () => {
    const aurora = sizeGuideForProduct(products[0]);
    const eixo = sizeGuideForProduct(products.find((product) => product.id === "prod_eixo")!);
    const assessment = evaluateMeasurementFit(products[0], { bust: 92, waist: 74, hip: 102 });
    expect(aurora.version).not.toBe(eixo.version);
    expect(assessment.guideLabel).toMatch(/Aurora/);
    expect(assessment.sizeComparisons).toHaveLength(4);
    expect(assessment.sizeComparisons.find((item) => item.size === "M")?.fit).toBe("balanced");
  });
});

describe("catalog pricing", () => {
  it("usa preços editoriais realistas em reais e centavos", () => {
    expect(products.find((product) => product.id === "prod_aurora")?.variants[0].price).toBe(64900);
    expect(products.find((product) => product.id === "prod_eixo")?.variants[0].price).toBe(44900);
    expect(products.find((product) => product.id === "prod_bruma")?.variants[0].price).toBe(12900);
  });
});
