import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-response";
import { getOrCreateSessionId, sessionCookie } from "@/src/lib/session";
import { completePilotCheckout } from "@/src/server/pilot-checkout";

export async function POST(request: Request) {
  try {
    const { idempotencyKey } = await request.json();
    if (typeof idempotencyKey !== "string" || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
      return NextResponse.json({ error: "Chave de idempotência inválida." }, { status: 400 });
    }
    const session = await getOrCreateSessionId();
    const response = NextResponse.json(await completePilotCheckout(session.id, idempotencyKey));
    if (session.created) response.cookies.set(sessionCookie(session.id));
    return response;
  } catch (error) {
    return apiError(error);
  }
}
