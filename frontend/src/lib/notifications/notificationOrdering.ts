/**
 * Canonical, pure ordering for the Header notification list.
 *
 * MyFinance's finance notifications (financeNotifications.ts) have no
 * database `created_at` — there is no Supabase "notifications" table at
 * all. Each notification is synthesized fresh from the current
 * budgets/transactions/goals/debts snapshot on every load and every
 * realtime-triggered reconciliation (see Header.tsx's `reloadHeaderData`),
 * not read as a persisted, individually-timestamped event row. There is
 * therefore no literal creation timestamp to sort by.
 *
 * The honest, minimal equivalent this module implements: "when did THIS
 * CLIENT first observe this exact notification id (a stable identity, e.g.
 * `bover-<budgetId>` — never display text) becoming active." The caller
 * persists this map (see Header.tsx) so ordering survives a reload, and
 * this module garbage-collects an id the moment its condition resolves, so
 * a LATER recurrence of the same id (e.g. a budget goes over limit again
 * after being fixed) is correctly treated as a brand-new notification, not
 * a revival of the old one at its old position.
 *
 * Deliberately timestamp-source- and persistence-agnostic: this module
 * only receives a plain `id -> firstSeenAtMs` map and returns a new one —
 * no Date.now(), no localStorage, no React — so it stays pure and directly
 * testable with synthetic timestamps.
 */

export type NotificationFirstSeenMap = Record<string, number>;

/**
 * Advances the first-seen map for the CURRENT set of active notification
 * ids: any id not already tracked is stamped with `now`; any previously
 * tracked id no longer present (its condition resolved) is dropped. An id
 * that stays active across calls keeps its ORIGINAL timestamp — this is
 * what makes reload-then-restore stable instead of re-stamping everything
 * "now" on every load.
 */
export function advanceNotificationFirstSeen(
  activeIds: readonly string[],
  previous: NotificationFirstSeenMap,
  now: number,
): NotificationFirstSeenMap {
  const next: NotificationFirstSeenMap = {};
  for (const id of activeIds) {
    next[id] = Object.prototype.hasOwnProperty.call(previous, id)
      ? previous[id]
      : now;
  }
  return next;
}

/**
 * Sorts notifications newest-first by their first-seen timestamp, using
 * `id` (descending, string comparison) as a deterministic tiebreaker for
 * equal timestamps so ordering can never shuffle randomly between renders.
 * Read/unread state is never consulted here — it must never affect
 * position (mark-as-read/mark-all-read only ever flip the `read` field via
 * an order-preserving `.map()` elsewhere, never touch this sort).
 *
 * Also de-duplicates by id defensively (keeping the first occurrence) so a
 * duplicate id arriving from two overlapping sources (e.g. a realtime
 * reconciliation racing a manual refresh) can never render as two rows for
 * the same logical alert — even though `buildFinanceNotifications` itself
 * cannot currently produce a duplicate id within one call.
 */
export function sortNotificationsNewestFirst<T extends { id: string }>(
  notifications: readonly T[],
  firstSeen: NotificationFirstSeenMap,
): T[] {
  const seenIds = new Set<string>();
  const deduped: T[] = [];
  for (const notification of notifications) {
    if (seenIds.has(notification.id)) continue;
    seenIds.add(notification.id);
    deduped.push(notification);
  }

  return deduped.sort((a, b) => {
    const aTime = firstSeen[a.id] ?? 0;
    const bTime = firstSeen[b.id] ?? 0;
    if (aTime !== bTime) return bTime - aTime; // newest (larger) first
    if (a.id === b.id) return 0;
    return a.id < b.id ? 1 : -1; // id DESC tiebreaker for equal timestamps
  });
}
