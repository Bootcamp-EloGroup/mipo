import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-response";
import { expiresAt, getOrCreateSessionId, sessionCookie } from "@/src/lib/session";
import { dataSource, supabaseRest } from "@/src/lib/supabase-rest";
import { getProduct } from "@/src/server/store";
import { evaluateCheckout } from "@/src/services/mipo";
import { evaluateSelectionContext } from "@/src/services/mipo";
import type { BodyMeasurements, SelectionContext, Size } from "@/src/domain/commerce";
import { measurementAssessmentSummary, validateMeasurements } from "@/src/services/measurement-fit";

function parseMeasurements(value: unknown): BodyMeasurements | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>; const result: BodyMeasurements = {};
  for (const key of ["bust", "waist", "hip"] as const) if (typeof source[key] === "number") result[key] = source[key];
  return Object.keys(result).length ? result : undefined;
}

export async function POST(request: Request) {
  try {
    const body = await request.json(); const fitPreference = body.fitPreference ?? null; const usualSize = body.usualSize ?? null; const measurements = parseMeasurements(body.measurements); const selectionContext = body.selectionContext && typeof body.selectionContext.preference === "string" && typeof body.selectionContext.label === "string" ? body.selectionContext as SelectionContext : null;
    if (typeof body.productId !== "string" || typeof body.variantId !== "string" || ![null,"fitted","regular","loose"].includes(fitPreference) || ![null,"P","M","G","GG"].includes(usualSize)) return NextResponse.json({ error: "Produto, variação e preferência válidos são obrigatórios." }, { status: 400 });
    const product = await getProduct(body.productId); const variant = product?.variants.find((item) => item.id === body.variantId);
    if (!product || !variant) return NextResponse.json({ error: "Produto ou variação não encontrado." }, { status: 404 });
    const measurementErrors = measurements ? validateMeasurements(measurements) : [];
    if (measurementErrors.length) return NextResponse.json({ error: measurementErrors[0] }, { status: 400 });
    const isApparel = product.productKind === "apparel" || product.variantAttribute === "size" || (!product.productKind && product.category !== "Maquiagem");
    if (!isApparel && !selectionContext) return NextResponse.json({ error: "Para este produto, uma preferência de uso é necessária." }, { status: 400 });
    const session = await getOrCreateSessionId(); let interventionId = `local-${crypto.randomUUID()}`;
    if (dataSource() === "supabase") {
      await supabaseRest("anonymous_sessions?on_conflict=id", { method:"POST", headers:{Prefer:"resolution=ignore-duplicates,return=minimal"}, body:JSON.stringify({id:session.id,expires_at:expiresAt(),last_seen_at:new Date().toISOString(),is_demo:process.env.MIPO_DEMO_MODE==="true"}) });
      await supabaseRest(`anonymous_sessions?id=eq.${session.id}`, {method:"PATCH",body:JSON.stringify({last_seen_at:new Date().toISOString()})});
      const rules = await supabaseRest<Array<{id:string;version:string;high_return_rate:number;minimum_improvement:number;low_stock_quantity:number;minimum_sample_size:number}>>("mipo_rule_sets?is_active=eq.true&select=*&limit=1");
      if (!rules[0]) throw new Error("Nenhum conjunto de regras MIPO ativo.");
      const thresholds = { highReturnRate: rules[0].high_return_rate, minimumImprovement: rules[0].minimum_improvement, lowStockQuantity: rules[0].low_stock_quantity, minimumSampleSize: rules[0].minimum_sample_size };
      const result = selectionContext ? evaluateSelectionContext(product, variant, selectionContext) : evaluateCheckout(product, variant, { fitPreference: fitPreference ?? "regular", thresholds, usualSize: usualSize as Size | null, measurements });
      const safeAssessment = result.measurementAssessment ? measurementAssessmentSummary(result.measurementAssessment) : undefined;
      const [intervention] = await supabaseRest<Array<{id:string}>>("mipo_interventions", { method: "POST", body: JSON.stringify({ session_id: session.id, product_id: product.id, selected_variant_id: variant.id, recommended_variant_id: result.recommendedVariant?.id ?? null, rule_set_id: rules[0].id, fit_preference: isApparel ? fitPreference : null, risk_type: result.risk, risk_level: result.level, evidence: { message: result.evidence, score: result.score, evidenceCoverage: result.evidenceCoverage, selectionContext, usualSize, outcome: result.outcome, matchedPreferences: result.matchedPreferences, mismatchedPreferences: result.mismatchedPreferences, measurementAssessment: safeAssessment, quantitativeOrigin: "observed_or_derived_from_csv", attributeOrigin: variant.evidenceOrigin, thresholds: rules[0] }, message: result.message }) }); interventionId = intervention.id;
      const response = NextResponse.json({ interventionId, result }); if (session.created) response.cookies.set(sessionCookie(session.id)); return response;
    }
    const result = selectionContext ? evaluateSelectionContext(product, variant, selectionContext) : evaluateCheckout(product, variant, { fitPreference: fitPreference ?? "regular", usualSize: usualSize as Size | null, measurements });
    const response = NextResponse.json({ interventionId, result }); if (session.created) response.cookies.set(sessionCookie(session.id)); return response;
  } catch (error) { return apiError(error); }
}
