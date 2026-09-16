import { apiError } from "@/src/lib/api-response";
import { listProducts } from "@/src/server/store";

export async function GET() { try { return Response.json(await listProducts()); } catch (error) { return apiError(error); } }
