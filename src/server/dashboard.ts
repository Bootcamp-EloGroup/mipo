import "server-only";
import type { DashboardData, DashboardDecision, DashboardRow } from "@/src/domain/dashboard";
import { dataSource, supabaseRest } from "@/src/lib/supabase-rest";

type Intervention = { id:string; created_at:string; product_id:string; selected_variant_id:string; recommended_variant_id:string|null; risk_type:DashboardRow["risk"]; risk_level:DashboardRow["level"]; evidence:{message?:string}|null; message:string; rule_set_id:string };
type Decision = { intervention_id:string; decision:"accepted"|"kept_original"|"not_required"; decided_at:string };
type Product = { id:string; title:string };
type Variant = { id:string; size:string|null };
type Rule = { id:string; version:string; minimum_sample_size:number; is_active:boolean };

function status(intervention: Intervention, decision?: Decision): DashboardDecision {
  if (decision) return decision.decision;
  return Date.now() - new Date(intervention.created_at).getTime() >= 30 * 60 * 1000 ? "abandoned" : "pending";
}

export async function getDashboardData(): Promise<DashboardData> {
  if (dataSource() !== "supabase") return { generatedAt:new Date().toISOString(), historicalWindow:{}, minimumSampleSize:30, metrics:{interventions:0,actionable:0,decidedActionable:0,accepted:0,keptOriginal:0,pending:0,abandoned:0,acceptanceRate:null}, riskDistribution:[], trend:[], rows:[], simulator:{locked:true,reason:"Conecte o Supabase para observar intervenções reais."} };
  const [interventions, decisions, products, variants, rules, oldest, newest] = await Promise.all([
    supabaseRest<Intervention[]>("mipo_interventions?select=id,created_at,product_id,selected_variant_id,recommended_variant_id,risk_type,risk_level,evidence,message,rule_set_id&order=created_at.desc&limit=5000"),
    supabaseRest<Decision[]>("mipo_decisions?select=intervention_id,decision,decided_at&limit=5000"),
    supabaseRest<Product[]>("products?select=id,title&limit=5000"),
    supabaseRest<Variant[]>("product_variants?select=id,size&limit=10000"),
    supabaseRest<Rule[]>("mipo_rule_sets?select=id,version,minimum_sample_size,is_active"),
    supabaseRest<Array<{ordered_at:string}>>("orders?select=ordered_at&order=ordered_at.asc&limit=1"),
    supabaseRest<Array<{ordered_at:string}>>("orders?select=ordered_at&order=ordered_at.desc&limit=1"),
  ]);
  const decisionByIntervention = new Map(decisions.map((item) => [item.intervention_id,item]));
  const productById = new Map(products.map((item) => [item.id,item]));
  const variantById = new Map(variants.map((item) => [item.id,item]));
  const ruleById = new Map(rules.map((item) => [item.id,item]));
  const rows: DashboardRow[] = interventions.map((item) => { const decision=decisionByIntervention.get(item.id); return { id:item.id, occurredAt:item.created_at, productId:item.product_id, product:productById.get(item.product_id)?.title ?? "Produto removido", selectedSize:variantById.get(item.selected_variant_id)?.size ?? "—", recommendedSize:item.recommended_variant_id ? variantById.get(item.recommended_variant_id)?.size ?? undefined : undefined, risk:item.risk_type, level:item.risk_level, evidence:item.evidence?.message ?? item.message, ruleVersion:ruleById.get(item.rule_set_id)?.version ?? "—", decision:status(item,decision), decidedAt:decision?.decided_at }; });
  const actionableRows=rows.filter((row)=>row.risk==="size" && !!row.recommendedSize); const decided=actionableRows.filter((row)=>row.decision==="accepted"||row.decision==="kept_original"); const accepted=decided.filter((row)=>row.decision==="accepted").length;
  const risks = (["size","quality","stock","none","insufficient_evidence"] as const).map((risk)=>({risk,count:rows.filter((row)=>row.risk===risk).length})).filter((item)=>item.count>0);
  const trendMap=new Map<string,{date:string;interventions:number;accepted:number}>(); for(const row of rows){const date=row.occurredAt.slice(0,10);const day=trendMap.get(date)??{date,interventions:0,accepted:0};day.interventions+=1;if(row.decision==="accepted")day.accepted+=1;trendMap.set(date,day);}
  const activeRule=rules.find((rule)=>rule.is_active) ?? rules[0];
  return { generatedAt:new Date().toISOString(), historicalWindow:{from:oldest[0]?.ordered_at,to:newest[0]?.ordered_at}, minimumSampleSize:activeRule?.minimum_sample_size??30, metrics:{interventions:rows.length,actionable:actionableRows.length,decidedActionable:decided.length,accepted,keptOriginal:decided.filter((row)=>row.decision==="kept_original").length,pending:rows.filter((row)=>row.decision==="pending").length,abandoned:rows.filter((row)=>row.decision==="abandoned").length,acceptanceRate:decided.length?accepted/decided.length:null}, riskDistribution:risks, trend:[...trendMap.values()].sort((a,b)=>a.date.localeCompare(b.date)), rows, simulator:{locked:actionableRows.length===0,reason:actionableRows.length===0?"Sem recomendações elegíveis com amostra mínima. O impacto potencial não pode ser estimado com segurança.":undefined} };
}
