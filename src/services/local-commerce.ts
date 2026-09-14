import { products, region } from "@/src/data/products";
import type { Cart, CartLine, CommerceRepository, MipoEvent, Product } from "@/src/domain/commerce";

const CART_KEY = "vertice:mipo:cart";
const EVENTS_KEY = "vertice:mipo:events";

const emptyCart = (): Cart => ({ id: "cart_demo", region, items: [] });

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value));
}

export const localCommerceRepository: CommerceRepository = {
  async listProducts(): Promise<Product[]> {
    return products;
  },
  async getProduct(id: string): Promise<Product | undefined> {
    return products.find((product) => product.id === id);
  },
  getCart(): Cart {
    return read(CART_KEY, emptyCart());
  },
  addLineItem(item: Omit<CartLine, "id">): Cart {
    const cart = this.getCart();
    const existing = cart.items.find((line) => line.variantId === item.variantId);
    const items = existing
      ? cart.items.map((line) => line.id === existing.id ? { ...line, quantity: line.quantity + item.quantity } : line)
      : [...cart.items, { ...item, id: `line_${Date.now()}` }];
    const next = { ...cart, items };
    write(CART_KEY, next);
    return next;
  },
  updateLineItem(id: string, quantity: number): Cart {
    const cart = this.getCart();
    const next = { ...cart, items: cart.items.map((line) => line.id === id ? { ...line, quantity: Math.max(1, quantity) } : line) };
    write(CART_KEY, next);
    return next;
  },
  removeLineItem(id: string): Cart {
    const cart = this.getCart();
    const next = { ...cart, items: cart.items.filter((line) => line.id !== id) };
    write(CART_KEY, next);
    return next;
  },
  clearCart(): Cart {
    const next = emptyCart();
    write(CART_KEY, next);
    return next;
  },
};

export function recordMipoEvent(event: Omit<MipoEvent, "id" | "occurredAt">): void {
  const events = read<MipoEvent[]>(EVENTS_KEY, []);
  write(EVENTS_KEY, [...events, { ...event, id: `evt_${Date.now()}`, occurredAt: new Date().toISOString() }]);
}
