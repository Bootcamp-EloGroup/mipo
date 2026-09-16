import { apiError } from "@/src/lib/api-response";
import { getOrCreateSessionId } from "@/src/lib/session";
import { dataSource, supabaseRest } from "@/src/lib/supabase-rest";

export async function POST(request: Request) {
  try { const body = await request.json(); if (typeof body.interventionId !== "string" || !["accepted","kept_original","not_required"].includes(body.decision)) return Response.json({ error: "Intervenção e decisão válidas são obrigatórias." }, { status: 400 }); const session = await getOrCreateSessionId(); if (dataSource() === "supabase") { const owned = await supabaseRest<Array<{id:string}>>(`mipo_interventions?id=eq.${body.interventionId}&session_id=eq.${session.id}&select=id&limit=1`); if (!owned[0]) return Response.json({ error: "Intervenção não encontrada para esta sessão." }, { status: 404 }); await supabaseRest("mipo_decisions", { method: "POST", body: JSON.stringify({ intervention_id: body.interventionId, session_id: session.id, decision: body.decision }) }); } return Response.json({ recorded: true }); } catch (error) { return apiError(error); }
}
