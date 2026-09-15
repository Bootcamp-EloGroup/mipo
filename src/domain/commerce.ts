import type { HttpTypes } from "@medusajs/types";

export type Size = "P" | "M" | "G" | "GG";

export type ProductVariant = Pick<
  HttpTypes.StoreProductVariant,
  "id" | "title" | "sku" | "inventory_quantity"
> & {
  size: Size;
  price: number;
  returnRate: number;
  defectRate: number;
  salesCount?: number;
  evidenceOrigin?: "provided" | "derived" | "synthetic";
};

export type Product = Pick<
  HttpTypes.StoreProduct,
  "id" | "title" | "handle" | "subtitle" | "description"
> & {
  category: string;
  color: string;
  accent: string;
  badge?: string;
  imageKey?: "sand" | "charcoal";
  variants: ProductVariant[];
  alternativeProductId?: string;
};

export type Region = Pick<HttpTypes.StoreRegion, "id" | "name" | "currency_code">;

export type CartLine = Pick<HttpTypes.StoreCartLineItem, "id" | "title" | "quantity"> & {
  productId: string;
  variantId: string;
  size: Size;
  unitPrice: number;
  color: string;
  mipoDecision?: "accepted" | "kept_original";
};

export type Cart = Pick<HttpTypes.StoreCart, "id"> & {
  region: Region;
  items: CartLine[];
};

export interface CommerceRepository {
  listProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  getCart(): Cart;
  addLineItem(item: Omit<CartLine, "id">): Cart;
  updateLineItem(id: string, quantity: number): Cart;
  removeLineItem(id: string): Cart;
  clearCart(): Cart;
}

export type MipoEvent = {
  id: string;
  occurredAt: string;
  productId: string;
  selectedVariantId: string;
  recommendedVariantId?: string;
  risk: "size" | "quality" | "stock" | "none" | "insufficient_evidence";
  decision: "accepted" | "kept_original" | "not_required";
};
