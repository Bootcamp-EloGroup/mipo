import { NextResponse } from "next/server";
import { apiError } from "@/src/lib/api-response";
import { auditCart } from "@/src/server/mipo-assistant";
import type { CartLine } from "@/src/domain/commerce";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const items = Array.isArray(body.items) ? (body.items as CartLine[]) : [];
    const audit = await auditCart(items);
    return NextResponse.json(audit);
  } catch (error) {
    return apiError(error);
  }
}
