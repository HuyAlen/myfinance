"use client";

import { useEffect, useState } from "react";
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

  // AI toggles
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

  // ── Data loading ───────────────────────────────────────────────────────────
  async function reloadStats() {
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
  }

  useEffect(() => {
    reloadStats();
  }, []);

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

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ══ Executive Account Summary ════════════════════════════════════════ */}
      <section className="overflow-hidden rounded-[2rem] border border-blue-100 shadow-sm">
        <div className="bg-gradient-to-br from-blue-50 via-white to-cyan-50 px-6 pb-6 pt-6 sm:px-8">
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
              desc="Cấu hình tính năng trí tuệ nhân tạo"
            />
            <div className="mt-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
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
