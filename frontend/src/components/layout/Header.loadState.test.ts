import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FINANCE-DATA-1B — Consumer Failure-State Correctness.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md). Whitespace is normalized before matching
 * multi-line JSX conditionals since this repo's files are CRLF.
 *
 * Header's search dropdown and notification bell both render an explicit
 * "nothing found" claim ("Không tìm thấy kết quả" / "Không có thông báo
 * mới") derived from `appData`, which defaults to EMPTY until the
 * once-per-lifetime idle load succeeds. Proves a narrow fix — a
 * hasHeaderDataLoaded flag distinguishes "never loaded" from "genuinely
 * nothing" at exactly those two spots — without a page-wide banner.
 */
describe("Header distinguishes an unloaded search index/notification list from a real empty one (FINANCE-DATA-1B)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "Header.tsx"),
    "utf8",
  );
  const normalized = source.replace(/\s+/g, " ");

  it("declares hasHeaderDataLoaded state, defaulting to false", () => {
    expect(source).toContain(
      "const [hasHeaderDataLoaded, setHasHeaderDataLoaded] = useState(false);",
    );
  });

  it("reloadHeaderData (the shared load/reload function used by both the initial idle load and NOTIF-FRESHNESS-1's realtime reconciliation) sets hasHeaderDataLoaded only on success", () => {
    const start = source.indexOf(
      "const reloadHeaderData = useCallback(async () => {",
    );
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("} catch (error) {", start);
    expect(end).toBeGreaterThan(start);
    const successSource = source.slice(start, end);
    expect(successSource).toContain("setHasHeaderDataLoaded(true);");

    const catchSource = source.slice(end, end + 200);
    expect(catchSource).not.toContain("setHasHeaderDataLoaded");
  });

  it("the search-results dropdown shows a loading state instead of 'Không tìm thấy kết quả' before the first load", () => {
    expect(normalized).toContain(
      "searchResults.length > 0 ? ( <>",
    );
    expect(normalized).toContain(": !hasHeaderDataLoaded ? (");
    expect(source).toContain("Đang tải dữ liệu tìm kiếm...");
  });

  it("the notification list shows a loading state instead of 'Không có thông báo mới' before the first load", () => {
    expect(normalized).toContain("visibleNotifList.length > 0 ? ( visibleNotifList.map");
    expect(source).toContain("Đang tải thông báo...");
  });

  it("the unread-badge stays additive-only and untouched (never asserts a zero claim)", () => {
    expect(source).toContain("unreadCount > 0 && (");
  });
});
