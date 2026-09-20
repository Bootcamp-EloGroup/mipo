export type PilotGroup = "control" | "treatment";
export type PilotOutcome = "pending" | "kept" | "returned";

export type PilotOrderResult = {
  id: string;
  displayId: string;
  group: PilotGroup;
  itemCount: number;
  totalCents: number;
  completedAt: string;
};

export function assignPilotGroup(sessionId: string): PilotGroup {
  let hash = 2166136261;
  for (const char of sessionId) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2 === 0 ? "control" : "treatment";
}

type ObservedOrder = { group: PilotGroup; outcome: PilotOutcome; returnCostCents: number };
type GroupSummary = { orders: number; observed: number; returns: number; returnRate: number | null; returnCostCents: number };

export function summarizePilot(orders: ObservedOrder[]) {
  const group = (name: PilotGroup): GroupSummary => {
    const matching = orders.filter((order) => order.group === name);
    const observed = matching.filter((order) => order.outcome !== "pending");
    const returns = observed.filter((order) => order.outcome === "returned");
    return {
      orders: matching.length,
      observed: observed.length,
      returns: returns.length,
      returnRate: observed.length ? returns.length / observed.length : null,
      returnCostCents: returns.reduce((total, order) => total + order.returnCostCents, 0),
    };
  };
  const control = group("control");
  const treatment = group("treatment");
  return { control, treatment, readyForComparison: control.observed >= 30 && treatment.observed >= 30 };
}
