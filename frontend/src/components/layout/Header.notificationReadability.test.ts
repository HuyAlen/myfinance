import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NOTIF-UI-1 — Notification Dropdown Readability & Interaction Polish.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md). Whitespace is normalized before matching
 * multi-line JSX where useful, matching Header.loadState.test.ts's own
 * established convention for this file's CRLF line endings.
 *
 * This is UI polish only — no notification generation/business-logic file
 * is touched, and no query is added/removed. These tests lock in the
 * layout/readability fix (wider desktop popover, larger non-wrapping
 * typography, calmer row spacing/dividers, taller scroll area) and the
 * Escape-to-close addition, without touching buildNotifications' data.
 */
describe("Notification popover responsive width (NOTIF-UI-1)", () => {
  const source = readFileSync(path.resolve(__dirname, "Header.tsx"), "utf8");

  it("desktop width is widened to ~420px, clamped so it can never overflow the viewport", () => {
    const start = source.indexOf(
      'className="fixed inset-x-3 top-16 z-50',
    );
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('">', start);
    const classNameSource = source.slice(start, end);

    expect(classNameSource).toContain(
      "sm:w-[min(420px,calc(100vw-24px))]",
    );
    // The old fixed 320px width must not remain alongside/instead of it.
    expect(classNameSource).not.toContain("sm:w-80");
  });

  it("mobile still anchors via inset-x-3 (viewport width minus a fixed safe margin) — untouched", () => {
    const start = source.indexOf(
      'className="fixed inset-x-3 top-16 z-50',
    );
    const end = source.indexOf('">', start);
    const classNameSource = source.slice(start, end);

    expect(classNameSource).toContain("fixed inset-x-3 top-16");
    expect(classNameSource).toContain("sm:inset-x-auto sm:right-0");
  });

  it("the popover is still anchored right, below the bell, and does not move the Header itself", () => {
    const start = source.indexOf(
      'className="fixed inset-x-3 top-16 z-50',
    );
    const end = source.indexOf('">', start);
    const classNameSource = source.slice(start, end);

    expect(classNameSource).toContain("sm:absolute");
    expect(classNameSource).toContain("sm:top-full sm:mt-2");
  });
});

describe("Notification row typography and spacing (NOTIF-UI-1)", () => {
  const source = readFileSync(path.resolve(__dirname, "Header.tsx"), "utf8");

  it("title is text-sm/font-semibold (up from text-xs/font-bold) so normal titles wrap far less aggressively", () => {
    const start = source.indexOf('"text-sm font-semibold leading-5 "');
    expect(start).toBeGreaterThan(-1);
    expect(source).not.toContain('"text-xs font-bold "');
  });

  it("description uses a larger, less pale size/color (13px, slate-500) than before (11px, slate-400)", () => {
    expect(source).toContain(
      'className="mt-1 text-[13px] leading-5 text-slate-500"',
    );
    expect(source).not.toContain(
      'className="mt-0.5 text-[11px] leading-4 text-slate-400"',
    );
  });

  it("each row keeps comfortable, consistent padding (py-3.5, px-4) and a slightly stronger divider than the near-invisible slate-50 it replaced", () => {
    const rowClassStart = source.indexOf(
      '"flex w-full items-start gap-3 border-b',
    );
    expect(rowClassStart).toBeGreaterThan(-1);
    const rowClassEnd = source.indexOf('" +', rowClassStart);
    const rowClassSource = source.slice(rowClassStart, rowClassEnd);

    expect(rowClassSource).toContain("border-slate-100");
    expect(rowClassSource).toContain("px-4 py-3.5");
    expect(rowClassSource).not.toContain("border-slate-50");
  });

  it("the status dot stays small and shrink-0, only its top offset shifted to align with the now-taller title line", () => {
    expect(source).toContain('"mt-2 size-2 shrink-0 rounded-full "');
  });
});

describe("Notification scroll area (NOTIF-UI-1)", () => {
  const source = readFileSync(path.resolve(__dirname, "Header.tsx"), "utf8");

  it("the list's scrollable region is taller than before (420px, Tailwind v4's canonical max-h-105) and still independently scrollable", () => {
    const start = source.indexOf("{/* List */}");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("notifList.length > 0", start);
    const regionSource = source.slice(start, end);

    expect(regionSource).toContain("max-h-105 overflow-y-auto");
    expect(regionSource).not.toContain("max-h-80");
  });

  it("the dropdown header sits outside the scrollable list, so it stays visible while the list scrolls", () => {
    const listStart = source.indexOf("{/* List */}");
    const headerStart = source.indexOf("{/* Header */}");
    expect(headerStart).toBeGreaterThan(-1);
    expect(listStart).toBeGreaterThan(headerStart);
  });

  it("does not add any custom scrollbar styling — relies on the existing global ::-webkit-scrollbar rule", () => {
    const start = source.indexOf("{/* List */}");
    const end = source.indexOf("notifList.length > 0", start);
    const regionSource = source.slice(start, end);
    expect(regionSource).not.toContain("scrollbar");
  });
});

