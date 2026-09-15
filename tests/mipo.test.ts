import { describe, expect, it } from "vitest";
import { products } from "../src/data/products";
import { evaluateCheckoutRisk } from "../src/services/mipo";

describe("evaluateCheckoutRisk", () => {
  it("recomenda variante com taxa pelo menos 8 p.p. menor", () => {
    const product = products[0];
    const result = evaluateCheckoutRisk(product, product.variants[1]);
    expect(result.risk).toBe("size");
    expect(result.recommendedVariant?.size).toBe("G");
  });

  it("não inventa recomendação quando não há alternativa melhor", () => {
    const product = products[3];
    const result = evaluateCheckoutRisk(product, product.variants[1]);
    expect(result.risk).toBe("none");
    expect(result.recommendedVariant).toBeUndefined();
  });

  it("sinaliza risco de qualidade sem decisão automática", () => {
    const product = products[4];
    const result = evaluateCheckoutRisk(product, product.variants[1]);
    expect(result.risk).toBe("quality");
    expect(result.alternativeProductId).toBe("prod_orbita");
  });

  it("sinaliza estoque baixo", () => {
    const product = products[2];
    const result = evaluateCheckoutRisk(product, product.variants[3]);
    expect(result.risk).toBe("stock");
  });

  it("respeita a direção da preferência de caimento", () => {
    const product = products[0];
    const result = evaluateCheckoutRisk(product, product.variants[1], "fitted");
    expect(result.recommendedVariant?.size).toBe("P");
  });
});
