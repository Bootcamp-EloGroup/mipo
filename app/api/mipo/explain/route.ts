import { apiError } from "@/src/lib/api-response";
import { getOrCreateSessionId } from "@/src/lib/session";
import { dataSource, supabaseRest } from "@/src/lib/supabase-rest";
import { getProduct } from "@/src/server/store";
import { runMipoAgent } from "@/src/server/mipo-react-agent";
import { evaluateCheckoutRisk, type FitPreference, type RiskResult } from "@/src/services/mipo";

type Intervention = {id:string;session_id:string;product_id:string;selected_variant_id:string;recommended_variant_id:string|null;fit_preference:FitPreference|null;risk_type:RiskResult["risk"];risk_level:RiskResult["level"];evidence:{message?:string};message:string;rule_set_id:string};
type Rule = {high_return_rate:number;minimum_improvement:number;low_stock_quantity:number;minimum_sample_size:number};

export async function POST(request:Request){
  try{
    const body=await request.json(); if(typeof body.interventionId!=="string")return Response.json({error:"Intervenção válida é obrigatória."},{status:400});
    if(process.env.AI_EXPLANATIONS_ENABLED!=="true")return Response.json({enabled:false});
    if(dataSource()!=="supabase")return Response.json({enabled:false});
    const session=await getOrCreateSessionId();
    const rows=await supabaseRest<Intervention[]>(`mipo_interventions?id=eq.${body.interventionId}&session_id=eq.${session.id}&select=*&limit=1`); const intervention=rows[0];
    if(!intervention)return Response.json({error:"Intervenção não encontrada para esta sessão."},{status:404});
    const [product,rules]=await Promise.all([getProduct(intervention.product_id),supabaseRest<Rule[]>(`mipo_rule_sets?id=eq.${intervention.rule_set_id}&select=high_return_rate,minimum_improvement,low_stock_quantity,minimum_sample_size&limit=1`)]); const selected=product?.variants.find((item)=>item.id===intervention.selected_variant_id);
    if(!product||!selected||!rules[0])return Response.json({error:"Contexto da intervenção não está mais disponível."},{status:409});
    const thresholds={highReturnRate:rules[0].high_return_rate,minimumImprovement:rules[0].minimum_improvement,lowStockQuantity:rules[0].low_stock_quantity,minimumSampleSize:rules[0].minimum_sample_size};
    const result=evaluateCheckoutRisk(product,selected,intervention.fit_preference??"regular",thresholds);
    if(result.risk!==intervention.risk_type||result.level!==intervention.risk_level)return Response.json({error:"A evidência atual diverge da intervenção registrada."},{status:409});
    const answer=await runMipoAgent({interventionId:intervention.id,product,selected,fitPreference:intervention.fit_preference??"regular",thresholds,deterministicResult:result});
    return Response.json({enabled:true,answer});
  }catch(error){return apiError(error);}
}
