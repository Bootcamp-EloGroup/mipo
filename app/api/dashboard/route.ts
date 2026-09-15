import { apiError } from "@/src/lib/api-response";
import { getDashboardData } from "@/src/server/dashboard";

export async function GET() {
  try { return Response.json(await getDashboardData()); }
  catch (error) { return apiError(error); }
}
