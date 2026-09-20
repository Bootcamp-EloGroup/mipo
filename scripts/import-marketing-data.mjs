import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (key === "--") continue;
  if (key === "--apply") args.set(key, true);
  else args.set(key, process.argv[++index]);
}

const marketingPath = args.get("--marketing");
if (!marketingPath) {
  console.error("Uso: pnpm data:import-marketing -- --marketing /caminho/marketing.csv [--apply]");
  process.exit(1);
}

export function parseCsv(text) {
  const firstLine = text.slice(0, text.indexOf("\n"));
  const delimiter = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const rows = []; let row = []; let value = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); value = ""; if (row.some((cell) => cell !== "")) rows.push(row); row = [];
    } else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const headers = rows.shift()?.map((header) => header.trim().replace(/^\uFEFF/, "")) ?? [];
  return rows.map((cells, index) => ({ rowNumber: index + 2, data: Object.fromEntries(headers.map((header, cell) => [header, cells[cell]?.trim() ?? ""])) }));
}

const decimal = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
  return Number.isFinite(parsed) ? parsed : null;
};
const integer = (value) => Number.parseInt(String(value ?? ""), 10);
const cents = (value) => { const parsed = decimal(value); return parsed === null ? null : Math.round(parsed * 100); };
const sha = (value) => createHash("sha256").update(value).digest("hex");

const text = await readFile(resolve(marketingPath), "utf8");
const rows = parseCsv(text);
const sourceHash = sha(text);
const required = ["campanha_id", "canal", "categoria_foco", "data_inicio", "data_fim", "investimento_reais", "impressoes", "cliques", "conversoes", "atribuicao", "status", "receita_gerada"];
for (const column of required) if (!(column in (rows[0]?.data ?? {}))) throw new Error(`marketing.csv sem coluna obrigatória: ${column}`);

const rejected = [];
const groups = new Map();
for (const row of rows) {
  const data = row.data;
  const valid = data.campanha_id && data.canal && data.categoria_foco && data.atribuicao && data.status &&
    /^\d{4}-\d{2}-\d{2}$/.test(data.data_inicio) && /^\d{4}-\d{2}-\d{2}$/.test(data.data_fim) &&
    [data.investimento_reais, data.impressoes, data.cliques, data.conversoes, data.receita_gerada].every((value) => decimal(value) !== null) &&
    integer(data.impressoes) >= 0 && integer(data.cliques) >= 0 && integer(data.conversoes) >= 0;
  if (!valid) { rejected.push({ row_number: row.rowNumber, reason: "Linha parcial, data ou métrica inválida", row_fingerprint: sha(JSON.stringify(data)) }); continue; }
  const key = [data.canal, data.categoria_foco, data.atribuicao, data.status].join("|");
  const item = groups.get(key) ?? { channel: data.canal, category_focus: data.categoria_foco, attribution: data.atribuicao, campaign_status: data.status, campaign_count: 0, spend_cents: 0, impressions: 0, clicks: 0, conversions: 0, revenue_cents: 0 };
  item.campaign_count += 1; item.spend_cents += cents(data.investimento_reais); item.impressions += integer(data.impressoes); item.clicks += integer(data.cliques); item.conversions += integer(data.conversoes); item.revenue_cents += cents(data.receita_gerada); groups.set(key, item);
}

const aggregates = [...groups.values()];
const total = aggregates.reduce((sum, item) => ({ campaigns: sum.campaigns + item.campaign_count, spend: sum.spend + item.spend_cents, impressions: sum.impressions + item.impressions, clicks: sum.clicks + item.clicks, conversions: sum.conversions + item.conversions, revenue: sum.revenue + item.revenue_cents }), { campaigns: 0, spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 });
console.log(JSON.stringify({ mode: args.has("--apply") ? "apply" : "dry-run", sourceHash, campaigns: { read: rows.length, accepted: rows.length - rejected.length, rejected: rejected.length, groups: aggregates.length }, totals: total, privacy: { rawCampaignIdsPersisted: 0, campaignNamesPersisted: 0 } }, null, 2));
if (!args.has("--apply")) process.exit(0);

try {
  const env = await readFile(resolve(".env.local"), "utf8");
  for (const line of env.split(/\r?\n/)) { const match = line.match(/^([^#=]+)=(.*)$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, ""); }
} catch {}
const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !secret) throw new Error("Configure SUPABASE_URL e SUPABASE_SECRET_KEY em .env.local.");
async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, { ...init, headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Prefer: "return=representation,resolution=merge-duplicates", ...init.headers } });
  if (!response.ok) throw new Error(`${response.status} ${path}: ${await response.text()}`);
  const body = await response.text(); return body ? JSON.parse(body) : null;
}
const existing = await request(`manager_import_runs?source_hash=eq.${sourceHash}&select=id,status`);
if (existing.length) throw new Error(`Agregados já importados: ${existing[0].id} (${existing[0].status}).`);
const [run] = await request("manager_import_runs", { method: "POST", body: JSON.stringify({ source_hash: sourceHash, schema_version: "2026-09-17.marketing-v1", customer_rows: 0, service_rows: 0, marketing_rows: rows.length - rejected.length, status: "staging" }) });
try {
  for (let index = 0; index < aggregates.length; index += 500) await request("marketing_campaign_metrics", { method: "POST", body: JSON.stringify(aggregates.slice(index, index + 500).map((item) => ({ ...item, import_run_id: run.id }))) });
  await request(`manager_import_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: "completed", finished_at: new Date().toISOString() }) });
  console.log(`Agregados de marketing importados: ${run.id}`);
} catch (error) {
  await request(`manager_import_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: "failed", finished_at: new Date().toISOString(), error_summary: String(error).slice(0, 500) }) }).catch(() => {});
  throw error;
}
