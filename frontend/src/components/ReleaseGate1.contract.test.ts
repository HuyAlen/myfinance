import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../..");
const packageJson = JSON.parse(
  readFileSync(path.join(frontendRoot, "package.json"), "utf8"),
) as {
  scripts: Record<string, string>;
};
const gate = readFileSync(
  path.join(frontendRoot, "scripts/release-gate.mjs"),
  "utf8",
).replace(/\r\n/g, "\n");
const mjsRunner = readFileSync(
  path.join(frontendRoot, "scripts/run-mjs-contracts.mjs"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("MYFINANCE-RELEASE-GATE-1 — P1", () => {
  it("exposes one canonical release gate plus explicit typecheck and contract scripts", () => {
    expect(packageJson.scripts.typecheck).toBe("tsc --noEmit");
    expect(packageJson.scripts["test:contracts"]).toBe(
      "node scripts/run-mjs-contracts.mjs",
    );
    expect(packageJson.scripts["release:gate"]).toBe(
      "node scripts/release-gate.mjs",
    );
  });

  it("runs env preflight, diff checks, typecheck, lint, all Vitest tests, MJS contracts and Next build", () => {
    expect(gate).toContain('run("git", ["diff", "--check"])');
    expect(gate).toContain('"Environment preflight"');
    expect(gate).toContain('"scripts/validate-env.mjs"');
    expect(gate.indexOf('"Environment preflight"')).toBeLessThan(
      gate.indexOf('"TypeScript"'),
    );
    expect(gate).toContain('"node_modules/typescript/bin/tsc"');
    expect(gate).toContain('"node_modules/eslint/bin/eslint.js"');
    expect(gate).toContain('"node_modules/vitest/vitest.mjs"');
    expect(gate).toContain("runMjsContracts()");
    expect(gate).toContain('"node_modules/next/dist/bin/next"');
    expect(gate).toContain('[release-gate] PASS');
  });

  it("does not depend on npx.cmd or npm.cmd process spawning on Windows", () => {
    expect(gate).not.toContain("npx.cmd");
    expect(gate).not.toContain("npm.cmd");
    expect(gate).toContain("process.execPath");
    expect(mjsRunner).toContain("process.execPath");
  });

  it("enumerates every standalone MJS regression contract exactly once", () => {
    const contracts = [
      "BudgetsPage.allocationColumnMajor.contract.test.mjs",
      "BudgetsPage.allocationSort.contract.test.mjs",
      "BudgetsPage.spendSort.contract.test.mjs",
      "CategoriesPage.groupSort.contract.test.mjs",
      "InvestmentsPage.exnessBalance.contract.test.mjs",
      "InvestmentsPage.uiPolish2.contract.test.mjs",
      "Sidebar.scrollRetention.contract.test.mjs",
      "WalletsPage.balanceSort.contract.test.mjs",
    ];

    for (const file of contracts) {
      expect(mjsRunner.split(file).length - 1).toBe(1);
    }
    expect(mjsRunner).toContain("MJS_CONTRACTS.length");
  });

  it("fails fast whenever a child process errors or returns a non-zero exit code", () => {
    expect(gate).toContain("if (result.error)");
    expect(gate).toContain("if (result.status !== 0)");
    expect(mjsRunner).toContain("if (result.error)");
    expect(mjsRunner).toContain("if (result.status !== 0)");
  });
});