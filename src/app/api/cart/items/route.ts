import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-response";
import { getOrCreateSessionId, sessionCookie } from "@/src/lib/session";
import { addCartItem } from "@/src/server/store";
import type { SelectionContext } from "@/src/domain/commerce";

export async function POST(request: Request) { try { const body = await request.json(); if (typeof body.variantId !== "string" || !Number.isInteger(body.quantity) || body.quantity < 1) return NextResponse.json({ error: "variantId e quantity válidos são obrigatórios." }, { status: 400 }); if (body.mipoDecision !== undefined && !["accepted","kept_original","not_required"].includes(body.mipoDecision)) return NextResponse.json({ error: "Decisão MIPO inválida." }, { status: 400 }); const selectionContext = body.selectionContext && typeof body.selectionContext.preference === "string" && typeof body.selectionContext.label === "string" ? body.selectionContext as SelectionContext : undefined; const session = await getOrCreateSessionId(); const response = NextResponse.json(await addCartItem(session.id, body.variantId, body.quantity, body.mipoDecision, selectionContext)); if (session.created) response.cookies.set(sessionCookie(session.id)); return response; } catch (error) { return apiError(error); } }
