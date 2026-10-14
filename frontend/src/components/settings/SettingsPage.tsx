"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveActiveSettingsSection } from "@/src/lib/settings/settingsScrollSpy";
import ConfirmDialog, {
  type PendingConfirm,
} from "@/src/components/ui/ConfirmDialog";
import { useToast } from "@/src/components/ui/ToastProvider";
import { useTheme } from "@/src/components/theme/ThemeProvider";
import FormattedDateInput from "@/src/components/ui/FormattedDateInput";
import { isDateDisplayFormat, DATE_DISPLAY_FORMAT_OPTIONS, DEFAULT_DATE_DISPLAY_FORMAT, type DateDisplayFormat } from "@/src/lib/date/dateDisplay";
import { notifyDateFormatSaved } from "@/src/lib/date/dateFormatPreference";
import { isValidBirthDateInput, readAccountBirthDate } from "@/src/lib/accountBirthdayTheme";
import {
  NOTIFICATION_PREFERENCES_CHANGED,
  readAccountNotificationPreferences,
  saveAccountNotificationPreferences,
  notifyNotificationPreferencesSaved,
} from "@/src/lib/notifications/notificationPreferences";
import { readAccountNotificationAlertThresholds } from "@/src/lib/notifications/notificationAlertThresholds";
import {
  pullNotificationCloudSettings,
  pushNotificationCloudSettings,
  toNotificationCloudSettings,
} from "@/src/lib/notifications/notificationCloudSync";

import {
  AlertTriangle,
  Bell,
  Bot,
  Check,
  ChevronRight,
  Database,
  Download,
  Lock,
  Monitor,
  RefreshCcw,
  Shield,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
  User,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

import { useAuth } from "@/src/components/auth/AuthProvider";
import { supabase } from "@/src/lib/supabase";
import HouseholdSettingsCard from "@/src/components/settings/HouseholdSettingsCard";
import SeasonalThemeSettingsCard from "@/src/components/settings/SeasonalThemeSettingsCard";
import SeasonalSkinPicker from "@/src/components/settings/SeasonalSkinPicker";
import { useRealtime } from "@/src/components/realtime/RealtimeProvider";
import { useHousehold } from "@/src/components/household/HouseholdProvider";
import { resolveBackupWorkspaceAccess } from "@/src/lib/settings/financeDataWorkspaceGuard";
import { notifyFinancialTargetsSaved } from "@/src/lib/settings/useAccountFinancialTargets";
import { SETTINGS_START_PAGES } from "@/src/lib/settings/effectivePreferences";
import { saveAccountSettingsSection, type SettingsSaveSection } from "@/src/lib/settings/settingsSectionStorage";
import { resolveSettingsSaveOutcome, settingsSaveMessage, type SettingsSaveStatus } from "@/src/lib/settings/settingsSaveFeedback";

import {
  clearAllUserData,
  exportFinanceBackup,
  FINANCE_BACKUP_VERSION,
  getBudgets,
  getCategories,
  getDebts,
  getForexAccounts,
  getGoals,
  getInvestments,
  getSavings,
  getTransactions,
  getWallets,
  resetFinanceDemoData,
  restoreFinanceBackup,
  validateFinanceBackup,
  type FinanceBackupV4,
} from "@/src/services/finance/financeStorage";
import {
  deleteAIFinanceApiKey,
  getAIFinanceSettings,
  saveAIFinanceSettings,
  testAIFinanceConnection,
  type PublicAIFinanceSettings,
} from "@/src/services/finance/ai-agent/aiSettingsApi";
import { DEFAULT_AI_FINANCE_SETTINGS } from "@/src/services/finance/ai-agent/aiSettings";

// ─── Section nav ──────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: "profile", label: "Hồ sơ", icon: User },
  { id: "household", label: "Gia đình", icon: Users },
  { id: "preferences", label: "Tùy chỉnh", icon: Sliders },
  { id: "financial", label: "Tài chính", icon: Wallet },
  { id: "ai", label: "Trợ lý AI", icon: Bot },
  { id: "notifications", label: "Thông báo", icon: Bell },
  { id: "data", label: "Dữ liệu", icon: Database },
  { id: "security", label: "Bảo mật", icon: Shield },
  { id: "sync", label: "Đồng bộ", icon: RefreshCcw },
  { id: "system", label: "Hệ thống", icon: Monitor },
  { id: "danger", label: "Vùng nguy hiểm", icon: AlertTriangle },
];

