/**
 * MYFINANCE-NOTIFICATIONS-READ-UNREAD-1
 * Presentation-only read/unread preferences for generated notifications.
 * No finance data, Supabase writes, or auth/session values are stored here.
 * The scope is required so two accounts/workspaces cannot share read IDs.
 */
export type NotificationReadFilter = "all" | "unread" | "read";

export function buildNotificationScope(
  userId: string | null | undefined,
  workspaceId: string | null | undefined,
): string | null {
  if (!userId?.trim() || !workspaceId?.trim()) return null;
  return `${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}`;
}

export function scopedNotificationStorageKey(
  base: string,
  scope: string | null,
): string | null {
  return scope ? `${base}:v2:${scope}` : null;
}

/** Returns a copy. The caller owns persistence and UI update. */
export function setNotificationReadState(
  previous: ReadonlySet<string>,
  id: string,
  read: boolean,
): Set<string> {
  const next = new Set(previous);
  if (id) {
    if (read) next.add(id);
    else next.delete(id);
  }
  return next;
}

/** Filter only for presentation; never modifies the canonical order. */
export function filterNotificationsByRead<T extends { read: boolean }>(
  notifications: readonly T[],
  filter: NotificationReadFilter,
): T[] {
  if (filter === "all") return [...notifications];
  return notifications.filter((item) => filter === "read" ? item.read : !item.read);
}
