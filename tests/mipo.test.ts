import { describe, expect, it } from "vitest";
import { products } from "../src/data/products";
import { evaluateCheckoutRisk } from "../src/services/mipo";

describe("evaluateCheckoutRisk", () => {
  it("recomenda variante com taxa pelo menos 8 p.p. menor", () => {
    const product = { ...products[0], variants: products[0].variants.map((variant) => ({ ...variant, salesCount: 100, inventory_quantity: Math.max(variant.inventory_quantity ?? 0, 4) })) };
    const result = evaluateCheckoutRisk(product, product.variants[1]);
    expect(result.risk).toBe("size");
    expect(result.recommendedVariant?.size).toBe("G");
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.evidenceCoverage).toBe(1);
  });

  it("não inventa recomendação quando não há alternativa melhor", () => {
    const product = products[3];
    const result = evaluateCheckoutRisk(product, product.variants[1]);
    expect(result.risk).toBe("none");
    expect(result.recommendedVariant).toBeUndefined();
  });

  it("sinaliza risco de qualidade sem decisão automática", () => {
    const product = products[4];
    const result = evaluateCheckoutRisk(product, product.variants[0]);
    expect(result.risk).toBe("quality");
    expect(result.alternativeProductId).toBe("prod_orbita");
  });

  it("sinaliza estoque baixo", () => {
    const product = products[2];
    const result = evaluateCheckoutRisk(product, product.variants[3]);
    expect(result.risk).toBe("stock");
  });

  it("respeita a direção da preferência de caimento", () => {
    const product = { ...products[0], variants: products[0].variants.map((variant) => ({ ...variant, salesCount: 100, inventory_quantity: Math.max(variant.inventory_quantity ?? 0, 4) })) };
    const result = evaluateCheckoutRisk(product, product.variants[1], "fitted");
    expect(result.recommendedVariant?.size).toBe("P");
  });

  it("não recomenda tamanho com amostra insuficiente", () => {
    const product = { ...products[0], variants: products[0].variants.map((variant) => ({ ...variant, salesCount: 7, inventory_quantity: Math.max(variant.inventory_quantity ?? 0, 4) })) };
    const result = evaluateCheckoutRisk(product, product.variants[1]);
    expect(result.risk).toBe("insufficient_evidence");
    expect(result.recommendedVariant).toBeUndefined();
    expect(result.evidenceCoverage).toBeGreaterThanOrEqual(0.5);
  });
});
