import { beforeEach, describe, expect, it } from "vitest";
import { DataSourceUnavailableError } from "../src/lib/supabase-rest";
import { WismoEventNotFoundError, getWismoDashboardData, parseWismoEventInput, recordWismoEvent } from "../src/server/wismo-events";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const valid = (overrides: Record<string, unknown> = {}) => ({ id: uuid(1), orderCode: "ord-demo-001", ...overrides });

beforeEach(() => {
  process.env.DATA_SOURCE = "local";
  Reflect.deleteProperty(globalThis, "__mipoWismoEvents");
});

describe("parseWismoEventInput", () => {
  it("aceita um evento válido e normaliza o código", () => {
    const parsed = parseWismoEventInput(valid());
    expect(parsed).toEqual({ ok: true, value: { id: uuid(1), orderCode: "ORD-DEMO-001" } });
  });

  it("rejeita corpo, id, código, status, resultado, origem e motivo inválidos", () => {
    for (const body of [null, "texto", valid({ id: "1" }), valid({ orderCode: "x" }), valid({ requestHuman: "yes" }), valid({ status: "on_time" }), valid({ outcome: "resolved" }), valid({ dataOrigin: "mock" }), valid({ escalationReason: "texto" })]) {
      expect(parseWismoEventInput(body).ok).toBe(false);
    }
  });
});

describe("registro local de atendimentos", () => {
  it("agrega atendimentos por resultado e status", async () => {
    const parse = (value: Record<string, unknown>) => { const parsed = parseWismoEventInput(value); if (!parsed.ok) throw new Error(parsed.error); return parsed.value; };
    await recordWismoEvent("s1", parse(valid({ id: uuid(1) })), new Date("2026-09-20T10:00:00Z"));
    await recordWismoEvent("s1", parse(valid({ id: uuid(2), orderCode: "ORD-DEMO-002", requestHuman: true })), new Date("2026-09-20T11:00:00Z"));
    await recordWismoEvent("s2", parse(valid({ id: uuid(3), orderCode: "ORD-9999" })), new Date("2026-09-20T12:00:00Z"));
    const data = await getWismoDashboardData();
    expect(data).toMatchObject({ available: true, total: 3, resolved: 1, escalated: 1, notFound: 1, botResolutionRate: 0.5 });
    expect(data.byStatus).toEqual([{ status: "delivered", count: 2 }]);
    expect(data.recent.map((row) => row.id)).toEqual([uuid(3), uuid(2), uuid(1)]);
  });

  it("atualiza o mesmo atendimento sem duplicar e preserva o horário original", async () => {
    const input = { id: uuid(1), orderCode: "ORD-DEMO-004" };
    await recordWismoEvent("s1", input, new Date("2026-09-20T10:00:00Z"));
    await recordWismoEvent("s1", { ...input, requestHuman: true }, new Date("2026-09-20T10:05:00Z"));
    const data = await getWismoDashboardData();
    expect(data.total).toBe(1);
    expect(data).toMatchObject({ resolved: 0, escalated: 1 });
    expect(data.recent[0].occurredAt).toBe("2026-09-20T10:00:00.000Z");
  });

  it("não permite outra sessão alterar um atendimento", async () => {
    const input = { id: uuid(1), orderCode: "ORD-DEMO-001" };
    await recordWismoEvent("s1", input);
    await expect(recordWismoEvent("s2", { ...input, requestHuman: true })).rejects.toBeInstanceOf(WismoEventNotFoundError);
  });

  it("limita o histórico em memória", async () => {
    for (let n = 1; n <= 505; n += 1) await recordWismoEvent("s1", { id: uuid(n), orderCode: "ORD-DEMO-001" });
    expect((await getWismoDashboardData()).total).toBe(500);
  });

  it("não simula persistência no modo supabase", async () => {
    process.env.DATA_SOURCE = "supabase";
    await expect(recordWismoEvent("s1", { id: uuid(1), orderCode: "ORD-DEMO-001" })).rejects.toBeInstanceOf(DataSourceUnavailableError);
    const data = await getWismoDashboardData();
    expect(data.available).toBe(false);
    expect(data.reason).toContain("tabela de atendimentos");
  });
});
