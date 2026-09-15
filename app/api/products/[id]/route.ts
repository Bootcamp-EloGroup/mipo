import { apiError } from "@/src/lib/api-response";
import { getProduct } from "@/src/server/store";

export async function GET(_request: Request, context: RouteContext<"/api/products/[id]">) {
  try { const product = await getProduct((await context.params).id); return product ? Response.json(product) : Response.json({ error: "Produto não encontrado." }, { status: 404 }); } catch (error) { return apiError(error); }
}
