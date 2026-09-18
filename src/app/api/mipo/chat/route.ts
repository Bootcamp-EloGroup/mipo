import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-response";
import { chatWithMipo, type ChatMessage } from "@/src/server/mipo-ai";
import type { Product, CartLine } from "@/src/domain/commerce";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages = Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : [];
    const productContext = (body.productContext as Product | undefined) ?? null;
    const cartContext = (body.cartContext as CartLine[] | undefined) ?? null;

    if (!messages.length) {
      return NextResponse.json({ error: "Mensagens não informadas." }, { status: 400 });
    }

    const result = await chatWithMipo(messages, productContext, cartContext);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
