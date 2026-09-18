import type { Cart, CartLine, Product, SelectionContext, Size } from "@/src/domain/commerce";
import type { RiskResult, FitPreference } from "@/src/services/mipo";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? "Serviço indisponível."); }
  return response.json();
}

export type ExplainParams = {
  interventionId: string;
  productId?: string;
  variantId?: string;
  fitPreference?: FitPreference;
  selectionContext?: SelectionContext;
  usualSize?: Size | null;
};

export const commerceApi = {
  products: () => request<Product[]>("/api/products"),
  cart: () => request<Cart>("/api/cart"),
  clearCart: () => request<Cart>("/api/cart", { method: "DELETE" }),
  addItem: (variantId: string, quantity = 1, mipoDecision?: "accepted"|"kept_original", selectionContext?: SelectionContext) => request<Cart>("/api/cart/items", { method: "POST", body: JSON.stringify({ variantId, quantity, mipoDecision, selectionContext }) }),
  updateItem: (id: string, quantity: number) => request<Cart>(`/api/cart/items/${id}`, { method: "PATCH", body: JSON.stringify({ quantity }) }),
  removeItem: (id: string) => request<Cart>(`/api/cart/items/${id}`, { method: "DELETE" }),
  evaluate: (productId: string, variantId: string, fitPreference?: FitPreference, selectionContext?: SelectionContext, usualSize?: Size | null) => request<{interventionId:string;result:RiskResult}>("/api/mipo/evaluate", { method: "POST", body: JSON.stringify({ productId, variantId, fitPreference, selectionContext, usualSize }) }),
  explain: (params: string | ExplainParams) => request<{enabled:boolean;answer?:{message:string;provider:string;status:string}}>("/api/mipo/explain", {method:"POST",body:JSON.stringify(typeof params === "string" ? { interventionId: params } : params)}),
  decide: (interventionId: string, decision: "accepted"|"kept_original"|"not_required") => request<{recorded:boolean}>("/api/mipo/decisions", { method: "POST", body: JSON.stringify({ interventionId, decision }) }),
  chat: (messages: Array<{ role: "system"|"user"|"assistant"; content: string }>, productContext?: Product | null, cartContext?: CartLine[] | null) => request<{ reply: string; suggestedAction?: { type: "select_size"|"view_product"; productId?: string; size?: Size; label?: string } }>("/api/mipo/chat", { method: "POST", body: JSON.stringify({ messages, productContext, cartContext }) }),
  auditCart: (items: CartLine[]) => request<{ status: "aligned"|"attention"; headline: string; advice: string; careTips: string[] }>("/api/mipo/audit-cart", { method: "POST", body: JSON.stringify({ items }) }),
};
