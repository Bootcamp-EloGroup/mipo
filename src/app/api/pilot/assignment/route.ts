import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-response";
import { getOrCreateSessionId, sessionCookie } from "@/src/lib/session";
import { getPilotAssignment } from "@/src/server/pilot-checkout";

export async function GET() {
  try {
    const session = await getOrCreateSessionId();
    const response = NextResponse.json({ group: await getPilotAssignment(session.id) });
    if (session.created) response.cookies.set(sessionCookie(session.id));
    return response;
  } catch (error) {
    return apiError(error);
  }
}
