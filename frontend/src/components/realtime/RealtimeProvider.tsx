"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { useHousehold } from "@/src/components/household/HouseholdProvider";
import { supabase } from "@/src/lib/supabase";
import { markInstant, measureAndReport } from "@/src/lib/performance/performanceMarks";
import {
  getRealtimeRecoveryDelayMs,
  isRealtimeFailureState,
  realtimeSubscriptionErrorMessage,
  shouldRecoverRealtimeAfterForeground,
} from "@/src/lib/realtime/realtimeRecovery";

// ─── Types ────────────────────────────────────────────────────────────────────

type RealtimeTable =
  | "wallets"
  | "wallet_reconciliations"
  | "categories"
  | "transactions"
  | "transaction_rules"
  | "transaction_review_acknowledgements"
  | "budgets"
  | "goals"
  | "debts"
  | "investments"
  | "forex_accounts"
  | "forex_cash_transactions"
  | "savings"
  | "saving_transactions"
  | "net_worth_snapshots";

type ReloadCallback = () => void | Promise<void>;

type RealtimeContextType = {
  /** Current Supabase channel subscription state */
  status: REALTIME_SUBSCRIBE_STATES | "INITIAL";
  /** ISO timestamp of the last received realtime event, or null if none yet */
  lastSync: Date | null;
  /** Internal: register a callback for one or more tables */
  _register: (tables: RealtimeTable[], cb: ReloadCallback) => () => void;
};

// ─── Context ──────────────────────────────────────────────────────────────────

