import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "WalletsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

function mobileActionRegion() {
  const start = source.indexOf(
    'className="absolute right-3.5 top-3.5 z-20 sm:right-6 sm:top-6"',
  );
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf(
    'className="hidden shrink-0 gap-1.5 opacity-0 transition-opacity sm:flex sm:group-hover:opacity-100"',
    start,
  );
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("WALLETS-MOBILE-ACTION-MENU-DISMISS-1", () => {
  it("controls the mobile Wallet action menu with one open wallet id instead of native details state", () => {
    expect(source).toContain(
      "const [openWalletActionMenuId, setOpenWalletActionMenuId] = useState<string | null>(null);",
    );
    expect(source).toContain("const walletActionMenuRefs = useRef(");
    expect(source).toContain("const walletActionTriggerRefs = useRef(");
    expect(source).not.toContain(
      '<details className="group/actions relative sm:hidden">',
    );
  });

  it("dismisses the active mobile menu on an outside pointer press", () => {
    expect(source).toContain("if (!openWalletActionMenuId) return;");
    expect(source).toContain(
      'document.addEventListener("pointerdown", handleWalletActionPointerDown);',
    );
    expect(source).toContain("menuRoot?.contains(event.target)");
    expect(source).toContain("setOpenWalletActionMenuId(null);");
    expect(source).toContain(
      'document.removeEventListener("pointerdown", handleWalletActionPointerDown);',
    );
  });

  it("dismisses on Escape and restores focus to the trigger that opened the menu", () => {
    expect(source).toContain('if (event.key !== "Escape") return;');
    expect(source).toContain(
      'document.addEventListener("keydown", handleWalletActionKeyDown);',
    );
    expect(source).toContain("walletActionTriggerRefs.current.get(menuId)?.focus();");
    expect(source).toContain(
      'document.removeEventListener("keydown", handleWalletActionKeyDown);',
    );
  });

  it("renders a single controlled popover with explicit expanded and menu semantics", () => {
    const region = mobileActionRegion();
    expect(region).toContain(
      "aria-expanded={openWalletActionMenuId === wallet.id}",
    );
    expect(region).toContain('aria-haspopup="menu"');
    // The production code intentionally uses a functional state update so a
    // rapid tap cannot toggle from a stale render. Assert the behavior contract
    // without requiring the less-safe direct state expression.
    expect(region).toContain("setOpenWalletActionMenuId((currentId) =>");
    expect(region).toContain("currentId === wallet.id ? null : wallet.id");
    expect(region).toContain("{openWalletActionMenuId === wallet.id ? (");
    expect(region).toContain('role="menu"');
    expect(region.match(/role="menuitem"/g)).toHaveLength(2);
  });

  it("closes the mobile menu before edit or delete hands off to the existing Wallet flows", () => {
    const region = mobileActionRegion();
    const editClose = region.indexOf("setOpenWalletActionMenuId(null);");
    const editAction = region.indexOf("openEditForm(wallet);", editClose);
    const deleteClose = region.indexOf(
      "setOpenWalletActionMenuId(null);",
      editAction,
    );
    const deleteAction = region.indexOf("void handleDelete(wallet.id);", deleteClose);

    expect(editClose).toBeGreaterThan(-1);
    expect(editAction).toBeGreaterThan(editClose);
    expect(deleteClose).toBeGreaterThan(editAction);
    expect(deleteAction).toBeGreaterThan(deleteClose);
  });
});
