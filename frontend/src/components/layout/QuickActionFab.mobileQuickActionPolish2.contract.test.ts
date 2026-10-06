import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(path.resolve(__dirname, relativePath), "utf8").replace(/\r\n/g, "\n");

const fab = read("QuickActionFab.tsx");
const transactions = read("../transactions/TransactionsPage.tsx");
const quickActionIntent = read("../../lib/navigation/quickActionIntent.ts");

describe("MOBILE-QUICK-ACTION-POLISH-2", () => {
  it("keeps Quick Action focused on transaction work: add transaction plus direct transfer", () => {
    expect(fab).toContain('id: "transaction",');
    expect(fab).toContain('label: "Th\u00eam giao d\u1ecbch",');
    expect(fab).toContain('id: "transfer",');
    expect(fab).toContain('label: "Chuyển tiền",');
    expect(fab).toContain('buildQuickActionCreateHref("/transactions", "transfer")');
    expect(fab).not.toContain('id: "open-wallets",');
    expect(fab).not.toContain('label: "M\u1edf V\u00ed Ti\u1ec1n",');
  });

  it("keeps lower-frequency create actions defined but hidden", () => {
    const start = fab.indexOf(
      "const QUICK_ACTION_VISIBILITY: Record<string, boolean> = {",
    );
    const end = fab.indexOf("};", start);
    const visibility = fab.slice(start, end);

    expect(visibility).toContain("transaction: true");
    expect(visibility).toContain("transfer: true");
    expect(visibility).toContain("wallet: false");
    expect(visibility).toContain("goal: false");
    expect(visibility).toContain("budget: false");
  });

  it("uses a one-shot typed Quick Action mode and removes it after consumption", () => {
    expect(quickActionIntent).toContain(
      'export const QUICK_ACTION_MODE_PARAM = "quickActionMode";',
    );
    expect(quickActionIntent).toContain(
      'export type QuickActionCreateMode = "transfer";',
    );
    expect(quickActionIntent).toContain("mode?: QuickActionCreateMode");
    expect(quickActionIntent).toContain('modeParam === "transfer" ? "transfer" : undefined');
    expect(quickActionIntent).toContain("onCreateRef.current(createMode);");
    expect(quickActionIntent).toContain("nextParams.delete(QUICK_ACTION_MODE_PARAM);");
  });

  it("opens the canonical transaction modal directly in transfer mode while preserving capture-speed defaults", () => {
    expect(transactions).toContain(
      "function openCreateFormWithMode(defaultMode: TransactionFormMode)",
    );

    const createStart = transactions.indexOf(
      "function openCreateFormWithMode(defaultMode: TransactionFormMode)",
    );
    const createEnd = transactions.indexOf(
      "function openCreateForm()",
      createStart,
    );
    expect(createStart).toBeGreaterThan(-1);
    expect(createEnd).toBeGreaterThan(createStart);

    const createRegion = transactions.slice(createStart, createEnd);
    expect(createRegion).toContain(
      "resolveCreateCaptureDefaults(defaultMode)",
    );
    expect(createRegion).toContain("formMode: defaultMode");
    expect(createRegion).toContain(
      "type: getTransactionTypeFromFormMode(defaultMode)",
    );
    expect(createRegion).toContain(
      "transferToWalletId: defaults.transferToWalletId",
    );

    expect(transactions).toContain(
      'openCreateFormWithMode(mode === "transfer" ? "transfer" : "expense");',
    );
    expect(transactions).toContain(
      "useQuickActionCreateIntent(openQuickActionCreateForm);",
    );
  });

  it("uses the real visual viewport for mobile panel bounds", () => {
    expect(fab).toContain("const visualViewport = window.visualViewport;");
    expect(fab).toContain("visualViewport?.width ?? window.innerWidth");
    expect(fab).toContain("visualViewport?.height ?? window.innerHeight");
  });

  it("repositions the open panel when Safari toolbar geometry changes and coalesces events with rAF", () => {
    expect(fab).toContain('visualViewport?.addEventListener("resize", scheduleReposition)');
    expect(fab).toContain('visualViewport?.addEventListener("scroll", scheduleReposition)');
    expect(fab).toContain("window.requestAnimationFrame(() => {");
    expect(fab).toContain('visualViewport?.removeEventListener("resize", scheduleReposition)');
    expect(fab).toContain('visualViewport?.removeEventListener("scroll", scheduleReposition)');
  });

  it("adds mobile press feedback and visible keyboard focus without allowing label truncation", () => {
    const start = fab.indexOf("function renderMobileActionPanel(");
    const end = fab.indexOf("\n  }", start);
    const panel = fab.slice(start, end);

    expect(panel).toContain("touch-manipulation");
    expect(panel).toContain("active:scale-[0.98]");
    expect(panel).toContain("focus-visible:ring-2");
    expect(panel).toContain("whitespace-nowrap");
    expect(panel).not.toContain("truncate");
  });

  it("supports Escape dismissal, returns focus to the FAB, and exposes expanded state", () => {
    expect(fab).toContain('event.key !== "Escape"');
    expect(fab).toContain("fabButtonRef.current?.focus({ preventScroll: true });");
    expect(fab).toContain("aria-expanded={isQuickActionOpen}");
    expect(fab).toContain('querySelector<HTMLButtonElement>("button")');
  });
});