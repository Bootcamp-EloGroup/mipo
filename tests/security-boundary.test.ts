import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("fronteira de segurança do Supabase", () => {
  it("mantém a credencial privilegiada fora do código cliente", () => {
    const clientFiles = [
      "src/components/storefront.tsx",
      "src/services/commerce-api.ts",
    ];

    for (const file of clientFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/SUPABASE_(SECRET_KEY|SERVICE_ROLE_KEY)/);
      expect(source).not.toMatch(/(?:ELOAGENTS|GROQ)_API_KEY/);
    }
  });

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
