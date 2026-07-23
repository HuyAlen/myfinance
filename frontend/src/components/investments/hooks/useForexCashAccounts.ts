"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ForexAccount,
  ForexCashTransaction,
  Wallet,
} from "@/src/types/finance";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import { forexAccountRepository } from "../data/forexAccountRepository";
import { forexCashTransactionRepository } from "../data/forexCashTransactionRepository";
import { getWallets } from "@/src/services/finance/financeStorage";

export function useForexCashAccounts() {
  const [accounts, setAccounts] = useState<ForexAccount[]>([]);
  const [transactions, setTransactions] = useState<ForexCashTransaction[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoadError(null);
      const [nextAccounts, nextTransactions, nextWallets] = await Promise.all([
        forexAccountRepository.list(),
        forexCashTransactionRepository.list(),
        getWallets(),
      ]);
      setAccounts(nextAccounts);
      setTransactions(nextTransactions);
      setWallets(nextWallets);
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
      getWallets(),
    ])
      .then(([nextAccounts, nextTransactions, nextWallets]) => {
        if (cancelled) return;
        setAccounts(nextAccounts);
        setTransactions(nextTransactions);
        setWallets(nextWallets);
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

  useRealtimeTable(
    ["forex_accounts", "forex_cash_transactions", "wallets"],
    reload,
  );

  return { accounts, transactions, wallets, isLoading, loadError, reload };
}
