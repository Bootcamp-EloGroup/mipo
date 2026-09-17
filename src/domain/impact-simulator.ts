export type ImpactSimulationInput = {
  eligibleInterventions: number;
  assumedAcceptanceRate: number;
  observedReturnRate: number;
  assumedAvoidableReturnShare: number;
  averageMarginPerOrderCents: number;
  averageReturnCostCents?: number | null;
};

export type ImpactSimulationResult = {
  eligibleInterventions: number;
  /** Aliases mantidos para compatibilidade com a tela do painel v2. */
  eligible: number;
  accepted: number;
  avoided: number;
  exposure: number;
  acceptedInterventions: number;
  potentiallyAvoidedReturns: number;
  potentialMarginAssociatedCents: number;
  potentialReturnCostAvoidedCents: number | null;
  assumptions: string[];
  status: "scenario";
};

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} deve ser finito.`);
}

function assertRate(name: string, value: number): void {
  assertFinite(name, value);
  if (value < 0 || value > 1) throw new RangeError(`${name} deve estar entre 0 e 1.`);
}

function assertNonNegative(name: string, value: number): void {
  assertFinite(name, value);
  if (value < 0) throw new RangeError(`${name} não pode ser negativo.`);
}

/**
 * Calcula somente uma exposição potencial. Não estima causalidade e não
 * representa economia realizada pelo produto.
 */
export function simulateImpact(input: ImpactSimulationInput): ImpactSimulationResult {
  assertNonNegative("eligibleInterventions", input.eligibleInterventions);
  assertRate("assumedAcceptanceRate", input.assumedAcceptanceRate);
  assertRate("observedReturnRate", input.observedReturnRate);
  assertRate("assumedAvoidableReturnShare", input.assumedAvoidableReturnShare);
  assertNonNegative("averageMarginPerOrderCents", input.averageMarginPerOrderCents);
  if (input.averageReturnCostCents !== null && input.averageReturnCostCents !== undefined) {
    assertNonNegative("averageReturnCostCents", input.averageReturnCostCents);
  }

  const acceptedInterventions = Math.round(input.eligibleInterventions * input.assumedAcceptanceRate);
  const potentiallyAvoidedReturns = Math.round(
    acceptedInterventions * input.observedReturnRate * input.assumedAvoidableReturnShare,
  );
  const potentialReturnCostAvoidedCents = input.averageReturnCostCents == null
    ? null
    : potentiallyAvoidedReturns * input.averageReturnCostCents;

  return {
    eligibleInterventions: input.eligibleInterventions,
    eligible: input.eligibleInterventions,
    accepted: acceptedInterventions,
    avoided: potentiallyAvoidedReturns,
    exposure: potentiallyAvoidedReturns * input.averageMarginPerOrderCents,
    acceptedInterventions,
    potentiallyAvoidedReturns,
    potentialMarginAssociatedCents: potentiallyAvoidedReturns * input.averageMarginPerOrderCents,
    potentialReturnCostAvoidedCents,
    assumptions: [
      "A taxa de aceitação é uma premissa editável, não uma medição causal.",
      "A taxa de devolução observada é aplicada como referência histórica ao cenário.",
      "A parcela evitável é uma premissa editável; não prova que a intervenção causou a redução.",
      "O valor de margem é associação média por pedido e não economia capturada.",
    ],
    status: "scenario",
  };
}
