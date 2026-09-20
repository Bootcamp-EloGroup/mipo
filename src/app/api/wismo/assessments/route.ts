import { apiError } from "@/src/lib/api-response";
import { dataSource } from "@/src/lib/supabase-rest";
import { rebuildDeliveryAssessments } from "@/src/server/wismo";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body?.confirm !== "RECONSTRUIR") return Response.json({ error: 'Envie { "confirm": "RECONSTRUIR" } para reconstruir as avaliações de entrega.' }, { status: 400 });
    if (dataSource() !== "supabase") return Response.json({ error: "A reconstrução exige DATA_SOURCE=supabase." }, { status: 409 });
    return Response.json(await rebuildDeliveryAssessments());
  } catch (error) { return apiError(error); }
}
