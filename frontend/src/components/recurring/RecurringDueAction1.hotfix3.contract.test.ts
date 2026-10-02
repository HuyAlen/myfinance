import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const read = (relativePath: string) =>
  readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

describe("RECURRING-DUE-ACTION-1 hotfix v3", () => {
  it("keeps the recurring-due alert kind syntactically valid", () => {
    const alerts = read("src/lib/notifications/actionableFinanceAlerts.ts");
    expect(alerts).toContain('| "recurring-config"\n  | "recurring-due"');
    expect(alerts).not.toContain('`n');
  });

  it("uses a supported ConfirmDialog variant for explicit realization", () => {
    const page = read("src/components/recurring/RecurringMoneyPage.tsx");
    expect(page).toContain(
      'variant: schedule.type === "expense" ? "danger" : "info"',
    );
    expect(page).not.toContain(
      'variant: schedule.type === "expense" ? "danger" : "default"',
    );
  });

  it("preserves explicit-only transaction creation", () => {
    const page = read("src/components/recurring/RecurringMoneyPage.tsx");
    const handlerStart = page.indexOf("function requestRecordDueTransaction");
    const clearStart = page.indexOf("function requestClear", handlerStart);
    const handler = page.slice(handlerStart, clearStart);

    expect(handlerStart).toBeGreaterThan(-1);
    expect(handler).toContain('if (dueAction.status !== "due-today") return;');
    expect(handler).toContain('confirmText: "Ghi giao dịch"');
    expect(handler).toContain("await addTransaction(transaction)");
  });
});
