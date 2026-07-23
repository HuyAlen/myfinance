"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
export type ChecklistItemId =
  | "wallet"
  | "transaction"
  | "budget"
  | "goal"
  | "report"
  | "ai";

export type AchievementId =
  | "first_wallet"
  | "first_transaction"
  | "first_budget"
  | "first_goal"
  | "first_report"
  | "first_ai";

export type Achievement = {
  id: AchievementId;
  title: string;
  emoji: string;
};

export const ACHIEVEMENTS: Record<AchievementId, Achievement> = {
  first_wallet: { id: "first_wallet", emoji: "🎉", title: "Ví đầu tiên!" },
  first_transaction: {
    id: "first_transaction",
    emoji: "🎉",
    title: "Giao dịch đầu tiên!",
  },
  first_budget: {
    id: "first_budget",
    emoji: "🎉",
    title: "Ngân sách đầu tiên!",
  },
  first_goal: { id: "first_goal", emoji: "🎉", title: "Mục tiêu đầu tiên!" },
  first_report: { id: "first_report", emoji: "📊", title: "Báo cáo đầu tiên!" },
  first_ai: { id: "first_ai", emoji: "🤖", title: "AI Insights đầu tiên!" },
};

export const CHECKLIST_ITEMS: Array<{
  id: ChecklistItemId;
  label: string;
  desc: string;
  href: string;
  achievementId: AchievementId;
}> = [
  {
    id: "wallet",
    label: "Tạo ví đầu tiên",
    desc: "Thêm ít nhất một ví tiền",
    href: "/wallets",
    achievementId: "first_wallet",
  },
  {
    id: "transaction",
    label: "Thêm giao dịch đầu tiên",
    desc: "Ghi lại khoản thu hoặc chi đầu tiên",
    href: "/transactions",
    achievementId: "first_transaction",
  },
  {
    id: "budget",
    label: "Tạo ngân sách đầu tiên",
    desc: "Đặt ngân sách cho một danh mục",
    href: "/budgets",
    achievementId: "first_budget",
  },
  {
    id: "goal",
    label: "Tạo mục tiêu đầu tiên",
    desc: "Thiết lập mục tiêu tài chính",
    href: "/goals",
    achievementId: "first_goal",
  },
  {
    id: "report",
    label: "Xem báo cáo đầu tiên",
    desc: "Khám phá phân tích tài chính",
    href: "/reports",
    achievementId: "first_report",
  },
  {
    id: "ai",
    label: "Mở AI Insights",
    desc: "Nhận tư vấn thông minh từ AI",
    href: "/ai-insights",
    achievementId: "first_ai",
  },
];

type OnboardingState = {
  wizardDone: boolean;
  tourDone: boolean;
  checklist: Record<ChecklistItemId, boolean>;
  earnedAchievements: AchievementId[];
  pendingAchievement: Achievement | null;
};

type OnboardingContextType = OnboardingState & {
  completeWizard: () => void;
  completeTour: () => void;
  completeChecklistItem: (id: ChecklistItemId) => void;
  clearPendingAchievement: () => void;
  resetOnboarding: () => void;
  checklistCount: number;
  checklistTotal: number;
  isFullyOnboarded: boolean;
};

const defaultState: OnboardingState = {
  wizardDone: false,
  tourDone: false,
  checklist: {
    wallet: false,
    transaction: false,
    budget: false,
    goal: false,
    report: false,
    ai: false,
  },
  earnedAchievements: [],
  pendingAchievement: null,
};

const OnboardingContext = createContext<OnboardingContextType>({
  ...defaultState,
  completeWizard: () => {},
  completeTour: () => {},
  completeChecklistItem: () => {},
  clearPendingAchievement: () => {},
  resetOnboarding: () => {},
  checklistCount: 0,
  checklistTotal: CHECKLIST_ITEMS.length,
  isFullyOnboarded: false,
});

const STORAGE_KEY = "mf-onboarding-v1";

function load(): OnboardingState {
  if (typeof window === "undefined") return defaultState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      wizardDone: parsed.wizardDone ?? false,
      tourDone: parsed.tourDone ?? false,
      checklist: { ...defaultState.checklist, ...(parsed.checklist ?? {}) },
      earnedAchievements: parsed.earnedAchievements ?? [],
      pendingAchievement: null,
    };
  } catch {
    return defaultState;
  }
}

function persist(s: OnboardingState) {
  if (typeof window === "undefined") return;

  try {
    const toSave = {
      wizardDone: s.wizardDone,
      tourDone: s.tourDone,
      checklist: s.checklist,
      earnedAchievements: s.earnedAchievements,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    /* noop */
  }
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(() => load());

  const update = useCallback(
    (updater: (s: OnboardingState) => OnboardingState) => {
      setState((prev) => {
        const next = updater(prev);
        persist(next);
        return next;
      });
    },
    [],
  );

  const completeWizard = useCallback(() => {
    update((s) => ({ ...s, wizardDone: true }));
  }, [update]);

  const completeTour = useCallback(() => {
    update((s) => ({ ...s, tourDone: true }));
  }, [update]);

  const completeChecklistItem = useCallback(
    (id: ChecklistItemId) => {
      update((s) => {
        if (s.checklist[id]) return s; // already done
        const item = CHECKLIST_ITEMS.find((c) => c.id === id);
        const achievement = item ? ACHIEVEMENTS[item.achievementId] : null;
        const earnedAchievements = achievement
          ? [...s.earnedAchievements, achievement.id]
          : s.earnedAchievements;
        return {
          ...s,
          checklist: { ...s.checklist, [id]: true },
          earnedAchievements,
          pendingAchievement: achievement,
        };
      });
    },
    [update],
  );

  const clearPendingAchievement = useCallback(() => {
    setState((s) => ({ ...s, pendingAchievement: null }));
  }, []);

  const resetOnboarding = useCallback(() => {
    const fresh = { ...defaultState };
    persist(fresh);
    setState(fresh);
  }, []);

  const checklistCount = Object.values(state.checklist).filter(Boolean).length;
  const isFullyOnboarded =
    checklistCount === CHECKLIST_ITEMS.length && state.wizardDone;

  return (
    <OnboardingContext.Provider
      value={{
        ...state,
        completeWizard,
        completeTour,
        completeChecklistItem,
        clearPendingAchievement,
        resetOnboarding,
        checklistCount,
        checklistTotal: CHECKLIST_ITEMS.length,
        isFullyOnboarded,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}
