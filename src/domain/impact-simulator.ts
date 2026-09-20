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

export type ExperimentProjectionInput = {
  totalEligibleSessions: number;
  splitRatio?: number;
  observedControlReturnRate: number;
  mipoAcceptanceRate: number;
  avoidableReturnShare: number;
  averageReturnCostCents: number;
  averageMarginPerOrderCents?: number;
};

export type ExperimentProjectionResult = {
  control: {
    sessions: number;
    returns: number;
    returnRate: number;
    reverseLogisticsCostCents: number;
  };
  mipo: {
    sessions: number;
    returns: number;
    returnRate: number;
    reverseLogisticsCostCents: number;
  };
  delta: {
    avoidedReturns: number;
    relativeReductionRate: number;
    potentialReturnCostAvoidedCents: number;
  };
  assumptions: string[];
  status: "scenario_projection";
};

/**
 * Projeta um desenho de experimento antes da coleta. Todos os resultados do
 * tratamento são derivados de premissas e não representam observações,
 * causalidade, significância estatística ou economia capturada.
 */
export function projectExperimentScenario(input: ExperimentProjectionInput): ExperimentProjectionResult {
  assertNonNegative("totalEligibleSessions", input.totalEligibleSessions);
  assertRate("observedControlReturnRate", input.observedControlReturnRate);
  assertRate("mipoAcceptanceRate", input.mipoAcceptanceRate);
  assertRate("avoidableReturnShare", input.avoidableReturnShare);
  assertNonNegative("averageReturnCostCents", input.averageReturnCostCents);

  const split = input.splitRatio ?? 0.5;
  assertRate("splitRatio", split);

  const total = Math.max(0, Math.round(input.totalEligibleSessions));
  const mipoSessions = Math.round(total * split);
  const controlSessions = total - mipoSessions;

  const controlReturnRate = input.observedControlReturnRate;
  const controlReturns = Math.round(controlSessions * controlReturnRate);
  const controlCostCents = controlReturns * input.averageReturnCostCents;

  // No grupo MIPO, a taxa de devolução cai pela fração de devoluções evitáveis que foram aceitas
  const relativeReduction = input.mipoAcceptanceRate * input.avoidableReturnShare;
  const mipoReturnRate = controlReturnRate * (1 - relativeReduction);
  const mipoReturns = Math.round(mipoSessions * mipoReturnRate);
  const mipoCostCents = mipoReturns * input.averageReturnCostCents;

  // Devoluções evitadas normalizadas para a escala do grupo MIPO
  const baselineReturnsIfNoMipo = Math.round(mipoSessions * controlReturnRate);
  const avoidedReturns = Math.max(0, baselineReturnsIfNoMipo - mipoReturns);
  const potentialReturnCostAvoidedCents = avoidedReturns * input.averageReturnCostCents;

  return {
    control: {
      sessions: controlSessions,
      returns: controlReturns,
      returnRate: controlReturnRate,
      reverseLogisticsCostCents: controlCostCents,
    },
    mipo: {
      sessions: mipoSessions,
      returns: mipoReturns,
      returnRate: mipoReturnRate,
      reverseLogisticsCostCents: mipoCostCents,
    },
    delta: {
      avoidedReturns,
      relativeReductionRate: relativeReduction,
      potentialReturnCostAvoidedCents,
    },
    assumptions: [
      "A divisão de tráfego é apenas o desenho proposto; nenhuma sessão foi randomizada por esta função.",
      "A taxa do grupo MIPO é projetada a partir de adesão e parcela evitável assumidas.",
      "O custo potencialmente evitado é uma projeção e não economia observada ou capturada.",
      "Significância e causalidade só podem ser calculadas com contagens reais dos dois grupos.",
    ],
    status: "scenario_projection",
  };
}
