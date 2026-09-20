import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const clientFiles = [
  "src/components/wismo-chat.tsx",
  "src/components/wismo-operations.tsx",
  "src/components/wismo-impact-simulator.tsx",
  "src/services/wismo-api.ts",
  "src/services/wismo-mock.ts",
];

describe("fronteira cliente/servidor do WISMO", () => {
  it("mantém credenciais e código de servidor fora do cliente", () => {
    for (const file of clientFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/SUPABASE_(SECRET_KEY|SERVICE_ROLE_KEY)/);
      expect(source, file).not.toMatch(/(?:ELOAGENTS|GROQ)_API_KEY/);
      expect(source, file).not.toMatch(/@\/src\/server\//);
    }
  });

  it("marca o armazenamento de atendimentos como exclusivo do servidor", () => {
    expect(readFileSync("src/server/wismo-events.ts", "utf8")).toContain('import "server-only"');
  });
});
