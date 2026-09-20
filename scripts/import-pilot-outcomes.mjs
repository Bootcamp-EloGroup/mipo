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
const outcomesPath = args.get("--outcomes");
if (!outcomesPath) {
  console.error("Uso: pnpm data:import-pilot-outcomes -- --outcomes /caminho/desfechos.csv [--apply]");
  process.exit(1);
}

export function parseCsv(text) {
  const first = text.slice(0, text.indexOf("\n"));
  const delimiter = first.split(";").length > first.split(",").length ? ";" : ",";
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift()?.split(delimiter).map((value) => value.trim().replace(/^\uFEFF/, "")) ?? [];
  return lines.filter(Boolean).map((line, index) => ({ rowNumber: index + 2, data: Object.fromEntries(headers.map((header, cell) => [header, line.split(delimiter)[cell]?.trim() ?? ""])) }));
}
const parseMoney = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const number = Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
};
const sha = (value) => createHash("sha256").update(value).digest("hex");
const text = await readFile(resolve(outcomesPath), "utf8");
const sourceHash = sha(text);
const input = parseCsv(text);
const required = ["display_id", "outcome", "return_reason", "return_cost_reais", "observed_at"];
for (const column of required) if (!(column in (input[0]?.data ?? {}))) throw new Error(`CSV sem coluna obrigatória: ${column}`);

const accepted = [];
const rejected = [];
for (const row of input) {
  const outcome = row.data.outcome?.toLowerCase();
  const cost = parseMoney(row.data.return_cost_reais);
  const observedAt = new Date(row.data.observed_at);
  if (!row.data.display_id || !["kept", "returned"].includes(outcome) || cost === null || Number.isNaN(observedAt.valueOf())) {
    rejected.push({ rowNumber: row.rowNumber, reason: "Pedido, desfecho, custo ou data inválidos" });
    continue;
  }
  if (outcome === "kept" && cost !== 0) {
    rejected.push({ rowNumber: row.rowNumber, reason: "Pedido mantido deve ter custo de devolução zero" });
    continue;
  }
  accepted.push({ displayId: row.data.display_id, outcome, returnReason: row.data.return_reason || null, returnCostCents: cost, observedAt: observedAt.toISOString() });
}
console.log(JSON.stringify({ mode: args.has("--apply") ? "apply" : "dry-run", sourceHash, read: input.length, accepted: accepted.length, rejected, privacy: { personalDataPersisted: 0 } }, null, 2));
if (!args.has("--apply")) process.exit(rejected.length ? 2 : 0);
if (rejected.length) throw new Error("Corrija as linhas rejeitadas antes de aplicar.");

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
for (const item of accepted) {
  const orders = await request(`pilot_orders?display_id=eq.${encodeURIComponent(item.displayId)}&select=id`);
  if (orders.length !== 1) throw new Error(`Pedido não encontrado ou duplicado: ${item.displayId}`);
  await request("pilot_order_outcomes?on_conflict=order_id", { method: "POST", body: JSON.stringify({ order_id: orders[0].id, outcome: item.outcome, return_reason: item.returnReason, return_cost_cents: item.returnCostCents, observed_at: item.observedAt, source_hash: sourceHash }) });
}
console.log(`Desfechos importados: ${accepted.length}`);
