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

const salesPath = args.get("--sales");
const customersPath = args.get("--customers");
if (!salesPath || !customersPath) {
  console.error("Uso: pnpm data:import-logistics -- --sales /caminho/vendas.csv --customers /caminho/clientes.csv [--apply]");
  process.exit(1);
}

function parseCsv(text) {
  const delimiter = text.slice(0, text.indexOf("\n")).split(";").length > text.slice(0, text.indexOf("\n")).split(",").length ? ";" : ",";
  const rows = []; let row = []; let value = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(value); value = ""; if (row.some((cell) => cell !== "")) rows.push(row); row = [];
    } else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const headers = rows.shift()?.map((header) => header.trim().replace(/^﻿/, "")) ?? [];
  return rows.map((cells, index) => ({ rowNumber: index + 2, data: Object.fromEntries(headers.map((header, cell) => [header, cells[cell]?.trim() ?? ""])) }));
}

const normalized = (value) => String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const uuid = (value) => { const hash = createHash("sha256").update(value).digest("hex"); return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`; };
const integer = (value) => Number.parseInt(value, 10);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const percentile = (asc, q) => asc[Math.min(asc.length - 1, Math.max(0, Math.ceil(q * asc.length) - 1))];

const states = JSON.parse(await readFile(resolve("src/data/brazilian-states.json"), "utf8"));
const stateByForm = new Map();
for (const state of states) { stateByForm.set(normalized(state.uf), state); stateByForm.set(normalized(state.name), state); }
const resolveState = (value) => stateByForm.get(normalized(value)) ?? null;

const [salesText, customersText] = await Promise.all([readFile(resolve(salesPath), "utf8"), readFile(resolve(customersPath), "utf8")]);
const salesRows = parseCsv(salesText);
const customerRows = parseCsv(customersText);

const requiredSales = ["order_id", "customer_id", "tempo_entrega_real"];
const requiredCustomers = ["customer_id", "estado"];
for (const column of requiredSales) if (!(column in (salesRows[0]?.data ?? {}))) throw new Error(`vendas.csv sem coluna obrigatória: ${column}`);
for (const column of requiredCustomers) if (!(column in (customerRows[0]?.data ?? {}))) throw new Error(`clientes.csv sem coluna obrigatória: ${column}`);

const rejections = [];
const customers = customerRows.filter(({ rowNumber, data }) => {
  const valid = Boolean(data.customer_id) && resolveState(data.estado) !== null;
  if (!valid) rejections.push({ source_name: "clientes.csv", row_number: rowNumber, reason: "Cliente sem identificador ou UF desconhecida", row_fingerprint: sha(JSON.stringify(data)) });
  return valid;
});
if (customers.length !== new Set(customers.map((row) => row.data.customer_id)).size) throw new Error("clientes.csv contém customer_id duplicado");
const stateByCustomer = new Map(customers.map(({ data }) => [data.customer_id, resolveState(data.estado)]));

const sales = salesRows.filter(({ rowNumber, data }) => {
  const delivery = integer(data.tempo_entrega_real);
  const valid = Boolean(data.order_id) && Number.isInteger(delivery) && delivery > 0;
  if (!valid) rejections.push({ source_name: "vendas.csv", row_number: rowNumber, reason: "Pedido sem identificador ou tempo de entrega inválido", row_fingerprint: sha(JSON.stringify(data)) });
  return valid;
});

function buildMatrix(rows, fileHash) {
  const byState = new Map(); const byRegion = new Map(); const national = [];
  let withoutCustomer = 0;
  for (const { data } of rows) {
    const delivery = integer(data.tempo_entrega_real);
    national.push(delivery);
    const state = stateByCustomer.get(data.customer_id);
    if (!state) { withoutCustomer += 1; continue; }
    if (!byState.has(state.uf)) byState.set(state.uf, []);
    if (!byRegion.has(state.region)) byRegion.set(state.region, []);
    byState.get(state.uf).push(delivery); byRegion.get(state.region).push(delivery);
  }
  const emit = (scope, scopeKey, values) => {
    const asc = [...values].sort((a, b) => a - b);
    return { id: uuid(`sla:${fileHash}:${scope}:${scopeKey}`), scope, scope_key: scopeKey, p50_days: percentile(asc, 0.5), p75_days: percentile(asc, 0.75), p90_days: percentile(asc, 0.9), sample_size: asc.length };
  };
  const sla = [
    ...[...byState.entries()].map(([uf, values]) => emit("state", uf, values)),
    ...[...byRegion.entries()].map(([region, values]) => emit("region", region, values)),
    ...(national.length ? [emit("national", "BR", national)] : []),
  ];
  return { sla, withoutCustomer };
}

function summarize(sla, withoutCustomer, mode) {
  const stateRows = sla.filter((row) => row.scope === "state");
  const covered = new Set(stateRows.map((row) => row.scope_key));
  const p75 = stateRows.map((row) => row.p75_days);
  return {
    mode,
    sales: { read: salesRows.length, accepted: sales.length },
    customers: { read: customerRows.length, accepted: customers.length },
    salesWithoutCustomer: withoutCustomer,
    rejected: rejections.length,
    sla: {
      states: stateRows.length,
      regions: sla.filter((row) => row.scope === "region").length,
      national: sla.filter((row) => row.scope === "national").length,
      uncoveredStates: states.map((state) => state.uf).filter((uf) => !covered.has(uf)),
      thinScopes: sla.filter((row) => row.sample_size < 5).map((row) => ({ scope: row.scope, scopeKey: row.scope_key, sampleSize: row.sample_size })),
      p75Min: p75.length ? Math.min(...p75) : null,
      p75Max: p75.length ? Math.max(...p75) : null,
      p75Distinct: new Set(p75).size,
    },
  };
}

const preview = buildMatrix(sales, "preview");
console.log(JSON.stringify(summarize(preview.sla, preview.withoutCustomer, args.has("--apply") ? "apply" : "dry-run"), null, 2));
if (!args.has("--apply")) process.exit(0);

async function loadEnv() {
  try {
    const text = await readFile(resolve(".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (!match) continue;
      const key = match[1].trim();
      if (!process.env[key]) process.env[key] = match[2].trim().replace(/^"(.*)"$/, "$1");
    }
  } catch {}
}
await loadEnv();

const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !secret) throw new Error("Configure SUPABASE_URL e SUPABASE_SECRET_KEY em .env.local.");

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, { ...init, headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Prefer: "return=representation,resolution=merge-duplicates", ...init.headers } });
  if (!response.ok) throw new Error(`${response.status} ${path}: ${await response.text()}`);
  const text = await response.text(); return text ? JSON.parse(text) : null;
}

async function batchUpsert(table, rows, conflict) {
  for (let index = 0; index < rows.length; index += 500) {
    await request(`${table}?on_conflict=${conflict}`, { method: "POST", headers: { Prefer: "return=minimal,resolution=merge-duplicates" }, body: JSON.stringify(rows.slice(index, index + 500)) });
  }
}

const runs = await request("data_import_runs?status=eq.completed&select=id,file_hash&order=finished_at.desc.nullslast&limit=1");
if (!runs.length) throw new Error("Nenhuma importação concluída encontrada. Rode data:import antes.");
const run = runs[0];

const existing = new Map();
for (let offset = 0; ; offset += 1000) {
  const page = await request(`orders?import_run_id=eq.${run.id}&select=id,source_order_key,ordered_at&order=source_order_key.asc&limit=1000&offset=${offset}`);
  for (const row of page) existing.set(row.source_order_key, row);
  if (page.length < 1000) break;
}

const matched = sales.filter(({ data }) => existing.has(data.order_id));
const { sla, withoutCustomer } = buildMatrix(matched, run.file_hash);

const orderRows = matched.map(({ data }) => {
  const row = existing.get(data.order_id);
  const state = stateByCustomer.get(data.customer_id);
  return { id: row.id, source_order_key: row.source_order_key, ordered_at: row.ordered_at, import_run_id: run.id, customer_key: data.customer_id, customer_state: state?.uf ?? null, actual_delivery_days: integer(data.tempo_entrega_real) };
});

await batchUpsert("logistics_sla", sla.map((row) => ({ ...row, import_run_id: run.id })), "scope,scope_key,import_run_id");
await batchUpsert("orders", orderRows, "id");
if (rejections.length) await batchUpsert("import_rejections", rejections.map((row) => ({ ...row, import_run_id: run.id })), "id");

console.log(JSON.stringify({ ...summarize(sla, withoutCustomer, "applied"), runId: run.id, ordersMatched: matched.length, ordersInCsvWithoutRow: sales.length - matched.length }, null, 2));
