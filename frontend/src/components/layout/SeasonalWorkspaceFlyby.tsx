"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  FLYBY_ACTIVITY_QUIET_MS,
  nextFlybyDelayMs,
  nextSeasonalMotionPlan,
  resolveFlybySeason,
  type FlybyDirection,
  type SeasonalMotionPlan,
} from "@/src/lib/seasonalFlyby";

type Motion = { id: number; plan: SeasonalMotionPlan };

// One opening flourish per document load, even if AppShell temporarily
// unmounts for a sidebar, modal or mobile overlay. F5 resets this latch.
let firstFlybyPlayedForDocument = false;

const THEME_ATTRIBUTE = "data-finance-workspace-season";
const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"], [role="alertdialog"], dialog[open]';
const EDITING_SELECTOR = 'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"]';
const SPARK_ANGLES = Array.from({ length: 12 }, (_, index) => index * 30);

/**
 * One rare event: Autumn falls, Christmas glides diagonally, Tet launches and
 * bursts. All animation is decorative, finite and detached from finance state.
 * The layer is a sibling of the scroll owner, NOT inside .finance-main.
 */
export default function SeasonalWorkspaceFlyby() {
  const [motion, setMotion] = useState<Motion | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const main = document.querySelector<HTMLElement>(".finance-main");
    if (!main) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia("(max-width: 767px)");
    const preview = new URLSearchParams(window.location.search).get("flyby") === "preview";

    let waitingTimer: number | null = null;
    let finishingTimer: number | null = null;
    let lastActivity = Date.now() - FLYBY_ACTIVITY_QUIET_MS;
    let motionCounter = 0;
    let hasPlayed = false;
    let running = false;
    let previousDirection: FlybyDirection | null = null;
    let currentSeason = resolveFlybySeason(root.getAttribute(THEME_ATTRIBUTE));

    const clearTimers = () => {
      if (waitingTimer !== null) window.clearTimeout(waitingTimer);
      if (finishingTimer !== null) window.clearTimeout(finishingTimer);
      waitingTimer = null;
      finishingTimer = null;
    };

    const stopMotion = () => {
      running = false;
      setMotion(null);
    };

    const modalOpen = () =>
      Array.from(document.querySelectorAll<HTMLElement>(MODAL_SELECTOR)).some((element) => {
        if (element.closest('[aria-hidden="true"]')) return false;
        if (element.getClientRects().length === 0) return false;
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
      });

    const editing = () => {
      const focused = document.activeElement;
      return focused instanceof HTMLElement && Boolean(focused.closest(EDITING_SELECTOR));
    };

    const globallyDisabled = () => document.hidden || reducedMotion.matches || !currentSeason;
    const temporarilyBlocked = () => editing() || modalOpen();

    const schedule = (delay?: number) => {
      if (waitingTimer !== null) window.clearTimeout(waitingTimer);
      waitingTimer = null;
      if (globallyDisabled()) return;

      if (temporarilyBlocked()) {
        waitingTimer = window.setTimeout(() => {
          waitingTimer = null;
          schedule(1_500);
        }, 9_000);
        return;
      }

      waitingTimer = window.setTimeout(() => {
        waitingTimer = null;
        currentSeason = resolveFlybySeason(root.getAttribute(THEME_ATTRIBUTE));
        if (globallyDisabled() || temporarilyBlocked()) {
          schedule(9_000);
          return;
        }
        const quietFor = Date.now() - lastActivity;
        if (quietFor < FLYBY_ACTIVITY_QUIET_MS) {
          schedule(FLYBY_ACTIVITY_QUIET_MS - quietFor + 1_000);
          return;
        }

        const season = currentSeason;
        if (!season) return;
        const plan = nextSeasonalMotionPlan({
          season,
          mobile: mobile.matches,
          previousDirection,
        });
        if (plan.mode === "glide") previousDirection = plan.sleigh.direction;
        running = true;
        hasPlayed = true;
        firstFlybyPlayedForDocument = true;
        motionCounter += 1;
        setMotion({ id: motionCounter, plan });
        finishingTimer = window.setTimeout(() => {
          finishingTimer = null;
          stopMotion();
          schedule();
        }, plan.durationMs);
      }, delay ?? nextFlybyDelayMs({ mobile: mobile.matches, preview, first: !hasPlayed && !firstFlybyPlayedForDocument }));
    };

    const restart = () => {
      clearTimers();
      stopMotion();
      currentSeason = resolveFlybySeason(root.getAttribute(THEME_ATTRIBUTE));
      schedule();
    };

    const onActivity = () => {
      lastActivity = Date.now();
      if (running) {
        clearTimers();
        stopMotion();
        schedule();
      }
    };

    const themeObserver = new MutationObserver(restart);
    themeObserver.observe(root, { attributes: true, attributeFilter: [THEME_ATTRIBUTE] });

    main.addEventListener("scroll", onActivity, { passive: true });
    document.addEventListener("pointerdown", onActivity, { passive: true, capture: true });
    document.addEventListener("keydown", onActivity, true);
    document.addEventListener("focusin", onActivity, true);
    document.addEventListener("visibilitychange", restart);
    reducedMotion.addEventListener("change", restart);
    mobile.addEventListener("change", restart);
    schedule();

    return () => {
      clearTimers();
      themeObserver.disconnect();
      main.removeEventListener("scroll", onActivity);
      document.removeEventListener("pointerdown", onActivity, true);
      document.removeEventListener("keydown", onActivity, true);
      document.removeEventListener("focusin", onActivity, true);
      document.removeEventListener("visibilitychange", restart);
      reducedMotion.removeEventListener("change", restart);
      mobile.removeEventListener("change", restart);
    };
  }, []);

  if (!motion) return null;
  const { plan } = motion;

  return (
    <div
      key={motion.id}
      className={`finance-season-flyby finance-season-flyby--${plan.mode}`}
      data-seasonal-flyby={plan.season}
      data-seasonal-motion-mode={plan.mode}
      data-flyby-direction={plan.mode === "glide" ? plan.sleigh.direction : undefined}
      aria-hidden="true"
    >
      {plan.mode === "fall" && plan.leaves.map((leaf) => (
        <span
          key={leaf.id}
          className="finance-season-autumn-leaf"
          style={{
            "--leaf-x": `${leaf.xPercent}%`,
            "--leaf-size": `${leaf.sizePx}px`,
            "--leaf-delay": `${leaf.delayMs}ms`,
            "--leaf-duration": `${leaf.durationMs}ms`,
            "--leaf-drift": `${leaf.driftPx}px`,
            "--leaf-sway": `${leaf.swayPx}px`,
            "--leaf-mid-x": `${Math.round(leaf.driftPx * 0.6 - leaf.swayPx)}px`,
            "--leaf-late-x": `${leaf.driftPx + leaf.swayPx}px`,
            "--leaf-fade-opacity": `${Number((leaf.alpha * 0.8).toFixed(2))}`,
            "--leaf-spin": `${leaf.spinDeg}deg`,
            "--leaf-hue": `${leaf.hueDeg}deg`,
            "--leaf-opacity": `${leaf.alpha}`,
          } as CSSProperties}
        />
      ))}

      {plan.mode === "glide" && (
        <span
          className="finance-season-flyby-track"
          style={{
            "--flyby-altitude": `${plan.sleigh.altitudePx}px`,
            "--sleigh-end-y": `${plan.sleigh.endShiftPx}px`,
            "--sleigh-mid-y": `${Math.round(plan.sleigh.endShiftPx * 0.29 + plan.sleigh.dipPx)}px`,
            "--sleigh-late-y": `${Math.round(plan.sleigh.endShiftPx * 0.67 - plan.sleigh.dipPx)}px`,
            "--sleigh-bob": `${plan.sleigh.bobPx}px`,
            "--sleigh-neg-bob": `${-plan.sleigh.bobPx}px`,
            "--sleigh-bank": `${plan.sleigh.bankDeg}deg`,
            "--sleigh-bank-late": `${Number((-plan.sleigh.bankDeg * 0.6).toFixed(1))}deg`,
            "--flyby-scale": `${plan.sleigh.scale}`,
            "--flyby-duration": `${plan.durationMs}ms`,
          } as CSSProperties}
        >
          <span className="finance-season-sleigh-bob">
            <span className="finance-season-flyby-art" />
          </span>
        </span>
      )}

      {plan.mode === "launch-burst" && plan.fireworks.map((firework) => (
        <span
          key={firework.id}
          className="finance-season-tet-firework"
          style={{
            "--firework-x": `${firework.xPercent}%`,
            "--firework-top": `${firework.targetTopPx}px`,
            "--firework-rise": `calc(${firework.targetTopPx}px - 100dvh)`,
            "--firework-travel": `calc(100dvh - ${firework.targetTopPx}px)`,
            "--firework-lateral": `${firework.lateralPx}px`,
            "--firework-delay": `${firework.delayMs}ms`,
            "--firework-radius": `${firework.radiusPx}px`,
            "--firework-reach": `${-firework.radiusPx}px`,
            "--firework-reach-late": `${Math.round(-firework.radiusPx * 1.3)}px`,
            "--firework-hue": `${firework.hueDeg}deg`,
          } as CSSProperties}
        >
          <span className="finance-season-tet-rocket" />
          <span className="finance-season-tet-burst">
            <span className="finance-season-tet-ring" />
            <span className="finance-season-tet-core" />
            {SPARK_ANGLES.map((angle) => (
              <span
                key={angle}
                className="finance-season-tet-spark"
                style={{ "--spark-angle": `${angle}deg` } as CSSProperties}
              />
            ))}
          </span>
        </span>
      ))}
    </div>
  );
}
