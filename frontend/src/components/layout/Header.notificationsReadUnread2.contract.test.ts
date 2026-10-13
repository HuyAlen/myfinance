import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/components/layout/Header.tsx"), "utf8")
  .replace(/\r\n?/g, "\n");

const reloadDeps =
  "}, [persistNotificationFirstSeen, persistNotificationIds, readNotificationFirstSeen, readNotificationIds]);";

describe("MYFINANCE-NOTIFICATIONS-READ-UNREAD-2 React Hooks regression", () => {
  it("derives invite read state directly from account scope without reading ref.current in render", () => {
    const start = source.indexOf("const householdInviteNotifications = useMemo");
    const end = source.indexOf("const visibleNotifList = useMemo", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const render = source.slice(start, end);
    expect(render).toContain("readNotificationIdsForScope(notificationScope)");
    expect(render).not.toContain("const readIds = readNotificationIds();");
    expect(render).not.toContain("notificationScopeRef.current");
  });

  it("explicitly observes read revision in the memoized visible notification list", () => {
    const start = source.indexOf("const visibleNotifList = useMemo");
    const end = source.indexOf("const filteredNotifList", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const render = source.slice(start, end);
    expect(render).toContain("void notificationReadRevision;");
    expect(render).toContain("readNotificationIdsForScope(notificationScope)");
    expect(render).not.toContain("notificationScopeRef.current");
    // The memo must track BOTH changes to read state and account notification
    // preferences; requiring revision to be the last dependency is brittle.
    const dependencyMatch = render.match(/\},\s*\[([^\]]+)\]\);/);
    expect(dependencyMatch).not.toBeNull();
    const dependencies = (dependencyMatch?.[1] ?? "").split(",").map((name) => name.trim());
    expect(dependencies).toContain("notificationReadRevision");
    expect(dependencies).toContain("notificationPreferences");
  });

  it("declares dependencies for all stable persistence callbacks in the async reload", () => {
    const start = source.indexOf("const reloadHeaderData = useCallback(async () => {");
    const end = source.indexOf("const reloadHeaderDataRef = useRef", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const callback = source.slice(start, end);
    expect(callback).toContain(reloadDeps);
    for (const symbol of ["readNotificationIds()", "persistNotificationIds(readIds)",
      "readNotificationFirstSeen()", "persistNotificationFirstSeen(firstSeen)"]) {
      expect(callback).toContain(symbol);
    }
  });

  it("keeps refs out of the account-scoped render paths while allowing them in async/event callbacks", () => {
    expect(source).toContain("notificationScopeRef.current");
    expect(source).toContain("if (requestedScope !== notificationScopeRef.current) return;");
    expect(source).toContain("handleSetNotificationRead(id: string, read: boolean)");
    expect(source).toContain("window.addEventListener(\"storage\", onNotificationStorage)");
  });
});
