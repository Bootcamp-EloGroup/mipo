import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWismoDashboardData } from "../src/server/wismo-events";

const row = {
  id: "00000000-0000-4000-8000-000000000001",
  session_id: "session-1",
  order_code: "ORD-DEMO-001",
  status: "delivered",
  outcome: "resolved",
  escalation_reason: null,
  data_origin: "observed",
  resolution: "solved",
  rating: 5,
  occurred_at: "2026-09-20T10:00:00.000Z",
  updated_at: "2026-09-20T10:00:00.000Z",
};

describe("atendimentos WISMO persistidos no Supabase", () => {
  beforeEach(() => {
    process.env.DATA_SOURCE = "supabase";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "test-secret";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([row]), { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it("alimenta o painel com eventos persistidos em vez de retornar indisponível", async () => {
    const data = await getWismoDashboardData();
    expect(data).toMatchObject({
      available: true,
      total: 1,
      resolved: 1,
      escalated: 0,
      ratedCount: 1,
      averageRating: 5,
      feedbackSolved: 1,
    });
    expect(data.recent[0].orderCode).toBe("ORD•••01");
  });
});
