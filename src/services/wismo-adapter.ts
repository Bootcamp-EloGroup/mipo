import type { WismoStatusResponse } from "@/src/domain/wismo-chat";

/**
 * Traduz a resposta do motor de regras (GET /api/wismo/orders/:orderKey, Frente 1)
 * para o formato que a interface exibe. Os tipos abaixo descrevem só o que a
 * interface lê, para não acoplar o cliente ao código de servidor da Frente 1.
 */
export type EngineOrderResponse = {
  order: { orderKey: string };
  status: {
    phase: "preparing" | "in_transit" | "delivered";
    flag: "on_time" | "late";
    daysLate: number;
    escalate: boolean;
    message: string;
    evidence: { promisedAt: string; criticalDays: number };
  };
};

const PHASE_LABELS = { preparing: "Em preparação", in_transit: "Em transporte", delivered: "Entregue" } as const;

/** Código não encontrado (HTTP 404 do motor): nada é escalado e nada é inventado. */
export function notFoundResponse(orderCode: string): WismoStatusResponse {
  return {
    found: false,
    orderCode,
    status: "inconclusive",
    customerMessage: "Não encontramos um pedido com esse código. Confira o código enviado por e-mail e tente novamente.",
    needsEscalation: false,
    dataOrigin: "observed",
  };
}

export function fromEngineResponse(payload: EngineOrderResponse): WismoStatusResponse {
  const { status } = payload;
  const delivered = status.phase === "delivered";
  const late = status.flag === "late";
  return {
    found: true,
    orderCode: payload.order.orderKey,
    status: delivered ? "delivered" : late ? "delayed" : "on_time",
    customerMessage: status.message,
    orderStatusLabel: PHASE_LABELS[status.phase],
    promisedDate: status.evidence.promisedAt,
    needsEscalation: status.escalate,
    escalationReason: status.escalate
      ? `Pedido ${status.daysLate} ${status.daysLate === 1 ? "dia" : "dias"} além do prazo previsto, acima do limiar crítico de ${status.evidence.criticalDays} dias.`
      : undefined,
    dataOrigin: "observed",
  };
}
