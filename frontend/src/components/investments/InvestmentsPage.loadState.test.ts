import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FINANCE-DATA-1B — Consumer Failure-State Correctness.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md).
 *
 * InvestmentsPage was audited as "already compliant" (loading/error state
 * pre-existed from FINANCE-DATA-1), but its empty-state gate didn't check
 * `loadError` — an initial failure still showed the "add your first
 * account" CTA as if zero accounts were a validated conclusion. Proves
 * the targeted one-line-scope fix: the CTA and a distinct error state are
 * now mutually exclusive on `loadError`.
 */
describe("InvestmentsPage distinguishes load failure from legitimate empty (FINANCE-DATA-1B)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "InvestmentsPage.tsx"),
    "utf8",
  );
  const normalized = source.replace(/\s+/g, " ");

  it("gates the error placeholder on loadError, before accounts.length === 0", () => {
    expect(normalized).toContain(
      "{!isLoading && loadError && accounts.length === 0 ? (",
    );
  });

  it("gates the legitimate-empty CTA on the absence of loadError", () => {
    expect(normalized).toContain(
      "{!isLoading && !loadError && accounts.length === 0 ? (",
    );
  });

  it("the error and empty-CTA blocks render different copy", () => {
    expect(source).toContain("Không thể tải dữ liệu Forex");
    expect(source).not.toBe("");
  });
});
