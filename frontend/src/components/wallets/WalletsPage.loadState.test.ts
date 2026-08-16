import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FINANCE-DATA-1B — Consumer Failure-State Correctness.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md). Whitespace is normalized before matching
 * multi-line JSX conditionals since this repo's files are CRLF.
 *
 * Proves an INITIAL load failure on WalletsPage cannot render as "Chưa có
 * ví tiền nào" (a validated, successful-empty conclusion). The page must
 * distinguish loading / failure / legitimate-empty instead of collapsing
 * them all into one empty-state block.
 */
describe("WalletsPage distinguishes load failure from legitimate empty (FINANCE-DATA-1B)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "WalletsPage.tsx"),
    "utf8",
  );
  const normalized = source.replace(/\s+/g, " ");

  it("declares isLoadingWallets and walletsLoadError state", () => {
    expect(source).toContain("useState(true)");
    expect(source).toContain("isLoadingWallets");
    expect(source).toContain("walletsLoadError");
  });

  it("reloadData clears the error on success and sets a message on failure, without touching wallet state", () => {
    const start = source.indexOf("const reloadData = useCallback(async () => {");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("}, []);", start);
    expect(end).toBeGreaterThan(start);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("setWalletsLoadError(null)");
    const catchIdx = fnSource.indexOf("} catch (error) {");
    expect(catchIdx).toBeGreaterThan(-1);
    const catchSource = fnSource.slice(catchIdx);
    expect(catchSource).toContain("setWalletsLoadError(");
    // The catch branch must never reset the wallets array itself.
    expect(catchSource).not.toContain("setWallets([])");
    expect(catchSource).toContain("setIsLoadingWallets(false)");
  });

  it("splits the empty-state block into loading / error / legitimate-empty conditionals", () => {
    expect(normalized).toContain(
      "{spendableWallets.length === 0 && isLoadingWallets && (",
    );
    expect(normalized).toContain(
      "{spendableWallets.length === 0 && !isLoadingWallets && walletsLoadError && (",
    );
    expect(normalized).toContain(
      "{spendableWallets.length === 0 && !isLoadingWallets && !walletsLoadError && (",
    );
  });

  it("the legitimate-empty branch still shows the original create-wallet CTA copy", () => {
    expect(source).toContain("Chưa có ví tiền nào");
  });
});
