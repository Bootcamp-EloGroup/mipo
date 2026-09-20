import type { HttpTypes } from "@medusajs/types";

export type Size = "P" | "M" | "G" | "GG";
export type BodyMeasurements = { bust?: number; waist?: number; hip?: number };
export type MeasurementMetric = keyof BodyMeasurements;
export type SizeGuide = {
  productId?: string;
  label: string;
  version: string;
  origin: "provided" | "derived" | "synthetic";
  unit: "cm";
  ranges: Record<Size, Partial<Record<MeasurementMetric, [number, number]>>>;
};
export type SizeComparison = {
  size: Size;
  fit: "fitted" | "balanced" | "roomy" | "outside";
  available: boolean;
  note: string;
};
export type MeasurementFitAssessment = {
  status: "recommended" | "between_sizes" | "out_of_range" | "insufficient_evidence";
  compatibleSizes: Size[];
  recommendedSize?: Size;
  limitingMeasurements: MeasurementMetric[];
  requiredMeasurements: MeasurementMetric[];
  providedMeasurements: MeasurementMetric[];
  expectedFit: "fitted" | "regular" | "loose";
  coverage: number;
  evidence: string;
  guideVersion: string;
  guideOrigin: SizeGuide["origin"];
  guideLabel: string;
  sizeComparisons: SizeComparison[];
};
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
export type TextileProfile = {
  material: string;
  composition?: string;
  elasticity: "none" | "low" | "medium" | "high" | "unknown";
  structure: "fluid" | "balanced" | "structured" | "unknown";
  drape?: string;
  care: string[];
  origin: "provided" | "derived" | "synthetic";
  evidence: string[];
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
  textileProfile?: TextileProfile;
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
  mipoDecision?: "accepted" | "kept_original" | "not_required" | "pending";
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
