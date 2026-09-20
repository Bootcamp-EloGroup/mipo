export type WismoImpactInput = {
  /** Tickets WISMO no período considerado. */
  ticketVolume: number;
  /** Fração (0 a 1) dos tickets que o bot resolveria sem atendimento humano. */
  botResolutionRate: number;
  /** Custo médio por ticket, em centavos. */
  averageCostPerTicketCents: number;
};

export type WismoImpactResult = {
  ticketVolume: number;
  ticketsResolvedByBot: number;
  ticketsRemaining: number;
  baselineCostCents: number;
  potentialCostAvoidedCents: number;
  remainingCostCents: number;
  assumptions: string[];
  status: "scenario";
};

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} deve ser finito.`);
}

function assertNonNegative(name: string, value: number): void {
  assertFinite(name, value);
  if (value < 0) throw new RangeError(`${name} não pode ser negativo.`);
}

/**
 * Cenário de tickets WISMO potencialmente evitados. Não é medição nem
 * economia capturada: depende inteiramente das premissas informadas.
 */
export function simulateWismoImpact(input: WismoImpactInput): WismoImpactResult {
  assertNonNegative("ticketVolume", input.ticketVolume);
  assertNonNegative("averageCostPerTicketCents", input.averageCostPerTicketCents);
  assertFinite("botResolutionRate", input.botResolutionRate);
  if (input.botResolutionRate < 0 || input.botResolutionRate > 1) {
    throw new RangeError("botResolutionRate deve estar entre 0 e 1.");
  }

  const ticketVolume = Math.round(input.ticketVolume);
  const cost = Math.round(input.averageCostPerTicketCents);
  const ticketsResolvedByBot = Math.round(ticketVolume * input.botResolutionRate);
  const ticketsRemaining = ticketVolume - ticketsResolvedByBot;

  return {
    ticketVolume,
    ticketsResolvedByBot,
    ticketsRemaining,
    baselineCostCents: ticketVolume * cost,
    potentialCostAvoidedCents: ticketsResolvedByBot * cost,
    remainingCostCents: ticketsRemaining * cost,
    assumptions: [
      "A taxa de resolução pelo bot é uma premissa editável, não uma medição.",
      "O custo médio por ticket é aplicado igualmente a todos os tickets do período.",
      "O valor é custo potencialmente evitado em cenário; depende de validação em produção e não representa economia capturada.",
    ],
    status: "scenario",
  };
}
