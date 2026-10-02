import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "TransactionsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("TRANSACTION-RULES-1-UX-POLISH", () => {
  const formStart = source.indexOf('id="transaction-form"');
  const formEnd = source.indexOf("<SaveError", formStart);
  const formSource = source.slice(formStart, formEnd);

  it("puts wallet and note before the rule suggestion, then category after the suggestion for Thu/Chi", () => {
    const walletIndex = formSource.indexOf('label="Ví tiền"');
    const noteIndex = formSource.indexOf('label="Ghi chú"');
    const suggestionIndex = formSource.indexOf(
      'data-transaction-rule-suggestion="true"',
    );
    const categoryIndex = formSource.indexOf('label="Danh mục"');

    expect(walletIndex).toBeGreaterThan(-1);
    expect(noteIndex).toBeGreaterThan(walletIndex);
    expect(suggestionIndex).toBeGreaterThan(noteIndex);
    expect(categoryIndex).toBeGreaterThan(suggestionIndex);
  });

  it("keeps the category selector out of the pre-suggestion data-entry grid", () => {
    const gridStart = formSource.indexOf(
      '<div className="grid gap-2 md:grid-cols-2">',
    );
    const gridEnd = formSource.indexOf(
      "{activeRuleSuggestion ? (",
      gridStart,
    );
    const preSuggestionGrid = formSource.slice(gridStart, gridEnd);

    expect(preSuggestionGrid).toContain('label="Ví tiền"');
    expect(preSuggestionGrid).toContain('label="Ghi chú"');
    expect(preSuggestionGrid).not.toContain('label="Danh mục"');
  });

  it("keeps manual rule application explicit rather than auto-mutating the form", () => {
    expect(formSource).toContain("Gợi ý từ quy tắc");
    expect(formSource).toContain("Áp dụng gợi ý");
    expect(formSource).toContain("onClick={applyActiveRuleSuggestion}");
  });

  it("preserves transfer flow and does not introduce transaction rules for transfer", () => {
    expect(formSource).toContain('label="Ví nguồn"');
    expect(formSource).toContain('label="Ví đích"');
    expect(source).toContain('if (form.formMode === "transfer") return null;');
  });

  it("keeps category selection before wallet preview so the financial preview stays downstream", () => {
    const categoryIndex = formSource.indexOf('label="Danh mục"');
    const walletPreviewIndex = formSource.indexOf("{/* Wallet preview */}");
    expect(categoryIndex).toBeGreaterThan(-1);
    expect(walletPreviewIndex).toBeGreaterThan(categoryIndex);
  });
});
