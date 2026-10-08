"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/src/components/auth/AuthProvider";
import StartupShellSkeleton from "@/src/components/layout/StartupShellSkeleton";
import { supabase } from "@/src/lib/supabase";
import {
  acceptHouseholdInvite,
  createHouseholdInvite,
  declineHouseholdInvite,
  getHouseholdContext,
  invalidateFinanceScopeCache,
  leaveHousehold as leaveHouseholdService,
  removeHouseholdMember,
  renameCurrentHousehold,
  revokeHouseholdInvite,
  setHouseholdMemberRole,
  switchFinanceWorkspace,
  type FinanceWorkspace,
  type HouseholdContext as HouseholdContextValue,
  type HouseholdInviteAcceptance,
  type HouseholdRole,
} from "@/src/services/finance/householdService";

type HouseholdContextType = {
  context: HouseholdContextValue | null;
  household: HouseholdContextValue["household"] | null;
  role: HouseholdRole | null;
  financeOwnerUserId: string | null;
  workspaces: FinanceWorkspace[];
  activeWorkspace: FinanceWorkspace | null;
  personalWorkspace: FinanceWorkspace | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  invite: (email: string, role: "member" | "viewer") => Promise<void>;
  acceptInvite: (inviteId: string) => Promise<HouseholdInviteAcceptance>;
  declineInvite: (inviteId: string) => Promise<void>;
  switchWorkspace: (householdId: string) => Promise<void>;
  leaveHousehold: (householdId: string) => Promise<void>;
  revokeInvite: (inviteId: string) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  changeMemberRole: (
    userId: string,
    role: "member" | "viewer",
  ) => Promise<void>;
  renameHousehold: (name: string) => Promise<void>;
};

const HOUSEHOLD_BOOTSTRAP_TIMEOUT_MS = 12_000;
const HOUSEHOLD_BOOTSTRAP_TIMEOUT_MESSAGE =
  "Không thể tải không gian tài chính trong thời gian cho phép.";
const HOUSEHOLD_BOOTSTRAP_ERROR_MESSAGE =
  "MyFinance chưa tải được không gian tài chính. Hãy kiểm tra kết nối và thử lại.";

function loadHouseholdContextWithTimeout(): Promise<HouseholdContextValue> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(HOUSEHOLD_BOOTSTRAP_TIMEOUT_MESSAGE));
    }, HOUSEHOLD_BOOTSTRAP_TIMEOUT_MS);

    void getHouseholdContext().then(
      (next) => {
        window.clearTimeout(timeoutId);
        resolve(next);
      },
      (loadError: unknown) => {
        window.clearTimeout(timeoutId);
        reject(loadError);
      },
    );
  });
}

