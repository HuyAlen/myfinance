"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Shared deep-link contract for Quick Action: `?action=create` tells a page
 * to open its own canonical create form instead of just navigating there.
 * `quickActionMode` is an optional, one-shot refinement for create flows that
 * already support a meaningful sub-mode (currently transaction transfer).
 */
export const QUICK_ACTION_PARAM = "action";
export const QUICK_ACTION_CREATE = "create";
export const QUICK_ACTION_MODE_PARAM = "quickActionMode";

export type QuickActionCreateMode = "transfer";

export function buildQuickActionCreateHref(
  pathname: string,
  mode?: QuickActionCreateMode,
) {
  const modeQuery = mode
    ? `&${QUICK_ACTION_MODE_PARAM}=${encodeURIComponent(mode)}`
    : "";
  return `${pathname}?${QUICK_ACTION_PARAM}=${QUICK_ACTION_CREATE}${modeQuery}`;
}

/**
 * Consumes a one-shot `?action=create` intent: calls `onCreate` once when
 * the param is present, then strips both the action and optional mode from
 * the URL so refresh/back navigation cannot re-arm it. The callback is read
 * through a ref so changes to page-local create closures do not re-run the
 * URL-driven effect by themselves.
 *
 * Same-page re-taps still work because `useSearchParams()` observes the new
 * query string, then the intent is consumed back to the clean pathname.
 */
export function useQuickActionCreateIntent(
  onCreate: (mode?: QuickActionCreateMode) => void,
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const actionParam = searchParams.get(QUICK_ACTION_PARAM);
  const modeParam = searchParams.get(QUICK_ACTION_MODE_PARAM);
  const createMode: QuickActionCreateMode | undefined =
    modeParam === "transfer" ? "transfer" : undefined;

  const onCreateRef = useRef(onCreate);
  useEffect(() => {
    onCreateRef.current = onCreate;
  });

  useEffect(() => {
    if (actionParam !== QUICK_ACTION_CREATE) return;

    onCreateRef.current(createMode);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete(QUICK_ACTION_PARAM);
    nextParams.delete(QUICK_ACTION_MODE_PARAM);
    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [actionParam, createMode, pathname, router, searchParams]);
}