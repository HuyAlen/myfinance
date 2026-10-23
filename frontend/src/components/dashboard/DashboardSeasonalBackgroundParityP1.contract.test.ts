import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appDir = path.resolve(__dirname, "../../../app");
const seasonal = readFileSync(path.join(appDir, "seasonal-workspace.css"), "utf8");
const polish = readFileSync(path.join(appDir, "dashboard-professional-polish.css"), "utf8");
const layout = readFileSync(path.join(appDir, "layout.tsx"), "utf8");

describe("MYFINANCE DASHBOARD SEASONAL BACKGROUND PARITY P1", () => {
  it("inherits the same sidebar, header and main artwork backgrounds as the other financial pages", () => {
    // Dashboard must not re-paint shared chrome: the seasonal workspace owns it.
    for (const surface of ["finance-sidebar", "finance-header", "finance-main"]) {
      expect(seasonal).toContain(`.finance-shell .${surface}`);
      expect(polish).not.toMatch(new RegExp(`\\.${surface}(?=[\\s:#.>+~{])`));
    }
    expect(layout).toContain('import "./seasonal-workspace.css"');
    expect(layout).toContain('import "./dashboard-professional-polish.css"');
  });

  it("does not hide seasonal motion and flyby on Dashboard while other pages show it", () => {
    expect(polish).not.toContain(".finance-season-motion");
    expect(polish).not.toContain(".finance-season-flyby");
  });

  it("retains compact mobile chart cards without mutating shared app chrome", () => {
    expect(polish).toContain('[data-dashboard-chart-first-grid]');
    expect(polish).toContain("@media (max-width: 767px)");
  });
});
