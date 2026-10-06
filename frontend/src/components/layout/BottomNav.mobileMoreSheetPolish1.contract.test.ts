import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "BottomNav.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("MOBILE-MORE-SHEET-POLISH-1", () => {
  it("keeps the sheet header compact and semantically described", () => {
    expect(source).toContain('aria-describedby="mobile-more-description"');
    expect(source).toContain('id="mobile-more-description"');
    expect(source).toContain("Các mục quản lý và phân tích khác.");
    expect(source).toContain("rounded-t-[28px]");
    expect(source).not.toContain(">\n                  Điều hướng\n                </p>");
  });

  it("groups destinations into compact cards without changing the navigation registry", () => {
    expect(source).toContain(
      'className="rounded-[24px] border border-slate-200/80 bg-white p-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"',
    );
    expect(source).toContain("MOBILE_MORE_GROUPS.map((group) => (");
    expect(source).toContain("group.items.map((item) => {");
    expect(source).toContain("grid grid-cols-2 gap-2");
  });

  it("shows the active destination with a compact check badge instead of a second text row", () => {
    expect(source).toContain("<Check size={10} strokeWidth={3} aria-hidden=\"true\" />");
    expect(source).toContain('<span className="sr-only">Đang mở</span>');
    expect(source).not.toContain(
      'className="mt-0.5 block text-[10px] font-bold text-blue-500"',
    );
    expect(source).toContain('aria-current={active ? "page" : undefined}');
  });

  it("traps keyboard focus inside the open modal and keeps Escape close behavior", () => {
    expect(source).toContain('if (event.key === "Escape")');
    expect(source).toContain('if (event.key !== "Tab") return;');
    expect(source).toContain('document.getElementById("mobile-more-menu")');
    expect(source).toContain("dialog.querySelectorAll<HTMLElement>(");
    expect(source).toContain("event.shiftKey && document.activeElement === first");
    expect(source).toContain("document.activeElement === last");
    expect(source).toContain("last.focus();");
    expect(source).toContain("first.focus();");
  });

  it("returns focus to the Thêm trigger when the sheet is dismissed but not after destination navigation", () => {
    expect(source).toContain("const moreTriggerRef = useRef<HTMLButtonElement>(null);");
    expect(source).toContain("const restoreMoreTriggerFocusRef = useRef(false);");
    expect(source).toContain("ref={moreTriggerRef}");
    expect(source).toContain("moreTriggerRef.current?.focus();");
    expect(source).toContain("restoreMoreTriggerFocusRef.current = false;");
    expect(source).toContain("setMoreOpen(false);");
  });

  it("keeps strong tap targets and visible keyboard focus rings", () => {
    expect(source).toContain("min-h-[4.5rem]");
    expect(source).toContain("focus-visible:ring-2 focus-visible:ring-blue-500/50");
    expect(source).toContain("active:scale-[0.98]");
  });

  it("preserves the real-iPhone visual viewport, safe-area and internal-scroll contracts", () => {
    expect(source).toContain("window.visualViewport");
    expect(source).toContain("--mobile-more-visual-viewport-height");
    expect(source).toContain("--mobile-more-visual-viewport-offset-top");
    expect(source).toContain("touch-pan-y");
    expect(source).toContain("overscroll-contain");
    expect(source).toContain("env(safe-area-inset-bottom)");
    expect(source).toContain(
      'maxHeight: "min(calc(var(--mobile-more-visual-viewport-height, 100dvh) - 0.75rem), 42rem)"',
    );
  });
});