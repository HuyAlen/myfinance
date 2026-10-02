import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "SavingsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("SAVINGS-EDIT-SUMMARY-DEDUPE-1", () => {
  it("does not repeat saving type when it is identical to the status badge", () => {
    expect(source).toContain(
      "getSavingTypeLabel(selectedSaving.type) !==\n                      getSavingStatus(selectedSaving).label",
    );
    expect(source).toContain(
      "{getSavingTypeLabel(selectedSaving.type)}",
    );
  });

  it("keeps the status badge as the primary summary signal", () => {
    expect(source).toContain(
      "{getSavingStatus(selectedSaving).label}",
    );
    expect(source).toContain(
      "${getSavingStatus(selectedSaving).className}",
    );
  });
});
