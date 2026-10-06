import { describe, expect, it } from "vitest";
import type { ActionableFinanceAlert } from "@/src/lib/notifications/actionableFinanceAlerts";
import { buildFinanceActionCenter } from "./financeActionCenter";

function alert(
  id: string,
  kind: ActionableFinanceAlert["kind"],
  priority: ActionableFinanceAlert["priority"],
): ActionableFinanceAlert {
  return {
    id,
    kind,
    priority,
    title: id,
    body: `${id} body`,
    href: `/${kind}`,
    tone: priority === "info" ? "info" : "warning",
    actionLabel: "Xử lý",
  };
}

describe("FINANCE-ACTION-CENTER-1 selector", () => {
  it("shows work to do only — informational notifications never consume an Action Center slot", () => {
    const model = buildFinanceActionCenter([
      alert("goal-info", "goal", "info"),
      alert("review", "transaction-review", "action"),
    ]);

    expect(model.items.map((item) => item.id)).toEqual(["review"]);
    expect(model.actionRequiredCount).toBe(1);
    expect(model.hiddenCount).toBe(0);
  });

  it("ranks urgent before action while preserving stable input order inside one priority", () => {
    const model = buildFinanceActionCenter([
      alert("recurring", "recurring-due", "action"),
      alert("budget-1", "budget", "urgent"),
      alert("review", "transaction-review", "urgent"),
    ]);

    expect(model.items.map((item) => item.id)).toEqual([
      "budget-1",
      "review",
      "recurring",
    ]);
  });

  it("prefers domain diversity before filling extra slots from the same kind", () => {
    const model = buildFinanceActionCenter([
      alert("budget-1", "budget", "urgent"),
      alert("budget-2", "budget", "urgent"),
      alert("review", "transaction-review", "action"),
      alert("recurring", "recurring-due", "action"),
    ]);

    expect(model.items.map((item) => item.id)).toEqual([
      "budget-1",
      "review",
      "recurring",
    ]);
    expect(model.actionRequiredCount).toBe(4);
    expect(model.hiddenCount).toBe(1);
  });

  it("fills remaining capacity with same-kind alerts when no other domain needs work", () => {
    const model = buildFinanceActionCenter([
      alert("budget-1", "budget", "urgent"),
      alert("budget-2", "budget", "urgent"),
      alert("budget-3", "budget", "action"),
    ]);

    expect(model.items.map((item) => item.id)).toEqual([
      "budget-1",
      "budget-2",
      "budget-3",
    ]);
  });

  it("caps the Dashboard at three actions by default and never mutates the source array", () => {
    const source = [
      alert("a", "budget", "urgent"),
      alert("b", "transaction-review", "action"),
      alert("c", "recurring-config", "action"),
      alert("d", "debt", "action"),
    ];
    const before = source.map((item) => item.id);

    const model = buildFinanceActionCenter(source);

    expect(model.items).toHaveLength(3);
    expect(model.hiddenCount).toBe(1);
    expect(source.map((item) => item.id)).toEqual(before);
  });

  it("supports an explicit zero cap without claiming the underlying work disappeared", () => {
    const model = buildFinanceActionCenter(
      [alert("review", "transaction-review", "urgent")],
      0,
    );

    expect(model.items).toEqual([]);
    expect(model.actionRequiredCount).toBe(1);
    expect(model.hiddenCount).toBe(1);
  });
});