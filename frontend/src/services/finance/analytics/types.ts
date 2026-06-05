/**
 * analytics/types.ts
 *
 * Shared insight types used by both individual analytics modules and
 * the aiAdvisorEngine orchestrator.
 *
 * Kept in a separate file to avoid circular imports between modules
 * that produce insights (e.g. emergencyFund.ts) and the orchestrator
 * that consumes them (aiAdvisorEngine.ts).
 */

/** Icon intent signal — the UI maps each value to a React node. */
export type InsightIconType =
  | "trending-up"
  | "trending-down"
  | "piggy-bank"
  | "shield-check"
  | "alert-triangle"
  | "lightbulb"
  | "target"
  | "flame"
  | "bar-chart"
  | "wallet";

export type InsightTone = "good" | "warning" | "danger" | "info";

/**
 * A fully-formed insight ready for rendering.
 * Does NOT contain React nodes — use `iconType` to look up the icon in UI.
 */
export type InsightData = {
  /** Stable key suitable for React list rendering. */
  key: string;
  title: string;
  text: string;
  tone: InsightTone;
  iconType: InsightIconType;
};
