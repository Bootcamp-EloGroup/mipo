import { NextResponse } from "next/server";
import { parseRatingsQuery } from "@/src/domain/wismo-chat";
import { apiError } from "@/src/lib/api-response";
import { getWismoRatingsSummary } from "@/src/server/wismo-events";

export async function GET(request: Request) {
  try {
    const parsed = parseRatingsQuery(new URL(request.url).searchParams);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    return NextResponse.json(await getWismoRatingsSummary(parsed.value));
  } catch (error) {
    return apiError(error);
  }
}
