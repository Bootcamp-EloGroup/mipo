import { NextResponse } from "next/server";
import { answerWismoHelp } from "@/src/domain/wismo-help";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { message?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (message.length < 2 || message.length > 500) {
    return NextResponse.json({ error: "Envie uma dúvida de 2 a 500 caracteres." }, { status: 400 });
  }
  return NextResponse.json(answerWismoHelp(message));
}
