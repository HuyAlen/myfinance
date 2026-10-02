import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const testSource = readFileSync(
  path.resolve(__dirname, "ActivityUiPolish1.hotfix3.contract.test.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("ACTIVITY-UI-POLISH-1 hotfix v4", () => {
  it("does not prepend frontend twice when resolving Activity files", () => {
    expect(testSource).toContain(
      'path.join(root, "src/components/activity/ActivityPage.tsx")',
    );
    expect(testSource).toContain(
      'path.join(root, "src/lib/auditUiIphone.contract.test.ts")',
    );
    expect(testSource).toContain(
      'path.join(root, "src/lib/auditUiCompactHierarchy.contract.test.ts")',
    );
    expect(testSource).toContain(
      'path.join(root, "src/lib/auditUiHighVolume.contract.test.ts")',
    );
    expect(testSource).not.toContain(
      'path.join(root, "frontend/src/',
    );
  });
});
