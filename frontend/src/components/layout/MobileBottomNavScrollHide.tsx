"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import BottomNav from "./BottomNav";
import {
  initialMobileBottomNavScrollState,
  nextMobileBottomNavScrollState,
} from "@/src/lib/mobileBottomNavScroll";
import styles from "./MobileBottomNavScrollHide.module.css";

type Props = {
  onMoreMenuOpenChange: (open: boolean) => void;
  holdVisible: boolean;
};

/**
 * Locate BottomNav's fixed bar within this box-free scope. Avoid changing
 * BottomNav's own rendering, menus, safe-area offsets, or navigation links.
 * The explicit bounds reject fullscreen drawers and floating action buttons.
 */
function findMobileBottomBar(scope: HTMLElement): HTMLElement | null {
  const candidates = scope.querySelectorAll<HTMLElement>(
    "nav, footer, [role='navigation'], div",
  );

  for (const candidate of candidates) {
    const style = window.getComputedStyle(candidate);
    if (style.position !== "fixed" || style.display === "none") continue;

    const rect = candidate.getBoundingClientRect();
    if (
      rect.width >= 180 &&
      rect.height >= 38 &&
      rect.height <= 180 &&
      rect.top >= window.innerHeight - 250 &&
      rect.bottom >= window.innerHeight - 70 &&
      rect.bottom <= window.innerHeight + 90
    ) {
      return candidate;
    }
  }

  return null;
}

/** iPhone: down hides, up shows; desktop and open menus always show. */
export default function MobileBottomNavScrollHide({
  onMoreMenuOpenChange,
  holdVisible,
}: Props) {
  const pathname = usePathname();
  const scopeRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const scope = scopeRef.current;
    const scroller = document.querySelector<HTMLElement>(".finance-main");
    if (!scope || !scroller) return;

    const mobile = window.matchMedia("(max-width: 767px)");
    let state = initialMobileBottomNavScrollState(scroller.scrollTop);
    let currentHidden = false;

    const setVisibility = (shouldHide: boolean) => {
      if (currentHidden === shouldHide) return;
      currentHidden = shouldHide;
      setHidden(shouldHide);
      if (targetRef.current) {
        targetRef.current.inert = shouldHide;
      }
    };

    const markBottomBar = () => {
      if (targetRef.current?.isConnected) return;
      const found = findMobileBottomBar(scope);
      if (!found) return;
      found.setAttribute("data-myfinance-mobile-bottom-nav-target", "true");
      found.inert = currentHidden;
      targetRef.current = found;
    };

    const reset = () => {
      state = initialMobileBottomNavScrollState(scroller.scrollTop);
      setVisibility(false);
      markBottomBar();
    };

    const onScroll = () => {
      if (!mobile.matches || holdVisible) {
        reset();
        return;
      }
      state = nextMobileBottomNavScrollState(state, scroller.scrollTop);
      setVisibility(state.hidden);
    };

    // iPhone Safari can resize the visual viewport while its browser chrome
    // collapses during scrolling. That must NOT reveal the nav accidentally.
    let lastWidth = window.innerWidth;
    const onScreenChange = () => {
      if (window.innerWidth !== lastWidth) {
        lastWidth = window.innerWidth;
        reset();
      } else {
        markBottomBar();
      }
    };
    markBottomBar();

    // BottomNav is expected to render immediately, but this also supports a
    // delayed menu/nav subtree without continuously polling the document.
    const observer = new MutationObserver(markBottomBar);
    observer.observe(scope, { childList: true, subtree: true });

    scroller.addEventListener("scroll", onScroll, { passive: true });
    mobile.addEventListener("change", onScreenChange);
    window.addEventListener("pageshow", reset);
    window.addEventListener("resize", onScreenChange, { passive: true });

    // Always reveal after navigating, opening an overlay, or resizing.
    reset();

    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", onScroll);
      mobile.removeEventListener("change", onScreenChange);
      window.removeEventListener("pageshow", reset);
      window.removeEventListener("resize", onScreenChange);
      const target = targetRef.current;
      if (target) {
        target.inert = false;
        target.removeAttribute("data-myfinance-mobile-bottom-nav-target");
      }
      targetRef.current = null;
    };
  }, [pathname, holdVisible]);

  return (
    <div ref={scopeRef} className={styles.scope} data-hidden={hidden ? "true" : "false"}>
      <BottomNav onMoreMenuOpenChange={onMoreMenuOpenChange} />
    </div>
  );
}
