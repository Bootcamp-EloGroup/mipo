import type { WismoDashboardData, WismoEventInput, WismoStatusResponse } from "@/src/domain/wismo";
import { mockWismoStatus } from "@/src/services/wismo-mock";

/**
 * Enquanto a consulta real de pedidos (Frente 1) não estiver integrada, defina
 * NEXT_PUBLIC_WISMO_SOURCE=mock para usar os cenários de demonstração. Sem essa
 * variável, o cliente consulta GET /api/wismo/status; não há troca silenciosa.
 */
export const WISMO_MOCK_ENABLED = process.env.NEXT_PUBLIC_WISMO_SOURCE === "mock";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Serviço indisponível.");
  }
  return response.json();
}

export const wismoApi = {
  status: (orderCode: string): Promise<WismoStatusResponse> =>
    WISMO_MOCK_ENABLED
      ? Promise.resolve(mockWismoStatus(orderCode))
      : request<WismoStatusResponse>(`/api/wismo/status?order=${encodeURIComponent(orderCode)}`),
  record: (event: WismoEventInput) =>
    request<{ recorded: boolean }>("/api/wismo/events", { method: "POST", body: JSON.stringify(event) }),
  stats: () => request<WismoDashboardData>("/api/wismo/events"),
};
