import { describe, expect, it } from "vitest";
import type { DeliveryRuler, DeliveryRulerSet, SlaScope, WismoOrder } from "../src/domain/wismo";
import { confidenceOf, criticalDaysOf, evaluateDeliveryStatus, projectOrderAt, resolveRuler } from "../src/services/wismo";

const DAY = 86_400_000;
const ORDERED_AT = "2023-06-15T00:00:00.000Z";

const ruler = (scope: SlaScope, scopeKey: string, p50: number, p75: number, p90: number, sampleSize: number): DeliveryRuler => ({ scope, scopeKey, p50Days: p50, p75Days: p75, p90Days: p90, sampleSize });
const national = ruler("national", "BR", 8, 12, 16, 27758);
const rulers = (extra: Partial<DeliveryRulerSet> = {}): DeliveryRulerSet => ({ national, ...extra });
const order = (actualDeliveryDays: number | null, orderedAt = ORDERED_AT): WismoOrder => ({ orderKey: "ORD-DEMO-001", orderedAt, customerState: "AC", actualDeliveryDays });
const at = (offsetDays: number, orderedAt = ORDERED_AT) => new Date(Date.parse(orderedAt) + offsetDays * DAY);

describe("escada de régua por especificidade", () => {
  it("usa a régua do estado mesmo com amostra 1", () => {
    const resolved = resolveRuler(rulers({ state: ruler("state", "AC", 9, 9, 9, 1), region: ruler("region", "norte", 10, 14, 18, 900) }));
    expect(resolved.ruler.scope).toBe("state");
    expect(resolved.ruler.sampleSize).toBe(1);
    expect(resolved.chain).toEqual(["state"]);
  });

  it("cai para a região quando o estado não tem régua", () => {
    const resolved = resolveRuler(rulers({ region: ruler("region", "norte", 10, 14, 18, 900) }));
    expect(resolved.ruler.scope).toBe("region");
    expect(resolved.chain).toEqual(["state", "region"]);
  });

  it("cai para o nacional quando estado e região não têm régua", () => {
    const resolved = resolveRuler(rulers());
    expect(resolved.ruler.scope).toBe("national");
    expect(resolved.chain).toEqual(["state", "region", "national"]);
  });

  it("nunca bloqueia por amostra pequena", () => {
    const status = evaluateDeliveryStatus(order(7), rulers({ state: ruler("state", "AC", 9, 9, 9, 1) }));
    expect(status.evidence.confidence).toBe("baixa");
    expect(status.evidence.promisedAt).toBeDefined();
    expect(status.flag).toBe("on_time");
  });
});

describe("rótulo de confiança", () => {
  it("rotula alta, média e baixa pelos cortes da regra", () => {
    expect(confidenceOf(30)).toBe("alta");
    expect(confidenceOf(29)).toBe("media");
    expect(confidenceOf(5)).toBe("media");
    expect(confidenceOf(4)).toBe("baixa");
  });
});

describe("banda de escalonamento", () => {
  it("abre banda mínima quando p75 é igual a p90", () => {
    expect(criticalDaysOf(ruler("state", "AC", 9, 9, 9, 1))).toBe(12);
  });

  it("não alarga a banda de uma régua bem amostrada", () => {
    expect(criticalDaysOf(national)).toBe(16);
  });
});

describe("classificação retrospectiva", () => {
  it("classifica pedido histórico entregue no prazo", () => {
    const status = evaluateDeliveryStatus(order(8), rulers());
    expect(status.phase).toBe("delivered");
    expect(status.flag).toBe("on_time");
    expect(status.daysLate).toBe(0);
    expect(status.criticalBreach).toBe(false);
  });

  it("classifica pedido histórico entregue com atraso", () => {
    const status = evaluateDeliveryStatus(order(15), rulers());
    expect(status.flag).toBe("late");
    expect(status.daysLate).toBe(3);
    expect(status.criticalBreach).toBe(false);
  });

  it("marca violação crítica em entrega acima do limiar", () => {
    const status = evaluateDeliveryStatus(order(17), rulers());
    expect(status.criticalBreach).toBe(true);
    expect(status.escalate).toBe(false);
  });

  it("não escalona pedido já entregue mesmo com data_pedido antiga", () => {
    const status = evaluateDeliveryStatus(order(8, "2023-01-01T00:00:00.000Z"), rulers(), new Date("2026-09-20T00:00:00.000Z"));
    expect(status.phase).toBe("delivered");
    expect(status.flag).toBe("on_time");
    expect(status.escalate).toBe(false);
    expect(status.evidence.elapsedDays).toBe(8);
  });
});

describe("pedido em voo", () => {
  it("considera pedido em preparação antes do prazo de separação", () => {
    const status = evaluateDeliveryStatus(order(null), rulers(), at(1));
    expect(status.phase).toBe("preparing");
    expect(status.flag).toBe("on_time");
  });

  it("considera pedido em transporte dentro do prazo", () => {
    const status = evaluateDeliveryStatus(order(null), rulers(), at(5));
    expect(status.phase).toBe("in_transit");
    expect(status.flag).toBe("on_time");
  });

  it("marca atraso em voo ao ultrapassar o prazo prometido", () => {
    const status = evaluateDeliveryStatus(order(null), rulers(), at(13));
    expect(status.phase).toBe("in_transit");
    expect(status.flag).toBe("late");
    expect(status.daysLate).toBe(1);
    expect(status.escalate).toBe(false);
  });

  it("escalona pedido em transporte acima do limiar crítico", () => {
    const status = evaluateDeliveryStatus(order(null), rulers(), at(17));
    expect(status.escalate).toBe(true);
    expect(status.criticalBreach).toBe(true);
  });

  it("não gera dias de atraso negativos", () => {
    const status = evaluateDeliveryStatus(order(null), rulers(), at(-3));
    expect(status.evidence.elapsedDays).toBe(0);
    expect(status.daysLate).toBe(0);
  });
});

describe("data de referência", () => {
  it("trata pedido como em voo antes da data de entrega", () => {
    const projected = projectOrderAt(order(10), at(4));
    expect(projected.actualDeliveryDays).toBeNull();
    expect(evaluateDeliveryStatus(projected, rulers(), at(4)).phase).toBe("in_transit");
  });

  it("trata pedido como entregue a partir da data de entrega", () => {
    const projected = projectOrderAt(order(10), at(10));
    expect(projected.actualDeliveryDays).toBe(10);
    expect(evaluateDeliveryStatus(projected, rulers(), at(10)).phase).toBe("delivered");
  });

  it("reproduz atraso em voo de um pedido histórico real", () => {
    const projected = projectOrderAt(order(20), at(13));
    const status = evaluateDeliveryStatus(projected, rulers(), at(13));
    expect(status.phase).toBe("in_transit");
    expect(status.flag).toBe("late");
    expect(status.daysLate).toBe(1);
  });
});

describe("limites de honestidade", () => {
  it("não inventa evento de rastreio", () => {
    const cases = [
      evaluateDeliveryStatus(order(8), rulers()),
      evaluateDeliveryStatus(order(17), rulers()),
      evaluateDeliveryStatus(order(null), rulers(), at(1)),
      evaluateDeliveryStatus(order(null), rulers(), at(5)),
      evaluateDeliveryStatus(order(null), rulers(), at(17)),
    ];
    for (const status of cases) expect(status.message).not.toMatch(/transportadora|último evento|saiu para entrega|rastreio|código de rastreamento/i);
  });
});
