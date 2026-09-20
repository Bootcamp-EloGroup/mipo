export type DataOrigin = "historical" | "snapshot" | "demo" | "scenario";
export type DashboardDecision = "accepted" | "kept_original" | "not_required" | "pending" | "abandoned";
export type RiskType = "size" | "quality" | "preference_mismatch" | "stock" | "none" | "insufficient_evidence";
export type DashboardFilters = { from:string|null;to:string|null;channel:string|null;category:string|null;origin:"all"|"historical"|"demo" };
export type LabeledCount = { label:string;count:number };
export type ImpactScenarioBasis = {
  eligibleInterventions:number;
  observedReturnRate:number|null;
  averageMarginPerOrderCents:number|null;
  averageReturnCostCents:number|null;
};
export type MarketingSlice = { label:string;campaigns:number;spendCents:number;conversions:number;revenueCents:number;impressions?:number;clicks?:number };
export type MarketingDashboardData = { source:"historical";campaigns:number;spendCents:number;impressions:number;clicks:number;conversions:number;revenueCents:number;byChannel:MarketingSlice[];byCategory:MarketingSlice[];byAttribution:MarketingSlice[] };
export type DashboardRow = { id:string;occurredAt:string;product:string;category:string;selectedSize:string;recommendedSize:string|null;risk:RiskType;level:"high"|"medium"|"low";score:number|null;evidence:string;ruleVersion:string;decision:DashboardDecision;origin:"historical"|"demo";agentStatus:string|null };
export type ManagerDashboardData = {
  generatedAt:string;filters:DashboardFilters;historicalWindow:{from:string|null;to:string|null};options:{channels:Array<{value:string}>;categories:Array<{value:string}>};
  scenarioBasis:ImpactScenarioBasis;
  pilot:{control:{orders:number;observed:number;returns:number;returnRate:number|null;returnCostCents:number};treatment:{orders:number;observed:number;returns:number;returnRate:number|null;returnCostCents:number};readyForComparison:boolean};
  marketing:MarketingDashboardData;
  executive:{source:"historical";revenueCents:number;marginCents:number;orders:number;returns:number;criticalSkus:number;inventoryExposureCents:number;monthly:Array<{month:string;revenueCents:number;marginCents:number;orders:number;returns:number}>;channels:Array<{channel:string;revenueCents:number;marginCents:number;orders:number;returns:number}>;products:Array<{product:string;category:string;revenueCents:number;marginCents:number;returns:number}>;inventory:Array<{status:string;skuCount:number;exposureCents:number}>};
  customers:{source:"snapshot";total:number;segments:Array<{label:string;customers:number;averageLtvCents:number;averageOrders:number}>;loyalty:Array<{label:string;customers:number}>;states:Array<{label:string;customers:number}>;devices:Array<{label:string;customers:number}>};
  service:{source:"historical";tickets:number;wismo:number;csat:number|null;firstResponseMinutes:number|null;costCents:number;backlog:number;weekly:Array<{week:string;tickets:number;wismo:number;csat:number|null}>;categories:Array<{label:string;tickets:number;wismo:number}>};
  mipo:{source:"historical"|"demo";evaluated:number;actionable:number;decided:number;accepted:number;risks:LabeledCount[];daily:Array<{day:string;interventions:number;accepted:number}>;recent:DashboardRow[]};
  agent:{source:"historical"|"demo";total:number;eloagents:number;groq:number;fallback:number;cacheHits:number;rejected:number;timeouts:number;averageLatencyMs:number|null;providers:LabeledCount[]};
};
export const emptyManagerDashboard=():ManagerDashboardData=>({generatedAt:new Date().toISOString(),filters:{from:null,to:null,channel:null,category:null,origin:"all"},historicalWindow:{from:null,to:null},options:{channels:[],categories:[]},scenarioBasis:{eligibleInterventions:0,observedReturnRate:null,averageMarginPerOrderCents:null,averageReturnCostCents:null},pilot:{control:{orders:0,observed:0,returns:0,returnRate:null,returnCostCents:0},treatment:{orders:0,observed:0,returns:0,returnRate:null,returnCostCents:0},readyForComparison:false},marketing:{source:"historical",campaigns:0,spendCents:0,impressions:0,clicks:0,conversions:0,revenueCents:0,byChannel:[],byCategory:[],byAttribution:[]},executive:{source:"historical",revenueCents:0,marginCents:0,orders:0,returns:0,criticalSkus:0,inventoryExposureCents:0,monthly:[],channels:[],products:[],inventory:[]},customers:{source:"snapshot",total:0,segments:[],loyalty:[],states:[],devices:[]},service:{source:"historical",tickets:0,wismo:0,csat:null,firstResponseMinutes:null,costCents:0,backlog:0,weekly:[],categories:[]},mipo:{source:"historical",evaluated:0,actionable:0,decided:0,accepted:0,risks:[],daily:[],recent:[]},agent:{source:"historical",total:0,eloagents:0,groq:0,fallback:0,cacheHits:0,rejected:0,timeouts:0,averageLatencyMs:null,providers:[]}});
