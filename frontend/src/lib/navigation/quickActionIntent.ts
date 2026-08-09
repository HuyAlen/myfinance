"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Shared deep-link contract for Quick Action: `?action=create` tells a page
 * to open its own canonical create form instead of just navigating there.
 * One param name/value pair, reused by every page instead of one-off
 * query-string literals.
 */
export const QUICK_ACTION_PARAM = "action";
export const QUICK_ACTION_CREATE = "create";

export function buildQuickActionCreateHref(pathname: string) {
  return `${pathname}?${QUICK_ACTION_PARAM}=${QUICK_ACTION_CREATE}`;
}

/**
 * Consumes a one-shot `?action=create` intent: calls `onCreate` once when
 * the param is present, then strips it from the URL so a refresh, back
 * navigation, or later closing the form never re-arms it. `onCreate` is read
 * through a ref (not a dependency) so this effect only re-runs when the URL
 * itself changes — passing the page's latest `openCreateForm` closure every
 * render can't cause the effect to loop or re-open the form spuriously.
 *
 * Also fires again after a same-page re-tap of the Quick Action button:
 * `useSearchParams()` reflects the new query string without the page
 * remounting, so the effect's `actionParam` dependency changes and reruns.
 */
export function useQuickActionCreateIntent(onCreate: () => void) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const actionParam = searchParams.get(QUICK_ACTION_PARAM);

  const onCreateRef = useRef(onCreate);
  useEffect(() => {
    onCreateRef.current = onCreate;
  });

  useEffect(() => {
    if (actionParam !== QUICK_ACTION_CREATE) return;

    onCreateRef.current();

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete(QUICK_ACTION_PARAM);
    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [actionParam, pathname, router, searchParams]);
}
