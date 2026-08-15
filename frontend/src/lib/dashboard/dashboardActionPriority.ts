/**
 * UI-DASH-3 Action Center priority/merge policy.
 *
 * DashboardPage's Action Center draws candidate actions from two sources —
 * a local "v3 advisor" heuristic and `generateDashboardActions` (which
 * already builds contextual `ctaRoute`s such as `buildBudgetsHref({
 * budgetId })` for some of its actions, per INTEGRATION-2). Before UI-DASH-3,
 * DashboardPage picked one source or the other wholesale
 * (`v3AdvisorActions.length > 0 ? v3AdvisorActions : aiActions`), so a
 * single low-severity v3 action could hide every contextual action the
 * other source produced.
 *
 * This module has been corrected twice since:
 *
 * 1. Action Identity & Dedup Correctness patch — the first cut deduped by
 *    `domain` (the action's icon/subject, e.g. "budget" or "goal") alone,
 *    which over-collapsed: two different over-budget categories, or two
 *    different behind-schedule goals, both legitimately share a domain
 *    without being the same issue.
 * 2. Semantic Issue Identity patch (this version) — the second cut fixed
 *    that by keying aggregate (entity-less) actions on `domain +
 *    destination route`, which UNDER-collapsed instead: v3's "saving rate
 *    is great" action (→ /goals) and generateDashboardActions' "saving
 *    rate is still low" action (→ /transactions) are the SAME financial
 *    observation — the person's saving rate — reported by two sources with
 *    two different CTAs, but the route-suffixed key treated them as two
 *    unrelated issues, so both could appear together (one "good", one
 *    "warning") — a self-contradictory Action Center.
 *
 * Identity is now assigned explicitly at each candidate's creation site
 * (DashboardPage.tsx), as a semantic `issueKind` — "saving-rate",
 * "emergency-fund", "budget-over", etc. — that describes WHAT financial
 * condition the action reports, never WHERE its CTA navigates. `ctaRoute`
 * is consulted in exactly one narrow, isolated place (`extractEntityId`)
 * to pull out an entity id INTEGRATION-2's builders already embedded
 * (e.g. `budgetId`) — because neither generator exposes that id as a
 * structured field today — and nowhere else. Two aggregate actions with
 * the same `issueKind` always share one issueKey regardless of their
 * destination; two entity-specific actions with the same kind but
 * different ids never do.
 *
 * Pure and framework-free: no React, no router.
 */
import type {
  DashboardActionIcon,
  DashboardActionTone,
} from "@/src/services/finance/financeCalculations";

export type DashboardActionCandidate = {
  /** Presentation only (icon lookup) — NOT the dedupe key. */
  domain: DashboardActionIcon;
  /** Dedupe identity: two candidates with the same `issueKey` are treated
   * as duplicate reports of the SAME logical issue, and only one survives.
   * Composed from a semantic `issueKind` (assigned explicitly by the
   * caller — see `composeIssueIdentity`/`deriveAggregateIssueKind`) plus,
   * when the action concerns one specific entity, that entity's id. Never
   * derived from `ctaRoute` as a whole — route shape plays no part beyond
   * the narrow entity-id extraction. */
  issueKey: string;
  /** True when this candidate's destination carries specific entity
   * context (e.g. a budgetId) rather than a generic domain-home route.
   * Used ONLY as a tie-break between otherwise-equal-severity duplicates
   * of the SAME issueKey (or, failing that, between otherwise-equal
   * distinct issues) — it never outranks a more severe issue. */
  isContextual: boolean;
  title: string;
  body: string;
  tone: DashboardActionTone;
  ctaLabel?: string;
  ctaRoute?: string;
};

const TONE_SEVERITY: Record<DashboardActionTone, number> = {
  danger: 0,
  warning: 1,
  good: 2,
};

/** The exact entity-focus query params INTEGRATION-2's navigation builders
 * emit (`financeNavigation.ts`'s `build*Href({ xId })` functions) — not an
 * arbitrary/invented list, and deliberately excludes filter-only params
 * (e.g. Transactions' `categoryId`/`type`) since those don't identify a
 * single entity. */
const ENTITY_ID_PARAMS = [
  "budgetId",
  "goalId",
  "debtId",
  "walletId",
  "savingId",
] as const;

/**
 * Pulls a known entity id out of a ctaRoute's query string, if present.
 * This is the ONLY place a route string is inspected anywhere in this
 * module — and it never assigns semantic meaning, it only recovers an id
 * a navigation builder already embedded (e.g. `buildBudgetsHref({
 * budgetId })`'s `budgetId` param). A route with no query, or a query with
 * none of these params (e.g. a Transactions filter link), yields `null` —
 * meaning "this action is about an aggregate condition, not one entity".
 */
export function extractEntityId(ctaRoute: string | undefined): string | null {
  if (!ctaRoute) return null;

  const queryIndex = ctaRoute.indexOf("?");
  if (queryIndex === -1) return null;

  const params = new URLSearchParams(ctaRoute.slice(queryIndex + 1));
  for (const param of ENTITY_ID_PARAMS) {
    const value = params.get(param);
    if (value) return value;
  }

  return null;
}

