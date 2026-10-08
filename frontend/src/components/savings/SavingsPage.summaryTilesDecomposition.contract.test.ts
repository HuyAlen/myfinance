import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  path.resolve(__dirname, "SavingsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const summaryTiles = readFileSync(
  path.resolve(__dirname, "SavingsPageSummaryTiles.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("CLIENT-PAGE-DECOMPOSITION-1 Savings summary tiles", () => {
  it("keeps the page wired to extracted presentational summary components", () => {
    expect(page).toContain(
      'from "@/src/components/savings/SavingsPageSummaryTiles";',
    );
    expect(page).toContain("<HeroMetric");
    expect(page).toContain("<SavingsInfoTile");
    expect(page).not.toContain("function HeroMetric(");
    expect(page).not.toContain("function SavingsInfoTile(");
  });

  it("keeps the extracted presentation module pure and hook-free", () => {
    expect(summaryTiles).toContain("export function HeroMetric(");
    expect(summaryTiles).toContain("export function SavingsInfoTile(");
    expect(summaryTiles).not.toContain('"use client"');
    expect(summaryTiles).not.toMatch(/\buse(State|Effect|Memo|Callback|Ref)\b/);
    expect(summaryTiles).not.toContain("financeStorage");
    expect(summaryTiles).not.toContain("supabase.");
  });

  it("preserves the canonical summary tile visual contracts", () => {
    expect(summaryTiles).toContain(
      "rounded-2xl border border-[#E3EAF1] bg-[#F8FBFE] p-3",
    );
    expect(summaryTiles).toContain(
      "min-w-0 rounded-xl border border-[#E8EEF4] bg-[#F8FBFE]",
    );
  });
});