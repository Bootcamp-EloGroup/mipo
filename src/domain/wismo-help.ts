export type WismoHelpAnswer = {
  reply: string;
  topic: "order_code" | "delivery_time" | "tracking" | "address" | "exchange" | "human" | "general";
};

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Extrai apenas códigos com letras e números; palavras comuns não viram pedidos por engano. */
export function extractOrderCode(message: string): string | undefined {
  const candidates = message.toUpperCase().match(/\b[A-Z][A-Z0-9]*-?[A-Z0-9]*\d[A-Z0-9-]{2,31}\b/g) ?? [];
  return candidates.find((candidate) => candidate.length >= 4)?.replace(/[^A-Z0-9-]/g, "");
}

/** Respostas gerais não consultam nem inferem dados de um pedido específico. */
export function answerWismoHelp(message: string): WismoHelpAnswer {
  const text = normalize(message);
  if (/onde.*(codigo|numero)|nao.*(tenho|sei).*(codigo|numero)|achar.*(codigo|numero)/.test(text)) {
    return { topic: "order_code", reply: "O código costuma aparecer no e-mail de confirmação da compra e no comprovante do pedido. Ele pode ter letras, números e hífens. Se não encontrar, você ainda pode tirar dúvidas gerais por aqui; para consultar uma entrega específica, o código será necessário." };
  }
  if (/(prazo|quanto tempo|quando.*chega|previsao)/.test(text)) {
    return { topic: "delivery_time", reply: "O prazo depende do canal e do destino e começa a contar a partir da confirmação do pedido. Para eu informar a previsão de uma compra específica, envie o código do pedido." };
  }
  if (/(rastre|acompanhar|status|onde.*pedido)/.test(text)) {
    return { topic: "tracking", reply: "Consigo consultar a situação, a previsão e o último evento disponível. Envie o código do pedido nesta conversa. Se os dados estiverem inconclusivos ou fora do prazo crítico, o caso pode ser encaminhado ao atendimento humano." };
  }
  if (/(endereco|endereço|destino|local.*entrega)/.test(text)) {
    return { topic: "address", reply: "Não altero endereço nem dados do pedido pelo chat. Como a possibilidade depende da etapa da entrega, se a compra já foi feita, tenha o código em mãos e procure o atendimento humano o quanto antes." };
  }
  if (/(troca|devolu|reembolso|produto.*errado|nao serviu|não serviu)/.test(text)) {
    return { topic: "exchange", reply: "Posso orientar sobre acompanhamento, mas não abro troca ou reembolso automaticamente. Guarde o código do pedido e as informações do item para que o atendimento humano analise o caso sem perder contexto." };
  }
  if (/(humano|pessoa|atendente|atendimento|falar com alguem|falar com alguém)/.test(text)) {
    return { topic: "human", reply: "Para um pedido específico, envie primeiro o código para levarmos o contexto junto ao atendimento. Se você não tiver o código, consulte o e-mail de confirmação ou os dados da compra antes de solicitar a análise." };
  }
  return { topic: "general", reply: "Posso ajudar com prazo de entrega, rastreamento, código do pedido, alteração de endereço, troca e encaminhamento ao atendimento. Faça sua pergunta com suas palavras — só vou pedir o código quando a resposta depender de uma compra específica." };
}
