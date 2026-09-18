import { describe, expect, it } from "vitest";
import { chatWithMipo, auditCart, explainFitDecision } from "../src/server/mipo-ai";
import { products } from "../src/data/products";
import { evaluateCheckoutRisk } from "../src/services/mipo";
import type { CartLine } from "../src/domain/commerce";

describe("MIPO Active Agent Suite", () => {
  describe("chatWithMipo (Atelier Stylist)", () => {
    it("responde a dúvidas de caimento e medidas com elegância e cordialidade", async () => {
      const response = await chatWithMipo(
        [{ role: "user", content: "Tenho 1,65m e 60kg, qual tamanho do Vestido Aurora fica melhor?" }],
        products[0]
      );
      expect(response).toBeDefined();
      expect(typeof response.reply).toBe("string");
      expect(response.reply.length).toBeGreaterThan(20);
    });

    it("oferece sugestões de combinação entre peças do catálogo", async () => {
      const calca = products.find((p) => p.id === "prod_calca_eixo") ?? products[3];
      const response = await chatWithMipo(
        [{ role: "user", content: "Com quais blusas ou calçados a Calça Eixo combina melhor?" }],
        calca
      );
      expect(response).toBeDefined();
      expect(typeof response.reply).toBe("string");
      expect(response.reply.length).toBeGreaterThan(15);
    });
  });

  describe("auditCart (Auditoria Multi-item e Cuidados)", () => {
    it("avalia coerência de sacola vazia", async () => {
      const audit = await auditCart([]);
      expect(audit.status).toBe("aligned");
      expect(audit.headline).toContain("vazia");
      expect(audit.careTips).toHaveLength(0);
    });

    it("aprova sacola com tamanhos uniformes e gera dicas de cuidados", async () => {
      const items: CartLine[] = [
        {
          id: "1",
          productId: "prod_vestido_aurora",
          variantId: "var_aurora_m",
          title: "Vestido Aurora",
          size: "M",
          quantity: 1,
          unitPrice: 48900,
          color: "#a4492e",
        },
        {
          id: "2",
          productId: "prod_blusa_trama",
          variantId: "var_trama_m",
          title: "Blusa Trama",
          size: "M",
          quantity: 1,
          unitPrice: 32900,
          color: "#dfdacb",
        },
      ];

      const audit = await auditCart(items);
      expect(audit.status).toBe("aligned");
      expect(audit.advice).toContain("tamanho M");
      expect(audit.careTips.length).toBeGreaterThanOrEqual(2);
      expect(audit.careTips.some((tip) => /linho/i.test(tip))).toBe(true);
      expect(audit.careTips.some((tip) => /tricot/i.test(tip))).toBe(true);
    });

    it("alerta quando há disparidade de tamanhos entre peças de vestuário", async () => {
      const items: CartLine[] = [
        {
          id: "1",
          productId: "prod_blusa_trama",
          variantId: "var_trama_p",
          title: "Blusa Trama",
          size: "P",
          quantity: 1,
          unitPrice: 32900,
          color: "#dfdacb",
        },
        {
          id: "2",
          productId: "prod_calca_eixo",
          variantId: "var_eixo_gg",
          title: "Calça Eixo",
          size: "GG",
          quantity: 1,
          unitPrice: 42000,
          color: "#4e5841",
        },
      ];

      const audit = await auditCart(items);
      expect(audit.status).toBe("attention");
      expect(audit.headline).toContain("variação de tamanhos");
      expect(audit.advice).toContain("P e GG");
    });
  });

  describe("explainFitDecision (Explicação Contextual)", () => {
    it("fornece explicação contextualizada para a decisão de caimento", async () => {
      const product = products[0];
      const selected = product.variants[0];
      const risk = evaluateCheckoutRisk(product, selected);
      const explanation = await explainFitDecision(product, selected, "regular", risk, "M");

      expect(explanation).toBeDefined();
      expect(typeof explanation.message).toBe("string");
      expect(explanation.message.length).toBeGreaterThan(10);
      expect(["eloagents", "deterministic"]).toContain(explanation.provider);
    });
  });

  describe("evaluateCheckoutRisk - Inteligência de Tamanho Habitual e Preferência", () => {
    it("valida positivamente quando o tamanho escolhido é idêntico ao habitual", () => {
      const product = products[1]; // Vestido Sereno
      const variantP = product.variants[0]; // P (returnRate 0.13)
      const result = evaluateCheckoutRisk(product, variantP, "regular", undefined, "P");

      expect(result.risk).toBe("none");
      expect(result.outcome).toBe("good_match");
      expect(result.message).toContain("Excelente escolha");
      expect(result.message).toContain("referência habitual");
      expect(result.recommendedVariant).toBeUndefined();
    });

    it("NÃO contesta e valida como boa escolha quando o cliente escolhe tamanho maior para caimento solto", () => {
      const product = products[1]; // Vestido Sereno
      const variantM = product.variants[1]; // M
      // usual is P, selected is M, fitPreference is loose
      const result = evaluateCheckoutRisk(product, variantM, "loose", undefined, "P");

      expect(result.risk).toBe("none");
      expect(result.outcome).toBe("good_match");
      expect(result.message).toContain("Escolha alinhada");
      expect(result.message).toContain("caimento mais solto");
      expect(result.recommendedVariant).toBeUndefined();
    });

    it("NÃO contesta e valida quando cliente escolhe tamanho menor intencionalmente para caimento ajustado", () => {
      const product = products[1]; // Vestido Sereno
      const variantP = product.variants[0]; // P
      // usual is M, selected is P, fitPreference is fitted
      const result = evaluateCheckoutRisk(product, variantP, "fitted", undefined, "M");

      expect(result.risk).toBe("none");
      expect(result.outcome).toBe("good_match");
      expect(result.message).toContain("Escolha intencional");
      expect(result.message).toContain("caimento ajustado");
      expect(result.recommendedVariant).toBeUndefined();
    });

    it("alerta quando o tamanho habitual do cliente possui alto índice de trocas nesta peça", () => {
      // Vestido Aurora variant M has return rate 0.34
      const product = {
        ...products[0],
        variants: products[0].variants.map((v) => ({ ...v, salesCount: 50 })),
      };
      const variantM = product.variants[1]; // returnRate 0.34
      // usual is M, selected is M
      const result = evaluateCheckoutRisk(product, variantM, "regular", undefined, "M");

      expect(result.risk).toBe("size");
      expect(result.outcome).toBe("attention");
      expect(result.message).toContain("Mesmo sendo seu tamanho habitual (M)");
      expect(result.recommendedVariant).toBeDefined();
    });
  });
});
