export type SlaScope = "channel" | "state" | "region" | "national";
export type SlaConfidence = "alta" | "media" | "baixa";
export type DeliveryPhase = "preparing" | "in_transit" | "delivered";
export type DeliveryFlag = "on_time" | "late";
export type BrazilRegion = "norte" | "nordeste" | "centro_oeste" | "sudeste" | "sul";

export type BrazilianState = { uf: string; name: string; region: BrazilRegion };

export type DeliveryRuler = {
  id?: string;
  scope: SlaScope;
  scopeKey: string;
  p50Days: number;
  p75Days: number;
  p90Days: number;
  sampleSize: number;
};

export type DeliveryRulerSet = { channel?: DeliveryRuler; state?: DeliveryRuler; region?: DeliveryRuler; national: DeliveryRuler };

export type WismoThresholds = {
  preparationDays: number;
  criticalExtraDays: number;
  highConfidenceSample: number;
  mediumConfidenceSample: number;
  escalationGraceDays: number;
};

export type WismoOrder = {
  orderKey: string;
  orderedAt: string;
  channel: string | null;
  customerState: string | null;
  actualDeliveryDays: number | null;
};

export type WismoEvidence = {
  scope: SlaScope;
  scopeKey: string;
  fallbackChain: SlaScope[];
  sampleSize: number;
  confidence: SlaConfidence;
  p50Days: number;
  p75Days: number;
  p90Days: number;
  criticalDays: number;
  promisedAt: string;
  criticalAt: string;
  elapsedDays: number;
  asOf?: string;
  deliveredAtOrigin?: "derived";
  quantitativeOrigin: "observed_or_derived_from_csv";
  source: "tempo_entrega_real";
};

export type WismoStatus = {
  phase: DeliveryPhase;
  flag: DeliveryFlag;
  daysLate: number;
  escalate: boolean;
  criticalBreach: boolean;
  deliveredAt?: string;
  ruler: DeliveryRuler;
  evidence: WismoEvidence;
  message: string;
};
