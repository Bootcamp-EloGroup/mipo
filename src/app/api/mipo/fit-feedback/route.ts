import { apiError } from "@/src/lib/api-response";
import { getOrCreateSessionId } from "@/src/lib/session";
import { dataSource, supabaseRest } from "@/src/lib/supabase-rest";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.productId !== "string" || typeof body.variantId !== "string" || !["tight", "ideal", "loose"].includes(body.rating)) return Response.json({ error: "Produto, variação e avaliação válidos são obrigatórios." }, { status: 400 });
    if (dataSource() === "supabase") {
      const session = await getOrCreateSessionId();
      await supabaseRest("mipo_fit_feedback", { method: "POST", body: JSON.stringify({ session_id: session.id, product_id: body.productId, variant_id: body.variantId, rating: body.rating }) });
    }
    return Response.json({ recorded: dataSource() === "supabase" });
  } catch (error) { return apiError(error); }
}
