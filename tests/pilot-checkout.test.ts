import { describe, expect, it } from "vitest";
import { assignPilotGroup, summarizePilot } from "../src/domain/pilot-checkout";

describe("pilot checkout", () => {
  it("mantém a mesma atribuição para a mesma sessão", () => {
    const sessionId = "55ce39fc-bef4-4bea-8c2e-cab4c88eca09";
    expect(assignPilotGroup(sessionId)).toBe(assignPilotGroup(sessionId));
    expect(["control", "treatment"]).toContain(assignPilotGroup(sessionId));
  });

  it("separa operação de resultado observado", () => {
    const summary = summarizePilot([
      { group: "control", outcome: "kept", returnCostCents: 0 },
      { group: "control", outcome: "returned", returnCostCents: 4500 },
      { group: "treatment", outcome: "kept", returnCostCents: 0 },
      { group: "treatment", outcome: "pending", returnCostCents: 0 },
    ]);
    expect(summary.control).toEqual({ orders: 2, observed: 2, returns: 1, returnRate: 0.5, returnCostCents: 4500 });
    expect(summary.treatment).toEqual({ orders: 2, observed: 1, returns: 0, returnRate: 0, returnCostCents: 0 });
    expect(summary.readyForComparison).toBe(false);
  });
});
