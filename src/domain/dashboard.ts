export type DashboardDecision = "accepted" | "kept_original" | "not_required" | "pending" | "abandoned";

export type DashboardRow = {
  id: string;
  occurredAt: string;
  productId: string;
  product: string;
  selectedSize: string;
  recommendedSize?: string;
  risk: "size" | "quality" | "stock" | "none" | "insufficient_evidence";
  level: "high" | "medium" | "low";
  evidence: string;
  ruleVersion: string;
  decision: DashboardDecision;
  decidedAt?: string;
};

export type DashboardData = {
  generatedAt: string;
  historicalWindow: { from?: string; to?: string };
  minimumSampleSize: number;
  metrics: { interventions: number; actionable: number; decidedActionable: number; accepted: number; keptOriginal: number; pending: number; abandoned: number; acceptanceRate: number | null };
  riskDistribution: Array<{ risk: DashboardRow["risk"]; count: number }>;
  trend: Array<{ date: string; interventions: number; accepted: number }>;
  rows: DashboardRow[];
  simulator: { locked: boolean; reason?: string };
  agent: { total:number; eloagents:number; groq:number; deterministicFallback:number; rejected:number; cacheHits:number; averageLatencyMs:number|null };
};
