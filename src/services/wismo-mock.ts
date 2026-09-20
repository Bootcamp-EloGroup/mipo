import { isValidOrderCode, normalizeOrderCode, type WismoStatusResponse } from "@/src/domain/wismo";

/**
 * Cenários provisórios da interface WISMO. Não implementam as regras reais:
 * enquanto o motor da Frente 1 não estiver integrado, servem apenas para
 * demonstrar cada estado (prazo, atraso, sem atualização, entregue e
 * inconclusivo). Ativados explicitamente por NEXT_PUBLIC_WISMO_SOURCE=mock.
 */
export const MOCK_ORDER_EXAMPLES = [
  { code: "ORD-1001", label: "No prazo" },
  { code: "ORD-1002", label: "Atrasado" },
  { code: "ORD-1003", label: "Sem atualização" },
  { code: "ORD-1004", label: "Entregue" },
  { code: "ORD-1005", label: "Inconclusivo" },
] as const;

const DAY = 86_400_000;
const HOUR = 3_600_000;
const zone = "America/Sao_Paulo";
const dayMonth = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: zone });
const hourOnly = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", hourCycle: "h23", timeZone: zone });
const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);
const atHour = (time: number) => `${dayMonth.format(time)} às ${hourOnly.format(time)}h`;

export function mockWismoStatus(rawCode: string, now: Date = new Date()): WismoStatusResponse {
  const orderCode = normalizeOrderCode(rawCode);
  const t = now.getTime();
  const base = { orderCode, dataOrigin: "mock" as const, carrier: "Transportadora Demo" };

  switch (orderCode) {
    case "ORD-1001": {
      const last = t - 5 * HOUR;
      return {
        ...base, found: true, status: "on_time", needsEscalation: false, orderStatusLabel: "Em transporte",
        promisedDate: isoDay(t + 2 * DAY), lastTrackingAt: new Date(last).toISOString(), lastTrackingEvent: "Saiu do centro de distribuição",
        customerMessage: `Seu pedido está em transporte e a previsão de entrega é até ${dayMonth.format(t + 2 * DAY)}. A última atualização foi em ${atHour(last)}: saiu do centro de distribuição.`,
      };
    }
    case "ORD-1002": {
      const last = t - 1 * DAY;
      return {
        ...base, found: true, status: "delayed", needsEscalation: false, orderStatusLabel: "Em transporte",
        promisedDate: isoDay(t - 3 * DAY), lastTrackingAt: new Date(last).toISOString(), lastTrackingEvent: "Em rota de entrega, aguardando nova tentativa", daysWithoutUpdate: 1,
        customerMessage: `Seu pedido passou da data prevista (${dayMonth.format(t - 3 * DAY)}), mas segue em movimentação. A última atualização foi em ${atHour(last)}. Registrei a atenção do time para acompanhar com a transportadora e você receberá uma nova atualização por este canal.`,
      };
    }
    case "ORD-1003": {
      const last = t - 7 * DAY;
      return {
        ...base, found: true, status: "no_update", needsEscalation: true, orderStatusLabel: "Em transporte",
        promisedDate: isoDay(t - 2 * DAY), lastTrackingAt: new Date(last).toISOString(), lastTrackingEvent: "Chegou à unidade de tratamento", daysWithoutUpdate: 7,
        escalationReason: "Sem atualização de rastreamento há 7 dias",
        customerMessage: "Seu pedido está sem atualização há 7 dias, mais tempo do que o esperado. Abri uma verificação e encaminhei o seu caso ao atendimento, com todo o contexto do pedido.",
      };
    }
    case "ORD-1004": {
      const last = t - 1 * DAY;
      return {
        ...base, found: true, status: "delivered", needsEscalation: false, orderStatusLabel: "Entregue",
        promisedDate: isoDay(t - 1 * DAY), lastTrackingAt: new Date(last).toISOString(), lastTrackingEvent: "Entregue ao destinatário", daysWithoutUpdate: 1,
        customerMessage: `Seu pedido foi entregue em ${atHour(last)}. Se algo não estiver certo com a entrega, posso acionar o atendimento.`,
      };
    }
    case "ORD-1005": {
      const last = t - 3 * DAY;
      return {
        ...base, found: true, status: "inconclusive", needsEscalation: true, orderStatusLabel: "Status indefinido",
        lastTrackingAt: new Date(last).toISOString(), lastTrackingEvent: "Informações divergentes entre os sistemas de rastreamento", daysWithoutUpdate: 3,
        escalationReason: "Informações de rastreamento inconsistentes",
        customerMessage: "Encontrei o seu pedido, mas as informações de rastreamento estão inconsistentes e não consigo confirmar o status com segurança. Encaminhei o caso ao atendimento com o contexto do pedido.",
      };
    }
    default:
      return {
        found: false, orderCode, dataOrigin: "mock", status: "inconclusive", needsEscalation: false,
        customerMessage: isValidOrderCode(orderCode)
          ? `Não encontrei um pedido com o código ${orderCode}. Revise o número e tente novamente.`
          : "Esse código não parece válido. Revise o número do pedido e tente novamente.",
      };
  }
}
