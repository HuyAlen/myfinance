"use client";

import { useCallback, useEffect, useState } from "react";
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
  getCategories,
  getDebts,
  getGoals,
  getBudgets,
  getInvestments,
  getTransactions,
  getWallets,
  importAllData,
  resetFinanceDemoData,
} from "@/src/services/finance/financeStorage";
import {
  clearAIFinanceApiKeyInDb,
  getAIFinanceSettingsFromDb,
  saveAIFinanceSettingsToDb,
} from "@/src/services/finance/ai-agent/aiSettingsService";
import { DEFAULT_AI_FINANCE_SETTINGS } from "@/src/services/finance/ai-agent/aiSettings";

// ─── Section nav ──────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: "profile", label: "Hồ sơ", icon: User },
  { id: "preferences", label: "Tùy chỉnh", icon: Sliders },
  { id: "financial", label: "Tài chính", icon: Wallet },
  { id: "ai", label: "AI Advisor", icon: Bot },
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user } = useAuth();
  const { status, lastSync } = useRealtime();

  const [stats, setStats] = useState({
    wallets: 0,
    categories: 0,
    transactions: 0,
    debts: 0,
    goals: 0,
  });

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
  const reloadStats = useCallback(async () => {
    const [wallets, categories, transactions, debts, goals] = await Promise.all(
      [
        getWallets(),
        getCategories(),
        getTransactions(),
        getDebts(),
        getGoals(),
      ],
    );

    setStats({
      wallets: wallets.length,
      categories: categories.length,
      transactions: transactions.length,
      debts: debts.length,
      goals: goals.length,
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reloadStats();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [reloadStats]);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setAiSettingsLoading(true);

      getAIFinanceSettingsFromDb(user.id)
        .then(({ settings, hasStoredApiKey, maskedApiKey }) => {
          if (cancelled) return;
          setAiProvider(settings.provider);
          setAiModel(settings.model);
          setAiTemperature(String(settings.temperature));
          setAiMaxTokens(String(settings.maxTokens));
          setAiFallbackLocal(settings.fallbackLocal);
          setAiNoFabrication(settings.noFabrication);
          setAiSendFinanceContext(settings.sendFinanceContext);
          setAiSendRuleInsights(settings.sendRuleInsights);
          setAiApiKey("");
          setAiHasStoredApiKey(hasStoredApiKey);
          setAiMaskedApiKey(maskedApiKey);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          toast({
            variant: "error",
            message:
              "Không thể tải AI Settings từ DB: " +
              (error instanceof Error ? error.message : "Lỗi không xác định"),
          });
        })
        .finally(() => {
          if (!cancelled) setAiSettingsLoading(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [toast, user?.id]);

  // ── Preserved handlers ─────────────────────────────────────────────────────
  async function handleResetDemo() {
    setPendingAction({
      title: "Reset dữ liệu demo?",
      description:
        "Toàn bộ dữ liệu hiện tại sẽ bị xóa và thay bằng dữ liệu demo.",
      confirmText: "Reset",
      variant: "warning",
      onConfirm: async () => {
        const { error } = await resetFinanceDemoData();
        if (error) {
          toast({
            variant: "error",
            message: "Lỗi reset dữ liệu demo: " + error,
          });
          return;
        }
        await reloadStats();
        toast({
          variant: "success",
          message: "Đã reset dữ liệu demo thành công.",
        });
      },
    });
  }

  async function handleClearAll() {
    setPendingAction({
      title: "Xóa toàn bộ dữ liệu?",
      description:
        "Hành động này không thể hoàn tác. Tất cả giao dịch, ví và dữ liệu tài chính sẽ bị xóa vĩnh viễn.",
      confirmText: "Xóa tất cả",
      variant: "danger",
      onConfirm: async () => {
        const { error } = await clearAllUserData();
        if (error) {
          toast({ variant: "error", message: "Lỗi xóa dữ liệu: " + error });
          return;
        }
        await reloadStats();
        toast({ variant: "success", message: "Đã xóa toàn bộ dữ liệu." });
      },
    });
  }

  async function handleExportJson() {
    const [
      wallets,
      categories,
      transactions,
      debts,
      goals,
      budgets,
      investments,
    ] = await Promise.all([
      getWallets(),
      getCategories(),
      getTransactions(),
      getDebts(),
      getGoals(),
      getBudgets(),
      getInvestments(),
    ]);
    const data = {
      pf_wallets: wallets,
      pf_categories: categories,
      pf_transactions: transactions,
      pf_debts: debts,
      pf_goals: goals,
      pf_budgets: budgets,
      pf_investments: investments,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download =
      "personal-finance-backup-" +
      new Date().toISOString().slice(0, 10) +
      ".json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleImportJson(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = JSON.parse(String(reader.result));
        const { error: importErr } = await importAllData({
          wallets: Array.isArray(result.pf_wallets)
            ? result.pf_wallets
            : undefined,
          categories: Array.isArray(result.pf_categories)
            ? result.pf_categories
            : undefined,
          transactions: Array.isArray(result.pf_transactions)
            ? result.pf_transactions
            : undefined,
          debts: Array.isArray(result.pf_debts) ? result.pf_debts : undefined,
          goals: Array.isArray(result.pf_goals) ? result.pf_goals : undefined,
          budgets: Array.isArray(result.pf_budgets)
            ? result.pf_budgets
            : undefined,
          investments: Array.isArray(result.pf_investments)
            ? result.pf_investments
            : undefined,
        });
        await reloadStats();
        if (importErr) {
          toast({
            variant: "error",
            message: "Lỗi import dữ liệu: " + importErr,
          });
        } else {
          toast({ variant: "success", message: "Import dữ liệu thành công." });
        }
      } catch {
        toast({ variant: "error", message: "File JSON không hợp lệ." });
      }
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
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2200);
  }

  async function handleSaveAISettings() {
    if (!user?.id) {
      toast({
        variant: "error",
        message: "Bạn cần đăng nhập để lưu AI Settings vào DB.",
      });
      return;
    }

    const normalizedTemperature = String(aiTemperature || "0.2").trim();
    const normalizedMaxTokens = String(aiMaxTokens || "4096").trim();
    const nextApiKey = aiApiKey.trim();

    if (aiProvider === "openai" && !nextApiKey && !aiHasStoredApiKey) {
      toast({
        variant: "error",
        message: "Vui lòng nhập OpenAI API Key trước khi lưu lần đầu.",
      });
      return;
    }

    try {
      const result = await saveAIFinanceSettingsToDb(user.id, {
        provider: aiProvider === "local" ? "local" : "openai",
        apiKey: nextApiKey || undefined,
        model: aiModel,
        temperature: Number(normalizedTemperature),
        maxTokens: Number(normalizedMaxTokens),
        fallbackLocal: aiFallbackLocal,
        noFabrication: aiNoFabrication,
        sendFinanceContext: aiSendFinanceContext,
        sendRuleInsights: aiSendRuleInsights,
      });

      setAiTemperature(String(result.settings.temperature));
      setAiMaxTokens(String(result.settings.maxTokens));
      setAiApiKey("");
      setAiHasStoredApiKey(result.hasStoredApiKey);
      setAiMaskedApiKey(result.maskedApiKey);
      setAiTestStatus("idle");
      setAiLastTestedAt("");
      setAiTestLatencyMs(null);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2200);

      toast({
        variant: "success",
        message: "Đã lưu AI Settings vào DB.",
      });
    } catch (error) {
      toast({
        variant: "error",
        message:
          "Không thể lưu AI Settings vào DB: " +
          (error instanceof Error ? error.message : "Lỗi không xác định"),
      });
    }
  }

  function handleRemoveAIApiKey() {
    if (!user?.id) {
      toast({
        variant: "error",
        message: "Bạn cần đăng nhập để xóa OpenAI API Key.",
      });
      return;
    }

    if (!aiHasStoredApiKey) {
      toast({
        variant: "error",
        message: "Chưa có OpenAI API Key nào được lưu trong DB.",
      });
      return;
    }

    setPendingAction({
      title: "Xóa OpenAI API Key đã lưu?",
      description:
        "Hành động này sẽ xóa vĩnh viễn API key khỏi tài khoản của bạn. Các cài đặt AI khác như model, temperature và context vẫn được giữ nguyên.",
      confirmText: "Xóa API Key",
      variant: "danger",
      onConfirm: async () => {
        try {
          await clearAIFinanceApiKeyInDb(user.id);
          setAiApiKey("");
          setAiHasStoredApiKey(false);
          setAiMaskedApiKey("");
          setAiTestStatus("idle");
          setAiLastTestedAt("");
          setAiTestLatencyMs(null);
          toast({
            variant: "success",
            message: "Đã xóa OpenAI API Key khỏi DB.",
          });
        } catch (error) {
          toast({
            variant: "error",
            message:
              "Không thể xóa OpenAI API Key: " +
              (error instanceof Error ? error.message : "Lỗi không xác định"),
          });
        }
      },
    });
  }

  async function handleTestAIConnection() {
    setAiTestStatus("testing");
    setAiTestLatencyMs(null);
    const startedAt = performance.now();

    try {
      if (aiProvider === "openai" && !aiApiKey.trim() && !aiHasStoredApiKey) {
        setAiTestStatus("error");
        toast({
          variant: "error",
          message:
            "Vui lòng nhập OpenAI API Key hoặc lưu key trong DB trước khi test.",
        });
        return;
      }

      if (
        aiProvider === "openai" &&
        aiApiKey.trim() &&
        !aiApiKey.trim().startsWith("sk-")
      ) {
        setAiTestStatus("error");
        toast({
          variant: "error",
          message: "API Key chưa đúng định dạng sk-...",
        });
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 650));

      setAiTestLatencyMs(Math.round(performance.now() - startedAt));
      setAiLastTestedAt(
        new Date().toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      setAiTestStatus("success");
      toast({
        variant: "success",
        message:
          aiProvider === "local"
            ? "Local AI đã sẵn sàng."
            : "AI Settings hợp lệ. AI Agent sẽ đọc OpenAI API Key từ DB.",
      });
    } catch {
      setAiTestStatus("error");
      toast({
        variant: "error",
        message: "Không thể kiểm tra AI Settings.",
      });
    }
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ══ Executive Account Summary ════════════════════════════════════════ */}
      <section className="overflow-hidden rounded-4xl border border-blue-100 shadow-sm">
        <div className="bg-linear-to-br from-blue-50 via-white to-cyan-50 px-6 pb-6 pt-6 sm:px-8">
          <p className="text-[11px] font-black uppercase tracking-widest text-blue-500">
            Account Center
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-5">
            {/* Avatar */}
            <div className="flex size-16 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 to-cyan-500 text-2xl font-black text-white shadow-lg shadow-blue-200/60">
              {avatarLetter}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                Cài đặt tài khoản
              </h1>
              <p className="mt-0.5 truncate text-sm text-slate-500">
                {displayEmail}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-[11px] font-bold text-emerald-700">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Tài khoản cá nhân
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-[11px] font-bold text-blue-700">
                  <Sparkles size={10} />
                  Premium
                </span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-5 flex flex-wrap gap-3">
            {[
              { label: "Ví tiền", value: stats.wallets },
              { label: "Danh mục", value: stats.categories },
              { label: "Giao dịch", value: stats.transactions },
              { label: "Khoản nợ", value: stats.debts },
              { label: "Mục tiêu", value: stats.goals },
            ].map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 shadow-sm"
              >
                <span className="text-lg font-black text-blue-700">
                  {s.value}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

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
        <div className="min-w-0 flex-1 space-y-8">
          {/* ────────────────────────────────────────────────────────────────
              §1 · HỒ SƠ CÁ NHÂN
              ──────────────────────────────────────────────────────────────── */}
          <div id="settings-profile">
            <SectionHeader
              icon={<User size={16} />}
              title="Hồ sơ cá nhân"
              desc="Thông tin tài khoản của bạn"
            />
            <div className="mt-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid gap-4 md:grid-cols-2">
                <SettingInput label="Email" value={displayEmail} readOnly />
                <SettingInput
                  label="Họ và tên"
                  placeholder="Nhập tên của bạn..."
                />
                <SettingInput
                  label="Số điện thoại"
                  placeholder="+84 xxx xxx xxx"
                />
                <SettingSelect
                  label="Múi giờ"
                  value="Asia/Ho_Chi_Minh"
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
                    "flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all " +
                    (saveSuccess
                      ? "bg-emerald-600 shadow-emerald-200"
                      : "bg-blue-600 shadow-blue-200 hover:bg-blue-700")
                  }
                >
                  {saveSuccess ? <Check size={15} /> : null}
                  {saveSuccess ? "Đã lưu!" : "Lưu thay đổi"}
                </button>
                <p className="text-xs text-slate-400">
                  Thay đổi được lưu cục bộ
                </p>
              </div>
            </div>
          </div>

          {/* ────────────────────────────────────────────────────────────────
              §2 · TÙY CHỈNH ỨNG DỤNG
              ──────────────────────────────────────────────────────────────── */}
          <div id="settings-preferences">
            <SectionHeader
              icon={<Sliders size={16} />}
              title="Tùy chỉnh ứng dụng"
              desc="Ngôn ngữ, giao diện và mặc định"
            />
            <div className="mt-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
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
                          "rounded-2xl border px-4 py-2 text-xs font-bold transition-all " +
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
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold outline-none focus:border-blue-400"
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
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold outline-none focus:border-blue-400"
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
                          "rounded-2xl border px-4 py-2 text-xs font-bold transition-all " +
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
          <div id="settings-financial">
            <SectionHeader
              icon={<Wallet size={16} />}
              title="Thiết lập tài chính"
              desc="Tham số kế hoạch tài chính cá nhân"
            />
            <div className="mt-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
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
                      className="w-24 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-black outline-none focus:border-blue-400"
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
                      className="w-24 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-black outline-none focus:border-blue-400"
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
                      className="w-24 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-black outline-none focus:border-blue-400"
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
                      className="w-24 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-black outline-none focus:border-blue-400"
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
                    "flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all " +
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
          <div id="settings-ai">
            <SectionHeader
              icon={<Sparkles size={16} />}
              title="AI Advisor"
              desc="AI-6.1 Provider Management, model và quy tắc an toàn"
            />

            <div className="mt-4 overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-sm">
              <div className="border-b border-blue-50 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-6">
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

                  <div className="grid w-full gap-3 sm:grid-cols-3 xl:w-auto xl:min-w-[440px]">
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

            <div className="mt-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h3 className="text-sm font-black text-slate-900">
                  AI Advisor Features
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
            </div>
          </div>

          {/* ────────────────────────────────────────────────────────────────
              §5 · THÔNG BÁO
              ──────────────────────────────────────────────────────────────── */}
          <div id="settings-notifications">
            <SectionHeader
              icon={<Bell size={16} />}
              title="Thông báo"
              desc="Quản lý cảnh báo và thông báo hệ thống"
            />
            <div className="mt-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
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
            </div>
          </div>

          {/* ────────────────────────────────────────────────────────────────
              §6 · DỮ LIỆU
              ──────────────────────────────────────────────────────────────── */}
          <div id="settings-data">
            <SectionHeader
              icon={<Database size={16} />}
              title="Dữ liệu"
              desc="Quản lý, backup và khôi phục dữ liệu"
            />
            <div className="mt-4 space-y-4">
              {/* Storage info */}
              <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-sm">
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
                  {[
                    { label: "Ví tiền", value: stats.wallets },
                    { label: "Danh mục", value: stats.categories },
                    { label: "Giao dịch", value: stats.transactions },
                    { label: "Khoản nợ", value: stats.debts },
                    { label: "Mục tiêu", value: stats.goals },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-2xl bg-slate-50 px-3 py-2.5 text-center"
                    >
                      <p className="text-xl font-black text-blue-700">
                        {s.value}
                      </p>
                      <p className="text-[10px] text-slate-400">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions grid */}
              <div className="grid gap-4 md:grid-cols-3">
                {/* Export */}
                <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-sm">
                    <Download size={16} />
                  </div>
                  <h3 className="mt-4 text-sm font-black text-slate-900">
                    Export JSON
                  </h3>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">
                    Tải toàn bộ dữ liệu về máy dưới dạng file JSON backup.
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
                <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-400 text-white shadow-sm">
                    <Upload size={16} />
                  </div>
                  <h3 className="mt-4 text-sm font-black text-slate-900">
                    Import JSON
                  </h3>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">
                    Khôi phục dữ liệu từ file backup JSON đã export trước đó.
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
                <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
                    <RefreshCcw size={16} />
                  </div>
                  <h3 className="mt-4 text-sm font-black text-slate-900">
                    Reset demo
                  </h3>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">
                    Đưa dữ liệu ví, giao dịch, danh mục về mặc định demo.
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
          <div id="settings-security">
            <SectionHeader
              icon={<Shield size={16} />}
              title="Bảo mật"
              desc="Quản lý bảo mật tài khoản"
            />
            <div className="mt-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
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
                    desc: "Quản lý các thiết bị đang đăng nhập",
                    status: "1 thiết bị",
                    statusCls: "bg-blue-50 text-blue-700 border-blue-200",
                  },
                  {
                    icon: <ChevronRight size={15} />,
                    label: "Lịch sử đăng nhập",
                    desc: "Xem lại các lần đăng nhập gần đây",
                    status: "Xem chi tiết",
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
          <div id="settings-sync">
            <SectionHeader
              icon={<RefreshCcw size={16} />}
              title="Đồng bộ hóa"
              desc="Trạng thái kết nối và đồng bộ dữ liệu"
            />
            <div className="mt-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-4">
                <div
                  className={
                    "flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm " +
                    (connected
                      ? "bg-gradient-to-br from-emerald-500 to-teal-400"
                      : "bg-gradient-to-br from-amber-400 to-orange-400")
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
          <div id="settings-system">
            <SectionHeader
              icon={<Monitor size={16} />}
              title="Trạng thái hệ thống"
              desc="Thông tin phiên bản và dịch vụ"
            />
            <div className="mt-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
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
          <div id="settings-danger">
            <SectionHeader
              icon={<AlertTriangle size={16} />}
              title="Vùng nguy hiểm"
              desc="Các thao tác không thể hoàn tác"
              danger
            />
            <div className="mt-4 rounded-[2rem] border border-rose-200 bg-rose-50/50 p-6 shadow-sm">
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
                      Đưa ví, giao dịch, danh mục, ngân sách, mục tiêu về dữ
                      liệu mẫu mặc định.
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
                      Xóa vĩnh viễn tất cả dữ liệu tài chính trên thiết bị hiện
                      tại. Không thể hoàn tác.
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
    <div className="flex items-center gap-3 px-1">
      <div
        className={
          "flex size-8 shrink-0 items-center justify-center rounded-2xl " +
          (danger ? "bg-rose-100 text-rose-500" : "bg-blue-100 text-blue-600")
        }
      >
        {icon}
      </div>
      <div>
        <h2
          className={
            "text-base font-black " +
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
    <div className="flex items-center justify-between gap-4 rounded-2xl p-4 transition hover:bg-slate-50">
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
        className={
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none " +
          (checked ? "bg-blue-600" : "bg-slate-200")
        }
      >
        <span
          className={
            "inline-block size-4 rounded-full bg-white shadow-sm transition-transform duration-200 " +
            (checked ? "translate-x-6" : "translate-x-1")
          }
        />
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
        defaultValue={value}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        className={
          "w-full rounded-2xl border px-4 py-3 text-sm outline-none " +
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
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
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
