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
import type { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { supabase } from "@/src/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

type RealtimeTable =
  | "wallets"
  | "categories"
  | "transactions"
  | "budgets"
  | "goals"
  | "debts"
  | "investments"
  | "forex_accounts"
  | "forex_cash_transactions";

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
  const { user } = useAuth();
  const [status, setStatus] = useState<REALTIME_SUBSCRIBE_STATES | "INITIAL">(
    "INITIAL",
  );
  const [lastSync, setLastSync] = useState<Date | null>(null);

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

  useEffect(() => {
    if (!user?.id) return;

    const tables: RealtimeTable[] = [
      "wallets",
      "categories",
      "transactions",
      "budgets",
      "goals",
      "debts",
      "investments",
      "forex_accounts",
      "forex_cash_transactions",
    ];

    const channel = supabase.channel(`myfinance-global-${user.id}`);

    for (const table of tables) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          setLastSync(new Date());
          listenersRef.current.get(table)?.forEach((cb) => {
            void cb();
          });
        },
      );
    }

    channel.subscribe((state) => {
      setStatus(state);
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const effectiveStatus = user?.id ? status : "INITIAL";
  const effectiveLastSync = user?.id ? lastSync : null;

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
