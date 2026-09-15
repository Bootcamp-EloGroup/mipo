import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("importador do case", () => {
  it("é determinístico e rejeita linha parcial no dry-run", () => {
    const directory = mkdtempSync(join(tmpdir(), "mipo-import-"));
    const inventory = join(directory, "estoque.csv"); const sales = join(directory, "vendas.csv");
    const inventoryLines = ["sku_id,nome_produto,categoria,subcategoria,preco_venda_sugerido,estoque_fisico,estoque_reservado,estoque_disponivel,status_disponibilidade"];
    for (let product = 1; product <= 6; product += 1) for (let variant = 1; variant <= 4; variant += 1) inventoryLines.push(`S${product}${variant},Produto ${product},Moda,Camisa,10.00,5,1,4,Em Estoque`);
    writeFileSync(inventory, `${inventoryLines.join("\n")}\n`);
    writeFileSync(sales, "order_id,sku_id,data_pedido,quantidade,preco_unitario,receita_liquida,devolvido,status_pagamento,margem_contribuicao\nO1,S11,2026-01-01 00:00:00,1,10.00,10.00,False,Aprovado,5.00\nO2,S12,2026-01-02 00:00:00,,,,False,,\n");
    const run = () => JSON.parse(execFileSync(process.execPath, ["scripts/import-case-data.mjs", "--sales", sales, "--inventory", inventory], { encoding: "utf8" }));
    const first = run(); const second = run();
    expect(first.rejected).toBe(1);
    expect(first.sales.accepted).toBe(1);
    expect(first.curatedProducts).toBe(6);
    expect(second.fileHash).toBe(first.fileHash);
  });
});
