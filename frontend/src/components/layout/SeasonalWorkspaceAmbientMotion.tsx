/**
 * MYFINANCE-SEASONAL-WORKSPACE-MOTION-VISIBILITY-FIX-1
 * Inert seasonal SVG particles confined to the chrome and outer page gutter.
 * CSS transform + opacity only; no timers, event listeners or data hooks.
 */
type AmbientArea = "sidebar" | "topbar" | "page";

export default function SeasonalWorkspaceAmbientMotion({
  area,
}: {
  area: AmbientArea;
}) {
  return (
    <div
      className={`finance-season-motion finance-season-motion--${area}`}
      data-seasonal-motion-area={area}
      aria-hidden="true"
    >
      <span className="finance-season-motion-particle" />
      <span className="finance-season-motion-particle" />
      <span className="finance-season-motion-particle" />
      <span className="finance-season-motion-particle" />
      <span className="finance-season-motion-particle" />
      <span className="finance-season-motion-particle" />
    </div>
  );
}
