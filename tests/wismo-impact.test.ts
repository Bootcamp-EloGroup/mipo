import { describe, expect, it } from "vitest";
import { simulateWismoImpact } from "../src/domain/wismo-impact";

describe("simulateWismoImpact", () => {
  it("calcula tickets e custo potencialmente evitados", () => {
    const result = simulateWismoImpact({ ticketVolume: 1000, botResolutionRate: 0.3, averageCostPerTicketCents: 1500 });
    expect(result.ticketsResolvedByBot).toBe(300);
    expect(result.ticketsRemaining).toBe(700);
    expect(result.baselineCostCents).toBe(1_500_000);
    expect(result.potentialCostAvoidedCents).toBe(450_000);
    expect(result.remainingCostCents).toBe(1_050_000);
    expect(result.potentialCostAvoidedCents + result.remainingCostCents).toBe(result.baselineCostCents);
  });

  it("não evita nada com taxa zero e evita tudo com taxa total", () => {
    expect(simulateWismoImpact({ ticketVolume: 500, botResolutionRate: 0, averageCostPerTicketCents: 1000 }).potentialCostAvoidedCents).toBe(0);
    const all = simulateWismoImpact({ ticketVolume: 500, botResolutionRate: 1, averageCostPerTicketCents: 1000 });
    expect(all.ticketsRemaining).toBe(0);
    expect(all.potentialCostAvoidedCents).toBe(all.baselineCostCents);
  });

  it("arredonda tickets para inteiros", () => {
    expect(simulateWismoImpact({ ticketVolume: 10, botResolutionRate: 0.25, averageCostPerTicketCents: 100 }).ticketsResolvedByBot).toBe(3);
  });

  it("rejeita premissas inválidas", () => {
    expect(() => simulateWismoImpact({ ticketVolume: 10, botResolutionRate: 1.2, averageCostPerTicketCents: 100 })).toThrow(RangeError);
    expect(() => simulateWismoImpact({ ticketVolume: -1, botResolutionRate: 0.5, averageCostPerTicketCents: 100 })).toThrow(RangeError);
    expect(() => simulateWismoImpact({ ticketVolume: 10, botResolutionRate: 0.5, averageCostPerTicketCents: Number.NaN })).toThrow(RangeError);
  });

  it("declara que é cenário e não economia capturada", () => {
    const result = simulateWismoImpact({ ticketVolume: 10, botResolutionRate: 0.5, averageCostPerTicketCents: 100 });
    expect(result.status).toBe("scenario");
    expect(result.assumptions.some((text) => text.includes("economia capturada"))).toBe(true);
  });
});
