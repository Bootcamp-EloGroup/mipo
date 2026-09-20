import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-response";
import { getOrCreateSessionId, sessionCookie } from "@/src/lib/session";
import { WismoEventNotFoundError, getWismoDashboardData, parseWismoEventInput, recordWismoEvent } from "@/src/server/wismo-events";

export async function POST(request: Request) {
  try {
    const parsed = parseWismoEventInput(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const session = await getOrCreateSessionId();
    await recordWismoEvent(session.id, parsed.value);
    const response = NextResponse.json({ recorded: true });
    if (session.created) response.cookies.set(sessionCookie(session.id));
    return response;
  } catch (error) {
    if (error instanceof WismoEventNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    return apiError(error);
  }
}

export async function GET() {
  try { return NextResponse.json(await getWismoDashboardData()); } catch (error) { return apiError(error); }
}
