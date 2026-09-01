"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/src/components/auth/AuthProvider";
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

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    if (!authUserId) {
      invalidateFinanceScopeCache();
      setContext(null);
      setContextAuthUserId(null);
      setError(null);
      setLoading(false);
      return;
    }
    const requestedAuthUserId = authUserId;
    if (!options?.silent) setLoading(true);
    try {
      const next = await getHouseholdContext();
      setContext(next);
      setContextAuthUserId(requestedAuthUserId);
      setError(null);
    } catch (loadError) {
      console.error("[HouseholdProvider] refresh failed:", loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Không thể tải không gian tài chính dùng chung.",
      );
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [authUserId]);

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
    if (!authUserId || !authEmail || typeof supabase.channel !== "function") return;
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
  }, [authEmail, authUserId, refresh]);

  // HOUSEHOLD-WORKSPACE-1: no polling is needed for in-app invites.
  // Refresh when the user returns to MyFinance so an invite created in another
  // session appears in the bell/settings without requiring a manual reload.
  useEffect(() => {
    if (!authUserId) return;
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
  }, [authUserId, refresh]);

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
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <div className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-6 text-center shadow-sm">
            <p className="text-sm font-black text-slate-900">
              Không thể xác định không gian tài chính
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">{error}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-4 min-h-11 rounded-2xl bg-blue-600 px-5 text-sm font-bold text-white"
            >
              Thử lại
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-semibold text-slate-500">
        Đang tải không gian tài chính...
      </div>
    );
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
