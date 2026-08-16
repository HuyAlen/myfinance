import { describe, expect, it } from "vitest";
import { matchesSearchQuery, normalizeSearchText } from "./transactionSearch";

/**
 * TXN-UX-1 — Vietnamese Diacritic-Insensitive Search (F-9).
 *
 * Real behavioral unit tests. Before this fix, Transactions search was
 * case-insensitive but not accent-insensitive — a plain-ASCII query like
 * "rut tien" never matched "Rút tiền mặt tại ATM", even though a
 * diacritic-stripping helper (normalizeTransactionNote) already existed
 * elsewhere in the codebase for an unrelated purpose (transfer/saving note
 * classification). This module provides an independent, search-specific
 * normalization so a future change to classification's normalization
 * never silently changes search behavior, or vice versa.
 */

describe("normalizeSearchText", () => {
  it("lowercases and strips Vietnamese diacritics", () => {
    expect(normalizeSearchText("Rút Tiền")).toBe("rut tien");
    expect(normalizeSearchText("Chuyển tiền học phí")).toBe(
      "chuyen tien hoc phi",
    );
    expect(normalizeSearchText("Tài khoản lương")).toBe("tai khoan luong");
    expect(normalizeSearchText("Tiền điện")).toBe("tien dien");
  });

  it('handles Vietnamese "đ"/"Đ" specifically — combining-mark stripping alone is not enough', () => {
    // "đ" (U+0111) has no NFD decomposition into a base letter + combining
    // mark — it must be explicitly mapped to "d".
    expect(normalizeSearchText("Đầu tư")).toBe("dau tu");
    expect(normalizeSearchText("đầu tư định kỳ")).toBe("dau tu dinh ky");
  });

  it("collapses internal whitespace and trims", () => {
    expect(normalizeSearchText("CHUYỂN   TIỀN")).toBe("chuyen tien");
    expect(normalizeSearchText("  rút tiền  ")).toBe("rut tien");
  });

  it("leaves already-plain ASCII text (numbers, dates) unaffected", () => {
    expect(normalizeSearchText("100000")).toBe("100000");
    expect(normalizeSearchText("2026-08-16")).toBe("2026-08-16");
  });

  it("empty/whitespace-only input normalizes to an empty string", () => {
    expect(normalizeSearchText("")).toBe("");
    expect(normalizeSearchText("   ")).toBe("");
  });
});

describe("matchesSearchQuery — F-9 mandatory matrix", () => {
  it('"Rút tiền mặt tại ATM" matches query "rut tien"', () => {
    expect(matchesSearchQuery("Rút tiền mặt tại ATM", "rut tien")).toBe(true);
  });

  it('"Chuyển tiền học phí" matches query "chuyen tien"', () => {
    expect(matchesSearchQuery("Chuyển tiền học phí", "chuyen tien")).toBe(
      true,
    );
  });

  it('"Đầu tư định kỳ" matches query "dau tu"', () => {
    expect(matchesSearchQuery("Đầu tư định kỳ", "dau tu")).toBe(true);
  });

  it('"Tài khoản lương" matches query "tai khoan"', () => {
    expect(matchesSearchQuery("Tài khoản lương", "tai khoan")).toBe(true);
  });

  it('"Chuyển khoản" matches query "chuyen khoan"', () => {
    expect(matchesSearchQuery("Chuyển khoản", "chuyen khoan")).toBe(true);
  });

  it('"Tiền điện" matches query "tien dien"', () => {
    expect(matchesSearchQuery("Tiền điện", "tien dien")).toBe(true);
  });

  it("matching still works when the SAME text keeps its original accents in the query too", () => {
    expect(matchesSearchQuery("Rút tiền mặt tại ATM", "Rút tiền")).toBe(true);
  });

  it("case differences are ignored on both sides", () => {
    expect(matchesSearchQuery("rút tiền mặt", "RÚT TIỀN")).toBe(true);
    expect(matchesSearchQuery("RÚT TIỀN MẶT", "rút tiền")).toBe(true);
  });

  it("accents on the query vs accents on the source both work independently", () => {
    expect(matchesSearchQuery("Chuyển tiền", "chuyển tiền")).toBe(true); // both accented
    expect(matchesSearchQuery("Chuyển tiền", "chuyen tien")).toBe(true); // both plain
    expect(matchesSearchQuery("chuyen tien", "Chuyển tiền")).toBe(true); // source plain, query accented
  });

  it("an unrelated query does not match", () => {
    expect(matchesSearchQuery("Rút tiền mặt tại ATM", "xyz")).toBe(false);
  });

  it("empty query applies no search restriction (everything matches)", () => {
    expect(matchesSearchQuery("Rút tiền mặt tại ATM", "")).toBe(true);
    expect(matchesSearchQuery("anything at all", "   ")).toBe(true);
  });

  it("preserves numeric/date matching (additive, not destructive)", () => {
    expect(matchesSearchQuery("100000", "100000")).toBe(true);
    expect(matchesSearchQuery("1.000.000 đ", "1.000.000")).toBe(true);
    expect(matchesSearchQuery("2026-08-16", "2026-08-16")).toBe(true);
  });
});
