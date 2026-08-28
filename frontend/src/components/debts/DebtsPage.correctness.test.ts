import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("DebtsPage financial semantics and recoverable readiness (DEBTS-CORRECTNESS-1)", () => {
  const source = readFileSync(path.resolve(__dirname, "DebtsPage.tsx"), "utf8");
  const normalized = source.replace(/\s+/g, " ");

  it("bounds every critical read and retries an initial failure", () => {
    expect(source).toContain("DEBTS_LOAD_TIMEOUT_MS = 10_000");
    expect(source).toContain("DEBTS_INITIAL_RETRY_MS = 750");
    expect(source).toContain("withDebtsLoadTimeout(getDebts()");
    expect(source).toContain("withDebtsLoadTimeout(getWallets()");
    expect(source).toContain("getTransactionsInRange(startDate, endDate)");
    expect(source).toContain("const ok = await runReload()");
    expect(source).toContain("DEBTS_INITIAL_RETRY_MS");
  });

  it("uses local rolling date keys rather than UTC ISO slicing", () => {
    expect(source).toContain("function toLocalDateKey(date: Date)");
    expect(source).toContain("function getRolling12MonthRange(now = new Date())");
    expect(source).not.toContain("new Date(now.getFullYear() - 1, now.getMonth(), 1)");
    expect(source).not.toContain(".toISOString().slice(0, 10)");
  });

  it("keeps last-known-good finance state on refresh failure", () => {
    const start = source.indexOf("const reloadData = useCallback");
    const end = source.indexOf("const runReload = useCallback", start);
    const region = source.slice(start, end);
    const catchStart = region.indexOf("} catch (error) {");
    const catchRegion = region.slice(catchStart);
    expect(catchRegion).toContain("hasLoadedDebtsDataRef.current");
    expect(catchRegion).toContain("setIsDebtsDataReady(true)");
    expect(catchRegion).not.toContain("setDebts([])");
    expect(catchRegion).not.toContain("setTotalAssets(0)");
    expect(catchRegion).not.toContain("setAnnualIncome(0)");
  });

  it("prevents overlapping reloads and keeps one trailing refresh", () => {
    expect(source).toContain("isReloadingRef.current");
    expect(source).toContain("hasPendingReloadRef.current = true");
    expect(source).toContain("do {");
    expect(source).toContain("while (hasPendingReloadRef.current)");
  });

  it("recovers when the app returns to foreground or online", () => {
    expect(source).toContain('document.addEventListener("visibilitychange"');
    expect(source).toContain('window.addEventListener("online"');
    expect(source).toContain('document.visibilityState === "visible"');
  });

  it("subscribes every dataset that affects debt analytics", () => {
    expect(normalized).toContain('useRealtimeTable( ["debts", "wallets", "transactions"], async () => { await runReload(); }, )');
  });

  it("gates first-viewport KPI values until a successful snapshot exists", () => {
    expect(source).toContain("isDebtsDataReady");
    expect((source.match(/isLoading={!isDebtsDataReady}/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(source).toContain("Tiến độ trả nợ");
    expect(source).toContain("animate-pulse");
  });

  it("preserves full Debt metadata when editing amount/name fields", () => {
    expect(source).toContain("const editingDebtRef = useRef<Debt | null>(null)");
    expect(source).toContain("editingDebtRef.current = debt");
    expect(source).toContain("...(existingDebt ?? {})");
  });

  it("guards create/update against rapid double submit", () => {
    expect(source).toContain("if (saveInFlightRef.current) return");
    expect(source).toContain("saveInFlightRef.current = true");
    expect(source).toContain("saveInFlightRef.current = false");
    expect(source).toContain("disabled={isSaving}");
  });

  it("guards delete confirmation against duplicate execution", () => {
    expect(source).toContain("if (deleteInFlightRef.current) return");
    expect(source).toContain("deleteInFlightRef.current = true");
    expect(source).toContain("deleteInFlightRef.current = false");
  });

  it("implements Avalanche by highest interest rate, not remaining-balance ratio", () => {
    const start = source.indexOf("const avalancheOrder = useMemo");
    const end = source.indexOf("// ── PRESERVED: CRUD", start);
    const region = source.slice(start, end);
    expect(region).toContain("a.interestRate");
    expect(region).toContain("b.interestRate");
    expect(region).toContain("return rateB - rateA");
    expect(region).not.toContain("remainingAmount / a.totalAmount");
    expect(source).toContain("Ưu tiên lãi suất cao nhất");
  });

  it("uses debt-service-to-income semantics from minimum payments", () => {
    expect(source).toContain("monthlyDebtService");
    expect(source).toContain("debt.minimumPayment");
    expect(source).toContain("(monthlyDebtService * 12) / annualIncome");
    expect(source).toContain("Trả nợ / Thu nhập");
    expect(source).not.toContain("const debtToIncome =");
  });

  it("clamps malformed repayment progress into the 0..100 domain", () => {
    expect(source).toContain("Math.max(0, Math.min(100");
    expect(source).toContain("Math.max(0, Math.min(d.totalAmount");
  });

  it("does not mislabel deterministic rules as AI or repayment progress as health", () => {
    expect(source).toContain("Gợi ý trả nợ");
    expect(source).not.toContain("AI Debt Coach");
    expect(source).not.toContain("Debt Health");
    expect(source).toContain("repaymentProgress");
  });
});
