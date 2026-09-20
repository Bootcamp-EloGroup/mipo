import { describe, expect, it } from "vitest";
import { fromEngineResponse, notFoundResponse, type EngineOrderResponse } from "../src/services/wismo-adapter";

const engine = (overrides: Partial<EngineOrderResponse["status"]>): EngineOrderResponse => ({
  order: { orderKey: "ORD-033198" },
  status: {
    phase: "in_transit",
    flag: "on_time",
    daysLate: 0,
    escalate: false,
    message: "Seu pedido está em transporte. A previsão de entrega é 25/09.",
    evidence: { promisedAt: "2026-09-25T12:00:00.000Z", criticalDays: 13 },
    ...overrides,
  },
});

describe("adaptador do motor de regras", () => {
  it("traduz pedido no prazo sem escalonar", () => {
    const result = fromEngineResponse(engine({}));
    expect(result.found).toBe(true);
    expect(result.orderCode).toBe("ORD-033198");
    expect(result.status).toBe("on_time");
    expect(result.orderStatusLabel).toBe("Em transporte");
    expect(result.promisedDate).toBe("2026-09-25T12:00:00.000Z");
    expect(result.needsEscalation).toBe(false);
    expect(result.escalationReason).toBe(undefined);
    expect(result.dataOrigin).toBe("observed");
  });

  it("traduz atraso com escalonamento e motivo", () => {
    const result = fromEngineResponse(engine({ flag: "late", daysLate: 3, escalate: true, message: "Vamos acionar o time responsável." }));
    expect(result.status).toBe("delayed");
    expect(result.needsEscalation).toBe(true);
    expect(result.escalationReason).toContain("3 dias");
    expect(result.customerMessage).toBe("Vamos acionar o time responsável.");
  });

  it("traduz pedido entregue, mesmo com atraso, sem escalonar", () => {
    const result = fromEngineResponse(engine({ phase: "delivered", flag: "late", daysLate: 2 }));
    expect(result.status).toBe("delivered");
    expect(result.orderStatusLabel).toBe("Entregue");
    expect(result.needsEscalation).toBe(false);
  });

  it("trata código inexistente sem escalonar", () => {
    const result = notFoundResponse("ORD-0");
    expect(result.found).toBe(false);
    expect(result.needsEscalation).toBe(false);
  });
});
