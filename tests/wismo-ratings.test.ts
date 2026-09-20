import { beforeEach, describe, expect, it } from "vitest";
import { isWismoRange, parseRatingsQuery, summarizeRatings } from "../src/domain/wismo-chat";
import { getWismoRatingsSummary, parseWismoEventInput, recordWismoEvent } from "../src/server/wismo-events";

const NOW = new Date("2026-09-20T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const event = (id: number, overrides: Record<string, unknown> = {}) => {
  const parsed = parseWismoEventInput({ id: uuid(id), orderCode: "ORD-1001", status: "on_time", outcome: "resolved", dataOrigin: "mock", ...overrides });
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
};

beforeEach(() => {
  process.env.DATA_SOURCE = "local";
  Reflect.deleteProperty(globalThis, "__mipoWismoEvents");
});

describe("summarizeRatings", () => {
  const events = [
    { occurredAt: daysAgo(0.2), rating: 5, resolution: "solved" },
    { occurredAt: daysAgo(3), rating: 3, resolution: "pending" },
    { occurredAt: daysAgo(20), rating: 1, resolution: "pending" },
    { occurredAt: daysAgo(60), rating: 4, resolution: "solved" },
    { occurredAt: daysAgo(1) },
  ];

  it("filtra pelas janelas pré-definidas", () => {
    expect(summarizeRatings(events, { range: "24h" }, NOW).ratedCount).toBe(1);
    expect(summarizeRatings(events, { range: "7d" }, NOW).ratedCount).toBe(2);
    expect(summarizeRatings(events, { range: "30d" }, NOW).ratedCount).toBe(3);
    expect(summarizeRatings(events, { range: "all" }, NOW).ratedCount).toBe(4);
  });

  it("filtra por período livre", () => {
    const summary = summarizeRatings(events, { from: daysAgo(25), to: daysAgo(2) }, NOW);
    expect(summary.range).toBe("custom");
    expect(summary.ratedCount).toBe(2);
    expect(summary.averageRating).toBe(2);
  });

  it("calcula média, distribuição e respostas de pendência na janela", () => {
    const all = summarizeRatings(events, { range: "all" }, NOW);
    expect(all.averageRating).toBe(3.25);
    expect(all.distribution.map((item) => item.count)).toEqual([1, 0, 1, 1, 1]);
    expect(all.feedbackSolved).toBe(2);
    expect(all.feedbackPending).toBe(2);
    expect(summarizeRatings(events, { range: "7d" }, NOW)).toMatchObject({ feedbackSolved: 1, feedbackPending: 1 });
  });

  it("não tem média sem avaliações e não conta datas futuras", () => {
    expect(summarizeRatings([], { range: "all" }, NOW).averageRating).toBe(null);
    expect(summarizeRatings([{ occurredAt: daysAgo(-1), rating: 5 }], { range: "all" }, NOW).ratedCount).toBe(0);
  });
});

describe("parseRatingsQuery", () => {
  const parse = (query: string) => parseRatingsQuery(new URLSearchParams(query));

  it("aceita janela pré-definida (padrão: tudo) e período livre", () => {
    expect(parse("range=7d")).toEqual({ ok: true, value: { range: "7d" } });
    expect(parse("")).toEqual({ ok: true, value: { range: "all" } });
    expect(parse("from=2026-09-01T00:00:00.000Z&to=2026-09-10T23:59:59.999Z")).toMatchObject({ ok: true, value: { from: "2026-09-01T00:00:00.000Z" } });
    expect(isWismoRange("7d")).toBe(true);
  });

  it("rejeita janela desconhecida, datas incompletas, inválidas ou invertidas", () => {
    for (const query of ["range=1y", "from=2026-09-01T00:00:00Z", "from=x&to=y", "from=2026-09-10T00:00:00Z&to=2026-09-01T00:00:00Z"]) {
      expect(parse(query).ok).toBe(false);
    }
  });
});

describe("getWismoRatingsSummary", () => {
  it("resume as notas gravadas na janela pedida", async () => {
    await recordWismoEvent("s1", event(1, { rating: 5, resolution: "solved" }), new Date(daysAgo(1)));
    await recordWismoEvent("s1", event(2, { rating: 2, resolution: "pending" }), new Date(daysAgo(40)));
    const week = await getWismoRatingsSummary({ range: "7d" }, NOW);
    const all = await getWismoRatingsSummary({ range: "all" }, NOW);
    expect(week).toMatchObject({ available: true, ratedCount: 1, averageRating: 5, feedbackSolved: 1, feedbackPending: 0 });
    expect(all).toMatchObject({ available: true, ratedCount: 2, averageRating: 3.5, feedbackPending: 1 });
  });

  it("não simula dados no modo supabase", async () => {
    process.env.DATA_SOURCE = "supabase";
    const data = await getWismoRatingsSummary({ range: "7d" }, NOW);
    expect(data.available).toBe(false);
    expect(data.ratedCount).toBe(0);
  });
});
