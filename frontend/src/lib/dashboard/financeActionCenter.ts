import {
  isActionRequiredPriority,
  type ActionableFinanceAlert,
} from "@/src/lib/notifications/actionableFinanceAlerts";

export type FinanceActionCenterModel = {
  items: ActionableFinanceAlert[];
  actionRequiredCount: number;
  hiddenCount: number;
};

const PRIORITY_RANK: Record<ActionableFinanceAlert["priority"], number> = {
  urgent: 0,
  action: 1,
  info: 2,
};

/**
 * FINANCE-ACTION-CENTER-1
 *
 * Presentation selector only. Financial rules remain owned by
 * financeNotifications.ts + actionableFinanceAlerts.ts. This helper never
 * re-derives budget, cash-flow, review, recurring or debt conditions.
 *
 * Policy:
 * - only urgent/action alerts are work to do; informational alerts stay in
 *   the notification feed and do not occupy the Dashboard command center;
 * - urgent outranks action;
 * - the first pass prefers one alert per kind so three over-budget rows cannot
 *   hide an equally important review/recurring task;
 * - a second pass fills any remaining slots with the next ranked alerts;
 * - input order is the stable tie-break within the same priority.
 */
export function buildFinanceActionCenter(
  alerts: ActionableFinanceAlert[],
  maxItems = 3,
): FinanceActionCenterModel {
  const limit = Math.max(0, Math.floor(Number(maxItems) || 0));
  const ranked = alerts
    .map((alert, index) => ({ alert, index }))
    .filter(({ alert }) => isActionRequiredPriority(alert.priority))
    .sort((a, b) => {
      const priorityDiff =
        PRIORITY_RANK[a.alert.priority] - PRIORITY_RANK[b.alert.priority];
      return priorityDiff !== 0 ? priorityDiff : a.index - b.index;
    });

  if (limit === 0 || ranked.length === 0) {
    return {
      items: [],
      actionRequiredCount: ranked.length,
      hiddenCount: ranked.length,
    };
  }

  const selected: typeof ranked = [];
  const selectedIds = new Set<string>();
  const representedKinds = new Set<ActionableFinanceAlert["kind"]>();

  for (const entry of ranked) {
    if (selected.length >= limit) break;
    if (representedKinds.has(entry.alert.kind)) continue;
    selected.push(entry);
    selectedIds.add(entry.alert.id);
    representedKinds.add(entry.alert.kind);
  }

  for (const entry of ranked) {
    if (selected.length >= limit) break;
    if (selectedIds.has(entry.alert.id)) continue;
    selected.push(entry);
    selectedIds.add(entry.alert.id);
  }

  return {
    items: selected.map(({ alert }) => alert),
    actionRequiredCount: ranked.length,
    hiddenCount: Math.max(0, ranked.length - selected.length),
  };
}