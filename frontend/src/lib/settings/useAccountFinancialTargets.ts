"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { accountSettingsKey } from "@/src/lib/date/dateFormatPreference";
import { DEFAULT_FINANCIAL_TARGETS, readAccountFinancialTargets } from "./effectivePreferences";

export const FINANCIAL_TARGETS_SAVED_EVENT = "myfinance:financial-targets-saved";

export function notifyFinancialTargetsSaved(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(FINANCIAL_TARGETS_SAVED_EVENT));
  }
}

export function useAccountFinancialTargets() {
  const { user } = useAuth();
  const accountId = user?.id ?? null;
  const subscribe = useCallback((listener: () => void) => {
    if (!accountId || typeof window === "undefined") return () => undefined;
    const onSaved = () => listener();
    const onStorage = (event: StorageEvent) => {
      if (event.key === accountSettingsKey(accountId) || event.key === null) listener();
    };
    window.addEventListener(FINANCIAL_TARGETS_SAVED_EVENT, onSaved);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(FINANCIAL_TARGETS_SAVED_EVENT, onSaved);
      window.removeEventListener("storage", onStorage);
    };
  }, [accountId]);
  // Primitive store snapshot prevents useSyncExternalStore re-render loops.
  const getSnapshot = useCallback(() => {
    const targets = readAccountFinancialTargets(accountId);
    return `${targets.savingsGoalPercent}|${targets.emergencyFundMonths}`;
  }, [accountId]);
  const serverSnapshot = useCallback(() =>
    `${DEFAULT_FINANCIAL_TARGETS.savingsGoalPercent}|${DEFAULT_FINANCIAL_TARGETS.emergencyFundMonths}`, []);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  return useMemo(() => {
    const [savingsGoalPercent, emergencyFundMonths] = snapshot.split("|").map(Number);
    return { savingsGoalPercent, emergencyFundMonths };
  }, [snapshot]);
}
