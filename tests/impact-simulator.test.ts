import { describe, expect, it } from "vitest";
import { simulateImpact } from "../src/domain/impact-simulator";

describe("simulateImpact", () => {
  it("recalcula um cenário determinístico sem alegar economia realizada", () => {
    const result = simulateImpact({
      eligibleInterventions: 100,
      assumedAcceptanceRate: 0.6,
      observedReturnRate: 0.2,
      assumedAvoidableReturnShare: 0.5,
      averageMarginPerOrderCents: 4_000,
      averageReturnCostCents: 1_200,
    });

    expect(result.acceptedInterventions).toBe(60);
    expect(result.potentiallyAvoidedReturns).toBe(6);
    expect(result.potentialMarginAssociatedCents).toBe(24_000);
    expect(result.potentialReturnCostAvoidedCents).toBe(7_200);
    expect(result.status).toBe("scenario");
    expect(result.assumptions.length).toBeGreaterThan(2);
  });

  it("preserva a ausência de custo quando a base não o fornece", () => {
    const result = simulateImpact({
      eligibleInterventions: 10,
      assumedAcceptanceRate: 1,
      observedReturnRate: 0.1,
      assumedAvoidableReturnShare: 1,
      averageMarginPerOrderCents: 500,
    });

    expect(result.potentialReturnCostAvoidedCents).toBeNull();
  });

  it.each([
    ["assumedAcceptanceRate", 1.1],
    ["observedReturnRate", -0.1],
    ["averageMarginPerOrderCents", -1],
  ])("rejeita %s inválido", (name, value) => {
    expect(() => simulateImpact({
      eligibleInterventions: 1,
      assumedAcceptanceRate: name === "assumedAcceptanceRate" ? value : 0.5,
      observedReturnRate: name === "observedReturnRate" ? value : 0.1,
      assumedAvoidableReturnShare: 0.5,
      averageMarginPerOrderCents: name === "averageMarginPerOrderCents" ? value : 100,
    })).toThrow(name);
  });
});
