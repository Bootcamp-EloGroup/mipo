import type { Cart, Product } from "@/src/domain/commerce";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? "Serviço indisponível."); }
  return response.json();
}

export const commerceApi = {
  products: () => request<Product[]>("/api/products"),
  cart: () => request<Cart>("/api/cart"),
  clearCart: () => request<Cart>("/api/cart", { method: "DELETE" }),
  addItem: (variantId: string, quantity = 1, mipoDecision?: "accepted"|"kept_original") => request<Cart>("/api/cart/items", { method: "POST", body: JSON.stringify({ variantId, quantity, mipoDecision }) }),
  updateItem: (id: string, quantity: number) => request<Cart>(`/api/cart/items/${id}`, { method: "PATCH", body: JSON.stringify({ quantity }) }),
  removeItem: (id: string) => request<Cart>(`/api/cart/items/${id}`, { method: "DELETE" }),
  evaluate: (productId: string, variantId: string, fitPreference?: "fitted"|"regular"|"loose") => request<{interventionId:string;result:unknown}>("/api/mipo/evaluate", { method: "POST", body: JSON.stringify({ productId, variantId, fitPreference }) }),
  explain: (interventionId:string) => request<{enabled:boolean;answer?:{message:string;provider:string;status:string}}>("/api/mipo/explain", {method:"POST",body:JSON.stringify({interventionId})}),
  decide: (interventionId: string, decision: "accepted"|"kept_original"|"not_required") => request<{recorded:boolean}>("/api/mipo/decisions", { method: "POST", body: JSON.stringify({ interventionId, decision }) }),
};
