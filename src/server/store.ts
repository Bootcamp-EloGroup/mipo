import "server-only";
import { products as localProducts, region } from "@/src/data/products";
import type { Cart, Product, SelectionContext } from "@/src/domain/commerce";
import { dataSource, supabaseRest } from "@/src/lib/supabase-rest";
import { expiresAt } from "@/src/lib/session";

type DbCart = { id: string; currency_code: string };
type DbCartItem = { id: string; quantity: number; unit_price_cents: number; mipo_decision?: "accepted" | "kept_original"; selection_context?: SelectionContext | null; product_variants: { id: string; size: "P"|"M"|"G"|"GG"|null; title: string; products: { id: string; title: string; color: string } } };

export async function listProducts(): Promise<Product[]> {
  if (dataSource() === "local") return localProducts;
  return supabaseRest<Product[]>("rpc/get_storefront_products", { method: "POST", body: "{}" });
}

export async function getProduct(id: string) { return (await listProducts()).find((product) => product.id === id); }

async function ensureCart(sessionId: string): Promise<DbCart> {
  if (dataSource() === "local") return { id: `local-${sessionId}`, currency_code: "brl" };
  await supabaseRest("anonymous_sessions?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ id: sessionId, expires_at: expiresAt(), last_seen_at: new Date().toISOString(), is_demo: process.env.MIPO_DEMO_MODE === "true" }) });
  await supabaseRest(`anonymous_sessions?id=eq.${sessionId}`, { method: "PATCH", body: JSON.stringify({ last_seen_at: new Date().toISOString() }) });
  const existing = await supabaseRest<DbCart[]>(`carts?session_id=eq.${sessionId}&select=id,currency_code&limit=1`);
  if (existing[0]) return existing[0];
  const [created] = await supabaseRest<DbCart[]>("carts", { method: "POST", body: JSON.stringify({ session_id: sessionId, expires_at: expiresAt() }) });
  return created;
}

export async function getCart(sessionId: string): Promise<Cart> {
  const cart = await ensureCart(sessionId);
  if (dataSource() === "local") return { id: cart.id, region, items: [] };
  const rows = await supabaseRest<DbCartItem[]>(`cart_items?cart_id=eq.${cart.id}&select=id,quantity,unit_price_cents,mipo_decision,selection_context,product_variants(id,size,products(id,title,color))`);
  return { id: cart.id, region: { ...region, currency_code: cart.currency_code }, items: rows.map((row) => ({ id: row.id, productId: row.product_variants.products.id, variantId: row.product_variants.id, title: row.product_variants.products.title, size: row.product_variants.size, quantity: row.quantity, unitPrice: row.unit_price_cents, color: row.product_variants.products.color, mipoDecision: row.mipo_decision, selectionContext: row.selection_context ?? undefined })) };
}

export async function addCartItem(sessionId: string, variantId: string, quantity: number, mipoDecision?: "accepted"|"kept_original", selectionContext?: SelectionContext) {
  const cart = await ensureCart(sessionId); const product = (await listProducts()).find((item) => item.variants.some((variant) => variant.id === variantId)); const variant = product?.variants.find((item) => item.id === variantId);
  if (!product || !variant) throw new Error("Variação não encontrada.");
  if (dataSource() === "local") return { id: cart.id, region, items: [{ id: crypto.randomUUID(), productId: product.id, variantId, title: product.title, size: variant.size, quantity, unitPrice: variant.price, color: product.color, mipoDecision, selectionContext }] } satisfies Cart;
  const current = await supabaseRest<Array<{id:string;quantity:number}>>(`cart_items?cart_id=eq.${cart.id}&variant_id=eq.${variantId}&select=id,quantity&limit=1`);
  if (current[0]) await supabaseRest(`cart_items?id=eq.${current[0].id}`, { method: "PATCH", body: JSON.stringify({ quantity: current[0].quantity + quantity, mipo_decision: mipoDecision, selection_context: selectionContext ?? null }) });
  else await supabaseRest("cart_items", { method: "POST", body: JSON.stringify({ cart_id: cart.id, variant_id: variantId, quantity, unit_price_cents: variant.price, mipo_decision: mipoDecision, selection_context: selectionContext ?? null }) });
  return getCart(sessionId);
}

export async function updateCartItem(sessionId: string, itemId: string, quantity: number) {
  const cart = await ensureCart(sessionId); if (dataSource() === "local") return getCart(sessionId);
  await supabaseRest(`cart_items?id=eq.${itemId}&cart_id=eq.${cart.id}`, { method: "PATCH", body: JSON.stringify({ quantity: Math.max(1, quantity) }) }); return getCart(sessionId);
}

export async function removeCartItem(sessionId: string, itemId: string) {
  const cart = await ensureCart(sessionId); if (dataSource() === "local") return getCart(sessionId);
  await supabaseRest(`cart_items?id=eq.${itemId}&cart_id=eq.${cart.id}`, { method: "DELETE" }); return getCart(sessionId);
}

export async function clearCart(sessionId: string) {
  const cart = await ensureCart(sessionId); if (dataSource() === "local") return getCart(sessionId);
  await supabaseRest(`cart_items?cart_id=eq.${cart.id}`, { method: "DELETE" }); return getCart(sessionId);
}
