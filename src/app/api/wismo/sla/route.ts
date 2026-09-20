import { apiError } from "@/src/lib/api-response";
import states from "@/src/data/brazilian-states.json";
import { getActiveWismoRuleSet, getLatestCompletedRunId, getRulerMatrix } from "@/src/server/wismo";
import { confidenceOf, criticalDaysOf } from "@/src/services/wismo";

export async function GET() {
  try {
    const runId = await getLatestCompletedRunId();
    if (!runId) return Response.json({ error: "Nenhuma importação concluída encontrada." }, { status: 409 });
    const [rule, matrix] = await Promise.all([getActiveWismoRuleSet(), getRulerMatrix(runId)]);
    const rulers = matrix.all.map((ruler) => ({ ...ruler, confidence: confidenceOf(ruler.sampleSize, rule.thresholds), criticalDays: criticalDaysOf(ruler, rule.thresholds) }));
    const covered = new Set(rulers.filter((ruler) => ruler.scope === "state").map((ruler) => ruler.scopeKey));
    const p75 = rulers.filter((ruler) => ruler.scope === "state").map((ruler) => ruler.p75Days);
    return Response.json({
      ruleVersion: rule.version,
      thresholds: rule.thresholds,
      rulers,
      coverage: {
        uncoveredStates: (states as Array<{ uf: string }>).map((state) => state.uf).filter((uf) => !covered.has(uf)),
        thinScopes: rulers.filter((ruler) => ruler.sampleSize < rule.thresholds.mediumConfidenceSample).map((ruler) => ({ scope: ruler.scope, scopeKey: ruler.scopeKey, sampleSize: ruler.sampleSize })),
        p75Min: p75.length ? Math.min(...p75) : null,
        p75Max: p75.length ? Math.max(...p75) : null,
        p75Distinct: new Set(p75).size,
      },
    });
  } catch (error) { return apiError(error); }
}
