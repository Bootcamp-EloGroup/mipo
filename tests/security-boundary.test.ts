import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("fronteira de segurança do Supabase", () => {
  it("mantém a credencial privilegiada fora do código cliente", () => {
    const clientFiles = [
      "src/components/storefront.tsx",
      "src/services/commerce-api.ts",
      "src/components/manager-dashboard.tsx",
    ];

    for (const file of clientFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/SUPABASE_(SECRET_KEY|SERVICE_ROLE_KEY)/);
      expect(source).not.toMatch(/(?:ELOAGENTS|GROQ)_API_KEY/);
      expect(source).not.toMatch(/MIPO_PYTHON_AGENT_TOKEN/);
    }
  });

  it("mantém a agregação gerencial e o RPC no servidor",()=>{expect(readFileSync("src/server/manager-dashboard.ts","utf8")).toContain('import "server-only"');expect(readFileSync("src/components/manager-dashboard.tsx","utf8")).not.toMatch(/SUPABASE_|manager_import_runs|customer_segment_snapshots|service_daily_metrics/);});

  it("marca o cliente REST privilegiado como exclusivo do servidor", () => {
    const source = readFileSync("src/lib/supabase-rest.ts", "utf8");
    expect(source).toContain('import "server-only"');
  });

  it("mantém provedores e orquestrador ReAct exclusivos do servidor", () => {
    expect(readFileSync("src/server/mipo-python-agent.ts","utf8")).toContain('import "server-only"');
  });

  it("garante a sessão antes de persistir uma intervenção", () => {
    const source=readFileSync("src/app/api/mipo/evaluate/route.ts","utf8");
    expect(source.indexOf('anonymous_sessions?on_conflict=id')).toBeGreaterThan(-1);
    expect(source.indexOf('anonymous_sessions?on_conflict=id')).toBeLessThan(source.indexOf('"mipo_interventions"'));
  });
});

describe("fronteira de dados da régua logística", () => {
  it("mantém o mapa de UFs sincronizado com a migration", () => {
    const states = JSON.parse(readFileSync("src/data/brazilian-states.json", "utf8")) as Array<{uf:string;name:string;region:string}>;
    const sql = readFileSync("supabase/migrations/202609200002_wismo_logistics_sla.sql", "utf8");
    expect(states).toHaveLength(27);
    for (const state of states) expect(sql).toContain(`('${state.uf}','${state.name}','${state.region}')`);
  });

  it("não altera o importador do case nem o teste que o cobre", () => {
    expect(readFileSync("scripts/import-case-data.mjs", "utf8")).not.toContain("--customers");
    expect(readFileSync("scripts/import-case-data.mjs", "utf8")).not.toContain("tempo_entrega_real");
    expect(readFileSync("tests/importer.test.ts", "utf8")).not.toContain("clientes.csv");
  });
});

describe("fronteira de dados dos atendimentos WISMO", () => {
  it("mantém eventos restritos à service role", () => {
    const sql = readFileSync("supabase/migrations/202609200004_wismo_service_events.sql", "utf8");
    expect(sql).toContain("alter table public.wismo_service_events enable row level security");
    expect(sql).toContain("revoke all on public.wismo_service_events from anon, authenticated");
  });
});
