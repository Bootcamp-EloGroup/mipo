import type { HttpTypes } from "@medusajs/types";

export type Size = "P" | "M" | "G" | "GG";
export type ProductQuestion = {
  id: string;
  label: string;
  options: string[];
};
export type ProductDecisionProfile = {
  questions: ProductQuestion[];
  acceptedPreferences: string[];
  attributes: string[];
};
export type SelectionContext = {
  preference: string;
  label: string;
  answers?: Record<string, string>;
};

export type ProductVariant = Pick<
  HttpTypes.StoreProductVariant,
  "id" | "title" | "sku" | "inventory_quantity"
> & {
  size: Size | null;
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
  subcategory?: string;
  color: string;
  accent: string;
  badge?: string;
  imageKey?: "sand" | "charcoal" | "apparel" | "beauty" | "lifestyle" | "aurora" | "sereno" | "trama" | "eixo" | "lume" | "orbita" | "bruma" | "luz";
  productKind?: "apparel" | "beauty" | "accessory" | "lifestyle";
  variantAttribute?: "size" | "shade" | "color" | "volume" | "none";
  decisionProfile?: ProductDecisionProfile;
  variants: ProductVariant[];
  alternativeProductId?: string;
};

export type Region = Pick<HttpTypes.StoreRegion, "id" | "name" | "currency_code">;

export type CartLine = Pick<HttpTypes.StoreCartLineItem, "id" | "title" | "quantity"> & {
  productId: string;
  variantId: string;
  size: Size | string | null;
  unitPrice: number;
  color: string;
  mipoDecision?: "accepted" | "kept_original";
  selectionContext?: SelectionContext;
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
  risk: "size" | "quality" | "preference_mismatch" | "none" | "insufficient_evidence";
  decision: "accepted" | "kept_original" | "not_required";
};
