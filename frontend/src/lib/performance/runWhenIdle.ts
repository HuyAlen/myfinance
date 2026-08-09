/**
 * Runs `callback` after the browser has had a chance to finish more urgent
 * work (paint, critical route data fetches) instead of competing with them
 * immediately on mount. Falls back to a short `setTimeout` on engines that
 * never implemented `requestIdleCallback` (notably Safari/WebKit — the
 * primary target platform for this app), so behavior stays consistent
 * across browsers instead of silently running eagerly only on iOS.
 */
export function runWhenIdle(callback: () => void): void {
  if (typeof window === "undefined") return;

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => callback(), { timeout: 2000 });
    return;
  }

  window.setTimeout(callback, 200);
}
