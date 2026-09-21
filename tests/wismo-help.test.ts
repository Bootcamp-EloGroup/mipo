import { describe, expect, it } from "vitest";
import { answerWismoHelp, extractOrderCode } from "../src/domain/wismo-help";

describe("assistente geral de pós-compra", () => {
  it("extrai um código dentro de uma pergunta sem confundir texto comum", () => {
    expect(extractOrderCode("Onde está o pedido ABC0123?")).toBe("ABC0123");
    expect(extractOrderCode("Qual é o prazo de entrega?")).toBeUndefined();
  });

  it("responde dúvidas gerais sem exigir código nem inventar status", () => {
    expect(answerWismoHelp("Onde encontro meu código?")).toMatchObject({ topic: "order_code" });
    expect(answerWismoHelp("Qual é o prazo de entrega?")).toMatchObject({ topic: "delivery_time" });
    expect(answerWismoHelp("Posso alterar o endereço?").reply).toContain("Não altero endereço");
  });

  it("mantém uma resposta de escopo para perguntas não reconhecidas", () => {
    const answer = answerWismoHelp("Tenho uma dúvida");
    expect(answer.topic).toBe("general");
    expect(answer.reply).toContain("só vou pedir o código");
  });
});
