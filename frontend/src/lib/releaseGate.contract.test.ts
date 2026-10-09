import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  path.resolve(__dirname, "../../../.github/workflows/myfinance-quality-gate.yml"),
  "utf8",
).replace(/\r\n?/g, "\n");

/** MYFINANCE-RELEASE-GATE-1 - guard the actual GitHub Actions config. */
describe("MyFinance release gate contract", () => {
  it("runs for PRs targeting main, main pushes, and manual dispatch", () => {
    expect(workflow).toContain("  pull_request:\n    branches: [main]");
    expect(workflow).toContain("  push:\n    branches: [main]");
    expect(workflow).toContain("  workflow_dispatch:");
  });

  it("uses read-only permissions, trusted pinned actions, and no credentials", () => {
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toMatch(/actions\/checkout@[a-f0-9]{40}/);
    expect(workflow).toMatch(/actions\/setup-node@[a-f0-9]{40}/);
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).not.toContain("secrets.");
    expect(workflow).not.toContain("service_role");
  });

  it("runs locked dependency install, TypeScript, lint, tests, then build", () => {
    const commands = [
      "run: npm ci --no-audit --no-fund",
      "run: npx tsc --noEmit",
      "run: npm run lint",
      "run: npm run test",
      "run: npm run build",
    ];
    let last = -1;
    for (const command of commands) {
      const position = workflow.indexOf(command);
      expect(position).toBeGreaterThan(last);
      last = position;
    }
    expect(workflow).toContain("working-directory: frontend");
    expect(workflow).toContain("cache-dependency-path: frontend/package-lock.json");
  });

  it("compiles with CI-only Supabase placeholders rather than real credentials", () => {
    expect(workflow).toContain("NEXT_PUBLIC_SUPABASE_URL: \"https://ci-placeholder.supabase.co\"");
    expect(workflow).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY: \"ci-placeholder-not-a-real-api-key\"");
    expect(workflow).not.toContain("vercel deploy");
    expect(workflow).not.toContain("supabase db push");
  });
});
