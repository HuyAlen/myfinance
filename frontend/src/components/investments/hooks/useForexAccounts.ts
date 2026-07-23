"use client";

import { useCallback, useEffect, useState } from "react";
import type { ForexAccount, ForexCashTransaction } from "@/src/types/finance";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import { forexAccountRepository } from "../data/forexAccountRepository";
import { forexCashTransactionRepository } from "../data/forexCashTransactionRepository";

export function useForexCashAccounts() {
  const [accounts, setAccounts] = useState<ForexAccount[]>([]);
  const [transactions, setTransactions] = useState<ForexCashTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoadError(null);
      const [nextAccounts, nextTransactions] = await Promise.all([
        forexAccountRepository.list(),
        forexCashTransactionRepository.list(),
      ]);
      setAccounts(nextAccounts);
      setTransactions(nextTransactions);
    } catch (error) {
      console.error("[useForexCashAccounts] reload:", error);
      setLoadError(
        error instanceof Error ? error.message : "Không thể tải dữ liệu Forex.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      forexAccountRepository.list(),
      forexCashTransactionRepository.list(),
    ])
      .then(([nextAccounts, nextTransactions]) => {
        if (cancelled) return;
        setAccounts(nextAccounts);
        setTransactions(nextTransactions);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Không thể tải dữ liệu Forex.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useRealtimeTable(["forex_accounts", "forex_cash_transactions"], reload);

  return { accounts, transactions, isLoading, loadError, reload };
}