const AI_MODEL_OPTIONS = [
  { value: "gpt-5.2", label: "GPT-5.2 · Khuyên dùng" },
  { value: "gpt-5.2-mini", label: "GPT-5.2 Mini · Nhanh" },
  { value: "gpt-5.1", label: "GPT-5.1" },
  { value: "gpt-4.1", label: "GPT-4.1" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
];


const SETTINGS_STATS_TIMEOUT_MS = 10_000;
const SETTINGS_INITIAL_RETRY_MS = 750;
const SETTINGS_LOCAL_VERSION = 1;

type SettingsStats = {
  wallets: number;
  categories: number;
  transactions: number;
  debts: number;
  goals: number;
  budgets: number;
  investments: number;
  savings: number;
  forex: number;
};

const SETTINGS_STAT_ITEMS = [
  { key: "wallets", label: "Ví tiền" },
  { key: "categories", label: "Danh mục" },
  { key: "transactions", label: "Giao dịch" },
  { key: "debts", label: "Khoản nợ" },
  { key: "goals", label: "Mục tiêu" },
  { key: "budgets", label: "Ngân sách" },
  { key: "investments", label: "Đầu tư" },
  { key: "savings", label: "Tiết kiệm" },
  { key: "forex", label: "Ngoại hối" },
] as const satisfies ReadonlyArray<{
  key: keyof SettingsStats;
  label: string;
}>;

type LocalSettingsSnapshot = {
  version: number;
  profileName: string;
  profilePhone: string;
  timezone: string;
  lang: string;
  currency: string;
  dateFormat: string;
  defaultPage: string;
  theme: string;
  finMonth: string;
  savingsGoal: string;
  budgetAlert: string;
  debtAlert: string;
  emergencyFund: string;
  aiInsights: boolean;
  aiForecast: boolean;
  aiRisk: boolean;
  aiGoalCoach: boolean;
  aiInvestCoach: boolean;
  notifBudget: boolean;
  notifGoal: boolean;
  notifDebt: boolean;
  notifInvest: boolean;
  notifWeekly: boolean;
  notifMonthly: boolean;
};

function withSettingsTimeout<T>(request: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`[SettingsPage] ${label} timed out`));
    }, SETTINGS_STATS_TIMEOUT_MS);
    Promise.resolve(request).then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user, session } = useAuth();
  const { status, lastSync } = useRealtime();
  const { activeWorkspace, context: householdContext, loading: householdLoading } = useHousehold();
  const { theme, setTheme } = useTheme();

  const [stats, setStats] = useState<SettingsStats>({
    wallets: 0,
    categories: 0,
    transactions: 0,
    debts: 0,
    goals: 0,
    budgets: 0,
    investments: 0,
    savings: 0,
    forex: 0,
  });
  const statItems = SETTINGS_STAT_ITEMS.map((item) => ({
    ...item,
    value: stats[item.key],
  }));
  // FINANCE-DATA-1B: stat pills render these counts unconditionally, so an
  // initial reloadStats() failure must not show "0" as if it were a real
  // count. isLoadingStats stays true until the first attempt (success or
  // failure) settles; statsLoadError marks that attempt as failed.
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [statsLoadError, setStatsLoadError] = useState<string | null>(null);
  const statsLoadedRef = useRef(false);
  const statsReloadingRef = useRef(false);
  const statsPendingReloadRef = useRef(false);
  const recoveryInFlightRef = useRef(false);

  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [birthDateInvalidForAccount, setBirthDateInvalidForAccount] = useState<string | null>(null);
  const [profileBirthDateDraft, setProfileBirthDateDraft] = useState<{ accountId: string; value: string } | null>(null);
  const [timezone, setTimezone] = useState("Asia/Ho_Chi_Minh");

  // Preferences
  const [lang, setLang] = useState("vi");
  const [currency, setCurrency] = useState("VND");
  const [dateFormat, setDateFormat] = useState<DateDisplayFormat>(DEFAULT_DATE_DISPLAY_FORMAT);
  const [defaultPage, setDefaultPage] = useState("/");


  // Financial settings
  const [finMonth, setFinMonth] = useState("1");
  const [savingsGoal, setSavingsGoal] = useState("20");
  const [budgetAlert, setBudgetAlert] = useState("80");
  const [debtAlert, setDebtAlert] = useState("50");
  const [emergencyFund, setEmergencyFund] = useState("6");

  // AI settings
  const [aiProvider, setAiProvider] = useState<string>(
    DEFAULT_AI_FINANCE_SETTINGS.provider,
  );
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState(DEFAULT_AI_FINANCE_SETTINGS.model);
  const [aiTemperature, setAiTemperature] = useState(
    String(DEFAULT_AI_FINANCE_SETTINGS.temperature),
  );
  const [aiMaxTokens, setAiMaxTokens] = useState(
    String(DEFAULT_AI_FINANCE_SETTINGS.maxTokens),
  );
  const [aiFallbackLocal, setAiFallbackLocal] = useState(
    DEFAULT_AI_FINANCE_SETTINGS.fallbackLocal,
  );
  const [aiNoFabrication, setAiNoFabrication] = useState(
    DEFAULT_AI_FINANCE_SETTINGS.noFabrication,
  );
  const [aiSendFinanceContext, setAiSendFinanceContext] = useState(
    DEFAULT_AI_FINANCE_SETTINGS.sendFinanceContext,
  );
  const [aiSendRuleInsights, setAiSendRuleInsights] = useState(
    DEFAULT_AI_FINANCE_SETTINGS.sendRuleInsights,
  );
  const [aiSettingsLoading, setAiSettingsLoading] = useState(false);
  const [aiSettingsLoadError, setAiSettingsLoadError] = useState<string | null>(null);
  const [aiHasStoredApiKey, setAiHasStoredApiKey] = useState(false);
  const [aiMaskedApiKey, setAiMaskedApiKey] = useState("");
  const [aiTestStatus, setAiTestStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");
  const [aiLastTestedAt, setAiLastTestedAt] = useState<string>("");
  const [aiTestLatencyMs, setAiTestLatencyMs] = useState<number | null>(null);

  // AI feature toggles
  const [aiInsights, setAiInsights] = useState(true);
  const [aiForecast, setAiForecast] = useState(true);
  const [aiRisk, setAiRisk] = useState(true);
  const [aiGoalCoach, setAiGoalCoach] = useState(true);
  const [aiInvestCoach, setAiInvestCoach] = useState(false);

  // Notification toggles
  const [notifBudget, setNotifBudget] = useState(true);
  const [notifGoal, setNotifGoal] = useState(true);
  const [notifDebt, setNotifDebt] = useState(true);
  // Invest/weekly/monthly notifications remain unsupported; their historical
  // snapshot fields are preserved by per-section writes, not edited here.

  // Each Save owns its feedback; revisions prevent an older request from marking new edits saved.
  type SavedSection = SettingsSaveSection | "aiSettings";
  const [saveStatuses, setSaveStatuses] = useState<Partial<Record<SavedSection | "notifications", SettingsSaveStatus>>>({});
  const revisionRef = useRef<Partial<Record<SavedSection | "notifications", number>>>({});
  function markDirty(section: SavedSection | "notifications") {
    revisionRef.current[section] = (revisionRef.current[section] ?? 0) + 1;
    setSaveStatuses((previous) => ({ ...previous, [section]: "dirty" }));
    if (section === "aiSettings") setAiTestStatus("idle");
  }
  function saveStatus(section: SavedSection | "notifications") { return saveStatuses[section] ?? "idle"; }
  function saveLabel(section: SavedSection | "notifications", normal: string) {
    return saveStatus(section) === "saving" ? "Đang lưu…" : saveStatus(section) === "dirty" ? "Chưa lưu · " + normal : saveStatus(section) === "error" ? "Thử lưu lại" : saveStatus(section) === "saved" ? "Đã lưu!" : normal;
  }
  function markSaveStarted(section: SavedSection | "notifications") {
    const revision = revisionRef.current[section] ?? 0;
    setSaveStatuses((prev) => ({...prev, [section]: "saving"}));
    return revision;
  }
  function markSaveSettled(section: SavedSection | "notifications", revision: number, success: boolean) {
    const outcome = resolveSettingsSaveOutcome(revision, revisionRef.current[section] ?? 0, success);
    setSaveStatuses((prev) => ({ ...prev, [section]: outcome }));
    return outcome;
  }
  const cloudMetadataSaveRef = useRef(false);
  // Keep unsaved drafts intact while Header refreshes notification settings.
  const notificationDraftAccountRef = useRef<string | null>(null);
  const financialDraftAccountRef = useRef<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingConfirm | null>(
    null,
  );
  const { toast } = useToast();
  const backupAccess = resolveBackupWorkspaceAccess(
    user?.id, activeWorkspace, householdContext?.activeHouseholdId, householdLoading,
  );
  function requireBackupWorkspace(): string | null {
    if (backupAccess.allowed && backupAccess.householdId) return backupAccess.householdId;
    toast({ variant: "error", message: backupAccess.reason });
    return null;
  }

  // Active nav section
  const [activeSection, setActiveSection] = useState("profile");
  const desktopSectionNavRef = useRef<HTMLDivElement | null>(null);

  const connected = status === "SUBSCRIBED";
  const authProfileName =
    typeof user?.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : typeof user?.user_metadata?.name === "string"
        ? user.user_metadata.name.trim()
        : "";
  const effectiveProfileName = profileName.trim() || authProfileName;
  const avatarLetter =
    effectiveProfileName.charAt(0).toUpperCase() ||
    user?.email?.[0]?.toUpperCase() ||
    "U";
  const displayEmail = user?.email ?? "";
  const birthDateInputValid = birthDateInvalidForAccount !== (user?.id ?? "");
  const accountBirthDate = readAccountBirthDate(user?.user_metadata);
  // Draft is scoped to the authenticated user ID; switching accounts never reuses it.
  // Explicit null check lets TypeScript safely narrow the draft.
  const profileBirthDate = profileBirthDateDraft !== null &&
    profileBirthDateDraft.accountId === user?.id
    ? profileBirthDateDraft.value
    : (accountBirthDate ?? "");
  const aiConnectionReady =
    aiProvider === "local" || aiHasStoredApiKey || Boolean(aiApiKey.trim());
  const aiConnectionLabel =
    aiProvider === "openai" && !aiConnectionReady
      ? "Thiếu khóa API"
      : aiTestStatus === "success"
        ? "Đã kết nối"
        : aiTestStatus === "error"
          ? "Cần xử lý"
          : aiTestStatus === "testing"
            ? "Đang kiểm tra"
            : aiConnectionReady
              ? "Sẵn sàng kiểm tra"
              : "Cần thiết lập";
  const aiMaskedKeyText = aiHasStoredApiKey
    ? aiMaskedApiKey || "••••••••••••••••"
    : "Chưa lưu khóa API";
  const aiTemperatureNumber = Number(aiTemperature || "0.2");
  const aiMaxTokensNumber = Number(aiMaxTokens || "4096");

  // ── Data loading ───────────────────────────────────────────────────────────
  // FINANCE-DATA-1: these readers now reject on a genuine query failure
  // instead of silently resolving to [] — caught here so every caller
  // (mount, and the post-reset/post-clear refresh in handleResetDemo/
  // handleClearAll below) never sees an unhandled rejection and their
  // confirm dialog can still close after the reset/clear itself already
  // succeeded.
  const reloadStats = useCallback(async (): Promise<boolean> => {
    try {
      const [
        wallets,
        categories,
        transactions,
        debts,
        goals,
        budgets,
        investments,
        savings,
        forexAccounts,
      ] = await Promise.all([
        withSettingsTimeout(getWallets(), "wallets"),
        withSettingsTimeout(getCategories(), "categories"),
        withSettingsTimeout(getTransactions(), "transactions"),
        withSettingsTimeout(getDebts(), "debts"),
        withSettingsTimeout(getGoals(), "goals"),
        withSettingsTimeout(getBudgets(), "budgets"),
        withSettingsTimeout(getInvestments(), "investments"),
        withSettingsTimeout(getSavings(), "savings"),
        withSettingsTimeout(getForexAccounts(), "forex accounts"),
      ]);

      setStats({
        wallets: wallets.length,
        categories: categories.length,
        transactions: transactions.length,
        debts: debts.length,
        goals: goals.length,
        budgets: budgets.length,
        investments: investments.length,
        savings: savings.length,
        forex: forexAccounts.length,
      });
      statsLoadedRef.current = true;
      setStatsLoadError(null);
      return true;
    } catch (error) {
      console.error("[SettingsPage] reloadStats failed:", error);
      setStatsLoadError(
        statsLoadedRef.current
          ? "Không thể đồng bộ số liệu mới. Đang giữ dữ liệu gần nhất."
          : "Không thể tải số liệu. Vui lòng thử lại.",
      );
      return false;
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  const runStatsReload = useCallback(async (): Promise<boolean> => {
    if (statsReloadingRef.current) {
      statsPendingReloadRef.current = true;
      return false;
    }
    statsReloadingRef.current = true;
    let ok = false;
    try {
      do {
        statsPendingReloadRef.current = false;
        ok = await reloadStats();
      } while (statsPendingReloadRef.current);
      return ok;
    } finally {
      statsReloadingRef.current = false;
    }
  }, [reloadStats]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;
    const timer = window.setTimeout(() => {
      void (async () => {
        const ok = await runStatsReload();
        if (!ok && !cancelled) {
          retryTimer = window.setTimeout(() => {
            void runStatsReload();
          }, SETTINGS_INITIAL_RETRY_MS);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [runStatsReload]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") void runStatsReload();
    };
    const onOnline = () => void runStatsReload();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [runStatsReload]);

  const localSettingsKey = `myfinance-settings-v${SETTINGS_LOCAL_VERSION}:${user?.id ?? "anonymous"}`;

  useEffect(() => {
    if (!user?.id) return;

    const timer = window.setTimeout(() => {
      try {
      const raw = window.localStorage.getItem(localSettingsKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<LocalSettingsSnapshot>;
      if (saved.version !== SETTINGS_LOCAL_VERSION) return;
      if (!authProfileName && typeof saved.profileName === "string") setProfileName(saved.profileName);
      if (typeof saved.profilePhone === "string") setProfilePhone(saved.profilePhone);
      if (typeof saved.timezone === "string") setTimezone("Asia/Ho_Chi_Minh");
      if (typeof saved.lang === "string") setLang("vi");
      if (typeof saved.currency === "string") setCurrency("VND");
      if (isDateDisplayFormat(saved.dateFormat)) setDateFormat(saved.dateFormat);
      if (typeof saved.defaultPage === "string") setDefaultPage(saved.defaultPage);
      // ThemeProvider owns its separate immediate-persisted preference; ignore the legacy snapshot.theme.
      if (typeof saved.finMonth === "string") setFinMonth("1");
      if (typeof saved.savingsGoal === "string") setSavingsGoal(saved.savingsGoal);
      if (typeof saved.budgetAlert === "string") setBudgetAlert(saved.budgetAlert);
      if (typeof saved.debtAlert === "string") setDebtAlert(saved.debtAlert);
      if (typeof saved.emergencyFund === "string") setEmergencyFund(saved.emergencyFund);
      if (typeof saved.aiInsights === "boolean") setAiInsights(saved.aiInsights);
      if (typeof saved.aiForecast === "boolean") setAiForecast(saved.aiForecast);
      if (typeof saved.aiRisk === "boolean") setAiRisk(saved.aiRisk);
      if (typeof saved.aiGoalCoach === "boolean") setAiGoalCoach(saved.aiGoalCoach);
      if (typeof saved.aiInvestCoach === "boolean") setAiInvestCoach(saved.aiInvestCoach);
      if (typeof saved.notifBudget === "boolean") setNotifBudget(saved.notifBudget);
      if (typeof saved.notifGoal === "boolean") setNotifGoal(saved.notifGoal);
      if (typeof saved.notifDebt === "boolean") setNotifDebt(saved.notifDebt);
      // Retired unsupported notification fields intentionally remain untouched
      // in localStorage for backward compatibility.
      } catch (error) {
        console.warn("[SettingsPage] local preferences could not be restored:", error);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [authProfileName, localSettingsKey, user?.id]);

  // Saved notification preferences are account-scoped and shared with Header.
  // Keep the editor in sync with same-tab saves and cross-tab storage updates.
  useEffect(() => {
    if (!user?.id) return;
    const accountId = user.id;
    const refreshNotificationToggles = () => {
      const saved = readAccountNotificationPreferences(accountId);
      if (notificationDraftAccountRef.current !== accountId) {
        setNotifBudget(saved.notifBudget);
        setNotifGoal(saved.notifGoal);
        setNotifDebt(saved.notifDebt);
      }
      const thresholds = readAccountNotificationAlertThresholds(accountId);
      if (financialDraftAccountRef.current !== accountId) {
        setBudgetAlert(String(thresholds.budgetAlert));
        setDebtAlert(String(thresholds.debtAlert));
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === localSettingsKey || event.key === null) refreshNotificationToggles();
    };
    const timer = window.setTimeout(refreshNotificationToggles, 0);
    window.addEventListener(NOTIFICATION_PREFERENCES_CHANGED, refreshNotificationToggles);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(NOTIFICATION_PREFERENCES_CHANGED, refreshNotificationToggles);
      window.removeEventListener("storage", onStorage);
    };
  }, [localSettingsKey, user?.id]);

  useEffect(() => {
    if (!user?.id || !authProfileName) return;
    const timer = window.setTimeout(() => {
      setProfileName(authProfileName);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [authProfileName, user?.id]);
  const applyAISettings = useCallback((settings: PublicAIFinanceSettings) => {
    setAiProvider(settings.provider);
    setAiModel(settings.model);
    setAiTemperature(String(settings.temperature));
    setAiMaxTokens(String(settings.maxTokens));
    setAiFallbackLocal(settings.fallbackLocal);
    setAiNoFabrication(settings.noFabrication);
    setAiSendFinanceContext(settings.sendFinanceContext);
    setAiSendRuleInsights(settings.sendRuleInsights);
    setAiApiKey("");
    setAiHasStoredApiKey(settings.hasStoredApiKey);
    setAiMaskedApiKey(settings.maskedApiKey);
    setAiTestStatus(
      settings.connectionStatus === "connected"
        ? "success"
        : settings.connectionStatus === "invalid" ||
            settings.connectionStatus === "error"
          ? "error"
          : "idle",
    );
    setAiLastTestedAt(
      settings.lastTestedAt
        ? new Date(settings.lastTestedAt).toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "",
    );
    setAiTestLatencyMs(settings.lastTestLatencyMs);
  }, []);

  const loadAISettings = useCallback(async (): Promise<boolean> => {
    const accessToken = session?.access_token;
    if (!user?.id || !accessToken) return false;
    try {
      setAiSettingsLoading(true);
      const settings = await withSettingsTimeout(
        getAIFinanceSettings(accessToken),
        "cài đặt AI",
      );
      applyAISettings(settings);
      setAiSettingsLoadError(null);
      return true;
    } catch (error) {
      const message =
        "Không thể tải cài đặt AI: " +
        (error instanceof Error ? error.message : "Lỗi không xác định");
      setAiSettingsLoadError(message);
      toast({ variant: "error", message });
      return false;
    } finally {
      setAiSettingsLoading(false);
    }
  }, [applyAISettings, session?.access_token, toast, user?.id]);

  useEffect(() => {
    if (!user?.id || !session?.access_token) return;
    let cancelled = false;
    let retryTimer: number | null = null;
    const timer = window.setTimeout(() => {
      void (async () => {
        const ok = await loadAISettings();
        if (!ok && !cancelled) {
          retryTimer = window.setTimeout(() => {
            void loadAISettings();
          }, SETTINGS_INITIAL_RETRY_MS);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [loadAISettings, session?.access_token, user?.id]);

  useEffect(() => {
    if (!user?.id || !session?.access_token) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") void loadAISettings();
    };
    const onOnline = () => void loadAISettings();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [loadAISettings, session?.access_token, user?.id]);

  // ── Preserved handlers ─────────────────────────────────────────────────────
  async function handleResetDemo() {
    const expectedWorkspaceId = requireBackupWorkspace();
    if (!expectedWorkspaceId) return;
    setPendingAction({
      title: `Đặt lại dữ liệu mẫu trong ${backupAccess.workspaceName}?`,
      description:
        "Toàn bộ dữ liệu hiện tại (Ví, Danh mục, Giao dịch, Nợ, Mục tiêu, Ngân sách, Đầu tư, Tiết kiệm và Ngoại hối) sẽ bị xóa và thay bằng trạng thái mẫu mặc định.",
      confirmText: "Đặt lại",
      variant: "warning",
      onConfirm: async () => {
        if (recoveryInFlightRef.current) {
          toast({
            variant: "warning",
            message: "Một thao tác khôi phục dữ liệu khác đang chạy. Vui lòng hoàn tất thao tác hiện tại trước.",
          });
          return;
        }
        recoveryInFlightRef.current = true;
        try {
        const { error } = await resetFinanceDemoData(expectedWorkspaceId);
        if (error) {
          toast({
            variant: "error",
            message: "Lỗi đặt lại dữ liệu mẫu: " + error,
          });
          return;
        }
        await runStatsReload();
        toast({
          variant: "success",
          message: "Đã đặt lại dữ liệu mẫu thành công.",
        });
        } finally {
          recoveryInFlightRef.current = false;
        }
      },
    });
  }

  async function handleClearAll() {
    const expectedWorkspaceId = requireBackupWorkspace();
    if (!expectedWorkspaceId) return;
    setPendingAction({
      title: `Xóa toàn bộ dữ liệu trong ${backupAccess.workspaceName}?`,
      description:
        "Hành động này không thể hoàn tác. Toàn bộ dữ liệu tài chính (Ví, Danh mục, Giao dịch, Nợ, Mục tiêu, Ngân sách, Đầu tư, Tiết kiệm, Ngoại hối và lịch sử Tài sản ròng) sẽ bị xóa vĩnh viễn.",
      confirmText: "Xóa tất cả",
      variant: "danger",
      onConfirm: async () => {
        if (recoveryInFlightRef.current) {
          toast({
            variant: "warning",
            message: "Một thao tác khôi phục dữ liệu khác đang chạy. Vui lòng hoàn tất thao tác hiện tại trước.",
          });
          return;
        }
        recoveryInFlightRef.current = true;
        try {
        const { error } = await clearAllUserData(expectedWorkspaceId);
        if (error) {
          toast({ variant: "error", message: "Lỗi xóa dữ liệu: " + error });
          return;
        }
        await runStatsReload();
        toast({ variant: "success", message: "Đã xóa toàn bộ dữ liệu." });
        } finally {
          recoveryInFlightRef.current = false;
        }
      },
    });
  }

  async function handleExportJson() {
    const expectedWorkspaceId = requireBackupWorkspace();
    if (!expectedWorkspaceId) return;
    // FINANCE-DATA-2: the database now produces one versioned snapshot in a
    // single RPC call. This prevents a partial browser-side export where one
    // of several independent collection reads fails after the others succeed.
    try {
      const backup = await exportFinanceBackup(expectedWorkspaceId);
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        `myfinance-backup-v${FINANCE_BACKUP_VERSION}-` +
        new Date().toISOString().slice(0, 10) +
        ".json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("[SettingsPage] handleExportJson failed:", error);
      toast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Không thể xuất dữ liệu. Vui lòng thử lại.",
      });
    }
  }

  function requestBackupRestore(backup: FinanceBackupV4, fileName: string, expectedWorkspaceId: string) {
    setPendingAction({
      title: `Khôi phục vào ${backupAccess.workspaceName}?`,
      description:
        `Tệp ${fileName} sẽ thay thế toàn bộ dữ liệu tài chính hiện tại ` +
        "(Ví, Danh mục, Giao dịch, Nợ, Mục tiêu, Ngân sách, Đầu tư, " +
        "Tiết kiệm, Ngoại hối và lịch sử Tài sản ròng). Quá trình khôi phục chạy trong một " +
        "giao dịch nguyên tử trên máy chủ; nếu có lỗi trước khi hoàn tất, hệ thống sẽ hoàn tác " +
        "toàn bộ, không để dữ liệu ở trạng thái khôi phục dở dang.",
      confirmText: "Khôi phục",
      variant: "warning",
      onConfirm: async () => {
        if (recoveryInFlightRef.current) {
          toast({
            variant: "warning",
            message: "Một thao tác khôi phục dữ liệu khác đang chạy. Vui lòng hoàn tất thao tác hiện tại trước.",
          });
          return;
        }
        recoveryInFlightRef.current = true;
        try {
        const { error: restoreError } = await restoreFinanceBackup(backup, expectedWorkspaceId);
        if (restoreError) {
          toast({
            variant: "error",
            message: "Không thể khôi phục dữ liệu: " + restoreError,
          });
          return;
        }

        await runStatsReload();
        toast({
          variant: "success",
          message: "Đã khôi phục bản sao lưu thành công.",
        });
        } finally {
          recoveryInFlightRef.current = false;
        }
      },
    });
  }

  function handleImportJson(event: React.ChangeEvent<HTMLInputElement>) {
    const expectedWorkspaceId = requireBackupWorkspace();
    const input = event.currentTarget;
    if (!expectedWorkspaceId) { input.value = ""; return; }
    const file = input.files?.[0];
    if (!file) return;

    // Allow choosing the same file again after cancel/error. The File object
    // remains valid after the input value is cleared.
    input.value = "";

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result));
        const validation = validateFinanceBackup(parsed);

        // Client-side preflight happens before the destructive confirmation
        // is even offered. The restore RPC repeats the same structural checks
        // server-side before its first DELETE, so this is UX plus defense in
        // depth, not the authority for safety.
        if (!validation.ok) {
          toast({ variant: "error", message: validation.error });
          return;
        }

        requestBackupRestore(validation.backup, file.name, expectedWorkspaceId);
      } catch {
        toast({ variant: "error", message: "Tệp JSON không hợp lệ." });
      }
    };
    reader.onerror = () => {
      toast({
        variant: "error",
        message: "Không thể đọc tệp sao lưu. Vui lòng thử lại.",
      });
    };
    reader.readAsText(file);
  }

  // ── Scroll-to helper ───────────────────────────────────────────────────────
  // SETTINGS-DESKTOP-SCROLLSPY-1: AppShell scrolls main.finance-main, not window.
  // Follow the section currently in view when the user scrolls the page.
  useEffect(() => {
    const scrollRoot = document.querySelector<HTMLElement>("main.finance-main");
    if (!scrollRoot) return;

    let frameId: number | null = null;
    const syncActiveSection = () => {
      frameId = null;
      const activationLine = scrollRoot.getBoundingClientRect().top +
        Math.min(120, Math.max(80, scrollRoot.clientHeight * 0.2));
      const positions = SECTIONS.flatMap((section) => {
        const node = document.getElementById("settings-" + section.id);
        return node ? [{ id: section.id, top: node.getBoundingClientRect().top }] : [];
      });
      if (positions.length === 0) return;
      const atScrollEnd =
        scrollRoot.scrollHeight > scrollRoot.clientHeight + 2 &&
        scrollRoot.scrollTop + scrollRoot.clientHeight >= scrollRoot.scrollHeight - 2;
      const next = resolveActiveSettingsSection(positions, activationLine, atScrollEnd);
      if (next !== null) {
        setActiveSection((current) => (current === next ? current : next));
      }
    };
    const scheduleSync = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(syncActiveSection);
    };
    scrollRoot.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);
    scheduleSync();
    return () => {
      scrollRoot.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, []);

  // If the desktop menu is taller than the screen, only scroll its own card
  // to keep the selected item in view; never scroll finance-main from here.
  useEffect(() => {
    const nav = desktopSectionNavRef.current;
    if (!nav || nav.clientHeight === 0) return;
    const activeButton = nav.querySelector<HTMLElement>('[aria-current="location"]');
    if (!activeButton) return;
    const navRect = nav.getBoundingClientRect();
    const itemRect = activeButton.getBoundingClientRect();
    const margin = 8;
    if (itemRect.top < navRect.top + margin) {
      nav.scrollTop += itemRect.top - navRect.top - margin;
    } else if (itemRect.bottom > navRect.bottom - margin) {
      nav.scrollTop += itemRect.bottom - navRect.bottom + margin;
    }
  }, [activeSection]);

  function scrollTo(id: string) {
    setActiveSection(id);
    document
      .getElementById("settings-" + id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ── Save prefs feedback ────────────────────────────────────────────────────
  // Notification Save never validates/updates the profile. Only this
  // account's versioned notification metadata is sent to Supabase Auth.
  async function handleSaveNotifications() {
    if (cloudMetadataSaveRef.current) {
      toast({ variant: "warning", message: "Một thao tác lưu tài khoản khác đang chạy. Vui lòng thử lại sau." });
      return;
    }
    const revision = markSaveStarted("notifications");
    cloudMetadataSaveRef.current = true;
    try {
      const chosen = { notifBudget, notifGoal, notifDebt };
      const cloud = toNotificationCloudSettings(
        chosen, readAccountNotificationAlertThresholds(user?.id),
      );
      if (user?.id && user.id !== "local-ui-user") {
        await pushNotificationCloudSettings(user.id, cloud, supabase.auth);
      }
      // Commit the on-device SSOT only after the cloud save succeeds.
      saveAccountNotificationPreferences(user?.id, chosen);
      if ((revisionRef.current.notifications ?? 0) === revision) notificationDraftAccountRef.current = null;
      if (markSaveSettled("notifications", revision, true) === "saved") toast({ variant: "success", message: user?.id === "local-ui-user" ? "Đã lưu thông báo trên trình duyệt này." : "Đã lưu thông báo trên tài khoản." });
    } catch (error) {
      markSaveSettled("notifications", revision, false);
      toast({
        variant: "error",
        message: error instanceof Error
          ? "Không thể lưu thông báo: " + error.message
          : "Không thể lưu thông báo. Vui lòng thử lại.",
      });
    } finally {
      cloudMetadataSaveRef.current = false;
    }
  }

  async function handleSaveProfile() {
    if (!birthDateInputValid || !isValidBirthDateInput(profileBirthDate)) {
      toast({ variant: "error", message: "Ngày sinh không hợp lệ hoặc nằm trong tương lai." });
      return;
    }
    const trimmedProfileName = profileName.trim();
    if (trimmedProfileName.length > 80) {
      toast({ variant: "error", message: "Họ và tên không được vượt quá 80 ký tự." });
      return;
    }
    if (!user?.id) {
      toast({ variant: "error", message: "Không có tài khoản để lưu hồ sơ." });
      return;
    }
    if (cloudMetadataSaveRef.current) {
      toast({ variant: "warning", message: "Một thao tác lưu tài khoản khác đang chạy. Vui lòng thử lại sau." });
      return;
    }
    const revision = markSaveStarted("profile");
    cloudMetadataSaveRef.current = true;
    try {
      if (user.id !== "local-ui-user") {
        const { error: profileError } = await supabase.auth.updateUser({
          data: { full_name: trimmedProfileName, name: trimmedProfileName, birth_date: profileBirthDate || null },
        });
        if (profileError) throw profileError;
      }
      saveAccountSettingsSection(user.id, "profile", {
        profileName: trimmedProfileName, profilePhone, timezone: "Asia/Ho_Chi_Minh", currency: "VND",
      });
      if (markSaveSettled("profile", revision, true) === "saved") {
        setProfileName(trimmedProfileName);
        toast({ variant: "success", message: "Đã lưu hồ sơ. Không thay đổi tùy chỉnh và thiết lập tài chính." });
      }
    } catch (error) {
      markSaveSettled("profile", revision, false);
      console.error("[SettingsPage] profile save failed:", error);
      toast({ variant: "error", message: error instanceof Error ? error.message : "Không thể lưu hồ sơ." });
    } finally {
      cloudMetadataSaveRef.current = false;
    }
  }

  function handleSavePreferences() {
    if (!user?.id) {
      toast({ variant: "error", message: "Không có tài khoản để lưu tùy chỉnh." });
      return;
    }
    if (!isDateDisplayFormat(dateFormat) || !SETTINGS_START_PAGES.some((path) => path === defaultPage)) {
      toast({ variant: "error", message: "Định dạng ngày hoặc trang mặc định không hợp lệ." });
      return;
    }
    const revision = markSaveStarted("preferences");
    try {
      saveAccountSettingsSection(user.id, "preferences", {
        lang: "vi", dateFormat, defaultPage,
      });
      notifyDateFormatSaved();
      // ThemeProvider persists the selected theme immediately in its own SSOT.
      if (markSaveSettled("preferences", revision, true) === "saved") {
        toast({ variant: "success", message: "Đã lưu tùy chỉnh trên trình duyệt này. Giao diện được áp dụng ngay khi chọn." });
      }
    } catch (error) {
      markSaveSettled("preferences", revision, false);
      toast({ variant: "error", message: error instanceof Error ? error.message : "Không thể lưu tùy chỉnh." });
    }
  }

  async function handleSaveFinancial() {
    const numericRules = [
      ["Mục tiêu tiết kiệm", savingsGoal, 0, 100],
      ["Ngưỡng cảnh báo ngân sách", budgetAlert, 0, 100],
      ["Ngưỡng cảnh báo nợ", debtAlert, 0, 200],
      ["Quỹ khẩn cấp", emergencyFund, 1, 24],
    ] as const;
    for (const [label, raw, min, max] of numericRules) {
      const value = Number(raw);
      if (String(raw).trim() === "" || !Number.isFinite(value) || value < min || value > max) {
        toast({ variant: "error", message: label + " phải nằm trong khoảng " + min + "–" + max + "." });
        return;
      }
    }
    if (!Number.isInteger(Number(emergencyFund))) {
      toast({ variant: "error", message: "Quỹ khẩn cấp phải là số tháng nguyên từ 1 đến 24." });
      return;
    }
    if (!user?.id) {
      toast({ variant: "error", message: "Không có tài khoản để lưu thiết lập tài chính." });
      return;
    }
    if (cloudMetadataSaveRef.current) {
      toast({ variant: "warning", message: "Một thao tác lưu tài khoản khác đang chạy. Vui lòng thử lại sau." });
      return;
    }
    const revision = markSaveStarted("financial");
    cloudMetadataSaveRef.current = true;
    try {
      if (user.id !== "local-ui-user") {
        let preservedNotificationFlags = readAccountNotificationPreferences(user.id);
        // Pull the latest CLOUD choices, never take unsaved notification toggles from this form.
        const cloudSaved = await pullNotificationCloudSettings(user.id, supabase.auth);
        if (cloudSaved) {
          preservedNotificationFlags = {
            notifBudget: cloudSaved.notifBudget,
            notifGoal: cloudSaved.notifGoal,
            notifDebt: cloudSaved.notifDebt,
          };
        }
        await pushNotificationCloudSettings(
          user.id,
          toNotificationCloudSettings(preservedNotificationFlags, {
            budgetAlert: Number(budgetAlert), debtAlert: Number(debtAlert),
          }),
          supabase.auth,
        );
      }
      saveAccountSettingsSection(user.id, "financial", {
        finMonth: "1", savingsGoal, budgetAlert, debtAlert, emergencyFund,
      });
      if ((revisionRef.current.financial ?? 0) === revision) financialDraftAccountRef.current = null;
      // Notify subscribers only AFTER the local write succeeds.
      notifyNotificationPreferencesSaved();
      notifyFinancialTargetsSaved();
      if (markSaveSettled("financial", revision, true) === "saved") {
        toast({ variant: "success", message: "Đã lưu thiết lập tài chính. Không cập nhật hồ sơ hoặc tính năng AI." });
      }
    } catch (error) {
      markSaveSettled("financial", revision, false);
      console.error("[SettingsPage] financial save failed:", error);
      toast({ variant: "error", message: error instanceof Error ? error.message : "Không thể lưu thiết lập tài chính." });
    } finally {
      cloudMetadataSaveRef.current = false;
    }
  }

  function handleSaveAIFeatures() {
    if (!user?.id) {
      toast({ variant: "error", message: "Không có tài khoản để lưu tùy chọn AI." });
      return;
    }
    const revision = markSaveStarted("aiFeatures");
    try {
      saveAccountSettingsSection(user.id, "aiFeatures", {
        aiInsights, aiForecast, aiRisk, aiGoalCoach, aiInvestCoach,
      });
      if (markSaveSettled("aiFeatures", revision, true) === "saved") {
        toast({ variant: "success", message: "Đã lưu lựa chọn tính năng AI trên trình duyệt; chưa thay đổi cấu hình AI máy chủ." });
      }
    } catch (error) {
      markSaveSettled("aiFeatures", revision, false);
      toast({ variant: "error", message: error instanceof Error ? error.message : "Không thể lưu lựa chọn AI." });
    }
  }

  function getAISettingsPayload() {
    return {
      provider:
        aiProvider === "local" ? ("local" as const) : ("openai" as const),
      apiKey: aiApiKey.trim() || undefined,
      model: aiModel,
      temperature: Number(String(aiTemperature || "0.2").trim()),
      maxTokens: Number(String(aiMaxTokens || "4096").trim()),
      fallbackLocal: aiFallbackLocal,
      noFabrication: aiNoFabrication,
      sendFinanceContext: aiSendFinanceContext,
      sendRuleInsights: aiSendRuleInsights,
    };
  }

  function validateAISettingsDraft(): string | null {
    const temperature = Number(String(aiTemperature).trim());
    const maxTokens = Number(String(aiMaxTokens).trim());
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      return "Độ sáng tạo phải nằm trong khoảng 0–2.";
    }
    if (!Number.isInteger(maxTokens) || maxTokens < 512 || maxTokens > 8192) {
      return "Số token tối đa phải là số nguyên trong khoảng 512–8192.";
    }
    return null;
  }

  async function handleSaveAISettings() {
    const accessToken = session?.access_token;
    if (!accessToken) {
      toast({
        variant: "error",
        message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      });
      return;
    }

    const validationError = validateAISettingsDraft();
    if (validationError) {
      toast({ variant: "error", message: validationError });
      return;
    }

    const nextApiKey = aiApiKey.trim();
    if (aiProvider === "openai" && !nextApiKey && !aiHasStoredApiKey) {
      toast({
        variant: "error",
        message: "Vui lòng nhập khóa API OpenAI trước khi lưu lần đầu.",
      });
      return;
    }

    if (nextApiKey && !nextApiKey.startsWith("sk-")) {
      toast({
        variant: "error",
        message: "Khóa API chưa đúng định dạng sk-...",
      });
      return;
    }

    const revision = markSaveStarted("aiSettings");
    try {
      setAiSettingsLoading(true);
      const settings = await saveAIFinanceSettings(
        accessToken,
        getAISettingsPayload(),
      );
      if ((revisionRef.current.aiSettings ?? 0) === revision) applyAISettings(settings);
      if (markSaveSettled("aiSettings", revision, true) === "saved") {
        toast({ variant: "success", message: "Đã lưu cài đặt AI an toàn qua API máy chủ." });
      }
    } catch (error) {
      markSaveSettled("aiSettings", revision, false);
      toast({
        variant: "error",
        message:
          "Không thể lưu cài đặt AI: " +
          (error instanceof Error ? error.message : "Lỗi không xác định"),
      });
    } finally {
      setAiSettingsLoading(false);
    }
  }

  function handleRemoveAIApiKey() {
    const accessToken = session?.access_token;
    if (!accessToken) {
      toast({
        variant: "error",
        message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      });
      return;
    }

    if (!aiHasStoredApiKey) {
      toast({
        variant: "error",
        message: "Chưa có khóa API OpenAI nào được lưu.",
      });
      return;
    }

    setPendingAction({
      title: "Xóa khóa API OpenAI đã lưu?",
      description:
        "Hành động này sẽ xóa vĩnh viễn khóa API đã mã hóa khỏi tài khoản. Các cài đặt AI khác vẫn được giữ nguyên.",
      confirmText: "Xóa khóa API",
      variant: "danger",
      onConfirm: async () => {
        try {
          setAiSettingsLoading(true);
          const settings = await deleteAIFinanceApiKey(accessToken);
          applyAISettings(settings);
          toast({
            variant: "success",
            message: "Đã xóa khóa API OpenAI.",
          });
        } catch (error) {
          toast({
            variant: "error",
            message:
              "Không thể xóa khóa API OpenAI: " +
              (error instanceof Error ? error.message : "Lỗi không xác định"),
          });
        } finally {
          setAiSettingsLoading(false);
        }
      },
    });
  }

  async function handleTestAIConnection() {
    const accessToken = session?.access_token;
    if (!accessToken) {
      toast({
        variant: "error",
        message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      });
      return;
    }

    const validationError = validateAISettingsDraft();
    if (validationError) {
      setAiTestStatus("error");
      toast({ variant: "error", message: validationError });
      return;
    }

    const nextApiKey = aiApiKey.trim();
    if (aiProvider === "openai" && (!aiHasStoredApiKey || nextApiKey)) {
      setAiTestStatus("error");
      toast({
        variant: "error",
        message: nextApiKey
          ? "Hãy lưu cấu hình trước khi kiểm tra kết nối."
          : "Vui lòng lưu khóa API OpenAI trước khi kiểm tra kết nối.",
      });
      return;
    }

    if (nextApiKey && !nextApiKey.startsWith("sk-")) {
      setAiTestStatus("error");
      toast({
        variant: "error",
        message: "Khóa API chưa đúng định dạng sk-...",
      });
      return;
    }

    setAiTestStatus("testing");
    setAiTestLatencyMs(null);

    try {
      setAiSettingsLoading(true);

      const result = await testAIFinanceConnection(accessToken);
      setAiTestStatus("success");
      setAiTestLatencyMs(result.latencyMs);
      setAiLastTestedAt(
        new Date().toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );

      toast({
        variant: "success",
        message:
          result.provider === "local"
            ? "AI cục bộ đã sẵn sàng."
            : `Đã kết nối OpenAI${result.model ? ` bằng ${result.model}` : ""}.`,
      });
    } catch (error) {
      setAiTestStatus("error");
      toast({
        variant: "error",
        message:
          "Không thể kiểm tra kết nối AI: " +
          (error instanceof Error ? error.message : "Lỗi không xác định"),
      });
    } finally {
      setAiSettingsLoading(false);
    }
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Mobile section navigation — fixed below the global mobile header.
          AppShell keeps Header outside the scrolling <main>, so pinning this
          rail to the viewport makes it independent from SettingsPage scroll. */}
      <div className="fixed inset-x-0 top-[8.5625rem] z-20 bg-slate-50/95 px-3 py-2 backdrop-blur-md sm:px-6 md:top-[4.5rem] lg:left-72 lg:px-8 xl:hidden">
        <nav
          aria-label="Điều hướng cài đặt"
          className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex w-max min-w-full gap-2 rounded-2xl border border-blue-100 bg-white/95 p-1.5 shadow-sm backdrop-blur">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = activeSection === s.id;
              const isDanger = s.id === "danger";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollTo(s.id)}
                  className={
                    "flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors " +
                    (active
                      ? isDanger
                        ? "bg-rose-50 text-rose-600"
                        : "bg-blue-600 text-white"
                      : isDanger
                        ? "text-rose-500"
                        : "text-slate-600")
                  }
                >
                  <Icon size={13} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Reserve mobile flow space for the fixed navigation rail so the
          account summary starts below it instead of being covered. */}
      <div aria-hidden="true" className="h-[3.75rem] xl:hidden" />
      {/* ══ Executive Account Summary ════════════════════════════════════════ */}
      <section className="overflow-hidden rounded-3xl border border-blue-100 shadow-sm sm:rounded-4xl">
        <div className="bg-linear-to-br from-blue-50 via-white to-cyan-50 px-4 pb-4 pt-4 sm:px-8 sm:pb-6 sm:pt-6">
          <p className="text-[11px] font-black uppercase tracking-widest text-blue-500">
            Cài đặt
          </p>
          <div className="mt-3 flex items-center gap-3 sm:mt-4 sm:gap-5">
            {/* Avatar */}
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-blue-600 to-cyan-500 text-lg font-black text-white shadow-md shadow-blue-200/50 sm:size-16 sm:rounded-3xl sm:text-2xl">
              {avatarLetter}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-3xl">
                Cài đặt tài khoản
              </h1>
              <p className="mt-0.5 break-all text-xs text-slate-500 sm:text-sm">
                {displayEmail}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-2 sm:mt-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-[11px] font-bold text-emerald-700">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Tài khoản cá nhân
                </span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="-mx-1 mt-4 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:mt-5 sm:flex-wrap sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0">
            {statItems.map((s) => (
              <div
                key={s.label}
                className="flex min-w-[7.5rem] shrink-0 snap-start items-center gap-2 rounded-2xl border border-blue-100 bg-white px-3 py-2 shadow-sm sm:min-w-0 sm:px-4"
              >
                <span className="text-lg font-black text-blue-700">
                  {isLoadingStats ? "…" : statsLoadError ? "–" : s.value}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {statsLoadError && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">{statsLoadError}</p>
          <button type="button" onClick={() => void runStatsReload()} className="min-h-11 shrink-0 rounded-xl border border-amber-300 bg-white px-3 text-sm font-bold text-amber-800">Thử lại</button>
        </div>
      )}

      {/* ══ Two-column layout: left nav + content ════════════════════════════ */}
      <div className="flex gap-6 xl:gap-8">
        {/* Left nav — desktop only */}
        <aside className="hidden w-44 shrink-0 xl:block">
          <div ref={desktopSectionNavRef} className="sticky top-6 max-h-[calc(100dvh_-_8.5rem)] overflow-y-auto overscroll-contain rounded-[1.7rem] border border-slate-100 bg-white shadow-sm">
            <div className="p-2 space-y-0.5">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const active = activeSection === s.id;
                const isDanger = s.id === "danger";
                return (
                  <button
                    key={s.id}
                    onClick={() => scrollTo(s.id)}
                    aria-current={active ? "location" : undefined}
                    className={
                      "flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-[12px] font-bold transition-all " +
                      (active
                        ? isDanger
                          ? "bg-rose-50 text-rose-600"
                          : "bg-blue-600 text-white shadow-sm"
                        : isDanger
                          ? "text-rose-400 hover:bg-rose-50 hover:text-rose-600"
                          : "text-slate-500 hover:bg-blue-50 hover:text-blue-700")
                    }
                  >
                    <Icon size={13} />
                    <span className="leading-tight">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1 space-y-5 sm:space-y-8">
          {/* ────────────────────────────────────────────────────────────────
              §1 · HỒ SƠ CÁ NHÂN
              ──────────────────────────────────────────────────────────────── */}
          <div id="settings-profile" className="scroll-mt-20">
            <SectionHeader
              icon={<User size={16} />}
              title="Hồ sơ cá nhân"
              desc="Thông tin tài khoản của bạn"
            />
            <div className="mt-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:mt-4 sm:rounded-4xl sm:p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <SettingInput label="Email" value={displayEmail} readOnly />
                <SettingInput
                  label="Họ và tên"
                  value={profileName}
                  onChange={(v) => { markDirty("profile"); setProfileName(v); }}
                  placeholder="Nhập tên của bạn..."
                />
                <SettingInput
                  label="Số điện thoại"
                  value={profilePhone}
                  onChange={(v) => { markDirty("profile"); setProfilePhone(v); }}
                  placeholder="+84 xxx xxx xxx"
                />
                <div className="min-w-0">
                  <label htmlFor="account-birth-date" className="mb-1.5 block text-sm font-bold text-slate-700">
                    Ngày sinh
                  </label>
                  <FormattedDateInput
                    id="account-birth-date"
                    data-account-birth-date="true"
                    min="1900-01-01"
                    value={profileBirthDate}
                    format={dateFormat}
                    onChange={(value) => { markDirty("profile"); setProfileBirthDateDraft({ accountId: user?.id ?? "", value }); }}
                    onValidityChange={(valid) => setBirthDateInvalidForAccount(valid ? null : (user?.id ?? ""))}
                    disabled={!user?.id || user?.id === "local-ui-user"}
                  />
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">
                    Lưu trong hồ sơ tài khoản; tự bật skin Sinh nhật mỗi năm vào ngày này.
                    Ngày 29/2 sẽ được kỷ niệm vào 28/2 ở năm không nhuận.
                  </p>
                </div>
                <SettingSelect
                  label="Múi giờ"
                  value={timezone}
                  onChange={setTimezone}
                  options={[{ value: "Asia/Ho_Chi_Minh", label: "Việt Nam (GMT+7)" }]}
                  desc="Hiện báo cáo và kỳ tài chính dùng giờ Việt Nam. Múi giờ khác chưa được hỗ trợ toàn hệ thống."
                />
                <SettingSelect
                  label="Tiền tệ mặc định"
                  value={currency}
                  onChange={setCurrency}
                  options={[{ value: "VND", label: "Đồng Việt Nam (VND)" }]}
                  desc="Hiện chỉ hỗ trợ VND. Chưa có quy đổi tỷ giá xuyên suốt ứng dụng cho USD/EUR."
                />
              </div>
              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={handleSaveProfile}
                  disabled={saveStatus("profile") === "saving"}
                  className={
                    "flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all sm:w-auto " +
                    (saveStatus("profile") === "saved"
                      ? "bg-emerald-600 shadow-emerald-200"
                      : "bg-blue-600 shadow-blue-200 hover:bg-blue-700")
                  }
                >
                  {saveStatus("profile") === "saved" ? <Check size={15} /> : null}
                  {saveLabel("profile", "Lưu hồ sơ")}
                    <span className="sr-only" role="status" aria-live="polite">{settingsSaveMessage(saveStatus("profile"), "hồ sơ tài khoản / trình duyệt này")}</span>
                </button>
                <p className="text-xs text-slate-400">
                  Họ tên và ngày sinh đồng bộ tài khoản; điện thoại và lựa chọn hiển thị lưu riêng trên trình duyệt.
                </p>
              </div>
            </div>
          </div>

          <HouseholdSettingsCard />

          {/* ────────────────────────────────────────────────────────────────
              §2 · TÙY CHỈNH ỨNG DỤNG
              ──────────────────────────────────────────────────────────────── */}
          <div id="settings-preferences" className="scroll-mt-20">
            <SectionHeader
              icon={<Sliders size={16} />}
              title="Tùy chỉnh ứng dụng"
              desc="Ngôn ngữ, giao diện và mặc định"
            />
            <div className="mt-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:mt-4 sm:rounded-4xl sm:p-6">
              <div className="space-y-5">
                {/* Language */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-700">Ngôn ngữ</p>
                    <p className="text-xs text-slate-400">
                      Hiện ứng dụng chỉ hỗ trợ đầy đủ Tiếng Việt. English sẽ mở khi dịch toàn bộ màn hình.
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {[
                      { val: "vi", label: "Tiếng Việt" },
                      { val: "en", label: "English" },
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        onClick={() => setLang(opt.val)}
                        disabled={opt.val === "en"}
                        title={opt.val === "en" ? "Chưa hỗ trợ toàn bộ giao diện English" : undefined}
                        className={
                          "min-h-11 rounded-2xl border px-4 py-2 text-sm font-bold transition-all " +
                          (lang === opt.val
                            ? "border-blue-300 bg-blue-600 text-white shadow-sm"
                            : "border-slate-200 bg-white text-slate-500 hover:bg-blue-50")
                        }
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100" />

                {/* Date format */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-700">
                      Định dạng ngày
                    </p>
                    <p className="text-xs text-slate-400">
                      Cách hiển thị ngày tháng
                    </p>
                  </div>
                  <select
                    value={dateFormat}
                    onChange={(e) => { markDirty("preferences"); if (isDateDisplayFormat(e.target.value)) setDateFormat(e.target.value); setBirthDateInvalidForAccount(null); }}
                    className="rounded-2xl border border-slate-200 bg-slate-50 min-h-11 px-3 py-2 text-sm font-bold outline-none focus:border-blue-400"
                  >
                    {DATE_DISPLAY_FORMAT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div className="border-t border-slate-100" />

                {/* Default page */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-700">
                      Trang mặc định
                    </p>
                    <p className="text-xs text-slate-400">
                      Trang hiển thị khi đăng nhập
                    </p>
                  </div>
                  <select
                    value={defaultPage}
                    onChange={(e) => { markDirty("preferences"); setDefaultPage(e.target.value); }}
                    className="rounded-2xl border border-slate-200 bg-slate-50 min-h-11 px-3 py-2 text-sm font-bold outline-none focus:border-blue-400"
                  >
                    <option value="/">Tổng quan</option>
                    <option value="/transactions">Giao dịch</option>
                    <option value="/wallets">Ví tiền</option>
                    <option value="/budgets">Ngân sách</option>
                    <option value="/reports">Báo cáo</option>
                  </select>
                </div>

                <div className="border-t border-slate-100" />

                {/* Theme */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-700">
                      Giao diện
                    </p>
                    <p className="text-xs text-slate-400">
                      Sáng, tối hoặc theo giao diện thiết bị
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {([
                      { val: "light", label: "Sáng" },
                      { val: "dark", label: "Tối" },
                      { val: "system", label: "Thiết bị" },
                    ] as const).map((opt) => (
                      <button
                        key={opt.val}
                        onClick={() => setTheme(opt.val)}
                        className={
                          "min-h-11 rounded-2xl border px-4 py-2 text-sm font-bold transition-all " +
                          (theme === opt.val
                            ? "border-blue-300 bg-blue-600 text-white shadow-sm"
                            : "border-slate-200 bg-white text-slate-500 hover:bg-blue-50")
                        }
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100" />
                <SeasonalThemeSettingsCard />
                <SeasonalSkinPicker />
                <p className="text-xs leading-5 text-slate-500">Giao diện và skin áp dụng ngay khi chọn. Ngôn ngữ, định dạng ngày và trang mặc định được lưu riêng cho tài khoản này trên trình duyệt.</p>
                <button type="button" onClick={handleSavePreferences} className="min-h-11 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
                  {saveLabel("preferences", "Lưu tùy chỉnh")}
                </button>
                <p role="status" aria-live="polite" className="mt-2 text-xs text-slate-500">{settingsSaveMessage(saveStatus("preferences"), "trình duyệt này")}</p>
              </div>
            </div>
          </div>

          {/* ────────────────────────────────────────────────────────────────
              §3 · THIẾT LẬP TÀI CHÍNH
              ──────────────────────────────────────────────────────────────── */}
          <div id="settings-financial" className="scroll-mt-20">
            <SectionHeader
              icon={<Wallet size={16} />}
              title="Thiết lập tài chính"
              desc="Tham số kế hoạch tài chính cá nhân"
            />
            <div className="mt-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:mt-4 sm:rounded-4xl sm:p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <SettingSelect
                  label="Ngày bắt đầu kỳ tài chính"
                  value={finMonth}
                  onChange={setFinMonth}
                  options={[{ value: "1", label: "Ngày 1" }]}
                  desc="Hiện báo cáo dùng tháng theo lịch (ngày 1 đến cuối tháng). Kỳ bắt đầu ngày khác chưa hỗ trợ."
                />
                <div>
                  <label className="mb-1.5 block text-sm font-black text-slate-700">
                    Mục tiêu tiết kiệm (%)
                  </label>
                  <p className="mb-2 text-[11px] text-slate-400">
                    So sánh tỷ lệ nạp tiết kiệm trong kỳ với thu nhập tại Tổng quan. Không tính tiền nạp đầu tư.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={savingsGoal}
                      onChange={(e) => { markDirty("financial"); setSavingsGoal(e.target.value); }}
                      className="w-24 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-base font-black sm:text-sm outline-none focus:border-blue-400"
                    />
                    <span className="text-sm font-black text-slate-500">%</span>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-black text-slate-700">
                    Ngưỡng cảnh báo ngân sách (%)
                  </label>
                  <p className="mb-2 text-[11px] text-slate-400">
                    Cảnh báo khi chi tiêu vượt ngưỡng này
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={budgetAlert}
                      onChange={(e) => { markDirty("financial"); financialDraftAccountRef.current = user?.id ?? null; setBudgetAlert(e.target.value); }}
                      className="w-24 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-base font-black sm:text-sm outline-none focus:border-blue-400"
                    />
                    <span className="text-sm font-black text-slate-500">%</span>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-black text-slate-700">
                    Ngưỡng cảnh báo nợ (%)
                  </label>
                  <p className="mb-2 text-[11px] text-slate-400">
                    Dư nợ hiện tại / thu nhập của tháng; không chia cho 0
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="200"
                      value={debtAlert}
                      onChange={(e) => { markDirty("financial"); financialDraftAccountRef.current = user?.id ?? null; setDebtAlert(e.target.value); }}
                      className="w-24 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-base font-black sm:text-sm outline-none focus:border-blue-400"
                    />
                    <span className="text-sm font-black text-slate-500">%</span>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-black text-slate-700">
                    Quỹ khẩn cấp (tháng)
                  </label>
                  <p className="mb-2 text-[11px] text-slate-400">
                    Mục tiêu độ phủ quỹ khẩn cấp tại Tổng quan và Tiết kiệm (1–24 tháng).
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="24"
                      value={emergencyFund}
                      onChange={(e) => { markDirty("financial"); setEmergencyFund(e.target.value); }}
                      className="w-24 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-base font-black sm:text-sm outline-none focus:border-blue-400"
                    />
                    <span className="text-sm font-black text-slate-500">
                      tháng
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-6">
                <button
                  onClick={handleSaveFinancial}
                  disabled={saveStatus("financial") === "saving"}
                  className={
                    "flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all sm:w-auto " +
                    (saveStatus("financial") === "saved"
                      ? "bg-emerald-600 shadow-emerald-200"
                      : "bg-blue-600 shadow-blue-200 hover:bg-blue-700")
                  }
                >
                  {saveStatus("financial") === "saved" ? <Check size={15} /> : null}
                  {saveLabel("financial", "Lưu thiết lập")}
                    <span className="sr-only" role="status" aria-live="polite">{settingsSaveMessage(saveStatus("financial"), "tài khoản / trình duyệt này")}</span>
                </button>
              </div>
            </div>
          </div>

          {/* ────────────────────────────────────────────────────────────────
              §4 · AI ADVISOR
              ──────────────────────────────────────────────────────────────── */}
          <div id="settings-ai" className="scroll-mt-20">
            <SectionHeader
              icon={<Sparkles size={16} />}
              title="Trợ lý AI"
              desc="AI-6.1 Quản lý nhà cung cấp, mô hình và quy tắc an toàn"
            />

            {aiSettingsLoadError && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-800">{aiSettingsLoadError}</p>
                <button type="button" onClick={() => void loadAISettings()} className="min-h-11 shrink-0 rounded-xl border border-amber-300 bg-white px-3 text-sm font-bold text-amber-800">Thử lại</button>
              </div>
            )}

            <div className="mt-3 overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm sm:mt-4 sm:rounded-4xl">
              <div className="border-b border-blue-50 bg-linear-to-br from-blue-50 via-white to-cyan-50 p-4 sm:p-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white shadow-sm shadow-blue-200">
                      <Bot size={13} />
                      AI-6.5 Cài đặt cơ sở dữ liệu
                    </div>
                    <h3 className="mt-3 flex items-center gap-2 text-xl font-black text-slate-900">
                      Nhà cung cấp OpenAI
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-600 shadow-sm">
                        Được cung cấp bởi OpenAI
                      </span>
                    </h3>
                    <p className="mt-1 text-sm font-medium text-slate-500">
                      Lưu khóa API, mô hình và phương án dự phòng cục bộ vào cơ sở dữ liệu Supabase theo từng người dùng. Giao diện chỉ hiển thị khóa đã che sau khi lưu.
                    </p>
                  </div>

                  <div className="grid w-full gap-3 sm:grid-cols-3 xl:w-auto xl:min-w-110">
                    <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Trạng thái
                      </p>
                      <div
                        className={
                          "mt-1 inline-flex items-center gap-2 text-sm font-black " +
                          (aiProvider === "openai" && !aiConnectionReady
                            ? "text-amber-700"
                            : aiTestStatus === "success"
                              ? "text-emerald-700"
                              : aiTestStatus === "error"
                                ? "text-rose-700"
                                : aiTestStatus === "testing"
                                  ? "text-amber-700"
                                  : aiConnectionReady
                                    ? "text-blue-700"
                                    : "text-slate-500")
                        }
                      >
                        <span
                          className={
                            "size-2 rounded-full " +
                            (aiProvider === "openai" && !aiConnectionReady
                              ? "bg-amber-500"
                              : aiTestStatus === "success"
                                ? "bg-emerald-500"
                                : aiTestStatus === "error"
                                  ? "bg-rose-500"
                                  : aiTestStatus === "testing"
                                    ? "bg-amber-500"
                                    : aiConnectionReady
                                      ? "bg-blue-500"
                                      : "bg-slate-400")
                          }
                        />
                        {aiConnectionLabel}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Mô hình
                      </p>
                      <p className="mt-1 truncate text-sm font-black text-slate-800">
                        {aiModel}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Độ trễ
                      </p>
                      <p className="mt-1 text-sm font-black text-slate-800">
                        {aiTestLatencyMs ? `${aiTestLatencyMs} ms` : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 p-6 xl:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <SettingSelect
                      label="Nhà cung cấp"
                      value={aiProvider}
                      onChange={(v) => { markDirty("aiSettings"); setAiProvider(v); }}
                      options={[
                        { value: "openai", label: "OpenAI" },
                        { value: "local", label: "Chỉ AI cục bộ" },
                      ]}
                      desc="OpenAI là nhà cung cấp chính, AI cục bộ dùng làm phương án dự phòng khi lỗi."
                    />

                    <SettingSelect
                      label="Mô hình"
                      value={aiModel}
                      onChange={(v) => { markDirty("aiSettings"); setAiModel(v); }}
                      options={AI_MODEL_OPTIONS}
                      desc="Mô hình mặc định cho trò chuyện tài chính AI."
                    />
                  </div>

                  <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <label className="block text-sm font-black text-slate-700">
                          Khóa API OpenAI
                        </label>
                        <p className="mt-1 text-xs font-medium text-slate-400">
                          Khóa API được lưu theo tài khoản trong cơ sở dữ liệu Supabase. Bạn có thể cập nhật hoặc xóa khóa đã lưu bất kỳ lúc nào.
                        </p>
                      </div>
                      <div
                        className={
                          "inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-black shadow-sm " +
                          (aiHasStoredApiKey
                            ? "text-emerald-700"
                            : "text-amber-700")
                        }
                      >
                        <Shield size={12} />
                        {aiHasStoredApiKey ? "Đã lưu an toàn" : "Thiếu khóa"}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 focus-within:border-blue-400">
                      <Lock size={16} className="shrink-0 text-slate-400" />
                      <input
                        type="password"
                        value={aiApiKey}
                        onChange={(e) => { markDirty("aiSettings"); setAiApiKey(e.target.value); }}
                        placeholder={
                          aiHasStoredApiKey
                            ? "Nhập khóa mới để cập nhật"
                            : "sk-..."
                        }
                        autoComplete="off"
                        spellCheck={false}
                        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-300"
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-black">
                        <span
                          className={
                            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 " +
                            (aiHasStoredApiKey
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700")
                          }
                        >
                          <span
                            className={
                              "size-1.5 rounded-full " +
                              (aiHasStoredApiKey
                                ? "bg-emerald-500"
                                : "bg-amber-500")
                            }
                          />
                          {aiSettingsLoading
                            ? "Đang tải cài đặt..."
                            : aiMaskedKeyText}
                        </span>
                        {aiLastTestedAt ? (
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                            Lần kiểm tra gần nhất {aiLastTestedAt}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => { markDirty("aiSettings"); setAiApiKey(""); }}
                          disabled={!aiApiKey.trim()}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-500 transition hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Xóa nội dung
                        </button>
                        {aiHasStoredApiKey ? (
                          <button
                            type="button"
                            onClick={handleRemoveAIApiKey}
                            disabled={aiSettingsLoading}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-[11px] font-black text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Trash2 size={12} />
                            Xóa khóa
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-slate-700">
                            Độ sáng tạo
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            Thấp = chính xác, cao = sáng tạo hơn.
                          </p>
                        </div>
                        <span className="rounded-2xl bg-blue-50 px-3 py-1 text-sm font-black text-blue-700">
                          {aiTemperature || "0.2"}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={
                          Number.isFinite(aiTemperatureNumber)
                            ? aiTemperatureNumber
                            : 0.2
                        }
                        onChange={(e) => { markDirty("aiSettings"); setAiTemperature(e.target.value); }}
                        className="mt-4 w-full accent-blue-600"
                      />
                      <div className="mt-1 flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        <span>Chính xác</span>
                        <span>Sáng tạo</span>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-slate-700">
                            Số token tối đa
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            Giới hạn độ dài câu trả lời AI.
                          </p>
                        </div>
                        <span className="rounded-2xl bg-cyan-50 px-3 py-1 text-sm font-black text-cyan-700">
                          {aiMaxTokens || "4096"}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="512"
                        max="8192"
                        step="256"
                        value={
                          Number.isFinite(aiMaxTokensNumber)
                            ? aiMaxTokensNumber
                            : 4096
                        }
                        onChange={(e) => { markDirty("aiSettings"); setAiMaxTokens(e.target.value); }}
                        className="mt-4 w-full accent-cyan-600"
                      />
                      <div className="mt-1 flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        <span>Ngắn</span>
                        <span>Chi tiết</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleSaveAISettings}
                      disabled={aiSettingsLoading || saveStatus("aiSettings") === "saving"}
                      className={
                        "inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black text-white shadow-sm transition " +
                        (saveStatus("aiSettings") === "saved"
                          ? "bg-emerald-600 shadow-emerald-200"
                          : "bg-blue-600 shadow-blue-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60")
                      }
                    >
                      {saveStatus("aiSettings") === "saved" ? (
                        <Check size={15} />
                      ) : (
                        <Sparkles size={15} />
                      )}
                      {saveLabel("aiSettings", "Lưu cài đặt AI")}
                    <span className="sr-only" role="status" aria-live="polite">{settingsSaveMessage(saveStatus("aiSettings"), "máy chủ")}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleTestAIConnection}
                      disabled={aiSettingsLoading || aiTestStatus === "testing"}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshCcw
                        size={15}
                        className={
                          aiTestStatus === "testing" ? "animate-spin" : ""
                        }
                      />
                      Kiểm tra kết nối
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-black text-slate-900">
                          Tính năng AI
                        </h4>
                        <p className="mt-1 text-xs font-medium text-slate-400">
                          Quy tắc an toàn và dữ liệu được gửi sang bộ kết nối AI.
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500 shadow-sm">
                        Chế độ an toàn
                      </span>
                    </div>

                    <div className="space-y-2">
                      <ToggleRow
                        icon={<Zap size={14} />}
                        iconBg="bg-emerald-100 text-emerald-600"
                        label="Dự phòng cục bộ"
                        desc="Nếu OpenAI lỗi hoặc thiếu khóa API, dùng bộ máy AI cục bộ AI-5."
                        checked={aiFallbackLocal}
                        onChange={() => { markDirty("aiSettings"); setAiFallbackLocal((v) => !v); }}
                      />
                      <ToggleRow
                        icon={<Shield size={14} />}
                        iconBg="bg-blue-100 text-blue-600"
                        label="Không bịa dữ liệu"
                        desc="AI chỉ được dùng dữ liệu tài chính hiện có."
                        checked={aiNoFabrication}
                        onChange={() => { markDirty("aiSettings"); setAiNoFabrication((v) => !v); }}
                      />
                      <ToggleRow
                        icon={<Database size={14} />}
                        iconBg="bg-cyan-100 text-cyan-600"
                        label="Ngữ cảnh tài chính"
                        desc="Cho phép gửi số liệu tổng hợp sang bộ kết nối AI."
                        checked={aiSendFinanceContext}
                        onChange={() => { markDirty("aiSettings"); setAiSendFinanceContext((v) => !v); }}
                      />
                      <ToggleRow
                        icon={<AlertTriangle size={14} />}
                        iconBg="bg-amber-100 text-amber-600"
                        label="Phân tích theo quy tắc"
                        desc="Đính kèm cảnh báo vượt ngân sách, dòng tiền và rủi ro."
                        checked={aiSendRuleInsights}
                        onChange={() => { markDirty("aiSettings"); setAiSendRuleInsights((v) => !v); }}
                      />
                    </div>
                  </div>

                  <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <h4 className="text-sm font-black text-emerald-900">
                      Bảo mật
                    </h4>
                    <div className="mt-3 grid gap-2 text-xs font-bold text-emerald-700">
                      <div className="flex items-center gap-2">
                        <Check size={13} /> Mỗi người dùng có bản ghi Supabase riêng
                      </div>
                      <div className="flex items-center gap-2">
                        <Check size={13} /> Khóa API không lưu trong bộ nhớ trình duyệt
                      </div>
                      <div className="flex items-center gap-2">
                        <Check size={13} /> Giao diện chỉ hiển thị khóa đã che
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-blue-100 bg-blue-50/70 p-4">
                    <h4 className="text-sm font-black text-blue-900">
                      Xem trước mức sử dụng
                    </h4>
                    <p className="mt-1 text-xs font-medium text-blue-700/70">
                      AI-6.4 đã có siêu dữ liệu token và độ trễ. Sang AI-6.6 có thể lưu mức sử dụng vào cơ sở dữ liệu để tính số yêu cầu, token và chi phí mỗi ngày.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:mt-4 sm:rounded-4xl sm:p-6">
              <div className="mb-4">
                <h3 className="text-sm font-black text-slate-900">
                  Tính năng trợ lý AI
                </h3>
                <p className="mt-1 text-xs font-medium text-slate-400">
                  Các công tắc này mới lưu lựa chọn trên trình duyệt; chưa bật/tắt các pipeline AI trên máy chủ.
                </p>
              </div>
              <div className="space-y-1">
                <ToggleRow
                  icon={<Sparkles size={14} />}
                  iconBg="bg-blue-100 text-blue-600"
                  label="Phân tích AI"
                  desc="Phân tích tài chính thông minh và gợi ý cải thiện"
                  checked={aiInsights}
                  onChange={() => { markDirty("aiFeatures"); setAiInsights((v) => !v); }}
                />
                <ToggleRow
                  icon={<Zap size={14} />}
                  iconBg="bg-cyan-100 text-cyan-600"
                  label="Bộ máy dự báo"
                  desc="Dự báo thu chi và dòng tiền tháng tới"
                  checked={aiForecast}
                  onChange={() => { markDirty("aiFeatures"); setAiForecast((v) => !v); }}
                />
                <ToggleRow
                  icon={<AlertTriangle size={14} />}
                  iconBg="bg-amber-100 text-amber-600"
                  label="Phân tích rủi ro"
                  desc="Phân tích rủi ro tài chính và cảnh báo"
                  checked={aiRisk}
                  onChange={() => { markDirty("aiFeatures"); setAiRisk((v) => !v); }}
                />
                <ToggleRow
                  icon={<ChevronRight size={14} />}
                  iconBg="bg-emerald-100 text-emerald-600"
                  label="Cố vấn mục tiêu"
                  desc="Tư vấn chiến lược đạt mục tiêu tài chính"
                  checked={aiGoalCoach}
                  onChange={() => { markDirty("aiFeatures"); setAiGoalCoach((v) => !v); }}
                />
                <ToggleRow
                  icon={<ChevronRight size={14} />}
                  iconBg="bg-indigo-100 text-indigo-600"
                  label="Cố vấn đầu tư"
                  desc="Phân tích và gợi ý danh mục đầu tư"
                  checked={aiInvestCoach}
                  onChange={() => { markDirty("aiFeatures"); setAiInvestCoach((v) => !v); }}
                />
              </div>
              <button type="button" onClick={handleSaveAIFeatures} className="mt-4 min-h-11 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white">{saveLabel("aiFeatures", "Lưu tính năng AI")}</button>
                <p role="status" aria-live="polite" className="mt-2 text-xs text-slate-500">{settingsSaveMessage(saveStatus("aiFeatures"), "trình duyệt này")}</p>
            </div>
          </div>

          {/* ────────────────────────────────────────────────────────────────
              §5 · THÔNG BÁO
              ──────────────────────────────────────────────────────────────── */}
          <div id="settings-notifications" className="scroll-mt-20">
            <SectionHeader
              icon={<Bell size={16} />}
              title="Thông báo"
              desc="Quản lý cảnh báo và thông báo hệ thống"
            />
            <div className="mt-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:mt-4 sm:rounded-4xl sm:p-6">
              <div className="space-y-1">
                <ToggleRow
                  icon={<Bell size={14} />}
                  iconBg="bg-rose-100 text-rose-500"
                  label="Cảnh báo ngân sách"
                  desc="Bắt đầu từ ngưỡng % đã chọn; luôn nhắc khi đạt hoặc vượt giới hạn"
                  checked={notifBudget}
                  onChange={() => { markDirty("notifications"); notificationDraftAccountRef.current = user?.id ?? null; setNotifBudget((v) => !v); }}
                />
                <ToggleRow
                  icon={<Bell size={14} />}
                  iconBg="bg-emerald-100 text-emerald-600"
                  label="Cột mốc mục tiêu"
                  desc="Các cột mốc 25%, 50%, 75% và hoàn thành 100%"
                  checked={notifGoal}
                  onChange={() => { markDirty("notifications"); notificationDraftAccountRef.current = user?.id ?? null; setNotifGoal((v) => !v); }}
                />
                <ToggleRow
                  icon={<Bell size={14} />}
                  iconBg="bg-amber-100 text-amber-600"
                  label="Cảnh báo khoản nợ"
                  desc="Nhắc nợ trả chậm và dư nợ vượt ngưỡng % thu nhập tháng"
                  checked={notifDebt}
                  onChange={() => { markDirty("notifications"); notificationDraftAccountRef.current = user?.id ?? null; setNotifDebt((v) => !v); }}
                />
                <div data-notification-unavailable="true" className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-bold text-slate-600">Chưa hỗ trợ: Cảnh báo đầu tư · Tổng kết tuần · Báo cáo tháng</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Các loại này chưa có nguồn thông báo tự động. Sẽ được bật khi chức năng thực sự sẵn sàng.</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">Đồng bộ theo tài khoản khi có mạng. Sau khi nâng cấp, hãy nhấn Lưu thông báo một lần để đưa lựa chọn cũ lên đám mây. Mở lại ứng dụng trên thiết bị khác để nhận cài đặt.</p>
              <button type="button" onClick={handleSaveNotifications} disabled={saveStatus("notifications") === "saving"} className="mt-4 min-h-11 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700">{saveLabel("notifications", "Lưu thông báo")}</button>
                <p role="status" aria-live="polite" className="mt-2 text-xs text-slate-500">{settingsSaveMessage(saveStatus("notifications"), user?.id === "local-ui-user" ? "trình duyệt này" : "tài khoản")}</p>
            </div>
          </div>

          {/* ────────────────────────────────────────────────────────────────
              §6 · DỮ LIỆU
              ──────────────────────────────────────────────────────────────── */}
          <div id="settings-data" className="scroll-mt-20">
            <SectionHeader
              icon={<Database size={16} />}
              title="Dữ liệu"
              desc="Quản lý, sao lưu và khôi phục dữ liệu"
            />
            <div data-settings-backup-scope={backupAccess.allowed ? "owner" : "blocked"} className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-sm font-bold text-blue-900">Không gian dữ liệu: {backupAccess.workspaceName}</p>
              <p className="mt-1 text-xs text-blue-700">{backupAccess.allowed
                ? "Bạn là chủ sở hữu. Sao lưu/khôi phục/đặt lại/xóa chỉ tác động lên không gian này; server xác minh lại trước khi thực thi."
                : backupAccess.reason}</p>
            </div>
            <div className="mt-4 space-y-4">
              {/* Storage info */}
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-4xl sm:p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-blue-500 to-cyan-500 text-white shadow-sm">
                    <Database size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">
                      Lưu trữ đám mây Supabase
                    </p>
                    <p className="text-xs text-slate-500">
                      Dữ liệu được lưu trữ và đồng bộ trên đám mây
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Đã kết nối
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {statItems.map((s) => (
                    <div
                      key={s.label}
                      className="rounded-2xl bg-slate-50 px-3 py-2.5 text-center"
                    >
                      <p className="text-xl font-black text-blue-700">
                        {isLoadingStats ? "…" : statsLoadError ? "–" : s.value}
                      </p>
                      <p className="text-[10px] text-slate-400">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions grid */}
              <div className="grid gap-4 md:grid-cols-3">
                {/* Export */}
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-4xl sm:p-5">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-linear-to-br from-blue-500 to-cyan-500 text-white shadow-sm">
                    <Download size={16} />
                  </div>
                  <h3 className="mt-4 text-sm font-black text-slate-900">
                    Xuất JSON
                  </h3>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">
                    Tải bản sao MyFinance V{FINANCE_BACKUP_VERSION} đầy đủ cho Ví, Danh mục, Giao dịch, Nợ, Mục tiêu, Ngân sách, Đầu tư, Tiết kiệm, Ngoại hối, lịch sử số dư ngoại hối và lịch sử Tài sản ròng.
                  </p>
                  <button
                    onClick={handleExportJson}
                    disabled={!backupAccess.allowed}
                    className="mt-4 flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-blue-200 transition-all hover:bg-blue-700 active:scale-[.98]"
                  >
                    <Download size={13} />
                    Tải bản sao lưu
                  </button>
                </div>

                {/* Import */}
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-4xl sm:p-5">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-linear-to-br from-emerald-500 to-teal-400 text-white shadow-sm">
                    <Upload size={16} />
                  </div>
                  <h3 className="mt-4 text-sm font-black text-slate-900">
                    Nhập JSON
                  </h3>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">
                    Khôi phục nguyên tử từ bản sao lưu MyFinance V{FINANCE_BACKUP_VERSION}. Bản sao lưu V2/V3 hợp lệ vẫn được hỗ trợ; bản sao lưu cũ thiếu dữ liệu bắt buộc sẽ bị từ chối an toàn.
                  </p>
                  <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-200 transition-all hover:bg-emerald-700 active:scale-[.98]">
                    <Upload size={13} />
                    Chọn tệp JSON
                    <input
                      type="file"
                      accept="application/json"
                      disabled={!backupAccess.allowed}
                      onChange={handleImportJson}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Đặt lại dữ liệu mẫu */}
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-4xl sm:p-5">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-linear-to-br from-amber-400 to-orange-500 text-white shadow-sm">
                    <RefreshCcw size={16} />
                  </div>
                  <h3 className="mt-4 text-sm font-black text-slate-900">
                    Đặt lại dữ liệu mẫu
                  </h3>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">
                    Đưa toàn bộ phân hệ tài chính về trạng thái mẫu mặc định, gồm Ngân sách, Đầu tư, Tiết kiệm và Ngoại hối.
                  </p>
                  <button
                    onClick={handleResetDemo}
                    disabled={!backupAccess.allowed}
                    className="mt-4 flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-amber-200 transition-all hover:bg-amber-600 active:scale-[.98]"
                  >
                    <RefreshCcw size={13} />
                    Đặt lại dữ liệu mẫu
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ────────────────────────────────────────────────────────────────
              §7 · BẢO MẬT
              ──────────────────────────────────────────────────────────────── */}
          <div id="settings-security" className="scroll-mt-20">
            <SectionHeader
              icon={<Shield size={16} />}
              title="Bảo mật"
              desc="Trạng thái bảo mật hiện có"
            />
            <div className="mt-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:mt-4 sm:rounded-4xl sm:p-6">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    icon: <Lock size={15} />,
                    label: "Mật khẩu",
                    desc: "Đổi mật khẩu đăng nhập",
                    status: "Đã cấu hình",
                    statusCls:
                      "bg-emerald-50 text-emerald-700 border-emerald-200",
                  },
                  {
                    icon: <Shield size={15} />,
                    label: "2FA",
                    desc: "Xác thực hai yếu tố",
                    status: "Chưa bật",
                    statusCls: "bg-amber-50 text-amber-700 border-amber-200",
                  },
                  {
                    icon: <Monitor size={15} />,
                    label: "Phiên đăng nhập",
                    desc: "Quản lý phiên chưa khả dụng",
                    status: "Chưa hỗ trợ",
                    statusCls: "bg-blue-50 text-blue-700 border-blue-200",
                  },
                  {
                    icon: <ChevronRight size={15} />,
                    label: "Lịch sử đăng nhập",
                    desc: "Lịch sử đăng nhập chưa khả dụng",
                    status: "Chưa hỗ trợ",
                    statusCls: "bg-slate-100 text-slate-600 border-slate-200",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm">
                        {item.icon}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-700">
                          {item.label}
                        </p>
                        <p className="text-xs text-slate-400">{item.desc}</p>
                      </div>
                    </div>
                    <span
                      className={
                        "inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold " +
                        item.statusCls
                      }
                    >
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ────────────────────────────────────────────────────────────────
              §8 · ĐỒNG BỘ HÓA
              ──────────────────────────────────────────────────────────────── */}
          <div id="settings-sync" className="scroll-mt-20">
            <SectionHeader
              icon={<RefreshCcw size={16} />}
              title="Đồng bộ hóa"
              desc="Trạng thái kết nối và đồng bộ dữ liệu"
            />
            <div className="mt-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:mt-4 sm:rounded-4xl sm:p-6">
              <div className="flex flex-wrap items-center gap-4">
                <div
                  className={
                    "flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm " +
                    (connected
                      ? "bg-linear-to-br from-emerald-500 to-teal-400"
                      : "bg-linear-to-br from-amber-400 to-orange-400")
                  }
                >
                  <RefreshCcw
                    size={18}
                    className={connected ? "" : "animate-spin"}
                  />
                </div>
                <div>
                  <p className="text-base font-black text-slate-900">
                    Supabase thời gian thực
                  </p>
                  <p className="text-xs text-slate-500">
                    Đồng bộ dữ liệu theo thời gian thực
                  </p>
                </div>
                <div
                  className={
                    "ml-auto inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-bold " +
                    (connected
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700")
                  }
                >
                  <span
                    className={
                      "size-2 rounded-full " +
                      (connected
                        ? "bg-emerald-500"
                        : "bg-amber-400 animate-pulse")
                    }
                  />
                  {connected ? "Đã kết nối" : "Đang kết nối..."}
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase text-slate-400">
                    Trạng thái
                  </p>
                  <p
                    className={
                      "mt-1.5 text-sm font-black " +
                      (connected ? "text-emerald-600" : "text-amber-600")
                    }
                  >
                    {connected ? "Đã kết nối" : "Đang kết nối..."}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase text-slate-400">
                    Đồng bộ lần cuối
                  </p>
                  <p className="mt-1.5 text-sm font-black text-slate-700">
                    {lastSync
                      ? lastSync.toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })
                      : "Chưa đồng bộ"}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase text-slate-400">
                    Chế độ
                  </p>
                  <p className="mt-1.5 text-sm font-black text-slate-700">
                    Đồng bộ đám mây
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ────────────────────────────────────────────────────────────────
              §9 · HỆ THỐNG
              ──────────────────────────────────────────────────────────────── */}
          <div id="settings-system" className="scroll-mt-20">
            <SectionHeader
              icon={<Monitor size={16} />}
              title="Trạng thái hệ thống"
              desc="Thông tin phiên bản và dịch vụ"
            />
            <div className="mt-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:mt-4 sm:rounded-4xl sm:p-6">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: "Phiên bản",
                    value: "1.0.0",
                    statusCls: "bg-blue-50 text-blue-700 border-blue-200",
                  },
                  {
                    label: "Môi trường",
                    value: "Môi trường thật",
                    statusCls:
                      "bg-emerald-50 text-emerald-700 border-emerald-200",
                  },
                  {
                    label: "Cơ sở dữ liệu",
                    value: "Supabase",
                    statusCls:
                      "bg-emerald-50 text-emerald-700 border-emerald-200",
                  },
                  {
                    label: "Dịch vụ AI",
                    value: "Đang hoạt động",
                    statusCls: "bg-indigo-50 text-indigo-700 border-indigo-200",
                  },
                  {
                    label: "Giao diện",
                    value: "Next.js 16",
                    statusCls: "bg-slate-100 text-slate-600 border-slate-200",
                  },
                  {
                    label: "Giao diện người dùng",
                    value: "Tailwind v4",
                    statusCls: "bg-cyan-50 text-cyan-700 border-cyan-200",
                  },
                  {
                    label: "Tiền tệ",
                    value: "VND",
                    statusCls: "bg-slate-100 text-slate-600 border-slate-200",
                  },
                  {
                    label: "Thời gian thực",
                    value: connected ? "Trực tuyến" : "Đang kết nối",
                    statusCls: connected
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-amber-50 text-amber-700 border-amber-200",
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
                  >
                    <span className="text-xs font-semibold text-slate-500">
                      {s.label}
                    </span>
                    <span
                      className={
                        "inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-black " +
                        s.statusCls
                      }
                    >
                      {s.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ────────────────────────────────────────────────────────────────
              §10 · DANGER ZONE
              ──────────────────────────────────────────────────────────────── */}
          <div id="settings-danger" className="scroll-mt-20">
            <SectionHeader
              icon={<AlertTriangle size={16} />}
              title="Vùng nguy hiểm"
              desc="Các thao tác không thể hoàn tác"
              danger
            />
            <p data-settings-danger-workspace="true" className="mt-3 text-sm font-semibold text-rose-700">Đích thao tác: {backupAccess.workspaceName}. Chỉ chủ sở hữu được phép; server sẽ từ chối khi workspace thay đổi.</p>
            <div className="mt-3 rounded-3xl border border-rose-200 bg-rose-50/50 p-4 shadow-sm sm:mt-4 sm:rounded-4xl sm:p-6">
              <div className="space-y-4">
                {/* Đặt lại dữ liệu mẫu */}
                <div className="flex flex-col justify-between gap-4 rounded-2xl border border-rose-100 bg-white p-5 sm:flex-row sm:items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <RefreshCcw size={15} className="text-amber-500" />
                      <p className="text-sm font-black text-slate-900">
                        Đặt lại dữ liệu mẫu
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Đưa toàn bộ phân hệ tài chính về trạng thái mẫu mặc định,
                      gồm Ngân sách, Đầu tư, Tiết kiệm và Ngoại hối.
                    </p>
                  </div>
                  <button
                    onClick={handleResetDemo}
                    disabled={!backupAccess.allowed}
                    className="shrink-0 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-700 transition-all hover:bg-amber-100 active:scale-[.98]"
                  >
                    Đặt lại dữ liệu mẫu
                  </button>
                </div>

                {/* Clear all */}
                <div className="flex flex-col justify-between gap-4 rounded-2xl border border-rose-200 bg-white p-5 sm:flex-row sm:items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <Trash2 size={15} className="text-rose-500" />
                      <p className="text-sm font-black text-rose-700">
                        Xóa toàn bộ dữ liệu
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Xóa vĩnh viễn toàn bộ dữ liệu tài chính trong tài khoản này trên đám mây. Không thể hoàn tác.
                    </p>
                  </div>
                  <button
                    onClick={handleClearAll}
                    disabled={!backupAccess.allowed}
                    className="shrink-0 rounded-2xl bg-rose-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-rose-200 transition-all hover:bg-rose-600 active:scale-[.98]"
                  >
                    Xóa tất cả
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        action={pendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  desc,
  danger = false,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 px-1 sm:gap-3">
      <div
        className={
          "flex size-8 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl " +
          (danger ? "bg-rose-100 text-rose-500" : "bg-blue-100 text-blue-600")
        }
      >
        {icon}
      </div>
      <div>
        <h2
          className={
            "text-sm font-black sm:text-base " +
            (danger ? "text-rose-700" : "text-slate-900")
          }
        >
          {title}
        </h2>
        <p className="text-xs text-slate-400">{desc}</p>
      </div>
    </div>
  );
}

function ToggleRow({
  icon,
  iconBg,
  label,
  desc,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  desc: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl px-2 py-3 transition hover:bg-slate-50 sm:gap-4 sm:p-4">
      <div className="flex items-center gap-3">
        <div
          className={
            "flex size-8 shrink-0 items-center justify-center rounded-xl " +
            iconBg
          }
        >
          {icon}
        </div>
        <div>
          <p className="text-sm font-bold text-slate-700">{label}</p>
          <p className="text-xs text-slate-400">{desc}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onChange}
        aria-pressed={checked}
        className="flex size-11 shrink-0 items-center justify-center rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        <span
          className={
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 " +
            (checked ? "bg-blue-600" : "bg-slate-200")
          }
        >
          <span
            className={
              "inline-block size-4 rounded-full bg-white shadow-sm transition-transform duration-200 " +
              (checked ? "translate-x-6" : "translate-x-1")
            }
          />
        </span>
      </button>
    </div>
  );
}

function SettingInput({
  label,
  value,
  placeholder,
  readOnly = false,
  onChange,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  readOnly?: boolean;
  onChange?: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-black text-slate-700">
        {label}
      </label>
      <input
        type="text"
        value={value ?? ""}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        className={
          "w-full rounded-2xl border px-4 py-3 text-base outline-none sm:text-sm " +
          (readOnly
            ? "border-slate-100 bg-slate-50 text-slate-400"
            : "border-slate-200 bg-slate-50 focus:border-blue-400 focus:bg-white")
        }
      />
    </div>
  );
}

function SettingSelect({
  label,
  value,
  onChange,
  options,
  desc,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  options: { value: string; label: string }[];
  desc?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-black text-slate-700">
        {label}
      </label>
      {desc && <p className="mb-2 text-[11px] text-slate-400">{desc}</p>}
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none sm:text-sm focus:border-blue-400 focus:bg-white"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
