"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

// ONBOARDING-SSOT-1
// `mf-onboarding-v1` is the only active onboarding/checklist persistence key.
// The old Help-only `mf-checklist` key is read once for migration and then
// removed only after the merged canonical state has been persisted safely.

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
  setChecklistItem: (id: ChecklistItemId, done: boolean) => void;
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
  setChecklistItem: () => {},
  clearPendingAchievement: () => {},
  resetOnboarding: () => {},
  checklistCount: 0,
  checklistTotal: CHECKLIST_ITEMS.length,
  isFullyOnboarded: false,
});

const STORAGE_KEY = "mf-onboarding-v1";
const LEGACY_HELP_CHECKLIST_KEY = "mf-checklist";

function cloneDefaultState(): OnboardingState {
  return {
    ...defaultState,
    checklist: { ...defaultState.checklist },
    earnedAchievements: [],
    pendingAchievement: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAchievementId(value: unknown): value is AchievementId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(ACHIEVEMENTS, value)
  );
}

function normalizeChecklist(value: unknown): Record<ChecklistItemId, boolean> {
  const stored = isRecord(value) ? value : {};
  const next = { ...defaultState.checklist };

  for (const item of CHECKLIST_ITEMS) {
    next[item.id] = stored[item.id] === true;
  }

  return next;
}

function readCanonicalState(): OnboardingState {
  if (typeof window === "undefined") return cloneDefaultState();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaultState();

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return cloneDefaultState();

    const earnedAchievements = Array.isArray(parsed.earnedAchievements)
      ? Array.from(
          new Set(parsed.earnedAchievements.filter(isAchievementId)),
        )
      : [];

    return {
      wizardDone: parsed.wizardDone === true,
      tourDone: parsed.tourDone === true,
      checklist: normalizeChecklist(parsed.checklist),
      earnedAchievements,
      pendingAchievement: null,
    };
  } catch {
    return cloneDefaultState();
  }
}

function readLegacyHelpChecklist(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(LEGACY_HELP_CHECKLIST_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Merge only checklist IDs that are part of the canonical onboarding model.
 * A legacy `true` may promote an incomplete canonical item, but legacy state
 * can never downgrade a completion already recorded in `mf-onboarding-v1`.
 * Migrated achievements are recorded silently so users do not receive a burst
 * of historical achievement toasts after upgrading.
 */
function mergeLegacyHelpChecklist(
  state: OnboardingState,
  legacyChecklist: Record<string, unknown>,
): OnboardingState {
  const checklist = { ...state.checklist };
  const earnedAchievements = new Set(state.earnedAchievements);

  for (const item of CHECKLIST_ITEMS) {
    if (legacyChecklist[item.id] !== true) continue;

    checklist[item.id] = true;
    earnedAchievements.add(item.achievementId);
  }

  return {
    ...state,
    checklist,
    earnedAchievements: Array.from(earnedAchievements),
    pendingAchievement: null,
  };
}

function persist(state: OnboardingState): boolean {
  if (typeof window === "undefined") return false;

  try {
    const toSave = {
      wizardDone: state.wizardDone,
      tourDone: state.tourDone,
      checklist: state.checklist,
      earnedAchievements: state.earnedAchievements,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    return true;
  } catch {
    return false;
  }
}

function load(): OnboardingState {
  if (typeof window === "undefined") return cloneDefaultState();

  const canonical = readCanonicalState();
  const legacyChecklist = readLegacyHelpChecklist();
  if (!legacyChecklist) return canonical;

  const migrated = mergeLegacyHelpChecklist(canonical, legacyChecklist);

  // Delete the old Help key only after the canonical write succeeds. If local
  // storage is unavailable/full, the legacy state remains available for a
  // later retry instead of being discarded.
  if (persist(migrated)) {
    try {
      window.localStorage.removeItem(LEGACY_HELP_CHECKLIST_KEY);
    } catch {
      // The canonical write already succeeded; a stale legacy key is harmless
      // because future migrations are monotonic (true can only promote).
    }
  }

  return migrated;
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(() => load());

  const update = useCallback(
    (updater: (current: OnboardingState) => OnboardingState) => {
      setState((current) => {
        const next = updater(current);
        if (next === current) return current;
        persist(next);
        return next;
      });
    },
    [],
  );

  const completeWizard = useCallback(() => {
    update((current) =>
      current.wizardDone ? current : { ...current, wizardDone: true },
    );
  }, [update]);

  const completeTour = useCallback(() => {
    update((current) =>
      current.tourDone ? current : { ...current, tourDone: true },
    );
  }, [update]);

  const setChecklistItem = useCallback(
    (id: ChecklistItemId, done: boolean) => {
      update((current) => {
        if (current.checklist[id] === done) return current;

        const item = CHECKLIST_ITEMS.find((candidate) => candidate.id === id);
        const achievement = item ? ACHIEVEMENTS[item.achievementId] : null;

        if (!done) {
          return {
            ...current,
            checklist: { ...current.checklist, [id]: false },
            pendingAchievement:
              current.pendingAchievement?.id === achievement?.id
                ? null
                : current.pendingAchievement,
          };
        }

        const alreadyEarned = achievement
          ? current.earnedAchievements.includes(achievement.id)
          : true;

        return {
          ...current,
          checklist: { ...current.checklist, [id]: true },
          earnedAchievements:
            achievement && !alreadyEarned
              ? [...current.earnedAchievements, achievement.id]
              : current.earnedAchievements,
          pendingAchievement:
            achievement && !alreadyEarned
              ? achievement
              : current.pendingAchievement,
        };
      });
    },
    [update],
  );

  const completeChecklistItem = useCallback(
    (id: ChecklistItemId) => {
      setChecklistItem(id, true);
    },
    [setChecklistItem],
  );

  const clearPendingAchievement = useCallback(() => {
    setState((current) =>
      current.pendingAchievement
        ? { ...current, pendingAchievement: null }
        : current,
    );
  }, []);

  const resetOnboarding = useCallback(() => {
    const fresh = cloneDefaultState();
    persist(fresh);

    try {
      window.localStorage.removeItem(LEGACY_HELP_CHECKLIST_KEY);
    } catch {
      // Reset still succeeds in memory/canonical storage when legacy cleanup
      // is unavailable.
    }

    setState(fresh);
  }, []);

  const checklistCount = CHECKLIST_ITEMS.filter(
    (item) => state.checklist[item.id],
  ).length;
  const isFullyOnboarded =
    checklistCount === CHECKLIST_ITEMS.length && state.wizardDone;

  return (
    <OnboardingContext.Provider
      value={{
        ...state,
        completeWizard,
        completeTour,
        completeChecklistItem,
        setChecklistItem,
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
