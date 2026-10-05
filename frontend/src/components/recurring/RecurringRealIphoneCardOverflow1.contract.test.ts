import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "RecurringMoneyPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("RECURRING-REAL-IPHONE-CARD-OVERFLOW-1", () => {
  it("lets the card header reflow instead of pushing the amount outside the phone viewport", () => {
    expect(source).toContain(
      'className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3"',
    );
    expect(source).toContain("max-w-full break-words text-left");
    expect(source).toContain("sm:shrink-0 sm:text-right");
  });

  it("stacks the due action on compact screens and keeps its button inside the card", () => {
    expect(source).toContain(
      '"mt-3 flex min-w-0 flex-col items-stretch gap-2.5 rounded-2xl border px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 " +',
    );
    expect(source).toContain("min-h-10 w-full min-w-0 rounded-xl bg-amber-600");
    expect(source).toContain("sm:w-auto sm:shrink-0");
  });

  it("uses a two-column mobile action footer with delete spanning the row", () => {
    expect(source).toContain(
      'className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3.5 sm:grid-cols-3"',
    );
    expect(source).toContain("col-span-2 inline-flex min-h-10 min-w-0");
    expect(source).toContain("sm:col-span-1");
  });

  it("keeps the schedule card itself shrinkable inside the page grid", () => {
    expect(source).toContain("min-w-0 rounded-3xl border bg-white");
  });
});