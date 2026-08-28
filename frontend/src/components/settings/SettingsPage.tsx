"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ConfirmDialog, {
  type PendingConfirm,
} from "@/src/components/ui/ConfirmDialog";
import { useToast } from "@/src/components/ui/ToastProvider";

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
  Wallet,
  Zap,
} from "lucide-react";

import { useAuth } from "@/src/components/auth/AuthProvider";
import { useRealtime } from "@/src/components/realtime/RealtimeProvider";

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
  type FinanceBackupV3,
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
  { value: "gpt-5.2", label: "GPT-5.2 · Recommended" },
  { value: "gpt-5.2-mini", label: "GPT-5.2 Mini · Fast" },
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
  { key: "forex", label: "Forex" },
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
  const destructiveInFlightRef = useRef(false);
  const restoreInFlightRef = useRef(false);

  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [timezone, setTimezone] = useState("Asia/Ho_Chi_Minh");

  // Preferences
  const [lang, setLang] = useState("vi");
  const [currency, setCurrency] = useState("VND");
  const [dateFormat, setDateFormat] = useState("dd/mm/yyyy");
  const [defaultPage, setDefaultPage] = useState("/");
  const [theme, setTheme] = useState("light");

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
  const [notifInvest, setNotifInvest] = useState(false);
  const [notifWeekly, setNotifWeekly] = useState(true);
  const [notifMonthly, setNotifMonthly] = useState(true);

  // Save feedback
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingConfirm | null>(
    null,
  );
  const { toast } = useToast();

  // Active nav section
  const [activeSection, setActiveSection] = useState("profile");

  const connected = status === "SUBSCRIBED";
  const avatarLetter = user?.email?.[0]?.toUpperCase() ?? "U";
  const displayEmail = user?.email ?? "";
  const aiConnectionReady =
    aiProvider === "local" || aiHasStoredApiKey || Boolean(aiApiKey.trim());
  const aiConnectionLabel =
    aiProvider === "openai" && !aiConnectionReady
      ? "API Key Missing"
      : aiTestStatus === "success"
        ? "Connected"
        : aiTestStatus === "error"
          ? "Action needed"
          : aiTestStatus === "testing"
            ? "Testing"
            : aiConnectionReady
              ? "Ready to test"
              : "Setup required";
  const aiMaskedKeyText = aiHasStoredApiKey
    ? aiMaskedApiKey || "••••••••••••••••"
    : "No API key stored";
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

  const buildLocalSettingsSnapshot = useCallback((): LocalSettingsSnapshot => ({
    version: SETTINGS_LOCAL_VERSION,
    profileName, profilePhone, timezone, lang, currency, dateFormat, defaultPage, theme,
    finMonth, savingsGoal, budgetAlert, debtAlert, emergencyFund,
    aiInsights, aiForecast, aiRisk, aiGoalCoach, aiInvestCoach,
    notifBudget, notifGoal, notifDebt, notifInvest, notifWeekly, notifMonthly,
  }), [profileName, profilePhone, timezone, lang, currency, dateFormat, defaultPage, theme, finMonth, savingsGoal, budgetAlert, debtAlert, emergencyFund, aiInsights, aiForecast, aiRisk, aiGoalCoach, aiInvestCoach, notifBudget, notifGoal, notifDebt, notifInvest, notifWeekly, notifMonthly]);

  useEffect(() => {
    if (!user?.id) return;

    const timer = window.setTimeout(() => {
      try {
      const raw = window.localStorage.getItem(localSettingsKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<LocalSettingsSnapshot>;
      if (saved.version !== SETTINGS_LOCAL_VERSION) return;
      if (typeof saved.profileName === "string") setProfileName(saved.profileName);
      if (typeof saved.profilePhone === "string") setProfilePhone(saved.profilePhone);
      if (typeof saved.timezone === "string") setTimezone(saved.timezone);
      if (typeof saved.lang === "string") setLang(saved.lang);
      if (typeof saved.currency === "string") setCurrency(saved.currency);
      if (typeof saved.dateFormat === "string") setDateFormat(saved.dateFormat);
      if (typeof saved.defaultPage === "string") setDefaultPage(saved.defaultPage);
      if (typeof saved.theme === "string") setTheme(saved.theme);
      if (typeof saved.finMonth === "string") setFinMonth(saved.finMonth);
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
      if (typeof saved.notifInvest === "boolean") setNotifInvest(saved.notifInvest);
      if (typeof saved.notifWeekly === "boolean") setNotifWeekly(saved.notifWeekly);
      if (typeof saved.notifMonthly === "boolean") setNotifMonthly(saved.notifMonthly);
      } catch (error) {
        console.warn("[SettingsPage] local preferences could not be restored:", error);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [localSettingsKey, user?.id]);

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
        "AI settings",
      );
      applyAISettings(settings);
      setAiSettingsLoadError(null);
      return true;
    } catch (error) {
      const message =
        "Không thể tải AI Settings: " +
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
    setPendingAction({
      title: "Reset dữ liệu demo?",
      description:
        "Toàn bộ dữ liệu hiện tại (Ví, Danh mục, Giao dịch, Nợ, Mục tiêu, Ngân sách, Đầu tư, Tiết kiệm và Forex) sẽ bị xóa và thay bằng trạng thái demo mặc định.",
      confirmText: "Reset",
      variant: "warning",
      onConfirm: async () => {
        if (destructiveInFlightRef.current) return;
        destructiveInFlightRef.current = true;
        try {
        const { error } = await resetFinanceDemoData();
        if (error) {
          toast({
            variant: "error",
            message: "Lỗi reset dữ liệu demo: " + error,
          });
          return;
        }
        await runStatsReload();
        toast({
          variant: "success",
          message: "Đã reset dữ liệu demo thành công.",
        });
        } finally {
          destructiveInFlightRef.current = false;
        }
      },
    });
  }

  async function handleClearAll() {
    setPendingAction({
      title: "Xóa toàn bộ dữ liệu?",
      description:
        "Hành động này không thể hoàn tác. Toàn bộ dữ liệu tài chính (Ví, Danh mục, Giao dịch, Nợ, Mục tiêu, Ngân sách, Đầu tư, Tiết kiệm, Forex và lịch sử Net Worth) sẽ bị xóa vĩnh viễn.",
      confirmText: "Xóa tất cả",
      variant: "danger",
      onConfirm: async () => {
        if (destructiveInFlightRef.current) return;
        destructiveInFlightRef.current = true;
        try {
        const { error } = await clearAllUserData();
        if (error) {
          toast({ variant: "error", message: "Lỗi xóa dữ liệu: " + error });
          return;
        }
        await runStatsReload();
        toast({ variant: "success", message: "Đã xóa toàn bộ dữ liệu." });
        } finally {
          destructiveInFlightRef.current = false;
        }
      },
    });
  }

  async function handleExportJson() {
    // FINANCE-DATA-2: the database now produces one versioned snapshot in a
    // single RPC call. This prevents a partial browser-side export where one
    // of several independent collection reads fails after the others succeed.
    try {
      const backup = await exportFinanceBackup();
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

  function requestBackupRestore(backup: FinanceBackupV3, fileName: string) {
    setPendingAction({
      title: "Khôi phục backup?",
      description:
        `File ${fileName} sẽ thay thế toàn bộ dữ liệu tài chính hiện tại ` +
        "(Ví, Danh mục, Giao dịch, Nợ, Mục tiêu, Ngân sách, Đầu tư, " +
        "Tiết kiệm, Forex và lịch sử Net Worth). Nếu bất kỳ bước nào thất bại, " +
        "dữ liệu hiện tại sẽ được giữ nguyên.",
      confirmText: "Khôi phục",
      variant: "warning",
      onConfirm: async () => {
        if (restoreInFlightRef.current) return;
        restoreInFlightRef.current = true;
        try {
        const { error: restoreError } = await restoreFinanceBackup(backup);
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
          message: "Đã khôi phục backup thành công.",
        });
        } finally {
          restoreInFlightRef.current = false;
        }
      },
    });
  }

  function handleImportJson(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
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

        requestBackupRestore(validation.backup, file.name);
      } catch {
        toast({ variant: "error", message: "File JSON không hợp lệ." });
      }
    };
    reader.onerror = () => {
      toast({
        variant: "error",
        message: "Không thể đọc file backup. Vui lòng thử lại.",
      });
    };
    reader.readAsText(file);
  }

  // ── Scroll-to helper ───────────────────────────────────────────────────────
  function scrollTo(id: string) {
    setActiveSection(id);
    document
      .getElementById("settings-" + id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ── Save prefs feedback ────────────────────────────────────────────────────
  function handleSavePrefs() {
    const numericRules = [
      ["Mục tiêu tiết kiệm", savingsGoal, 0, 100],
      ["Ngưỡng cảnh báo ngân sách", budgetAlert, 0, 100],
      ["Ngưỡng cảnh báo nợ", debtAlert, 0, 100],
      ["Quỹ khẩn cấp", emergencyFund, 1, 24],
    ] as const;
    for (const [label, raw, min, max] of numericRules) {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < min || value > max) {
        toast({ variant: "error", message: `${label} phải nằm trong khoảng ${min}–${max}.` });
        return;
      }
    }
    try {
      window.localStorage.setItem(
        localSettingsKey,
        JSON.stringify(buildLocalSettingsSnapshot()),
      );
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 2200);
      toast({ variant: "success", message: "Đã lưu tùy chỉnh trên trình duyệt này." });
    } catch {
      toast({ variant: "error", message: "Không thể lưu tùy chỉnh trên trình duyệt này." });
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
      return "Temperature phải nằm trong khoảng 0–2.";
    }
    if (!Number.isInteger(maxTokens) || maxTokens < 512 || maxTokens > 8192) {
      return "Max Tokens phải là số nguyên trong khoảng 512–8192.";
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
        message: "Vui lòng nhập OpenAI API Key trước khi lưu lần đầu.",
      });
      return;
    }

    if (nextApiKey && !nextApiKey.startsWith("sk-")) {
      toast({
        variant: "error",
        message: "API Key chưa đúng định dạng sk-...",
      });
      return;
    }

    try {
      setAiSettingsLoading(true);
      const settings = await saveAIFinanceSettings(
        accessToken,
        getAISettingsPayload(),
      );
      applyAISettings(settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2200);

      toast({
        variant: "success",
        message: "Đã lưu AI Settings an toàn qua server API.",
      });
    } catch (error) {
      toast({
        variant: "error",
        message:
          "Không thể lưu AI Settings: " +
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
        message: "Chưa có OpenAI API Key nào được lưu.",
      });
      return;
    }

    setPendingAction({
      title: "Xóa OpenAI API Key đã lưu?",
      description:
        "Hành động này sẽ xóa vĩnh viễn API key đã mã hóa khỏi tài khoản. Các cài đặt AI khác vẫn được giữ nguyên.",
      confirmText: "Xóa API Key",
      variant: "danger",
      onConfirm: async () => {
        try {
          setAiSettingsLoading(true);
          const settings = await deleteAIFinanceApiKey(accessToken);
          applyAISettings(settings);
          toast({
            variant: "success",
            message: "Đã xóa OpenAI API Key.",
          });
        } catch (error) {
          toast({
            variant: "error",
            message:
              "Không thể xóa OpenAI API Key: " +
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
          : "Vui lòng lưu OpenAI API Key trước khi kiểm tra kết nối.",
      });
      return;
    }

    if (nextApiKey && !nextApiKey.startsWith("sk-")) {
      setAiTestStatus("error");
      toast({
        variant: "error",
        message: "API Key chưa đúng định dạng sk-...",
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
            ? "Local AI đã sẵn sàng."
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
          <div className="sticky top-6 overflow-hidden rounded-[1.7rem] border border-slate-100 bg-white shadow-sm">
            <div className="p-2 space-y-0.5">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const active = activeSection === s.id;
                const isDanger = s.id === "danger";
                return (
                  <button
                    key={s.id}
                    onClick={() => scrollTo(s.id)}
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
                  onChange={setProfileName}
                  placeholder="Nhập tên của bạn..."
                />
                <SettingInput
                  label="Số điện thoại"
                  value={profilePhone}
                  onChange={setProfilePhone}
                  placeholder="+84 xxx xxx xxx"
                />
                <SettingSelect
                  label="Múi giờ"
                  value={timezone}
                  onChange={setTimezone}
                  options={[
                    { value: "Asia/Ho_Chi_Minh", label: "Việt Nam (GMT+7)" },
                    { value: "Asia/Bangkok", label: "Bangkok (GMT+7)" },
                    { value: "Asia/Singapore", label: "Singapore (GMT+8)" },
                    { value: "UTC", label: "UTC (GMT+0)" },
                  ]}
                />
                <SettingSelect
                  label="Tiền tệ mặc định"
                  value={currency}
                  onChange={setCurrency}
                  options={[
                    { value: "VND", label: "Đồng Việt Nam (VND)" },
                    { value: "USD", label: "US Dollar (USD)" },
                    { value: "EUR", label: "Euro (EUR)" },
                  ]}
                />
              </div>
              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={handleSavePrefs}
                  className={
                    "flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all sm:w-auto " +
                    (saveSuccess
                      ? "bg-emerald-600 shadow-emerald-200"
                      : "bg-blue-600 shadow-blue-200 hover:bg-blue-700")
                  }
                >
                  {saveSuccess ? <Check size={15} /> : null}
                  {saveSuccess ? "Đã lưu!" : "Lưu thay đổi"}
                </button>
                <p className="text-xs text-slate-400">
                  Lưu riêng cho tài khoản này trên trình duyệt
                </p>
              </div>
            </div>
          </div>

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
                      Ngôn ngữ giao diện ứng dụng
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
                    onChange={(e) => setDateFormat(e.target.value)}
                    className="rounded-2xl border border-slate-200 bg-slate-50 min-h-11 px-3 py-2 text-sm font-bold outline-none focus:border-blue-400"
                  >
                    <option value="dd/mm/yyyy">DD/MM/YYYY</option>
                    <option value="mm/dd/yyyy">MM/DD/YYYY</option>
                    <option value="yyyy-mm-dd">YYYY-MM-DD</option>
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
                    onChange={(e) => setDefaultPage(e.target.value)}
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
                      Chế độ sáng hoặc tối
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {[
                      { val: "light", label: "Sáng" },
                      { val: "system", label: "Tự động" },
                    ].map((opt) => (
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
                  label="Tháng tài chính bắt đầu"
                  value={finMonth}
                  onChange={setFinMonth}
                  options={Array.from({ length: 28 }, (_, i) => ({
                    value: String(i + 1),
                    label: "Ngày " + (i + 1),
                  }))}
                  desc="Ngày bắt đầu chu kỳ tài chính hàng tháng"
                />
                <div>
                  <label className="mb-1.5 block text-sm font-black text-slate-700">
                    Mục tiêu tiết kiệm (%)
                  </label>
                  <p className="mb-2 text-[11px] text-slate-400">
                    % thu nhập mục tiêu tiết kiệm mỗi tháng
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={savingsGoal}
                      onChange={(e) => setSavingsGoal(e.target.value)}
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
                      onChange={(e) => setBudgetAlert(e.target.value)}
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
                    Cảnh báo khi nợ vượt % thu nhập
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="200"
                      value={debtAlert}
                      onChange={(e) => setDebtAlert(e.target.value)}
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
                    Số tháng chi tiêu cần dự phòng
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="24"
                      value={emergencyFund}
                      onChange={(e) => setEmergencyFund(e.target.value)}
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
                  onClick={handleSavePrefs}
                  className={
                    "flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all sm:w-auto " +
                    (saveSuccess
                      ? "bg-emerald-600 shadow-emerald-200"
                      : "bg-blue-600 shadow-blue-200 hover:bg-blue-700")
                  }
                >
                  {saveSuccess ? <Check size={15} /> : null}
                  {saveSuccess ? "Đã lưu!" : "Lưu thiết lập"}
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
              desc="AI-6.1 Provider Management, model và quy tắc an toàn"
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
                      AI-6.5 DB Settings
                    </div>
                    <h3 className="mt-3 flex items-center gap-2 text-xl font-black text-slate-900">
                      OpenAI Provider
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-600 shadow-sm">
                        Powered by OpenAI
                      </span>
                    </h3>
                    <p className="mt-1 text-sm font-medium text-slate-500">
                      Lưu API Key, model và fallback local vào Supabase DB theo
                      từng user. Frontend chỉ hiển thị key đã che sau khi lưu.
                    </p>
                  </div>

                  <div className="grid w-full gap-3 sm:grid-cols-3 xl:w-auto xl:min-w-110">
                    <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Status
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
                        Model
                      </p>
                      <p className="mt-1 truncate text-sm font-black text-slate-800">
                        {aiModel}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Latency
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
                      label="Provider"
                      value={aiProvider}
                      onChange={setAiProvider}
                      options={[
                        { value: "openai", label: "OpenAI" },
                        { value: "local", label: "Local AI only" },
                      ]}
                      desc="OpenAI là provider chính, Local AI dùng để fallback khi lỗi."
                    />

                    <SettingSelect
                      label="Model"
                      value={aiModel}
                      onChange={setAiModel}
                      options={AI_MODEL_OPTIONS}
                      desc="Model mặc định cho AI Finance Chat."
                    />
                  </div>

                  <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <label className="block text-sm font-black text-slate-700">
                          OpenAI API Key
                        </label>
                        <p className="mt-1 text-xs font-medium text-slate-400">
                          API key được lưu theo tài khoản trong Supabase DB. Bạn
                          có thể cập nhật hoặc xóa key đã lưu bất kỳ lúc nào.
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
                        {aiHasStoredApiKey ? "Stored securely" : "Key missing"}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 focus-within:border-blue-400">
                      <Lock size={16} className="shrink-0 text-slate-400" />
                      <input
                        type="password"
                        value={aiApiKey}
                        onChange={(e) => setAiApiKey(e.target.value)}
                        placeholder={
                          aiHasStoredApiKey
                            ? "Nhập key mới để cập nhật"
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
                            ? "Đang tải settings..."
                            : aiMaskedKeyText}
                        </span>
                        {aiLastTestedAt ? (
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                            Last test {aiLastTestedAt}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAiApiKey("")}
                          disabled={!aiApiKey.trim()}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-500 transition hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Clear input
                        </button>
                        {aiHasStoredApiKey ? (
                          <button
                            type="button"
                            onClick={handleRemoveAIApiKey}
                            disabled={aiSettingsLoading}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-[11px] font-black text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Trash2 size={12} />
                            Remove Key
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
                            Temperature
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
                        onChange={(e) => setAiTemperature(e.target.value)}
                        className="mt-4 w-full accent-blue-600"
                      />
                      <div className="mt-1 flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        <span>Precise</span>
                        <span>Creative</span>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-slate-700">
                            Max Tokens
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
                        onChange={(e) => setAiMaxTokens(e.target.value)}
                        className="mt-4 w-full accent-cyan-600"
                      />
                      <div className="mt-1 flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        <span>Short</span>
                        <span>Detailed</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleSaveAISettings}
                      disabled={aiSettingsLoading}
                      className={
                        "inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black text-white shadow-sm transition " +
                        (saveSuccess
                          ? "bg-emerald-600 shadow-emerald-200"
                          : "bg-blue-600 shadow-blue-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60")
                      }
                    >
                      {saveSuccess ? (
                        <Check size={15} />
                      ) : (
                        <Sparkles size={15} />
                      )}
                      {saveSuccess ? "Đã lưu!" : "Lưu AI Settings"}
                    </button>

                    <button
                      type="button"
                      onClick={handleTestAIConnection}
                      disabled={aiTestStatus === "testing"}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshCcw
                        size={15}
                        className={
                          aiTestStatus === "testing" ? "animate-spin" : ""
                        }
                      />
                      Test Connection
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-black text-slate-900">
                          AI Features
                        </h4>
                        <p className="mt-1 text-xs font-medium text-slate-400">
                          Quy tắc an toàn và dữ liệu được gửi sang AI Adapter.
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500 shadow-sm">
                        Safe mode
                      </span>
                    </div>

                    <div className="space-y-2">
                      <ToggleRow
                        icon={<Zap size={14} />}
                        iconBg="bg-emerald-100 text-emerald-600"
                        label="Local Fallback"
                        desc="Nếu OpenAI lỗi hoặc thiếu API key, dùng AI-5 Local Engine."
                        checked={aiFallbackLocal}
                        onChange={() => setAiFallbackLocal((v) => !v)}
                      />
                      <ToggleRow
                        icon={<Shield size={14} />}
                        iconBg="bg-blue-100 text-blue-600"
                        label="No Fabrication"
                        desc="AI chỉ được dùng dữ liệu tài chính hiện có."
                        checked={aiNoFabrication}
                        onChange={() => setAiNoFabrication((v) => !v)}
                      />
                      <ToggleRow
                        icon={<Database size={14} />}
                        iconBg="bg-cyan-100 text-cyan-600"
                        label="Finance Context"
                        desc="Cho phép gửi số liệu tổng hợp sang AI Adapter."
                        checked={aiSendFinanceContext}
                        onChange={() => setAiSendFinanceContext((v) => !v)}
                      />
                      <ToggleRow
                        icon={<AlertTriangle size={14} />}
                        iconBg="bg-amber-100 text-amber-600"
                        label="Rule Insights"
                        desc="Đính kèm cảnh báo vượt ngân sách, dòng tiền và rủi ro."
                        checked={aiSendRuleInsights}
                        onChange={() => setAiSendRuleInsights((v) => !v)}
                      />
                    </div>
                  </div>

                  <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <h4 className="text-sm font-black text-emerald-900">
                      Security
                    </h4>
                    <div className="mt-3 grid gap-2 text-xs font-bold text-emerald-700">
                      <div className="flex items-center gap-2">
                        <Check size={13} /> Per-user Supabase row
                      </div>
                      <div className="flex items-center gap-2">
                        <Check size={13} /> API Key không lưu localStorage
                      </div>
                      <div className="flex items-center gap-2">
                        <Check size={13} /> Frontend chỉ hiển thị masked key
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-blue-100 bg-blue-50/70 p-4">
                    <h4 className="text-sm font-black text-blue-900">
                      Usage Preview
                    </h4>
                    <p className="mt-1 text-xs font-medium text-blue-700/70">
                      AI-6.4 đã có token/latency metadata. Sang AI-6.6 có thể
                      lưu usage vào DB để tính request, token và chi phí mỗi
                      ngày.
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
                  Bật/tắt các module phân tích dùng chung cho AI Agent.
                </p>
              </div>
              <div className="space-y-1">
                <ToggleRow
                  icon={<Sparkles size={14} />}
                  iconBg="bg-blue-100 text-blue-600"
                  label="AI Insights"
                  desc="Phân tích tài chính thông minh và gợi ý cải thiện"
                  checked={aiInsights}
                  onChange={() => setAiInsights((v) => !v)}
                />
                <ToggleRow
                  icon={<Zap size={14} />}
                  iconBg="bg-cyan-100 text-cyan-600"
                  label="Forecast Engine"
                  desc="Dự báo thu chi và dòng tiền tháng tới"
                  checked={aiForecast}
                  onChange={() => setAiForecast((v) => !v)}
                />
                <ToggleRow
                  icon={<AlertTriangle size={14} />}
                  iconBg="bg-amber-100 text-amber-600"
                  label="Risk Analysis"
                  desc="Phân tích rủi ro tài chính và cảnh báo"
                  checked={aiRisk}
                  onChange={() => setAiRisk((v) => !v)}
                />
                <ToggleRow
                  icon={<ChevronRight size={14} />}
                  iconBg="bg-emerald-100 text-emerald-600"
                  label="Goal Coach"
                  desc="Tư vấn chiến lược đạt mục tiêu tài chính"
                  checked={aiGoalCoach}
                  onChange={() => setAiGoalCoach((v) => !v)}
                />
                <ToggleRow
                  icon={<ChevronRight size={14} />}
                  iconBg="bg-indigo-100 text-indigo-600"
                  label="Investment Coach"
                  desc="Phân tích và gợi ý danh mục đầu tư"
                  checked={aiInvestCoach}
                  onChange={() => setAiInvestCoach((v) => !v)}
                />
              </div>
              <button type="button" onClick={handleSavePrefs} className="mt-4 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white">Lưu tính năng AI</button>
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
                  desc="Nhận thông báo khi chi tiêu vượt ngưỡng cảnh báo"
                  checked={notifBudget}
                  onChange={() => setNotifBudget((v) => !v)}
                />
                <ToggleRow
                  icon={<Bell size={14} />}
                  iconBg="bg-emerald-100 text-emerald-600"
                  label="Cột mốc mục tiêu"
                  desc="Nhận thông báo khi đạt 25%, 50%, 75%, 100% mục tiêu"
                  checked={notifGoal}
                  onChange={() => setNotifGoal((v) => !v)}
                />
                <ToggleRow
                  icon={<Bell size={14} />}
                  iconBg="bg-amber-100 text-amber-600"
                  label="Cảnh báo khoản nợ"
                  desc="Nhận thông báo khi tỷ lệ nợ vượt ngưỡng an toàn"
                  checked={notifDebt}
                  onChange={() => setNotifDebt((v) => !v)}
                />
                <ToggleRow
                  icon={<Bell size={14} />}
                  iconBg="bg-blue-100 text-blue-600"
                  label="Cảnh báo đầu tư"
                  desc="Nhận thông báo về biến động danh mục đầu tư"
                  checked={notifInvest}
                  onChange={() => setNotifInvest((v) => !v)}
                />
                <ToggleRow
                  icon={<Bell size={14} />}
                  iconBg="bg-indigo-100 text-indigo-600"
                  label="Tổng kết tuần"
                  desc="Báo cáo thu chi và tiến độ mục tiêu hàng tuần"
                  checked={notifWeekly}
                  onChange={() => setNotifWeekly((v) => !v)}
                />
                <ToggleRow
                  icon={<Bell size={14} />}
                  iconBg="bg-cyan-100 text-cyan-600"
                  label="Báo cáo tháng"
                  desc="Phân tích tài chính toàn diện cuối mỗi tháng"
                  checked={notifMonthly}
                  onChange={() => setNotifMonthly((v) => !v)}
                />
              </div>
              <button type="button" onClick={handleSavePrefs} className="mt-4 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white">Lưu thông báo</button>
            </div>
          </div>

          {/* ────────────────────────────────────────────────────────────────
              §6 · DỮ LIỆU
              ──────────────────────────────────────────────────────────────── */}
          <div id="settings-data" className="scroll-mt-20">
            <SectionHeader
              icon={<Database size={16} />}
              title="Dữ liệu"
              desc="Quản lý, backup và khôi phục dữ liệu"
            />
            <div className="mt-4 space-y-4">
              {/* Storage info */}
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-4xl sm:p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-blue-500 to-cyan-500 text-white shadow-sm">
                    <Database size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">
                      Supabase Cloud Storage
                    </p>
                    <p className="text-xs text-slate-500">
                      Dữ liệu được lưu trữ và đồng bộ trên cloud
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
                    Export JSON
                  </h3>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">
                    Tải snapshot MyFinance V{FINANCE_BACKUP_VERSION} đầy đủ cho Ví, Danh mục, Giao dịch, Nợ, Mục tiêu, Ngân sách, Đầu tư, Tiết kiệm, Forex và lịch sử Net Worth.
                  </p>
                  <button
                    onClick={handleExportJson}
                    className="mt-4 flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-blue-200 transition-all hover:bg-blue-700 active:scale-[.98]"
                  >
                    <Download size={13} />
                    Tải backup
                  </button>
                </div>

                {/* Import */}
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-4xl sm:p-5">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-linear-to-br from-emerald-500 to-teal-400 text-white shadow-sm">
                    <Upload size={16} />
                  </div>
                  <h3 className="mt-4 text-sm font-black text-slate-900">
                    Import JSON
                  </h3>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">
                    Khôi phục atomically từ backup MyFinance V{FINANCE_BACKUP_VERSION}. Backup V2 hợp lệ vẫn được hỗ trợ; backup legacy thiếu dữ liệu bắt buộc sẽ bị từ chối an toàn.
                  </p>
                  <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-200 transition-all hover:bg-emerald-700 active:scale-[.98]">
                    <Upload size={13} />
                    Chọn file JSON
                    <input
                      type="file"
                      accept="application/json"
                      onChange={handleImportJson}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Reset demo */}
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-4xl sm:p-5">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-linear-to-br from-amber-400 to-orange-500 text-white shadow-sm">
                    <RefreshCcw size={16} />
                  </div>
                  <h3 className="mt-4 text-sm font-black text-slate-900">
                    Reset demo
                  </h3>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">
                    Đưa toàn bộ domain tài chính về trạng thái demo mặc định, gồm Ngân sách, Đầu tư, Tiết kiệm và Forex.
                  </p>
                  <button
                    onClick={handleResetDemo}
                    className="mt-4 flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-amber-200 transition-all hover:bg-amber-600 active:scale-[.98]"
                  >
                    <RefreshCcw size={13} />
                    Reset demo
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
                    Supabase Realtime
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
                    {connected ? "Connected" : "Connecting..."}
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
                    Cloud Sync
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
                    value: "Production",
                    statusCls:
                      "bg-emerald-50 text-emerald-700 border-emerald-200",
                  },
                  {
                    label: "Database",
                    value: "Supabase",
                    statusCls:
                      "bg-emerald-50 text-emerald-700 border-emerald-200",
                  },
                  {
                    label: "AI Services",
                    value: "Active",
                    statusCls: "bg-indigo-50 text-indigo-700 border-indigo-200",
                  },
                  {
                    label: "Frontend",
                    value: "Next.js 16",
                    statusCls: "bg-slate-100 text-slate-600 border-slate-200",
                  },
                  {
                    label: "UI",
                    value: "Tailwind v4",
                    statusCls: "bg-cyan-50 text-cyan-700 border-cyan-200",
                  },
                  {
                    label: "Tiền tệ",
                    value: "VND",
                    statusCls: "bg-slate-100 text-slate-600 border-slate-200",
                  },
                  {
                    label: "Realtime",
                    value: connected ? "Online" : "Connecting",
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
            <div className="mt-3 rounded-3xl border border-rose-200 bg-rose-50/50 p-4 shadow-sm sm:mt-4 sm:rounded-4xl sm:p-6">
              <div className="space-y-4">
                {/* Reset demo */}
                <div className="flex flex-col justify-between gap-4 rounded-2xl border border-rose-100 bg-white p-5 sm:flex-row sm:items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <RefreshCcw size={15} className="text-amber-500" />
                      <p className="text-sm font-black text-slate-900">
                        Reset dữ liệu demo
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Đưa toàn bộ domain tài chính về trạng thái demo mặc định,
                      gồm Ngân sách, Đầu tư, Tiết kiệm và Forex.
                    </p>
                  </div>
                  <button
                    onClick={handleResetDemo}
                    className="shrink-0 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-700 transition-all hover:bg-amber-100 active:scale-[.98]"
                  >
                    Reset demo
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
                      Xóa vĩnh viễn toàn bộ dữ liệu tài chính trong tài khoản này trên cloud. Không thể hoàn tác.
                    </p>
                  </div>
                  <button
                    onClick={handleClearAll}
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