const RealtimeContext = createContext<RealtimeContextType>({
  status: "INITIAL",
  lastSync: null,
  _register: () => () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user, session } = useAuth();
  const { financeOwnerUserId } = useHousehold();
  const [status, setStatus] = useState<REALTIME_SUBSCRIBE_STATES | "INITIAL">(
    "INITIAL",
  );
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [recoveryRevision, setRecoveryRevision] = useState(0);
  const statusRef = useRef<REALTIME_SUBSCRIBE_STATES | "INITIAL">("INITIAL");
  const recoveryAttemptRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);
  const channelGenerationRef = useRef(0);
  const hasEverSubscribedRef = useRef(false);

  // Map from table name → Set of callbacks registered by pages
  const listenersRef = useRef<Map<RealtimeTable, Set<ReloadCallback>>>(
    new Map(),
  );

  // Register a page's reload callback for specific tables
  const register = useCallback(
    (tables: RealtimeTable[], cb: ReloadCallback) => {
      for (const table of tables) {
        if (!listenersRef.current.has(table)) {
          listenersRef.current.set(table, new Set());
        }
        listenersRef.current.get(table)!.add(cb);
      }
      return () => {
        for (const table of tables) {
          listenersRef.current.get(table)?.delete(cb);
        }
      };
    },
    [],
  );

  const hasReportedRealtimeReadyRef = useRef(false);
  const sessionAccessToken = session?.access_token ?? null;

  useEffect(() => {
    if (!user?.id || !financeOwnerUserId) {
      statusRef.current = "INITIAL";
      recoveryAttemptRef.current = 0;
      hiddenAtRef.current = null;
      return;
    }

    let active = true;
    let recoveryTimerId: number | null = null;
    const generation = ++channelGenerationRef.current;

    statusRef.current = "INITIAL";
    queueMicrotask(() => {
      if (!active || channelGenerationRef.current !== generation) return;
      setStatus("INITIAL");
    });
    markInstant("realtime:subscribe:start");

    const invokeReloadCallback = (
      cb: ReloadCallback,
      reason: "event" | "recovery",
    ) => {
      try {
        void Promise.resolve(cb()).catch(() => {
          console.warn(
            `[RealtimeProvider] ${reason} refresh callback failed.`,
          );
        });
      } catch {
        console.warn(
          `[RealtimeProvider] ${reason} refresh callback failed.`,
        );
      }
    };

    const reconcileRegisteredListeners = () => {
      const uniqueCallbacks = new Set<ReloadCallback>();

      for (const callbacks of listenersRef.current.values()) {
        for (const cb of callbacks) {
          uniqueCallbacks.add(cb);
        }
      }

      for (const cb of uniqueCallbacks) {
        invokeReloadCallback(cb, "recovery");
      }
    };

    const clearRecoveryTimer = () => {
      if (recoveryTimerId === null) return;
      window.clearTimeout(recoveryTimerId);
      recoveryTimerId = null;
    };

    const scheduleRecovery = (delayMs: number) => {
      if (
        !active ||
        recoveryTimerId !== null ||
        navigator.onLine === false
      ) {
        return;
      }

      recoveryTimerId = window.setTimeout(() => {
        recoveryTimerId = null;
        if (!active) return;
        setRecoveryRevision((current) => current + 1);
      }, delayMs);
    };

    const scheduleFailureRecovery = () => {
      if (
        !active ||
        recoveryTimerId !== null ||
        navigator.onLine === false
      ) {
        return;
      }

      const attempt = recoveryAttemptRef.current;
      recoveryAttemptRef.current += 1;
      scheduleRecovery(getRealtimeRecoveryDelayMs(attempt));
    };

    const onOffline = () => {
      if (!active) return;

      clearRecoveryTimer();
      statusRef.current = REALTIME_SUBSCRIBE_STATES.CLOSED;
      setStatus(REALTIME_SUBSCRIBE_STATES.CLOSED);
    };

    const onOnline = () => {
      if (!active) return;
      recoveryAttemptRef.current = 0;
      clearRecoveryTimer();
      scheduleRecovery(0);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }

      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;

      if (
        shouldRecoverRealtimeAfterForeground({
          hiddenAt,
          now: Date.now(),
        })
      ) {
        recoveryAttemptRef.current = 0;
        clearRecoveryTimer();
        scheduleRecovery(0);
        return;
      }

      if (statusRef.current !== REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        scheduleFailureRecovery();
      }
    };

    const onFocus = () => {
      if (
        document.visibilityState !== "hidden" &&
        statusRef.current !== REALTIME_SUBSCRIBE_STATES.SUBSCRIBED
      ) {
        scheduleFailureRecovery();
      }
    };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const tables: RealtimeTable[] = [
      "wallets",
      "wallet_reconciliations",
      "categories",
      "transactions",
      "transaction_rules",
      "transaction_review_acknowledgements",
      "budgets",
      "goals",
      "debts",
      "investments",
      "forex_accounts",
      "forex_cash_transactions",
      "savings",
      "saving_transactions",
      "net_worth_snapshots",
    ];

    const channel = supabase.channel(`myfinance-global-${financeOwnerUserId}`);

    for (const table of tables) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `user_id=eq.${financeOwnerUserId}`,
        },
        () => {
          if (!active || channelGenerationRef.current !== generation) {
            return;
          }

          setLastSync(new Date());
          listenersRef.current.get(table)?.forEach((cb) => {
            invokeReloadCallback(cb, "event");
          });
        },
      );
    }

    channel.subscribe((state, error) => {
      if (!active || channelGenerationRef.current !== generation) {
        return;
      }

      statusRef.current = state;
      setStatus(state);

      if (state === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        clearRecoveryTimer();
        recoveryAttemptRef.current = 0;

        const shouldReconcile = hasEverSubscribedRef.current;
        hasEverSubscribedRef.current = true;

        if (!hasReportedRealtimeReadyRef.current) {
          hasReportedRealtimeReadyRef.current = true;
          measureAndReport(
            "realtime_ready",
            "realtime:subscribe:start",
            "realtime:subscribed",
            { status: "success" },
          );
        }

        if (shouldReconcile) {
          reconcileRegisteredListeners();
        }

        return;
      }

      if (!isRealtimeFailureState(state)) {
        return;
      }

      if (error) {
        console.warn(
          `[RealtimeProvider] ${state}:`,
          realtimeSubscriptionErrorMessage(error),
        );
      }

      scheduleFailureRecovery();
    });

    return () => {
      active = false;
      clearRecoveryTimer();
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);

      if (channelGenerationRef.current === generation) {
        channelGenerationRef.current += 1;
      }

      void supabase.removeChannel(channel);
    };
  }, [
    financeOwnerUserId,
    recoveryRevision,
    sessionAccessToken,
    user?.id,
  ]);

  const effectiveStatus = user?.id && financeOwnerUserId ? status : "INITIAL";
  const effectiveLastSync = user?.id && financeOwnerUserId ? lastSync : null;

  return (
    <RealtimeContext.Provider
      value={{
        status: effectiveStatus,
        lastSync: effectiveLastSync,
        _register: register,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Access connection status and last sync time */
export function useRealtime() {
  const { status, lastSync } = useContext(RealtimeContext);
  return { status, lastSync };
}

/**
 * Register a reload callback that fires whenever any of the given tables
 * receive a Supabase Realtime event.
 */
export function useRealtimeTable(tables: RealtimeTable[], cb: ReloadCallback) {
  const { _register } = useContext(RealtimeContext);
  const cbRef = useRef(cb);

  useEffect(() => {
    cbRef.current = cb;
  });

  useEffect(() => {
    const stableCb: ReloadCallback = () => cbRef.current();
    const unregister = _register(tables, stableCb);
    return unregister;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_register, tables.join(",")]);
}