const HouseholdContext = createContext<HouseholdContextType>({
  context: null,
  household: null,
  role: null,
  financeOwnerUserId: null,
  workspaces: [],
  activeWorkspace: null,
  personalWorkspace: null,
  loading: true,
  error: null,
  refresh: async () => {},
  invite: async () => {},
  acceptInvite: async () => ({
    householdId: "",
    activeHouseholdId: "",
    personalHouseholdId: "",
  }),
  declineInvite: async () => {},
  switchWorkspace: async () => {},
  leaveHousehold: async () => {},
  revokeInvite: async () => {},
  removeMember: async () => {},
  changeMemberRole: async () => {},
  renameHousehold: async () => {},
});

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const authUserId = user?.id ?? null;
  const authEmail = user?.email?.trim().toLowerCase() ?? "";
  const [context, setContext] = useState<HouseholdContextValue | null>(null);
  const [contextAuthUserId, setContextAuthUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshRevisionRef = useRef(0);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    const requestRevision = ++refreshRevisionRef.current;

    if (!authUserId) {
      invalidateFinanceScopeCache();
      setContext(null);
      setContextAuthUserId(null);
      setError(null);
      setLoading(false);
      return;
    }

    const requestedAuthUserId = authUserId;
    if (!options?.silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const next = await loadHouseholdContextWithTimeout();

      if (refreshRevisionRef.current !== requestRevision) {
        return;
      }

      setContext(next);
      setContextAuthUserId(requestedAuthUserId);
      setError(null);
    } catch (loadError) {
      if (refreshRevisionRef.current !== requestRevision) {
        return;
      }

      const message =
        loadError instanceof Error
          ? loadError.message
          : "Household bootstrap failed.";
      console.error(
        "[HouseholdProvider] refresh failed:",
        message.slice(0, 240),
      );
      setError(
        message === HOUSEHOLD_BOOTSTRAP_TIMEOUT_MESSAGE
          ? HOUSEHOLD_BOOTSTRAP_TIMEOUT_MESSAGE
          : HOUSEHOLD_BOOTSTRAP_ERROR_MESSAGE,
      );
    } finally {
      if (refreshRevisionRef.current === requestRevision) {
        setLoading(false);
      }
    }
  }, [authUserId]);

  useEffect(() => {
    return () => {
      refreshRevisionRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [authLoading, refresh]);

  // Pending invites are delivered through the Supabase Realtime publication.
  // The SQL policy only exposes rows addressed to the authenticated email; the
  // foreground refresh below remains a safe fallback after reconnect/sleep.
  useEffect(() => {
    if (
      !authUserId ||
      contextAuthUserId !== authUserId ||
      !authEmail ||
      typeof supabase.channel !== "function"
    ) {
      return;
    }
    const channel = supabase
      .channel(`household-invites:${authUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "household_invites",
          filter: `email=eq.${authEmail}`,
        },
        () => {
          void refresh({ silent: true });
        },
      )
      .subscribe();
    return () => {
      if (typeof supabase.removeChannel === "function") {
        void supabase.removeChannel(channel);
      }
    };
  }, [authEmail, authUserId, contextAuthUserId, refresh]);

  // HOUSEHOLD-WORKSPACE-1: no polling is needed for in-app invites.
  // Refresh when the user returns to MyFinance so an invite created in another
  // session appears in the bell/settings without requiring a manual reload.
  useEffect(() => {
    if (!authUserId || contextAuthUserId !== authUserId) return;
    let timer: number | null = null;
    const scheduleRefresh = () => {
      if (document.visibilityState === "hidden") return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void refresh({ silent: true });
      }, 120);
    };
    window.addEventListener("focus", scheduleRefresh);
    document.addEventListener("visibilitychange", scheduleRefresh);
    return () => {
      window.removeEventListener("focus", scheduleRefresh);
      document.removeEventListener("visibilitychange", scheduleRefresh);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [authUserId, contextAuthUserId, refresh]);

  const invite = useCallback(
    async (email: string, role: "member" | "viewer") => {
      await createHouseholdInvite(email, role);
      await refresh();
    },
    [refresh],
  );

  const acceptInvite = useCallback(
    async (inviteId: string) => {
      const receipt = await acceptHouseholdInvite(inviteId);
      await refresh();
      return receipt;
    },
    [refresh],
  );

  const declineInvite = useCallback(
    async (inviteId: string) => {
      await declineHouseholdInvite(inviteId);
      await refresh();
    },
    [refresh],
  );

  const switchWorkspace = useCallback(
    async (householdId: string) => {
      await switchFinanceWorkspace(householdId);
      await refresh();
    },
    [refresh],
  );

  const leaveHousehold = useCallback(
    async (householdId: string) => {
      await leaveHouseholdService(householdId);
      await refresh();
    },
    [refresh],
  );

  const revokeInvite = useCallback(
    async (inviteId: string) => {
      await revokeHouseholdInvite(inviteId);
      await refresh();
    },
    [refresh],
  );

  const removeMember = useCallback(
    async (userId: string) => {
      await removeHouseholdMember(userId);
      await refresh();
    },
    [refresh],
  );

  const changeMemberRole = useCallback(
    async (userId: string, role: "member" | "viewer") => {
      await setHouseholdMemberRole(userId, role);
      await refresh();
    },
    [refresh],
  );

  const renameHousehold = useCallback(
    async (name: string) => {
      await renameCurrentHousehold(name);
      await refresh();
    },
    [refresh],
  );

  const activeContext =
    authUserId && contextAuthUserId === authUserId ? context : null;
  const workspaces = useMemo(
    () => activeContext?.workspaces ?? [],
    [activeContext],
  );
  const activeWorkspace =
    workspaces.find(
      (workspace) =>
        workspace.householdId === activeContext?.activeHouseholdId ||
        workspace.isActive,
    ) ?? null;
  const personalWorkspace =
    workspaces.find(
      (workspace) =>
        workspace.householdId === activeContext?.personalHouseholdId ||
        workspace.isPersonal,
    ) ?? null;

  const value = useMemo<HouseholdContextType>(
    () => ({
      context: activeContext,
      household: activeContext?.household ?? null,
      role: activeContext?.role ?? null,
      financeOwnerUserId: activeContext?.financeOwnerUserId ?? null,
      workspaces,
      activeWorkspace,
      personalWorkspace,
      loading: authLoading || loading,
      error,
      refresh,
      invite,
      acceptInvite,
      declineInvite,
      switchWorkspace,
      leaveHousehold,
      revokeInvite,
      removeMember,
      changeMemberRole,
      renameHousehold,
    }),
    [
      acceptInvite,
      activeContext,
      activeWorkspace,
      authLoading,
      changeMemberRole,
      declineInvite,
      error,
      invite,
      leaveHousehold,
      loading,
      personalWorkspace,
      refresh,
      removeMember,
      renameHousehold,
      revokeInvite,
      switchWorkspace,
      workspaces,
    ],
  );

  if (authUserId && !activeContext) {
    if (error && !loading) {
      return (
        <main className="flex min-h-(--app-height) items-center justify-center bg-[var(--finance-page)] px-4 py-8 sm:px-6">
          <section
            role="alert"
            aria-live="assertive"
            aria-labelledby="household-recovery-title"
            className="w-full max-w-lg rounded-3xl border border-blue-100 bg-white p-5 text-center shadow-[0_12px_40px_rgba(54,83,107,0.10)] sm:p-7"
          >
            <div
              aria-hidden="true"
              className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-xl font-black text-blue-600"
            >
              !
            </div>

            <h1
              id="household-recovery-title"
              className="mt-4 text-xl font-black tracking-tight text-slate-900 sm:text-2xl"
            >
              Không thể tải không gian tài chính
            </h1>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
              {error}
            </p>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void refresh()}
                className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Thử tải lại
              </button>

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Tải lại ứng dụng
              </button>
            </div>
          </section>
        </main>
      );
    }

    return <StartupShellSkeleton />;
  }

  return (
    <HouseholdContext.Provider value={value}>
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  return useContext(HouseholdContext);
}
