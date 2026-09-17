import { describe, expect, it } from "vitest";
import { parseAgentAnswer } from "../src/domain/agent";

const valid = {
  action: "explain_evidence",
  message: "O histórico observado indica atenção para esta escolha.",
  rationaleCode: "quality_context",
  provider: "groq",
  model: "test-model",
  status: "groq_succeeded",
};

describe("contrato da resposta do agente", () => {
  it("aceita somente o formato autorizado", () => {
    expect(parseAgentAnswer(valid)).toEqual(valid);
  });

  it.each([
    ["action", { action: "invent_action" }],
    ["message", { message: "" }],
    ["rationale", { rationaleCode: "invented" }],
    ["provider", { provider: "unknown" }],
    ["status", { status: "completed" }],
  ])("rejeita %s fora do contrato", (_field, change) => {
    expect(() => parseAgentAnswer({ ...valid, ...change })).toThrow("agent_invalid");
  });

  it("limita texto externo antes da resposta chegar ao browser", () => {
    expect(() => parseAgentAnswer({ ...valid, message: "x".repeat(501) })).toThrow("agent_invalid_message");
  });
});
