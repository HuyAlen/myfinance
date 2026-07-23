"use client";

import { useCallback, useEffect, useState } from "react";
import type { Investment } from "@/src/types/finance";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import { investmentRepository } from "../data/investmentRepository";

export function useInvestments() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoadError(null);
      setInvestments(await investmentRepository.list());
    } catch (error) {
      console.error("[useInvestments] reload:", error);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Không thể tải danh mục đầu tư. Vui lòng thử lại.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void investmentRepository
      .list()
      .then((items) => {
        if (cancelled) return;
        setLoadError(null);
        setInvestments(items);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("[useInvestments] initial load:", error);
        setLoadError(
          error instanceof Error
            ? error.message
            : "Không thể tải danh mục đầu tư. Vui lòng thử lại.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useRealtimeTable(["investments"], reload);

  return { investments, isLoading, loadError, reload, setIsLoading };
}
