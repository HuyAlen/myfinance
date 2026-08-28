import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("SavingsPage realtime + contextual navigation integrity", () => {
  const source = readFileSync(path.resolve(__dirname, "SavingsPage.tsx"), "utf8");

  it("refreshes every mutable dependency of the savings screen through the shared realtime provider", () => {
    expect(source).toContain('useRealtimeTable(');
    expect(source).toContain('"savings", "saving_transactions", "wallets"');
    expect(source).toContain("requestRealtimeRefresh");
    expect(source).toContain("loadWalletsForSavingsEngine()");
    expect(source).toContain("loadSavingsSnapshot()");
  });

  it("coalesces multi-table saving-movement bursts instead of racing duplicate reloads", () => {
    expect(source).toContain("realtimeRefreshTimerRef");
    expect(source).toContain("window.clearTimeout(realtimeRefreshTimerRef.current)");
    expect(source).toContain("window.setTimeout(() => {");
    expect(source).toContain("void Promise.all([");
  });

  it("treats savingId as entity focus and restores the neutral list if filters hide the target", () => {
    expect(source).toContain('parseFocusId(searchParams, "savingId")');
    expect(source).toContain('if (searchTerm || activeFilter !== "all")');
    expect(source).toContain('setSearchTerm("")');
    expect(source).toContain('setActiveFilter("all")');
    expect(source).toContain('document.getElementById(`saving-card-${focusSavingId}`)');
  });

  it("gives each saving card a stable focus target and temporary highlight", () => {
    expect(source).toContain('id={`saving-card-${item.id}`}');
    expect(source).toContain("highlightedSavingId === item.id");
    expect(source).toContain('scrollIntoView({ behavior: "smooth", block: "center" })');
  });
});
