import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-response";
import { chatWithMipo, type ChatMessage } from "@/src/server/mipo-assistant";
import type { Product, CartLine } from "@/src/domain/commerce";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body?.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: "Mensagens não informadas." }, { status: 400 });
    }

    const validMessages: ChatMessage[] = [];
    for (const message of body.messages) {
      if (
        message &&
        typeof message === "object" &&
        ["user", "assistant"].includes(String((message as Record<string, unknown>).role)) &&
        typeof (message as Record<string, unknown>).content === "string"
      ) {
        const trimmed = String((message as Record<string, unknown>).content).trim();
        if (trimmed.length > 0) {
          validMessages.push({
            role: (message as Record<string, unknown>).role as "user" | "assistant",
            content: trimmed.length > 2000 ? `${trimmed.slice(0, 2000)}…` : trimmed,
          });
        }
      }
    }

    if (validMessages.length === 0) {
      return NextResponse.json({ error: "Nenhuma mensagem válida encontrada." }, { status: 400 });
    }

    const messages = validMessages.slice(-12);
    const productContext = (body.productContext as Product | undefined) ?? null;
    const cartContext = (body.cartContext as CartLine[] | undefined) ?? null;

    const result = await chatWithMipo(messages, productContext, cartContext);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
