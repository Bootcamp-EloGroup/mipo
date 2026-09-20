import { summarizeRatings, type WismoDashboardData, type WismoEventInput, type WismoRatingsQuery, type WismoRatingsResponse, type WismoStatusResponse } from "@/src/domain/wismo-chat";
import { WISMO_SAMPLE_DASHBOARD, sampleRatedEvents } from "@/src/domain/wismo-sample";
import { fromEngineResponse, notFoundResponse, type EngineOrderResponse } from "@/src/services/wismo-adapter";
import { mockWismoStatus } from "@/src/services/wismo-mock";

/**
 * Enquanto a consulta real de pedidos (Frente 1) não estiver integrada, defina
 * NEXT_PUBLIC_WISMO_SOURCE=mock para usar os cenários de demonstração. Sem essa
 * variável, o cliente consulta GET /api/wismo/orders/:orderKey (motor de regras da Frente 1); não há troca silenciosa.
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

async function engineStatus(orderCode: string): Promise<WismoStatusResponse> {
  const response = await fetch(`/api/wismo/orders/${encodeURIComponent(orderCode)}`, { cache: "no-store" });
  if (response.status === 404) return notFoundResponse(orderCode);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Serviço indisponível.");
  }
  return fromEngineResponse((await response.json()) as EngineOrderResponse);
}

/** Prévia visual com dados fictícios: só com `?wismo=exemplo` na URL do painel. */
const previewSample = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("wismo") === "exemplo";

export const wismoApi = {
  status: (orderCode: string): Promise<WismoStatusResponse> =>
    WISMO_MOCK_ENABLED ? Promise.resolve(mockWismoStatus(orderCode)) : engineStatus(orderCode),
  record: (event: WismoEventInput) =>
    request<{ recorded: boolean }>("/api/wismo/events", { method: "POST", body: JSON.stringify(event) }),
  ratings: (query: WismoRatingsQuery): Promise<WismoRatingsResponse> => {
    if (previewSample()) return Promise.resolve({ available: true, sample: true, ...summarizeRatings(sampleRatedEvents(), query) });
    const params = "range" in query ? `range=${query.range}` : `from=${encodeURIComponent(query.from)}&to=${encodeURIComponent(query.to)}`;
    return request<WismoRatingsResponse>(`/api/wismo/ratings?${params}`);
  },
  stats: () => (previewSample() ? Promise.resolve(WISMO_SAMPLE_DASHBOARD) : request<WismoDashboardData>("/api/wismo/events")),
};
