import { describe, expect, it } from "vitest";
import { products } from "../src/data/products";
import { evaluateCheckoutRisk, evaluateSelectionContext } from "../src/services/mipo";
import { getTextileProfile, productQuestions } from "../src/services/product-profile";

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

  it("ignora disponibilidade ao calcular a recomendação", () => {
    const product = products[2];
    const result = evaluateCheckoutRisk(product, product.variants[3]);
    expect(result.risk).toBe("none");
    expect(result.evidence).not.toMatch(/estoque|disponib/i);
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

  it("compara respostas do cliente com atributos de produto não vestuário", () => {
    const product = products.find((item) => item.id === "prod_bruma")!;
    const result = evaluateSelectionContext(product, product.variants[0], {
      label: "Preferências do produto",
      preference: "Intenso e marcante",
      answers: { finish: "Intenso e marcante", use: "Evento ou produção" },
    });
    expect(result.risk).toBe("preference_mismatch");
    expect(result.outcome).toBe("attention");
    expect(result.mismatchedPreferences).toContain("Intenso e marcante");
    expect(result.evidence).not.toMatch(/estoque|disponib/i);
  });

  it("aprova uma escolha quando todas as preferências combinam", () => {
    const product = products.find((item) => item.id === "prod_bruma")!;
    const result = evaluateSelectionContext(product, product.variants[0], {
      label: "Preferências do produto",
      preference: "Natural e leve",
      answers: { finish: "Natural e leve", use: "Dia a dia" },
    });
    expect(result.risk).toBe("none");
    expect(result.outcome).toBe("good_match");
    expect(result.score).toBeGreaterThan(70);
  });

  it("não aprova metal para uma bolsa cujo material principal é couro", () => {
    const product = {
      ...products[0],
      id: "prod_bolsa_couro",
      title: "Bolsa de Couro Artesanal Bege",
      category: "Acessórios",
      subcategory: "Bolsa de Couro",
      productKind: "accessory" as const,
      variants: [{ ...products[0].variants[0], id: "var_bolsa", size: null, title: "Opção 1" }],
    };
    const result = evaluateSelectionContext(product, product.variants[0], {
      label: "Preferências do produto",
      preference: "Metal",
      answers: { material: "Metal", use: "Dia a dia" },
    });
    expect(productQuestions(product)[0].options).toEqual(["Couro"]);
    expect(result.risk).toBe("preference_mismatch");
  });

  it("expõe composição e elasticidade com origem rastreável", () => {
    const profile = getTextileProfile({ ...products[0], title: "Vestido Aurora de Linho" });
    expect(profile?.material).toBe("Linho");
    expect(profile?.elasticity).toBe("none");
    expect(profile?.origin).toBe("synthetic");
    expect(profile?.evidence[0]).toMatch(/editorial/i);
  });

  it("não inventa perfil têxtil quando o catálogo não identifica o material", () => {
    const profile = getTextileProfile({ ...products[0], title: "Vestido Essencial", subtitle: null, description: null });
    expect(profile).toBeUndefined();
  });
});
