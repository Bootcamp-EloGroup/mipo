import { apiError } from "@/src/lib/api-response";
import { getOrCreateSessionId } from "@/src/lib/session";
import { removeCartItem, updateCartItem } from "@/src/server/store";

export async function PATCH(request: Request, context: RouteContext<"/api/cart/items/[id]">) { try { const body = await request.json(); if (!Number.isInteger(body.quantity) || body.quantity < 1) return Response.json({ error: "quantity deve ser um inteiro positivo." }, { status: 400 }); return Response.json(await updateCartItem((await getOrCreateSessionId()).id, (await context.params).id, body.quantity)); } catch (error) { return apiError(error); } }
export async function DELETE(_request: Request, context: RouteContext<"/api/cart/items/[id]">) { try { return Response.json(await removeCartItem((await getOrCreateSessionId()).id, (await context.params).id)); } catch (error) { return apiError(error); } }