describe("Notification dropdown Escape/outside-click behavior (NOTIF-UI-1)", () => {
  const source = readFileSync(path.resolve(__dirname, "Header.tsx"), "utf8");

  it("outside click still closes only the notification dropdown, unchanged", () => {
    const start = source.indexOf("{notifOpen && (");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("{/* Header */}", start);
    expect(end).toBeGreaterThan(start);
    const overlaySource = source.slice(start, end).replace(/\s+/g, " ");
    expect(overlaySource).toContain('className="fixed inset-0 z-40"');
    expect(overlaySource).toContain("onClick={() => setNotifOpen(false)}");
  });

  it("Escape now also closes the notification dropdown — installed only while open, cleaned up on close", () => {
    const start = source.indexOf("if (!notifOpen) return;");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("}, [notifOpen]);", start);
    expect(end).toBeGreaterThan(start);
    const effectSource = source.slice(start, end);

    expect(effectSource).toContain('if (event.key === "Escape") setNotifOpen(false);');
    expect(effectSource).toContain(
      'document.addEventListener("keydown", handleKeyDown);',
    );
    expect(effectSource).toContain(
      'return () => document.removeEventListener("keydown", handleKeyDown);',
    );
  });

  it("the Escape effect is scoped to notifOpen only — it does not call closeAll() or touch dropdownOpen/monthOpen", () => {
    const start = source.indexOf("if (!notifOpen) return;");
    const end = source.indexOf("}, [notifOpen]);", start);
    const effectSource = source.slice(start, end);

    expect(effectSource).not.toContain("closeAll()");
    expect(effectSource).not.toContain("setDropdownOpen");
    expect(effectSource).not.toContain("setMonthOpen");
  });
});

describe("Bell accessible name and click behavior are unchanged (NOTIF-UI-1 scope guard)", () => {
  const source = readFileSync(path.resolve(__dirname, "Header.tsx"), "utf8");

  it("the bell button keeps its existing accessible name and dimensions", () => {
    expect(source).toContain('aria-label="Thông báo"');
    expect(source).toContain("h-11 w-11");
  });

  it("notification click still navigates via router.push(href) and marks the item read the same way as before", () => {
    const start = source.indexOf(
      "function handleNotifClick(href: string, id: string) {",
    );
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("function handleMarkAllRead()", start);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("readNotificationIds()");
    expect(fnSource).toContain("persistNotificationIds(readIds)");
    expect(fnSource).toContain("router.push(href)");
  });
});

describe("Business-logic and query-topology guard (NOTIF-UI-1 must not touch these)", () => {
  const source = readFileSync(path.resolve(__dirname, "Header.tsx"), "utf8");

  it("buildNotifications delegates to the canonical financeNotifications module rather than reimplementing budget/goal/debt/cash-flow rules inline (NOTIF-CORRECTNESS-1)", () => {
    expect(source).toContain(
      'from "@/src/lib/notifications/financeNotifications"',
    );
    expect(source).toContain("buildFinanceNotifications({");
    // The old ad-hoc 80%/100% budget-threshold reimplementation this
    // ticket replaced must not reappear in Header.tsx itself.
    expect(source).not.toContain("if (pct >= 100)");
    expect(source).not.toContain("pct >= 80");
  });

  it("does not add a new data-fetching call — the single idle-deferred Promise.all in the mount effect is unchanged", () => {
    const occurrences = source.split("runWhenIdle(() => {").length - 1;
    expect(occurrences).toBe(1);
  });

  it("tone (warning/success/info) is read as-is for the status dot color — no new severity classification derived in the UI", () => {
    const start = source.indexOf("const dot =");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("const bg =", start);
    expect(end).toBeGreaterThan(start);
    const dotSource = source.slice(start, end).replace(/\s+/g, " ");
    expect(dotSource).toBe(
      'const dot = n.tone === "warning" ? "bg-amber-400" : n.tone === "success" ? "bg-emerald-500" : "bg-blue-500"; ',
    );
  });
});
