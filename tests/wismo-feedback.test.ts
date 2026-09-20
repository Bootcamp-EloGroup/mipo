import { beforeEach, describe, expect, it } from "vitest";
import { WismoEventNotFoundError, getWismoDashboardData, parseWismoEventInput, recordWismoEvent } from "../src/server/wismo-events";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const valid = (overrides: Record<string, unknown> = {}) => ({ id: uuid(1), orderCode: "ORD-1001", status: "on_time", outcome: "resolved", dataOrigin: "mock", ...overrides });
const parse = (value: Record<string, unknown>) => {
  const parsed = parseWismoEventInput(value);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
};

beforeEach(() => {
  process.env.DATA_SOURCE = "local";
  Reflect.deleteProperty(globalThis, "__mipoWismoEvents");
});

describe("resposta de pendência e nota do atendimento", () => {
  it("aceita resposta e nota opcionais", () => {
    const parsed = parseWismoEventInput(valid({ resolution: "solved", rating: 5 }));
    expect(parsed).toMatchObject({ ok: true, value: { resolution: "solved", rating: 5 } });
    expect(parseWismoEventInput(valid()).ok).toBe(true);
  });

  it("rejeita resposta desconhecida e notas fora de 1 a 5 ou não inteiras", () => {
    for (const bad of [{ resolution: "maybe" }, { rating: 0 }, { rating: 6 }, { rating: 3.5 }, { rating: "5" }]) {
      expect(parseWismoEventInput(valid(bad)).ok).toBe(false);
    }
  });

  it("reenviar o atendimento sem resposta ou nota não apaga o que o cliente já informou", async () => {
    await recordWismoEvent("s1", parse(valid({ resolution: "pending", rating: 2 })), new Date("2026-09-20T10:00:00Z"));
    await recordWismoEvent("s1", parse(valid({ outcome: "escalated", escalationReason: "Cliente solicitou atendimento humano" })), new Date("2026-09-20T10:05:00Z"));
    const data = await getWismoDashboardData();
    expect(data.recent[0]).toMatchObject({ outcome: "escalated", resolution: "pending", rating: 2 });
  });

  it("calcula pendências e nota média só com quem respondeu", async () => {
    await recordWismoEvent("s1", parse(valid({ id: uuid(1), resolution: "solved", rating: 5 })));
    await recordWismoEvent("s1", parse(valid({ id: uuid(2), resolution: "pending", rating: 2, outcome: "escalated" })));
    await recordWismoEvent("s1", parse(valid({ id: uuid(3), resolution: "solved" })));
    await recordWismoEvent("s1", parse(valid({ id: uuid(4) })));
    const data = await getWismoDashboardData();
    expect(data.feedbackSolved).toBe(2);
    expect(data.feedbackPending).toBe(1);
    expect(data.ratedCount).toBe(2);
    expect(data.averageRating).toBe(3.5);
  });

  it("não há nota média sem avaliações", async () => {
    await recordWismoEvent("s1", parse(valid()));
    const data = await getWismoDashboardData();
    expect(data.averageRating).toBe(null);
    expect(data.ratedCount).toBe(0);
  });

  it("outra sessão não altera a avaliação", async () => {
    await recordWismoEvent("s1", parse(valid({ rating: 4 })));
    await expect(recordWismoEvent("s2", parse(valid({ rating: 1 })))).rejects.toBeInstanceOf(WismoEventNotFoundError);
  });
});
