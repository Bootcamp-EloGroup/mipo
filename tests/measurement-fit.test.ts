import { describe, expect, it } from "vitest";
import { products } from "../src/data/products";
import { evaluateCheckout } from "../src/services/mipo";
import { evaluateMeasurementFit, measurementAssessmentSummary, requiredMeasurements } from "../src/services/measurement-fit";

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
});
