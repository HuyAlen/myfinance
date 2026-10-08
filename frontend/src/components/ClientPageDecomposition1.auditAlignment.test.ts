import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../..");

function read(relativePath: string) {
  return readFileSync(path.join(frontendRoot, relativePath), "utf8").replace(
    /\r\n/g,
    "\n",
  );
}

describe("CLIENT-PAGE-DECOMPOSITION-1 audit ownership alignment", () => {
  it("keeps Vietnamese UI audits aware of the composed Savings surface", () => {
    const ssot = read("src/components/MyFinanceVietnameseUiSsot1.contract.test.ts");
    const surface = read(
      "src/components/MyFinanceVietnameseUiSurfaceAudit1.contract.test.ts",
    );
    const route = read("src/components/VietnameseUiRouteAudit2.contract.test.ts");

    for (const audit of [ssot, surface, route]) {
      expect(audit).toContain("savings/savingsPageSupport.tsx");
      expect(audit).toContain("savings/SavingsPageSummaryTiles.tsx");
    }
  });

  it("keeps local-date ownership in Savings support while the cross-page audit follows that ownership", () => {
    const finalAudit = read(
      "src/services/finance/finalCrossPageAudit.contract.test.ts",
    );
    const savingsSupport = read(
      "src/components/savings/savingsPageSupport.tsx",
    );

    expect(savingsSupport).toContain(
      "const todayInputValue = () => formatLocalISODate();",
    );
    expect(savingsSupport).not.toContain('toISOString().slice(0, 10)');

    expect(finalAudit).toContain(
      "../../components/savings/savingsPageSupport.tsx",
    );
    expect(finalAudit).toContain("expect(savingsSupport).toContain(");
    expect(finalAudit).toContain(
      "for (const savingsSource of [savings, savingsSupport])",
    );
  });
});