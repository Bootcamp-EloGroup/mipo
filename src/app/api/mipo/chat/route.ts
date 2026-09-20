import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-response";
import { chatWithMipo, type ChatMessage } from "@/src/server/mipo-assistant";
import type { Product, CartLine } from "@/src/domain/commerce";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages = Array.isArray(body.messages)
      ? body.messages.filter(
          (message: unknown): message is ChatMessage =>
            Boolean(message) &&
            typeof message === "object" &&
            ["user", "assistant"].includes(String((message as Record<string, unknown>).role)) &&
            typeof (message as Record<string, unknown>).content === "string" &&
            String((message as Record<string, unknown>).content).trim().length > 0 &&
            String((message as Record<string, unknown>).content).length <= 1200,
        ).slice(-12)
      : [];
    const productContext = (body.productContext as Product | undefined) ?? null;
    const cartContext = (body.cartContext as CartLine[] | undefined) ?? null;

    if (!messages.length || messages.length !== body.messages.length) {
      return NextResponse.json({ error: "Mensagens não informadas." }, { status: 400 });
    }

    const result = await chatWithMipo(messages, productContext, cartContext);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