/**
 * Maps a `generateDashboardActions` candidate's `domain` (icon) to the
 * semantic issue it reports, for the aggregate (entity-less) case — used
 * because that generator doesn't expose a structured "what condition is
 * this" field, only `icon`/`title`/`body`/`tone`/`ctaRoute`, and title/body
 * text is deliberately never used as identity (presentation copy, not a
 * stable contract). Chosen only where the mapping is unambiguous:
 *
 * - `savings`/`shield` both report the SAME underlying metric (the
 *   person's saving rate) at different thresholds within one mutually
 *   exclusive if/else chain — unified as "saving-rate" so they also match
 *   v3AdvisorActions' own explicit "saving-rate" issue (see the reachable
 *   savingRate=35% regression this fixes).
 * - `debt`/`bank` are the two severity tiers of one metric (debt ratio) —
 *   unified as "debt-ratio".
 * - `goal`/`budget` map to their aggregate names ("goals-progress",
 *   "budget-over"); when the actual action carries an entity id, the
 *   caller composes a MORE specific key on top (see
 *   `composeIssueIdentity`), so this aggregate name is only ever the
 *   final key for the entity-less case.
 * - `alert` is intentionally left unmapped (falls back to the domain
 *   itself): `generateDashboardActions` uses this ONE domain for two
 *   genuinely different, mutually exclusive conditions (a low saving-rate
 *   warning and a "no income recorded" warning) that cannot be told apart
 *   without reading title/body copy (forbidden) or a structural change to
 *   `DashboardAction` (out of this patch's scope). Since no other source
 *   ever emits an `alert`-domain action, this causes no incorrect dedup —
 *   only a coarser-than-ideal label for that one pair.
 */
const AGGREGATE_ISSUE_KIND_BY_DOMAIN: Partial<Record<DashboardActionIcon, string>> = {
  savings: "saving-rate",
  shield: "saving-rate",
  emergency: "emergency-fund",
  debt: "debt-ratio",
  bank: "debt-ratio",
  investment: "investment-return",
  goal: "goals-progress",
  budget: "budget-over",
};

export function deriveAggregateIssueKind(domain: DashboardActionIcon): string {
  return AGGREGATE_ISSUE_KIND_BY_DOMAIN[domain] ?? domain;
}

/**
 * Composes a candidate's final dedupe identity from an explicit semantic
 * `issueKind` (assigned by the caller at normalization time — e.g.
 * "saving-rate", "emergency-fund", or `deriveAggregateIssueKind(domain)`
 * for generateDashboardActions candidates) plus, when the action is about
 * one specific entity, that entity's id extracted from `ctaRoute`.
 *
 * Two candidates sharing an `issueKind` with NO entity always collapse to
 * the SAME issueKey regardless of which page their CTA points at (the
 * core regression this patch fixes). Two candidates sharing an
 * `issueKind` but DIFFERENT entity ids (two distinct over-budget
 * categories) get different issueKeys and both survive dedup.
 */
export function composeIssueIdentity(
  issueKind: string,
  ctaRoute: string | undefined,
): { issueKey: string; isContextual: boolean } {
  const entityId = extractEntityId(ctaRoute);

  if (entityId) {
    return { issueKey: `${issueKind}:${entityId}`, isContextual: true };
  }

  return { issueKey: issueKind, isContextual: false };
}

/**
 * Selects at most `maxActions` candidates for the Action Center:
 *
 * 1. Deduplicate by `issueKey` — when two candidates describe the SAME
 *    logical issue, keep only the more severe one; if severity ties,
 *    prefer the one flagged `isContextual`. Candidates with different
 *    `issueKey`s always both survive this step, even if they share a
 *    `domain` (two different over-budget categories are two candidates).
 * 2. Sort the survivors by severity (danger, then warning, then good).
 *    Within equal severity, `isContextual` sorts first — a quality
 *    tie-break, never a reason to outrank a more severe issue.
 * 3. Truncate to `maxActions`, preserving the existing "up to 3" cap.
 *    Dedup always runs before the cap, so duplicate reports of one issue
 *    can never occupy two of the limited slots.
 *
 * Input order is never assumed to already be priority-sorted — sourcing
 * order (which array a candidate came from) has no bearing on the result,
 * beyond a stable tie-break when severity and contextuality both match.
 * Never mutates the input array. Unchanged by the Semantic Issue Identity
 * patch — this algorithm only ever reads `issueKey`/`isContextual`/`tone`,
 * never `ctaRoute` or `domain` directly, so correcting how `issueKey` is
 * assigned required no change here.
 */
export function selectDashboardPriorityActions(
  candidates: DashboardActionCandidate[],
  maxActions = 3,
): DashboardActionCandidate[] {
  const bestByIssue = new Map<
    string,
    { candidate: DashboardActionCandidate; index: number }
  >();

  candidates.forEach((candidate, index) => {
    const existing = bestByIssue.get(candidate.issueKey);
    if (!existing) {
      bestByIssue.set(candidate.issueKey, { candidate, index });
      return;
    }

    const existingSeverity = TONE_SEVERITY[existing.candidate.tone];
    const candidateSeverity = TONE_SEVERITY[candidate.tone];

    if (candidateSeverity < existingSeverity) {
      bestByIssue.set(candidate.issueKey, { candidate, index });
      return;
    }
    if (candidateSeverity > existingSeverity) {
      return;
    }

    if (candidate.isContextual && !existing.candidate.isContextual) {
      bestByIssue.set(candidate.issueKey, { candidate, index });
    }
  });

  const survivors = Array.from(bestByIssue.values());

  survivors.sort((a, b) => {
    const severityDiff =
      TONE_SEVERITY[a.candidate.tone] - TONE_SEVERITY[b.candidate.tone];
    if (severityDiff !== 0) return severityDiff;

    if (a.candidate.isContextual !== b.candidate.isContextual) {
      return a.candidate.isContextual ? -1 : 1;
    }

    return a.index - b.index;
  });

  return survivors.slice(0, maxActions).map((entry) => entry.candidate);
}
