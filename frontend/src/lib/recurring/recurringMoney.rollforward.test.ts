import { describe, expect, it } from "vitest";
import {
  buildRecurringMoneySchedules,
  resolveEffectiveNextRunDate,
  toRecurringScheduleInputs,
} from "./recurringMoney";
import type { Category, Wallet } from "@/src/types/finance";

describe("RECURRING-NEXT-RUN-ROLLFORWARD-1", () => {
  it("rolls a stale monthly schedule forward to the next real occurrence", () => {
    expect(resolveEffectiveNextRunDate("2026-08-05", "monthly", "2026-10-02")).toBe("2026-10-05");
    expect(resolveEffectiveNextRunDate("2026-08-05", "monthly", "2026-10-06")).toBe("2026-11-05");
  });

  it("preserves the original monthly anchor day across short months", () => {
    expect(resolveEffectiveNextRunDate("2026-01-31", "monthly", "2026-02-01")).toBe("2026-02-28");
    expect(resolveEffectiveNextRunDate("2026-01-31", "monthly", "2026-03-01")).toBe("2026-03-31");
    expect(resolveEffectiveNextRunDate("2028-01-31", "monthly", "2028-02-01")).toBe("2028-02-29");
  });

  it("preserves leap-day yearly anchoring without UTC date drift", () => {
    expect(resolveEffectiveNextRunDate("2024-02-29", "yearly", "2025-02-01")).toBe("2025-02-28");
    expect(resolveEffectiveNextRunDate("2024-02-29", "yearly", "2025-03-01")).toBe("2026-02-28");
    expect(resolveEffectiveNextRunDate("2024-02-29", "yearly", "2028-02-01")).toBe("2028-02-29");
  });

  it("rolls daily and weekly schedules directly to the first date on/after reference", () => {
    expect(resolveEffectiveNextRunDate("2026-09-28", "daily", "2026-10-02")).toBe("2026-10-02");
    expect(resolveEffectiveNextRunDate("2026-09-18", "weekly", "2026-10-02")).toBe("2026-10-02");
    expect(resolveEffectiveNextRunDate("2026-09-18", "weekly", "2026-10-03")).toBe("2026-10-09");
  });

  it("rejects invalid calendar anchors/reference dates rather than JS-normalizing them", () => {
    expect(resolveEffectiveNextRunDate("2026-02-31", "monthly", "2026-10-02")).toBeUndefined();
    expect(resolveEffectiveNextRunDate("2026-08-05", "monthly", "2026-13-02")).toBeUndefined();
  });

  it("keeps stored anchor immutable but exposes a rolled effective date for UI/sorting/forecast", () => {
    const wallets: Wallet[] = [
      { id: "bank", name: "Ngân hàng", type: "bank", balance: 10_000_000 },
    ];
    const categories: Category[] = [
      {
        id: "rent",
        name: "Nhà ở",
        type: "expense",
        planningGroup: "fixed",
        isRecurring: true,
        recurrence: "monthly",
        defaultAmount: 6_500_000,
        defaultWalletId: "bank",
        nextRunDate: "2026-08-05",
      },
    ];

    const schedules = buildRecurringMoneySchedules({
      categories,
      transactions: [],
      wallets,
      referenceDate: "2026-10-02",
    });

    expect(schedules).toHaveLength(1);
    expect(schedules[0].nextRunDate).toBe("2026-08-05");
    expect(schedules[0].effectiveNextRunDate).toBe("2026-10-05");
    expect(toRecurringScheduleInputs(schedules)[0].nextRunDate).toBe("2026-10-05");
  });

  it("sorts recurring cards by rolled effective next date, not stale stored anchor", () => {
    const wallets: Wallet[] = [
      { id: "bank", name: "Ngân hàng", type: "bank", balance: 10_000_000 },
    ];
    const categories: Category[] = [
      {
        id: "late",
        name: "Late",
        type: "expense",
        isRecurring: true,
        recurrence: "monthly",
        defaultAmount: 100,
        defaultWalletId: "bank",
        nextRunDate: "2026-08-20",
      },
      {
        id: "early",
        name: "Early",
        type: "expense",
        isRecurring: true,
        recurrence: "monthly",
        defaultAmount: 100,
        defaultWalletId: "bank",
        nextRunDate: "2026-09-05",
      },
    ];

    const schedules = buildRecurringMoneySchedules({
      categories,
      transactions: [],
      wallets,
      referenceDate: "2026-10-02",
    });

    expect(schedules.map((item) => item.sourceId)).toEqual(["early", "late"]);
    expect(schedules.map((item) => item.effectiveNextRunDate)).toEqual([
      "2026-10-05",
      "2026-10-20",
    ]);
  });
});
