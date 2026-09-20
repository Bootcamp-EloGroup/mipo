import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const source = process.env.DATA_SOURCE;
  const checks = {
    dataSource: source === "local" || source === "supabase",
    supabase: source !== "supabase" || Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)),
    agent: process.env.AI_EXPLANATIONS_ENABLED !== "true" || Boolean(process.env.MIPO_PYTHON_AGENT_URL && process.env.MIPO_PYTHON_AGENT_TOKEN),
  };
  const ready = Object.values(checks).every(Boolean);
  return NextResponse.json(
    { status: ready ? "ready" : "misconfigured", checks },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
