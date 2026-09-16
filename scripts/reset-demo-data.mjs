import { createInterface } from "node:readline/promises";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

try { const text=await readFile(resolve(".env.local"),"utf8"); for(const line of text.split(/\r?\n/)){const match=line.match(/^([^#=]+)=(.*)$/);if(match&&!process.env[match[1]])process.env[match[1]]=match[2].replace(/^['"]|['"]$/g,"");} } catch {}
const baseUrl=process.env.SUPABASE_URL?.replace(/\/$/,""); const secret=process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!baseUrl||!secret)throw new Error("Configure SUPABASE_URL e SUPABASE_SECRET_KEY em .env.local.");
if(process.env.MIPO_DEMO_MODE!=="true")throw new Error("O reset exige MIPO_DEMO_MODE=true.");
const projectRef=new URL(baseUrl).hostname.split(".")[0];
async function reset(applyReset){const response=await fetch(`${baseUrl}/rest/v1/rpc/reset_demo_data`,{method:"POST",headers:{apikey:secret,Authorization:`Bearer ${secret}`,"Content-Type":"application/json"},body:JSON.stringify({apply_reset:applyReset})});if(!response.ok)throw new Error(`${response.status}: ${await response.text()}`);return response.json();}
const counts=await reset(false); console.log("\nEscopo marcado explicitamente como demonstrativo:"); for(const [name,count] of Object.entries(counts))console.log(`- ${name}: ${count}`); console.log("\nCatálogo, importações, pedidos históricos, devoluções, estoque e sessões não-demo não fazem parte desta operação.\n");
const input=createInterface({input:process.stdin,output:process.stdout}); const ref=await input.question(`Digite o Project Ref (${projectRef}) para continuar: `); const phrase=await input.question('Digite exatamente "RESETAR DEMO": '); input.close();
if(ref!==projectRef||phrase!=="RESETAR DEMO"){console.error("Confirmação inválida. Nenhum dado foi removido.");process.exit(1);}
await reset(true); console.log("Dados demonstrativos removidos. Dados históricos e sessões não-demo preservados.");
