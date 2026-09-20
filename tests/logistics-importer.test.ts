import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Summary = {
  sales: { read: number; accepted: number };
  customers: { read: number; accepted: number };
  salesWithoutCustomer: number;
  rejected: number;
  sla: { states: number; regions: number; national: number; uncoveredStates: string[]; thinScopes: Array<{ scope: string; scopeKey: string; sampleSize: number }>; p75Min: number | null; p75Max: number | null; p75Distinct: number };
};

function run(salesLines: string[], customerLines: string[]): Summary {
  const directory = mkdtempSync(join(tmpdir(), "mipo-logistics-"));
  const sales = join(directory, "vendas.csv"); const customers = join(directory, "clientes.csv");
  writeFileSync(sales, `${salesLines.join("\n")}\n`);
  writeFileSync(customers, `${customerLines.join("\n")}\n`);
  return JSON.parse(execFileSync(process.execPath, ["scripts/import-logistics.mjs", "--sales", sales, "--customers", customers], { encoding: "utf8" }));
}

const salesHeader = "order_id,customer_id,tempo_entrega_real";
const customersHeader = "customer_id,estado";

describe("importador da régua logística", () => {
  it("calcula percentis por UF com regra de posto mais próximo", () => {
    const lines = [salesHeader];
    for (let day = 1; day <= 10; day += 1) lines.push(`O-SP-${day},CLI-SP,${day}`);
    const summary = run(lines, [customersHeader, "CLI-SP,SP"]);
    expect(summary.sla.states).toBe(1);
    expect(summary.sla.p75Min).toBe(8);
    expect(summary.sla.p75Max).toBe(8);
  });

  it("registra régua degenerada com amostra 1", () => {
    const summary = run([salesHeader, "O-1,CLI-SP,4", "O-2,CLI-AC,9"], [customersHeader, "CLI-SP,SP", "CLI-AC,AC"]);
    const thin = summary.sla.thinScopes.filter((scope) => scope.scope === "state");
    expect(thin).toHaveLength(2);
    expect(thin.every((scope) => scope.sampleSize === 1)).toBe(true);
  });

  it("rejeita cliente com UF desconhecida", () => {
    const summary = run([salesHeader, "O-1,CLI-SP,5"], [customersHeader, "CLI-SP,SP", "CLI-ZZ,Nárnia"]);
    expect(summary.customers.accepted).toBe(1);
    expect(summary.rejected).toBe(1);
  });

  it("aceita venda sem cliente correspondente e conta a lacuna", () => {
    const summary = run([salesHeader, "O-1,CLI-SP,5", "O-2,CLI-FANTASMA,9"], [customersHeader, "CLI-SP,SP"]);
    expect(summary.sales.accepted).toBe(2);
    expect(summary.salesWithoutCustomer).toBe(1);
    expect(summary.rejected).toBe(0);
  });

  it("aceita o nome do estado por extenso além da sigla", () => {
    const summary = run([salesHeader, "O-1,CLI-SP,5"], [customersHeader, "CLI-SP,São Paulo"]);
    expect(summary.customers.accepted).toBe(1);
    expect(summary.sla.states).toBe(1);
    expect(summary.sla.uncoveredStates).toHaveLength(26);
  });

  it("rejeita venda com tempo de entrega inválido", () => {
    const summary = run([salesHeader, "O-1,CLI-SP,5", "O-2,CLI-SP,"], [customersHeader, "CLI-SP,SP"]);
    expect(summary.sales.accepted).toBe(1);
    expect(summary.rejected).toBe(1);
  });

  it("exige --customers", () => {
    const directory = mkdtempSync(join(tmpdir(), "mipo-logistics-"));
    const sales = join(directory, "vendas.csv");
    writeFileSync(sales, `${salesHeader}\nO-1,CLI-SP,5\n`);
    expect(() => execFileSync(process.execPath, ["scripts/import-logistics.mjs", "--sales", sales], { encoding: "utf8", stdio: "pipe" })).toThrow();
  });
});
