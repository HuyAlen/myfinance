import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "QuickActionFab.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("MOBILE-QUICK-ACTION-FAB-RESTORE-1", () => {
  it("keeps the default Quick Action FAB visible on mobile above the bottom nav", () => {
    expect(source).toContain(
      'className="fixed bottom-[calc(var(--mobile-bottom-nav-height)+env(safe-area-inset-bottom)+0.75rem)] right-4 z-100 flex flex-col items-end gap-2 lg:bottom-6"',
    );

    expect(source).not.toContain(
      'right-4 z-100 hidden flex-col items-end gap-2 lg:bottom-6 lg:flex',
    );
  });

  it("keeps a dragged or restored Quick Action FAB visible on mobile", () => {
    expect(source).toContain(
      'className="fixed left-0 top-0 z-100"',
    );

    expect(source).not.toContain(
      'className="fixed left-0 top-0 z-100 hidden lg:block"',
    );
  });

  it("keeps the compact expanded menu mobile-only", () => {
    expect(source).toContain(
      '"fixed z-100 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl lg:hidden"',
    );
  });

  it("keeps the desktop expanded action stack desktop-only", () => {
    expect(source).toContain(
      'className="fixed z-100 hidden flex-col items-end gap-2 lg:flex"',
    );
  });
});
