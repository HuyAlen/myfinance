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
import {
  acceptCurrentHouseholdInvite,
  createHouseholdInvite,
  getHouseholdContext,
  invalidateFinanceScopeCache,
  removeHouseholdMember,
  renameCurrentHousehold,
  revokeHouseholdInvite,
  setHouseholdMemberRole,
  type HouseholdContext as HouseholdContextValue,
  type HouseholdRole,
} from "@/src/services/finance/householdService";

type HouseholdContextType = {
  context: HouseholdContextValue | null;
  household: HouseholdContextValue["household"] | null;
  role: HouseholdRole | null;
  financeOwnerUserId: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  invite: (email: string, role: "member" | "viewer") => Promise<void>;
  acceptInvite: () => Promise<void>;
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
  loading: true,
  error: null,
  refresh: async () => {},
  invite: async () => {},
  acceptInvite: async () => {},
  revokeInvite: async () => {},
  removeMember: async () => {},
  changeMemberRole: async () => {},
  renameHousehold: async () => {},
});

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const authUserId = user?.id ?? null;
  const [context, setContext] = useState<HouseholdContextValue | null>(null);
  const [contextAuthUserId, setContextAuthUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!authUserId) {
      invalidateFinanceScopeCache();
      setContext(null);
      setContextAuthUserId(null);
      setError(null);
      setLoading(false);
      return;
    }

    const requestedAuthUserId = authUserId;
    setLoading(true);
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
      setLoading(false);
    }
  }, [authUserId]);

  useEffect(() => {
    if (authLoading) return;
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [authLoading, refresh]);

  const invite = useCallback(
    async (email: string, role: "member" | "viewer") => {
      await createHouseholdInvite(email, role);
      await refresh();
    },
    [refresh],
  );

  const acceptInvite = useCallback(async () => {
    await acceptCurrentHouseholdInvite();
    await refresh();
  }, [refresh]);

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

  const value = useMemo<HouseholdContextType>(
    () => ({
      context: activeContext,
      household: activeContext?.household ?? null,
      role: activeContext?.role ?? null,
      financeOwnerUserId: activeContext?.financeOwnerUserId ?? null,
      loading: authLoading || loading,
      error,
      refresh,
      invite,
      acceptInvite,
      revokeInvite,
      removeMember,
      changeMemberRole,
      renameHousehold,
    }),
    [
      acceptInvite,
      authLoading,
      activeContext,
      changeMemberRole,
      error,
      invite,
      loading,
      refresh,
      removeMember,
      renameHousehold,
      revokeInvite,
    ],
  );

  if (authUserId && !activeContext) {
    if (error && !loading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <div className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-6 text-center shadow-sm">
            <p className="text-sm font-black text-slate-900">Không thể xác định không gian tài chính</p>
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
