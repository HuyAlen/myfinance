import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SAVINGS-UX-1.4 — Mobile Transaction Vertical Distribution.
 *
 * The full-screen mobile transaction surface should use its available height:
 * selector at the top, form in the middle, impact/validation at the bottom.
 * Desktop keeps the compact modal flow.
 */
describe("SavingsPage distributes mobile transaction content vertically", () => {
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

  it("uses the entire transaction body as a vertical flex layout on mobile", () => {
    expect(movementSource).toContain(
      "flex min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain",
    );
    expect(movementSource).toContain("flex-col justify-between sm:block");
  });

  it("keeps the three meaningful mobile sections from collapsing", () => {
    expect(movementSource).toContain(
      "grid shrink-0 grid-cols-3 gap-1",
    );
    expect(movementSource).toContain(
      "mt-2.5 grid shrink-0 grid-cols-2 gap-x-2.5 gap-y-2.5",
    );
    expect(movementSource).toContain(
      '<div className="shrink-0">\n                <div className="mt-3 rounded-2xl',
    );
  });

  it("keeps impact and validation together as the bottom visual anchor", () => {
    const bottomAnchorStart = movementSource.indexOf(
      '<div className="shrink-0">\n                <div className="mt-3 rounded-2xl',
    );
    const impactStart = movementSource.indexOf('"Sau khi nạp"', bottomAnchorStart);
    const errorStart = movementSource.indexOf("{transactionError ? (", bottomAnchorStart);
    const bottomAnchorEnd = movementSource.indexOf(
      "</div>\n            </div>\n\n            <div className=\"grid shrink-0 grid-cols-2",
      bottomAnchorStart,
    );

    expect(bottomAnchorStart).toBeGreaterThan(-1);
    expect(impactStart).toBeGreaterThan(bottomAnchorStart);
    expect(errorStart).toBeGreaterThan(impactStart);
    expect(bottomAnchorEnd).toBeGreaterThan(errorStart);
  });

  it("preserves the full-screen architecture and fixed footer", () => {
    expect(movementSource).toContain(
      "relative z-10 flex h-dvh w-full flex-col overflow-hidden bg-white",
    );
    expect(movementSource).toContain(
      "grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 bg-white",
    );
    expect(movementSource).toContain(
      "pb-[calc(0.5rem+env(safe-area-inset-bottom))]",
    );
  });

  it("keeps the 1.3 visual semantics intact", () => {
    expect(movementSource).toContain(
      'type === "withdraw"\n                            ? "bg-white text-[#2F80ED]',
    );
    expect(movementSource).toContain('"Sau khi rút"');
    expect(movementSource).toContain('"Xác nhận rút"');
  });
});
