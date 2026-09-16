import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-response";
import { getOrCreateSessionId, sessionCookie } from "@/src/lib/session";
import { clearCart, getCart } from "@/src/server/store";

export async function GET() { try { const session = await getOrCreateSessionId(); const response = NextResponse.json(await getCart(session.id)); if (session.created) response.cookies.set(sessionCookie(session.id)); return response; } catch (error) { return apiError(error); } }
export async function DELETE() { try { return NextResponse.json(await clearCart((await getOrCreateSessionId()).id)); } catch (error) { return apiError(error); } }
