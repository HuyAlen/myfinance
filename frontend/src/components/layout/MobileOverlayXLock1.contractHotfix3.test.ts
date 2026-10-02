import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "../../lib/auditUiIphone.contract.test.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("MOBILE-OVERLAY-X-LOCK-1 contract hotfix v3", () => {
  it("does not use a trailing word boundary after the literal ] in z-[80]", () => {
    expect(source).toContain(
      'toMatch(/fixed\\s+inset-0[^"]*z-\\[80\\]/)',
    );
    expect(source).not.toContain(
      'z-\\[80\\]\\b',
    );
  });
});
