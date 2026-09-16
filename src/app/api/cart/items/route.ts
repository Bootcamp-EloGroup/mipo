import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-response";
import { getOrCreateSessionId, sessionCookie } from "@/src/lib/session";
import { addCartItem } from "@/src/server/store";

export async function POST(request: Request) { try { const body = await request.json(); if (typeof body.variantId !== "string" || !Number.isInteger(body.quantity) || body.quantity < 1) return NextResponse.json({ error: "variantId e quantity válidos são obrigatórios." }, { status: 400 }); const session = await getOrCreateSessionId(); const response = NextResponse.json(await addCartItem(session.id, body.variantId, body.quantity, body.mipoDecision)); if (session.created) response.cookies.set(sessionCookie(session.id)); return response; } catch (error) { return apiError(error); } }
