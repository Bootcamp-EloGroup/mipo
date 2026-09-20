import { describe, expect, it } from "vitest";
import { projectExperimentScenario, simulateImpact } from "../src/domain/impact-simulator";

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

describe("projectExperimentScenario", () => {
  it("projeta um desenho A/B sem alegar causalidade ou economia capturada", () => {
    const result = projectExperimentScenario({
      totalEligibleSessions: 1_000,
      splitRatio: 0.5,
      observedControlReturnRate: 0.25, // 25% no grupo controle
      mipoAcceptanceRate: 0.70,        // 70% aceitam a recomendação
      avoidableReturnShare: 0.60,      // 60% das devoluções são evitáveis (tamanho/modelagem)
      averageReturnCostCents: 4_500,   // R$ 45,00 de frete reverso/triagem por devolução
    });

    expect(result.status).toBe("scenario_projection");
    expect(result.control.sessions).toBe(500);
    expect(result.mipo.sessions).toBe(500);
    expect(result.control.returns).toBe(125);
    expect(result.control.returnRate).toBe(0.25);

    // Redução relativa esperada: 0.70 * 0.60 = 0.42 (42% de redução)
    expect(result.delta.relativeReductionRate).toBeCloseTo(0.42, 2);
    // Taxa esperada no grupo MIPO: 0.25 * (1 - 0.42) = 0.145 (14.5%)
    expect(result.mipo.returnRate).toBeCloseTo(0.145, 3);
    expect(result.mipo.returns).toBe(73); // Math.round(500 * 0.145) = 73

    // Devoluções evitadas: 125 - 73 = 52
    expect(result.delta.avoidedReturns).toBe(52);
    // Economia: 52 * 4500 = 234.000 cents (R$ 2.340,00)
    expect(result.delta.potentialReturnCostAvoidedCents).toBe(234_000);
    expect(result.assumptions.join(" ")).toContain("projeção");
    expect(result.assumptions.join(" ")).toContain("contagens reais");
  });

  it("respeita split de tráfego customizado", () => {
    const result = projectExperimentScenario({
      totalEligibleSessions: 800,
      splitRatio: 0.25, // 25% MIPO, 75% Controle
      observedControlReturnRate: 0.20,
      mipoAcceptanceRate: 0.50,
      avoidableReturnShare: 0.50,
      averageReturnCostCents: 3_000,
    });

    expect(result.mipo.sessions).toBe(200);
    expect(result.control.sessions).toBe(600);
    expect(result.delta.avoidedReturns).toBeGreaterThan(0);
  });

  it("rejeita entradas com valores de taxa fora de [0, 1]", () => {
    expect(() => projectExperimentScenario({
      totalEligibleSessions: 100,
      observedControlReturnRate: 1.5,
      mipoAcceptanceRate: 0.5,
      avoidableReturnShare: 0.5,
      averageReturnCostCents: 1000,
    })).toThrow("observedControlReturnRate");
  });
});
