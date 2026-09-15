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
const inventoryPath = args.get("--inventory");
if (!salesPath || !inventoryPath) {
  console.error("Uso: pnpm data:import -- --sales /caminho/vendas.csv --inventory /caminho/estoque.csv [--apply]");
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
  const headers = rows.shift()?.map((header) => header.trim().replace(/^\uFEFF/, "")) ?? [];
  return rows.map((cells, index) => ({ rowNumber: index + 2, data: Object.fromEntries(headers.map((header, cell) => [header, cells[cell]?.trim() ?? ""])) }));
}

const normalized = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const slugify = (value) => normalized(value).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const uuid = (value) => { const hash = createHash("sha256").update(value).digest("hex"); return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`; };
const decimal = (value) => { const text = String(value).trim(); return Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text); };
const cents = (value) => Math.round(decimal(value) * 100);
const integer = (value) => Number.parseInt(value, 10);
const yes = (value) => ["sim", "true", "1", "yes"].includes(normalized(value));
const sha = (value) => createHash("sha256").update(value).digest("hex");

const [salesText, inventoryText] = await Promise.all([readFile(resolve(salesPath), "utf8"), readFile(resolve(inventoryPath), "utf8")]);
const fileHash = sha(`${sha(salesText)}:${sha(inventoryText)}`);
const salesRows = parseCsv(salesText);
const inventoryRows = parseCsv(inventoryText);
const requiredSales = ["order_id","sku_id","data_pedido","quantidade","preco_unitario","receita_liquida","devolvido"];
const requiredInventory = ["sku_id","nome_produto","categoria","subcategoria","estoque_fisico","estoque_reservado","estoque_disponivel","status_disponibilidade"];
for (const column of requiredSales) if (!(column in (salesRows[0]?.data ?? {}))) throw new Error(`vendas.csv sem coluna obrigatória: ${column}`);
for (const column of requiredInventory) if (!(column in (inventoryRows[0]?.data ?? {}))) throw new Error(`estoque.csv sem coluna obrigatória: ${column}`);

const rejections = [];
const inventory = inventoryRows.filter(({ rowNumber, data }) => {
  const valid = data.sku_id && data.nome_produto && Number.isInteger(integer(data.estoque_fisico)) && integer(data.estoque_fisico) - integer(data.estoque_reservado) === integer(data.estoque_disponivel);
  if (!valid) rejections.push({ source_name: "estoque.csv", row_number: rowNumber, reason: "Linha obrigatória ausente ou saldo inconsistente", row_fingerprint: sha(JSON.stringify(data)) });
  return valid;
});
const inventoryBySku = new Map(inventory.map((row) => [row.data.sku_id, row.data]));
const sales = salesRows.filter(({ rowNumber, data }) => {
  const valid = data.order_id && data.sku_id && inventoryBySku.has(data.sku_id) && data.data_pedido && integer(data.quantidade) > 0 && Number.isFinite(cents(data.preco_unitario));
  if (!valid) rejections.push({ source_name: "vendas.csv", row_number: rowNumber, reason: "Linha parcial, tipo inválido ou SKU inexistente", row_fingerprint: sha(JSON.stringify(data)) });
  return valid;
});

const duplicate = (rows, key) => rows.length !== new Set(rows.map((row) => row.data[key])).size;
if (duplicate(inventory, "sku_id")) throw new Error("estoque.csv contém sku_id duplicado");
if (duplicate(sales, "order_id")) throw new Error("vendas.csv contém order_id duplicado; o modelo 1 pedido:1 item precisa ser revisto");

const salesBySku = new Map();
for (const { data } of sales) {
  const metric = salesBySku.get(data.sku_id) ?? { sales: 0, returns: 0, defects: 0 };
  metric.sales += 1;
  if (yes(data.devolvido)) metric.returns += 1;
  if (yes(data.devolvido) && /defeito|qualidade|avaria/i.test(data.motivo_devolucao)) metric.defects += 1;
  salesBySku.set(data.sku_id, metric);
}

const groups = new Map();
for (const { data } of inventory) {
  const key = `${data.nome_produto}|${data.categoria}|${data.subcategoria}`;
  const group = groups.get(key) ?? { key, name: data.nome_produto, category: data.categoria, subcategory: data.subcategoria, rows: [], sales: 0 };
  group.rows.push(data); group.sales += salesBySku.get(data.sku_id)?.sales ?? 0; groups.set(key, group);
}
const curated = [...groups.values()].filter((group) => group.rows.length === 4).sort((a, b) => b.sales - a.sales).slice(0, 6);
if (curated.length < 6) throw new Error("Não há 6 produtos com exatamente 4 SKUs para o enriquecimento P/M/G/GG.");
const curatedKeys = new Set(curated.map((group) => group.key));
const palette = [["#a4492e","#e6cbb2","sand"],["#263f49","#b9cac9","charcoal"],["#9b7a4d","#e8dac1","sand"],["#4e5841","#c9cdbd","sand"],["#936726","#e4c88c","charcoal"],["#633b45","#c8a2a8","charcoal"]];
const sizes = ["P","M","G","GG"];
const products = [...groups.values()].map((group, index) => {
  const productId = uuid(`product:${fileHash}:${group.key}`); const curatedIndex = curated.findIndex((item) => item.key === group.key); const colors = palette[Math.max(0, curatedIndex) % palette.length];
  return { id: productId, source_key: group.key, title: group.name, handle: `${slugify(group.name)}-${productId.slice(0,6)}`, subtitle: `${group.subcategory} · seleção Vértice`, description: `Peça selecionada do catálogo fornecido para a experiência demonstrativa MIPO.`, category: group.category, subcategory: group.subcategory, color: colors[0], accent: colors[1], badge: curatedIndex === 0 ? "Mais desejado" : null, image_key: colors[2], is_curated: curatedKeys.has(group.key), origin: "derived" };
});
const productByKey = new Map(products.map((product) => [product.source_key, product]));
const variants = [];
for (const group of groups.values()) group.rows.forEach((data, index) => {
  const metric = salesBySku.get(data.sku_id) ?? { sales: 0, returns: 0, defects: 0 }; const synthetic = curatedKeys.has(group.key); const size = synthetic ? sizes[index % 4] : null;
  variants.push({ id: uuid(`variant:${fileHash}:${data.sku_id}`), product_id: productByKey.get(group.key).id, source_sku: data.sku_id, title: size ?? data.sku_id, size, color_name: synthetic ? (index % 2 ? "Natural" : "Principal") : null, price_cents: cents(data.preco_venda_sugerido), sales_count: metric.sales, return_rate: metric.sales ? metric.returns / metric.sales : null, defect_rate: metric.sales ? metric.defects / metric.sales : null, attributes_origin: synthetic ? "synthetic" : "provided" });
});
const variantBySku = new Map(variants.map((variant) => [variant.source_sku, variant]));
const capturedAt = new Date().toISOString();
const snapshots = inventory.map(({ data }) => ({ variant_id: variantBySku.get(data.sku_id).id, captured_at: capturedAt, physical_quantity: integer(data.estoque_fisico), reserved_quantity: integer(data.estoque_reservado), available_quantity: integer(data.estoque_disponivel), availability_status: data.status_disponibilidade, captured_at_origin: "derived" }));
const orders = sales.map(({ data }) => ({ id: uuid(`order:${fileHash}:${data.order_id}`), source_order_key: data.order_id, ordered_at: new Date(data.data_pedido.replace(" ", "T") + (data.data_pedido.includes("Z") ? "" : "Z")).toISOString(), channel: data.canal || null, payment_status: data.status_pagamento || null }));
const items = sales.map(({ data }) => ({ id: uuid(`item:${fileHash}:${data.order_id}`), order_id: uuid(`order:${fileHash}:${data.order_id}`), variant_id: variantBySku.get(data.sku_id).id, quantity: integer(data.quantidade), unit_price_cents: cents(data.preco_unitario), net_revenue_cents: cents(data.receita_liquida), contribution_margin_cents: data.margem_contribuicao ? cents(data.margem_contribuicao) : null }));
const returns = sales.filter(({ data }) => yes(data.devolvido)).map(({ data }) => ({ id: uuid(`return:${fileHash}:${data.order_id}`), order_item_id: uuid(`item:${fileHash}:${data.order_id}`), reason: data.motivo_devolucao || null, origin: "derived" }));

const summary = { mode: args.has("--apply") ? "apply" : "dry-run", fileHash, sales: { read: salesRows.length, accepted: sales.length }, inventory: { read: inventoryRows.length, accepted: inventory.length }, products: products.length, curatedProducts: curated.length, variants: variants.length, returns: returns.length, rejected: rejections.length };
console.log(JSON.stringify(summary, null, 2));
if (!args.has("--apply")) process.exit(0);

async function loadEnv() {
  try { const text = await readFile(resolve(".env.local"), "utf8"); for (const line of text.split(/\r?\n/)) { const match = line.match(/^([^#=]+)=(.*)$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, ""); } } catch {}
}
await loadEnv();
const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !secret) throw new Error("Configure SUPABASE_URL e SUPABASE_SECRET_KEY em .env.local antes de usar --apply.");
async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, { ...init, headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Prefer: "return=representation,resolution=merge-duplicates", ...init.headers } });
  if (!response.ok) throw new Error(`${response.status} ${path}: ${await response.text()}`); const text = await response.text(); return text ? JSON.parse(text) : null;
}
async function batchUpsert(table, rows, conflict, runId) {
  for (let index = 0; index < rows.length; index += 500) {
    const batch = rows.slice(index, index + 500).map((row) => ({ ...row, ...(runId ? { import_run_id: runId } : {}) }));
    await request(`${table}?on_conflict=${conflict}`, { method: "POST", body: JSON.stringify(batch) });
  }
}
const existing = await request(`data_import_runs?file_hash=eq.${fileHash}&select=id,status`);
if (existing.length) throw new Error(`Este conteúdo já foi importado: ${existing[0].id} (${existing[0].status}).`);
const [run] = await request("data_import_runs", { method: "POST", body: JSON.stringify({ file_hash: fileHash, schema_version: "2026-09-14.v1", status: "staging", accepted_rows: sales.length + inventory.length, rejected_rows: rejections.length }) });
try {
  await batchUpsert("products", products, "id", run.id);
  await batchUpsert("product_variants", variants, "id", run.id);
  await batchUpsert("inventory_snapshots", snapshots, "variant_id,import_run_id", run.id);
  await batchUpsert("orders", orders, "id", run.id);
  await batchUpsert("order_items", items, "id", run.id);
  await batchUpsert("returns", returns, "id", run.id);
  await batchUpsert("import_rejections", rejections, "id", run.id);
  await request(`data_import_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: "completed", finished_at: new Date().toISOString() }) });
  console.log(`Importação concluída: ${run.id}`);
} catch (error) {
  await request(`data_import_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: "failed", finished_at: new Date().toISOString(), error_summary: String(error).slice(0, 500) }) }).catch(() => {});
  throw error;
}
