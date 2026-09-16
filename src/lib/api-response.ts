import { NextResponse } from "next/server";
import { DataSourceUnavailableError } from "@/src/lib/supabase-rest";

export function apiError(error: unknown) {
  if (error instanceof DataSourceUnavailableError) return NextResponse.json({ error: error.message }, { status: 503 });
  console.error(error);
  return NextResponse.json({ error: "Não foi possível concluir a operação." }, { status: 500 });
}
