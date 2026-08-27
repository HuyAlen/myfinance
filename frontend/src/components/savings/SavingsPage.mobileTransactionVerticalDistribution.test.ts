import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SAVINGS-UX-1.5 — Natural Mobile Transaction Rhythm.
 *
 * Real iPhone layouts should not use justify-between to force equal empty
 * bands between controls. Keep the transaction content cohesive, readable,
 * touch-friendly, and let any remaining space live after the content stack.
 */
describe("SavingsPage uses a natural mobile transaction rhythm", () => {
  const source = readFileSync(
    path.resolve(__dirname, "SavingsPage.tsx"),
    "utf8",
  );

  const movementStart = source.indexOf(
    "/* SAVINGS-UX-1: focused money-movement sheet.",
  );
  const historyStart = source.indexOf(
    "/* SAVINGS-UX-1: history is a read-only sheet, not part of edit.",
  );
  const movementSource = source.slice(movementStart, historyStart);

  it("removes the artificial justify-between viewport spreading from 1.4", () => {
    expect(movementSource).not.toContain("flex-col justify-between sm:block");
    expect(movementSource).toContain(
      "mx-auto flex w-full max-w-md flex-col gap-3.5",
    );
  });

  it("groups transaction inputs into one cohesive mobile card", () => {
    expect(movementSource).toContain("Chi tiết giao dịch");
    expect(movementSource).toContain(
      "rounded-2xl border border-[#E3EBF3] bg-white p-3.5 shadow-sm",
    );
    expect(movementSource).toContain(
      "mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2",
    );
    expect(movementSource).toContain("sm:col-span-2");
  });

  it("uses iPhone-sized controls and full-width wallet selection", () => {
    expect(movementSource).toContain("min-h-12");
    expect(movementSource).toContain(
      "mt-1.5 min-h-12 w-full min-w-0 rounded-xl",
    );
    expect(movementSource).toContain(
      "focus-within:bg-white focus-within:ring-4",
    );
  });

  it("keeps the impact summary directly after the form instead of pinning it to the viewport bottom", () => {
    const formStart = movementSource.indexOf("Chi tiết giao dịch");
    const impactStart = movementSource.indexOf('"Sau khi nạp"', formStart);
    const footerStart = movementSource.indexOf(
      'className="grid shrink-0 grid-cols-2 gap-2 border-t',
      impactStart,
    );

    expect(formStart).toBeGreaterThan(-1);
    expect(impactStart).toBeGreaterThan(formStart);
    expect(footerStart).toBeGreaterThan(impactStart);
  });

  it("preserves full-screen mobile architecture, safe areas, and 1.3 color semantics", () => {
    expect(movementSource).toContain(
      "relative z-10 flex h-dvh w-full flex-col overflow-hidden bg-white",
    );
    expect(movementSource).toContain(
      "pb-[calc(0.5rem+env(safe-area-inset-bottom))]",
    );
    expect(movementSource).toContain(
      'type === "withdraw"\n                            ? "bg-blue-50 text-[#2F80ED]',
    );
    expect(movementSource).toContain('"bg-rose-50 text-rose-600');
    expect(movementSource).toContain('"Xác nhận rút"');
  });
});
