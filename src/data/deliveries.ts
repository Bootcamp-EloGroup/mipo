import type { DeliveryRuler, WismoOrder } from "@/src/domain/wismo";

export const demoRulers: DeliveryRuler[] = [
  { scope: "national", scopeKey: "BR", p50Days: 8, p75Days: 12, p90Days: 16, sampleSize: 27758 },
  { scope: "region", scopeKey: "sudeste", p50Days: 5, p75Days: 7, p90Days: 10, sampleSize: 9120 },
  { scope: "region", scopeKey: "norte", p50Days: 11, p75Days: 16, p90Days: 21, sampleSize: 140 },
  { scope: "state", scopeKey: "SP", p50Days: 5, p75Days: 7, p90Days: 9, sampleSize: 3402 },
  { scope: "state", scopeKey: "AC", p50Days: 12, p75Days: 12, p90Days: 12, sampleSize: 1 },
];

export const demoOrders: WismoOrder[] = [
  { orderKey: "ORD-DEMO-001", orderedAt: "2023-06-15T00:00:00.000Z", customerState: "SP", actualDeliveryDays: 6 },
  { orderKey: "ORD-DEMO-002", orderedAt: "2023-06-15T00:00:00.000Z", customerState: "SP", actualDeliveryDays: 14 },
  { orderKey: "ORD-DEMO-003", orderedAt: "2023-07-02T00:00:00.000Z", customerState: "AC", actualDeliveryDays: 20 },
  { orderKey: "ORD-DEMO-004", orderedAt: "2023-08-10T00:00:00.000Z", customerState: null, actualDeliveryDays: 9 },
];
