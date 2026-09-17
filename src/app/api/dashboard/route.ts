import { apiError } from "@/src/lib/api-response";
import { getManagerDashboardData } from "@/src/server/manager-dashboard";

const date=/^\d{4}-\d{2}-\d{2}$/;
export async function GET(request:Request) {
  try { const url=new URL(request.url);const from=url.searchParams.get("from");const to=url.searchParams.get("to");const origin=url.searchParams.get("origin");if((from&&!date.test(from))||(to&&!date.test(to)))return Response.json({error:"Período inválido."},{status:400});if(origin&&!['all','historical','demo'].includes(origin))return Response.json({error:"Origem inválida."},{status:400});return Response.json(await getManagerDashboardData({from,to,channel:url.searchParams.get("channel"),category:url.searchParams.get("category"),origin:(origin??"all") as "all"|"historical"|"demo"})); }
  catch (error) { return apiError(error); }
}
