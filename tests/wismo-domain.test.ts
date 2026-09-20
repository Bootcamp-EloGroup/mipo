import { describe, expect, it } from "vitest";
import { WISMO_STATUSES, isValidOrderCode, normalizeOrderCode, outcomeFor } from "../src/domain/wismo";
import { MOCK_ORDER_EXAMPLES, mockWismoStatus } from "../src/services/wismo-mock";

const now = new Date("2026-09-20T15:00:00Z");

describe("contrato WISMO", () => {
  it("normaliza e valida o código do pedido", () => {
    expect(normalizeOrderCode("  ord-1001 ")).toBe("ORD-1001");
    expect(isValidOrderCode("ORD-1001")).toBe(true);
    expect(isValidOrderCode("A1")).toBe(false);
    expect(isValidOrderCode("ORD 1001")).toBe(false);
    expect(isValidOrderCode("-ORD-1")).toBe(false);
    expect(isValidOrderCode("A".repeat(33))).toBe(false);
  });

  it("deriva o resultado do atendimento", () => {
    expect(outcomeFor({ found: false, needsEscalation: false })).toBe("not_found");
    expect(outcomeFor({ found: true, needsEscalation: true })).toBe("escalated");
    expect(outcomeFor({ found: true, needsEscalation: false })).toBe("resolved");
  });
});

describe("cenários provisórios da interface", () => {
  it("cobre um cenário por status do contrato", () => {
    const statuses = MOCK_ORDER_EXAMPLES.map((example) => mockWismoStatus(example.code, now).status);
    expect(statuses).toEqual(["on_time", "delayed", "no_update", "delivered", "inconclusive"]);
    expect(new Set(statuses)).toEqual(new Set(WISMO_STATUSES));
  });

  it("escala apenas sem atualização e inconclusivo, com motivo", () => {
    for (const example of MOCK_ORDER_EXAMPLES) {
      const result = mockWismoStatus(example.code, now);
      const shouldEscalate = result.status === "no_update" || result.status === "inconclusive";
      expect(result.found).toBe(true);
      expect(result.needsEscalation).toBe(shouldEscalate);
      expect(Boolean(result.escalationReason)).toBe(shouldEscalate);
      expect(result.dataOrigin).toBe("mock");
    }
  });

  it("informa previsão e último evento dentro do prazo", () => {
    const result = mockWismoStatus("ord-1001", now);
    expect(result.orderCode).toBe("ORD-1001");
    expect(result.customerMessage).toContain("22/09");
    expect(result.customerMessage).toContain("20/09 às 07h");
    expect(result.promisedDate).toBe("2026-09-22");
  });

  it("informa há quantos dias não há atualização", () => {
    const result = mockWismoStatus("ORD-1003", now);
    expect(result.daysWithoutUpdate).toBe(7);
    expect(result.customerMessage).toContain("7 dias");
  });

  it("trata código inexistente sem escalar", () => {
    const result = mockWismoStatus("ORD-9999", now);
    expect(result.found).toBe(false);
    expect(result.needsEscalation).toBe(false);
    expect(outcomeFor(result)).toBe("not_found");
    expect(result.customerMessage).toContain("ORD-9999");
  });
});
