"use client";

import { useEffect, useMemo, useState } from "react";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Bot,
  BriefcaseBusiness,
  Edit3,
  Landmark,
  Lightbulb,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";

import type {
  Transaction,
  Wallet as WalletType,
  WalletType as FinanceWalletType,
} from "@/src/types/finance";

import {
  addTransaction,
  addWallet,
  deleteWallet,
  getTransactions,
  getWallets,
  updateWallet,
} from "@/src/services/finance/financeStorage";

import {
  formatVND,
  getTotalAssets,
  getTotalExpense,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";
import { CurrencyInput } from "@/src/components/ui/CurrencyInput";
import { SaveError } from "@/src/components/ui/SaveError";
import ConfirmDialog, {
  type PendingConfirm,
} from "@/src/components/ui/ConfirmDialog";
import { useToast } from "@/src/components/ui/ToastProvider";

// ─── Constants ────────────────────────────────────────────────────────────────
type FormState = {
  id?: string;
  name: string;
  type: FinanceWalletType;
  balance: string;
};

type TransferFormState = {
  fromWalletId: string;
  toWalletId: string;
  amount: string;
  date: string;
  note: string;
};

const createEmptyTransferForm = (): TransferFormState => ({
  fromWalletId: "",
  toWalletId: "",
  amount: "",
  date: new Date().toISOString().slice(0, 10),
  note: "",
});

const emptyForm: FormState = {
  name: "",
  type: "cash",
  balance: "",
};

const walletTypeOptions: {
  label: string;
  value: FinanceWalletType;
  description: string;
}[] = [
  { label: "Tiền mặt", value: "cash", description: "Tiền mặt đang giữ" },
  { label: "Ngân hàng", value: "bank", description: "Tài khoản ngân hàng" },
  {
    label: "Ví điện tử",
    value: "ewallet",
    description: "Momo, ZaloPay, ShopeePay...",
  },
  {
    label: "Đầu tư",
    value: "investment",
    description: "Cổ phiếu, quỹ, crypto...",
  },
];

const TYPE_COLORS: Record<FinanceWalletType, string> = {
  cash: "#f59e0b",
  bank: "#2563eb",
  ewallet: "#7c3aed",
  investment: "#10b981",
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WalletsPage() {
  const [wallets, setWallets] = useState<WalletType[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [transferForm, setTransferForm] = useState<TransferFormState>(
    createEmptyTransferForm,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingConfirm | null>(
    null,
  );
  const { toast } = useToast();

  async function reloadData() {
    const [w, t] = await Promise.all([getWallets(), getTransactions()]);
    setWallets(w);
    setTransactions(t);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reloadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);
  useRealtimeTable(["wallets", "transactions"], reloadData);

  // ── Existing computations ─────────────────────────────────────────────────
  const totalAssets = useMemo(() => getTotalAssets(wallets), [wallets]);

  const walletStats = useMemo(
    () =>
      walletTypeOptions.map((o) => ({
        ...o,
        total: wallets
          .filter((w) => w.type === o.value)
          .reduce((s, w) => s + w.balance, 0),
        count: wallets.filter((w) => w.type === o.value).length,
      })),
    [wallets],
  );

  // ── New analytics ─────────────────────────────────────────────────────────
  const now = new Date();
  const currentMonth =
    now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");

  const [thirtyDaysAgo] = useState(() =>
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );

  const liquidBalance = useMemo(
    () =>
      wallets
        .filter((w) => w.type !== "investment")
        .reduce((s, w) => s + w.balance, 0),
    [wallets],
  );
  const totalCash = useMemo(
    () =>
      wallets
        .filter((w) => w.type === "cash")
        .reduce((s, w) => s + w.balance, 0),
    [wallets],
  );
  const liquidityScore =
    totalAssets > 0 ? Math.round((liquidBalance / totalAssets) * 100) : 0;

  const currentMonthTxns = useMemo(
    () => transactions.filter((t) => t.date.startsWith(currentMonth)),
    [transactions, currentMonth],
  );
  const currentMonthNet = useMemo(
    () => getTotalIncome(currentMonthTxns) - getTotalExpense(currentMonthTxns),
    [currentMonthTxns],
  );

  const currentMonthTransfers = useMemo(
    () => currentMonthTxns.filter((t) => t.type === "transfer"),
    [currentMonthTxns],
  );

  const currentMonthTransferTotal = useMemo(
    () => currentMonthTransfers.reduce((sum, t) => sum + t.amount, 0),
    [currentMonthTransfers],
  );

  const transferWalletStats = useMemo(() => {
    const map = new Map<
      string,
      { wallet: WalletType; sent: number; received: number; count: number }
    >();

    for (const wallet of wallets) {
      map.set(wallet.id, { wallet, sent: 0, received: 0, count: 0 });
    }

    for (const transaction of currentMonthTransfers) {
      const from = map.get(transaction.walletId);
      if (from) {
        from.sent += transaction.amount;
        from.count += 1;
      }

      if (transaction.transferToWalletId) {
        const to = map.get(transaction.transferToWalletId);
        if (to) {
          to.received += transaction.amount;
          to.count += 1;
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [wallets, currentMonthTransfers]);

  const mostTransferActiveWallet = transferWalletStats.find(
    (item) => item.count > 0,
  );

  const largestWallet = useMemo(
    () =>
      wallets.length > 0
        ? [...wallets].sort((a, b) => b.balance - a.balance)[0]
        : null,
    [wallets],
  );

  const mostActiveWallet = useMemo(() => {
    if (wallets.length === 0) return null;
    const counts = wallets.map((w) => ({
      wallet: w,
      count: transactions.filter(
        (t) => t.walletId === w.id || t.transferToWalletId === w.id,
      ).length,
    }));
    return counts.sort((a, b) => b.count - a.count)[0]?.wallet ?? null;
  }, [wallets, transactions]);

  // Per-wallet monthly flow
  const walletFlow = useMemo(() => {
    const map = new Map<
      string,
      {
        income: number;
        expense: number;
        transferIn: number;
        transferOut: number;
      }
    >();
    for (const w of wallets) {
      const wt = currentMonthTxns.filter((t) => t.walletId === w.id);
      map.set(w.id, {
        income: getTotalIncome(wt),
        expense: getTotalExpense(wt),
        transferIn: currentMonthTransfers
          .filter((t) => t.transferToWalletId === w.id)
          .reduce((sum, t) => sum + t.amount, 0),
        transferOut: currentMonthTransfers
          .filter((t) => t.walletId === w.id)
          .reduce((sum, t) => sum + t.amount, 0),
      });
    }
    return map;
  }, [wallets, currentMonthTxns, currentMonthTransfers]);

  // Allocation pie data
  const pieData = useMemo(
    () =>
      walletTypeOptions
        .map((o) => ({
          name: o.label,
          value: walletStats.find((s) => s.value === o.value)?.total ?? 0,
          color: TYPE_COLORS[o.value],
        }))
        .filter((d) => d.value > 0),
    [walletStats],
  );

  // Intelligence alerts
  const alerts = useMemo(() => {
    const out: {
      type: "warning" | "info" | "opportunity";
      title: string;
      body: string;
    }[] = [];
    // Low balance wallets
    for (const w of wallets) {
      if (w.balance < 100_000 && w.type !== "investment") {
        out.push({
          type: "warning",
          title: "Số dư thấp · " + w.name,
          body:
            "Số dư chỉ còn " +
            formatVND(w.balance) +
            ". Hãy nạp tiền để tránh gián đoạn.",
        });
      }
    }

    // Inactive wallets
    for (const w of wallets) {
      const hasRecent = transactions.some(
        (t) => t.walletId === w.id && t.date >= thirtyDaysAgo,
      );
      if (!hasRecent && transactions.some((t) => t.walletId === w.id)) {
        out.push({
          type: "info",
          title: "Ví ít hoạt động · " + w.name,
          body: "Không có giao dịch trong 30 ngày qua. Cân nhắc hợp nhất.",
        });
      }
    }

    // Idle cash opportunity
    if (totalCash > 5_000_000) {
      out.push({
        type: "opportunity",
        title: "Cơ hội sinh lời",
        body:
          "Bạn đang giữ " +
          formatVND(totalCash) +
          " tiền mặt. Cân nhắc chuyển một phần sang tài khoản tiết kiệm hoặc đầu tư.",
      });
    }

    // Liquidity risk
    if (liquidityScore < 20 && totalAssets > 0) {
      out.push({
        type: "warning",
        title: "Rủi ro thanh khoản",
        body:
          "Tài sản thanh khoản chỉ chiếm " +
          liquidityScore +
          "%. Hãy duy trì ít nhất 20% tài sản ở dạng thanh khoản.",
      });
    }

    if (mostTransferActiveWallet && mostTransferActiveWallet.count >= 2) {
      out.push({
        type: "info",
        title: "AI phân bổ ví · " + mostTransferActiveWallet.wallet.name,
        body:
          "Tháng này ví này tham gia " +
          mostTransferActiveWallet.count +
          " lần chuyển tiền. Cân nhắc giữ số dư dự phòng ở ví thường dùng để giảm thao tác chuyển qua lại.",
      });
    }

    return out.slice(0, 6);
  }, [
    wallets,
    transactions,
    totalCash,
    liquidityScore,
    totalAssets,
    thirtyDaysAgo,
    mostTransferActiveWallet,
  ]);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  function openCreateForm() {
    setForm(emptyForm);
    setIsFormOpen(true);
  }

  function openEditForm(wallet: WalletType) {
    setForm({
      id: wallet.id,
      name: wallet.name,
      type: wallet.type,
      balance: String(wallet.balance),
    });
    setIsFormOpen(true);
  }

  function openTransferForm(defaultFromWalletId?: string) {
    const fromWalletId = defaultFromWalletId ?? wallets[0]?.id ?? "";
    const toWalletId =
      wallets.find((wallet) => wallet.id !== fromWalletId)?.id ?? "";

    setTransferForm({
      ...createEmptyTransferForm(),
      fromWalletId,
      toWalletId,
    });
    setSaveError(null);
    setIsTransferOpen(true);
  }

  async function handleTransferSubmit(event: React.FormEvent) {
    event.preventDefault();

    const amount = Number(transferForm.amount);
    const fromWallet = wallets.find(
      (wallet) => wallet.id === transferForm.fromWalletId,
    );
    const toWallet = wallets.find(
      (wallet) => wallet.id === transferForm.toWalletId,
    );

    if (!fromWallet) {
      setSaveError("Vui lòng chọn ví nguồn");
      return;
    }

    if (!toWallet) {
      setSaveError("Vui lòng chọn ví đích");
      return;
    }

    if (fromWallet.id === toWallet.id) {
      setSaveError("Ví nguồn và ví đích phải khác nhau");
      return;
    }

    if (!amount || amount <= 0) {
      setSaveError("Vui lòng nhập số tiền hợp lệ");
      return;
    }

    if (fromWallet.balance < amount) {
      setSaveError("Ví nguồn không đủ số dư để chuyển tiền");
      return;
    }

    const nextFromWallet: WalletType = {
      ...fromWallet,
      balance: fromWallet.balance - amount,
    };
    const nextToWallet: WalletType = {
      ...toWallet,
      balance: toWallet.balance + amount,
    };

    const transaction: Transaction = {
      id: crypto.randomUUID(),
      type: "transfer",
      amount,
      categoryId: "",
      walletId: fromWallet.id,
      transferToWalletId: toWallet.id,
      note:
        transferForm.note.trim() ||
        `Chuyển tiền từ ${fromWallet.name} sang ${toWallet.name}`,
      date: transferForm.date,
    };

    setSaveError(null);

    const fromResult = await updateWallet(nextFromWallet);
    if (fromResult.error) {
      setSaveError(fromResult.error);
      return;
    }

    const toResult = await updateWallet(nextToWallet);
    if (toResult.error) {
      await updateWallet(fromWallet);
      setSaveError(toResult.error);
      return;
    }

    const transactionResult = await addTransaction(transaction);
    if (transactionResult.error) {
      await Promise.all([updateWallet(fromWallet), updateWallet(toWallet)]);
      setSaveError(transactionResult.error);
      return;
    }

    toast({
      variant: "success",
      message: `Đã chuyển ${formatVND(amount)} từ ${fromWallet.name} sang ${toWallet.name}.`,
    });
    await reloadData();
    setIsTransferOpen(false);
    setTransferForm(createEmptyTransferForm());
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const balance = Number(form.balance);
    if (!form.name.trim()) {
      setSaveError("Vui lòng nhập tên ví");
      return;
    }
    if (Number.isNaN(balance) || balance < 0) {
      setSaveError("Vui lòng nhập số dư hợp lệ");
      return;
    }
    const wallet: WalletType = {
      id: form.id ?? crypto.randomUUID(),
      name: form.name.trim(),
      type: form.type,
      balance,
    };
    setSaveError(null);
    const { error } = form.id
      ? await updateWallet(wallet)
      : await addWallet(wallet);
    if (error) {
      setSaveError(error);
      return;
    }
    await reloadData();
    setIsFormOpen(false);
    setForm(emptyForm);
  }

  function handleDelete(id: string) {
    const wallet = wallets.find((w) => w.id === id);
    const linked = transactions.filter(
      (t) => t.walletId === id || t.transferToWalletId === id,
    );
    if (linked.length > 0) {
      toast({
        variant: "warning",
        message: `Không thể xóa ví "${wallet?.name ?? "này"}" vì đang có ${linked.length} giao dịch liên kết. Hãy xóa hoặc chuyển các giao dịch trước.`,
      });
      return;
    }
    setPendingAction({
      title: `Xóa ví "${wallet?.name ?? "này"}"?`,
      description:
        "Hành động này không thể hoàn tác. Ví sẽ bị xóa khỏi tài khoản của bạn.",
      variant: "danger",
      onConfirm: async () => {
        const { error } = await deleteWallet(id);
        if (error) {
          toast({ variant: "error", message: "Lỗi xóa ví: " + error });
          return;
        }
        toast({ variant: "success", message: "Đã xóa ví thành công." });
        await reloadData();
      },
    });
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 · Executive KPI Header
          ══════════════════════════════════════════════════════════════════ */}
      <section className="overflow-hidden rounded-4xl border border-blue-100 shadow-sm">
        <div className="bg-linear-to-br from-blue-50 via-white to-cyan-50 px-6 pb-7 pt-6 sm:px-8">
          {/* Top row */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-blue-500">
                Treasury Dashboard
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                Ví tiền & Tài khoản
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Quản lý tiền mặt, ngân hàng, ví điện tử và tài sản đầu tư.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => openTransferForm()}
                disabled={wallets.length < 2}
                className="flex items-center gap-2 rounded-2xl border border-blue-200 bg-white px-5 py-3 text-sm font-bold text-blue-700 shadow-sm transition-all hover:bg-blue-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowLeftRight size={17} />
                Chuyển tiền
              </button>
              <button
                onClick={openCreateForm}
                className="flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200/60 transition-all hover:bg-blue-700 active:scale-95"
              >
                <Plus size={17} />
                Thêm ví tiền
              </button>
            </div>
          </div>

          {/* 5 KPI cards */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <KpiCard
              label="Tổng tài sản"
              value={formatVND(totalAssets)}
              sub={"Tất cả " + wallets.length + " ví"}
              gradient="from-blue-500 to-blue-600"
              iconBg="bg-blue-400/30"
              icon={<Landmark size={16} />}
            />
            <KpiCard
              label="Tài sản thanh khoản"
              value={formatVND(liquidBalance)}
              sub="Tiền mặt + Ngân hàng + Ví điện tử"
              gradient="from-cyan-500 to-cyan-600"
              iconBg="bg-cyan-400/30"
              icon={<Wallet size={16} />}
            />
            <KpiCard
              label="Dòng tiền tháng này"
              value={
                (currentMonthNet >= 0 ? "+" : "") + formatVND(currentMonthNet)
              }
              sub={"T" + (now.getMonth() + 1) + "/" + now.getFullYear()}
              gradient={
                currentMonthNet >= 0
                  ? "from-emerald-500 to-emerald-600"
                  : "from-rose-500 to-rose-600"
              }
              iconBg="bg-white/20"
              icon={
                currentMonthNet >= 0 ? (
                  <TrendingUp size={16} />
                ) : (
                  <TrendingDown size={16} />
                )
              }
            />
            <KpiCard
              label="Chuyển giữa ví"
              value={formatVND(currentMonthTransferTotal)}
              sub={currentMonthTransfers.length + " giao dịch tháng này"}
              gradient="from-indigo-500 to-indigo-600"
              iconBg="bg-indigo-400/30"
              icon={<ArrowLeftRight size={16} />}
            />
            <div className="col-span-2 sm:col-span-1 rounded-2xl bg-linear-to-br from-amber-400 to-orange-500 p-4 shadow-sm shadow-amber-200/60">
              <p className="text-[10px] font-black uppercase tracking-wide text-amber-100">
                Liquidity Score
              </p>
              <p className="mt-1 text-3xl font-black text-white">
                {liquidityScore}
                <span className="text-lg font-bold opacity-70">%</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-1.5 rounded-full bg-white"
                  style={{ width: Math.min(liquidityScore, 100) + "%" }}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-amber-100">
                {liquidityScore >= 50
                  ? "Thanh khoản cao"
                  : liquidityScore >= 20
                    ? "Bình thường"
                    : "Rủi ro thấp"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 · Wallet Overview
          ══════════════════════════════════════════════════════════════════ */}
      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        {/* Allocation breakdown */}
        <div className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-linear-to-br from-blue-600 to-cyan-500 text-white shadow-sm shadow-blue-100">
              <Landmark size={17} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                Phân bổ tài sản
              </h2>
              <p className="text-xs text-slate-500">Theo loại ví tiền</p>
            </div>
          </div>

          <div className="space-y-4">
            {walletStats
              .filter((s) => s.total > 0)
              .map((s) => {
                const pct =
                  totalAssets > 0
                    ? Math.round((s.total / totalAssets) * 100)
                    : 0;
                const color = TYPE_COLORS[s.value];
                return (
                  <div key={s.value}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full shrink-0"
                          style={{ background: color }}
                        />
                        <span className="font-bold text-slate-700">
                          {s.label}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          {s.count} ví
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-slate-900">
                          {pct}%
                        </span>
                        <span className="text-xs text-slate-400">
                          {formatVND(s.total)}
                        </span>
                      </div>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-2.5 rounded-full transition-all duration-500"
                        style={{ width: pct + "%", background: color }}
                      />
                    </div>
                  </div>
                );
              })}
            {walletStats.every((s) => s.total === 0) && (
              <p className="py-4 text-center text-sm text-slate-400">
                Chưa có dữ liệu
              </p>
            )}
          </div>
        </div>

        {/* Right panel: Pie + highlights */}
        <div className="flex flex-col gap-5">
          {/* Pie chart */}
          <div className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-black text-slate-900">
              Biểu đồ phân bổ
            </h2>
            {pieData.length > 0 ? (
              <div className="flex items-center gap-4">
                <div className="h-32 w-32 shrink-0">
                  <PieChart width={128} height={128}>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      innerRadius={40}
                      outerRadius={60}
                      paddingAngle={4}
                      startAngle={90}
                      endAngle={-270}
                    >
                      {pieData.map((e, i) => (
                        <Cell key={i} fill={e.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </div>
                <div className="flex-1 space-y-2">
                  {pieData.map((d) => (
                    <div
                      key={d.name}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: d.color }}
                      />
                      <span className="flex-1 font-bold text-slate-600">
                        {d.name}
                      </span>
                      <span className="font-black text-slate-900">
                        {totalAssets > 0
                          ? Math.round((d.value / totalAssets) * 100)
                          : 0}
                        %
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-slate-400">
                Chưa có dữ liệu
              </p>
            )}
          </div>

          {/* Transfer stats */}
          <div className="rounded-4xl border border-indigo-100 bg-indigo-50/50 p-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                <ArrowLeftRight size={14} />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900">
                  Chuyển tiền tháng này
                </h2>
                <p className="text-[11px] text-slate-500">
                  Không tính vào thu nhập / chi tiêu
                </p>
              </div>
            </div>
            <p className="text-2xl font-black text-indigo-700">
              {formatVND(currentMonthTransferTotal)}
            </p>
            <p className="mt-1 text-xs font-bold text-indigo-500">
              {currentMonthTransfers.length} giao dịch chuyển ví
            </p>
            {mostTransferActiveWallet && (
              <p className="mt-3 rounded-2xl bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                Ví hoạt động nhiều nhất:{" "}
                <b>{mostTransferActiveWallet.wallet.name}</b> ·{" "}
                {mostTransferActiveWallet.count} lượt.
              </p>
            )}
          </div>

          {/* Largest + most active */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
              <p className="text-[10px] font-black uppercase tracking-wide text-blue-500">
                Ví lớn nhất
              </p>
              <p className="mt-1.5 truncate text-sm font-black text-slate-900">
                {largestWallet?.name ?? "—"}
              </p>
              <p className="mt-0.5 text-xs font-bold text-blue-600">
                {largestWallet ? formatVND(largestWallet.balance) : "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
              <p className="text-[10px] font-black uppercase tracking-wide text-emerald-600">
                Hoạt động nhất
              </p>
              <p className="mt-1.5 truncate text-sm font-black text-slate-900">
                {mostActiveWallet?.name ?? "—"}
              </p>
              <p className="mt-0.5 text-xs font-bold text-emerald-600">
                {mostActiveWallet
                  ? transactions.filter(
                      (t) => t.walletId === mostActiveWallet.id,
                    ).length + " giao dịch"
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3 · Wallet Intelligence
          ══════════════════════════════════════════════════════════════════ */}
      {alerts.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2 px-1">
            <Bot size={14} className="text-blue-600" />
            <p className="text-sm font-black text-slate-700">
              Wallet Intelligence
            </p>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">
              {alerts.length}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {alerts.map((a, i) => {
              const styles = {
                warning: {
                  card: "border-amber-200 bg-amber-50",
                  icon: "bg-amber-100 text-amber-600",
                  title: "text-amber-800",
                  body: "text-amber-700",
                  Icon: AlertTriangle,
                },
                info: {
                  card: "border-blue-200 bg-blue-50",
                  icon: "bg-blue-100 text-blue-600",
                  title: "text-blue-800",
                  body: "text-blue-700",
                  Icon: Lightbulb,
                },
                opportunity: {
                  card: "border-emerald-200 bg-emerald-50",
                  icon: "bg-emerald-100 text-emerald-600",
                  title: "text-emerald-800",
                  body: "text-emerald-700",
                  Icon: Zap,
                },
              };
              const s = styles[a.type];
              return (
                <div key={i} className={"rounded-2xl border p-4 " + s.card}>
                  <div className="mb-2 flex items-center gap-2">
                    <div
                      className={
                        "flex size-7 shrink-0 items-center justify-center rounded-xl " +
                        s.icon
                      }
                    >
                      <s.Icon size={13} />
                    </div>
                    <p className={"text-xs font-black " + s.title}>{a.title}</p>
                  </div>
                  <p className={"text-xs leading-5 " + s.body}>{a.body}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 4 · Wallet Cards
          ══════════════════════════════════════════════════════════════════ */}
      <section>
        <div className="mb-4 flex items-center gap-2 px-1">
          <div className="size-1.5 rounded-full bg-blue-600" />
          <p className="text-sm font-black text-slate-700">
            {wallets.length} ví tiền
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {wallets.map((wallet) => {
            const pct =
              totalAssets > 0
                ? Math.round((wallet.balance / totalAssets) * 100)
                : 0;
            const flow = walletFlow.get(wallet.id) ?? {
              income: 0,
              expense: 0,
              transferIn: 0,
              transferOut: 0,
            };
            const net = flow.income - flow.expense;
            const txCount = transactions.filter(
              (t) =>
                t.walletId === wallet.id || t.transferToWalletId === wallet.id,
            ).length;
            const color = TYPE_COLORS[wallet.type];

            return (
              <div
                key={wallet.id}
                className="group relative rounded-4xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-blue-100 hover:shadow-lg hover:shadow-blue-50"
              >
                {/* Header */}
                <div className="min-w-0 pr-20">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="shrink-0">
                      <WalletIcon type={wallet.type} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-black leading-tight text-slate-900 wrap-anywhere">
                        {wallet.name}
                      </h3>
                      <span
                        className="mt-1 inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-bold"
                        style={{
                          borderColor: color + "33",
                          background: color + "11",
                          color,
                        }}
                      >
                        {getWalletTypeLabel(wallet.type)}
                      </span>
                    </div>
                  </div>

                  <div className="absolute right-6 top-6 z-10 flex shrink-0 gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => openEditForm(wallet)}
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-400 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                      aria-label="Sửa ví"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(wallet.id)}
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-400 shadow-sm hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                      aria-label="Xóa ví"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Balance */}
                <div className="mt-5">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Số dư hiện tại
                  </p>
                  <p className="mt-1 text-3xl font-black text-blue-700">
                    {formatVND(wallet.balance)}
                  </p>
                </div>

                {/* Monthly flow */}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-emerald-50 px-2.5 py-2 text-center">
                    <p className="text-[9px] font-bold text-emerald-600 uppercase">
                      Thu
                    </p>
                    <p className="mt-0.5 text-xs font-black text-emerald-700">
                      {flow.income > 0
                        ? Math.round(flow.income / 1e3) + "K"
                        : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-rose-50 px-2.5 py-2 text-center">
                    <p className="text-[9px] font-bold text-rose-500 uppercase">
                      Chi
                    </p>
                    <p className="mt-0.5 text-xs font-black text-rose-600">
                      {flow.expense > 0
                        ? Math.round(flow.expense / 1e3) + "K"
                        : "—"}
                    </p>
                  </div>
                  <div
                    className={
                      "rounded-xl px-2.5 py-2 text-center " +
                      (net >= 0 ? "bg-blue-50" : "bg-rose-50")
                    }
                  >
                    <p
                      className={
                        "text-[9px] font-bold uppercase " +
                        (net >= 0 ? "text-blue-600" : "text-rose-500")
                      }
                    >
                      Ròng
                    </p>
                    <p
                      className={
                        "mt-0.5 flex items-center justify-center gap-0.5 text-xs font-black " +
                        (net >= 0 ? "text-blue-700" : "text-rose-600")
                      }
                    >
                      {net > 0 ? (
                        <ArrowUpRight size={9} />
                      ) : net < 0 ? (
                        <ArrowDownRight size={9} />
                      ) : null}
                      {net !== 0 ? Math.round(Math.abs(net) / 1e3) + "K" : "—"}
                    </p>
                  </div>
                </div>

                {/* Contribution bar */}
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Tỷ trọng tài sản</span>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-700">{pct}%</span>
                      <span className="text-slate-400">
                        · {txCount} giao dịch
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-2.5 rounded-full transition-all duration-500"
                      style={{ width: pct + "%", background: color }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openTransferForm(wallet.id)}
                  disabled={wallets.length < 2}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-xs font-black text-indigo-600 transition-all hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowLeftRight size={13} />
                  Chuyển tiền từ ví này
                </button>

                {/* Mobile edit buttons (always visible) */}
                <div className="mt-3 flex gap-2 lg:hidden">
                  <button
                    onClick={() => openEditForm(wallet)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-bold text-slate-500"
                  >
                    <Edit3 size={12} />
                    Sửa
                  </button>
                  <button
                    onClick={() => handleDelete(wallet.id)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-100 py-2 text-xs font-bold text-rose-500"
                  >
                    <Trash2 size={12} />
                    Xóa
                  </button>
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {wallets.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-4xl border-2 border-dashed border-blue-200 bg-blue-50/30 p-12 text-center md:col-span-2 xl:col-span-3">
              <div className="flex size-16 items-center justify-center rounded-3xl bg-blue-100">
                <Wallet size={24} className="text-blue-400" />
              </div>
              <h3 className="mt-4 text-base font-black text-slate-700">
                Chưa có ví tiền nào
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                Bắt đầu bằng cách thêm ví đầu tiên của bạn.
              </p>
              <button
                onClick={openCreateForm}
                className="mt-5 flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700"
              >
                <Plus size={15} />
                Thêm ví tiền
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          Transfer Modal
          ══════════════════════════════════════════════════════════════════ */}
      {isTransferOpen && (
        <div className="fixed inset-0 z-100 flex items-end justify-center bg-slate-900/40 px-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[calc(100dvh-0.75rem)] w-full flex-col overflow-hidden rounded-t-4xl bg-white shadow-2xl sm:max-w-xl sm:rounded-4xl">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:p-6 sm:pb-5">
              <div>
                <div className="mb-2 flex size-11 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-600 to-blue-500 text-white shadow-lg shadow-indigo-100">
                  <ArrowLeftRight size={18} />
                </div>
                <h2 className="text-xl font-black text-slate-900">
                  Chuyển tiền giữa các ví
                </h2>
                <p className="mt-0.5 text-sm text-slate-400">
                  Transfer chỉ đổi số dư ví, không tính vào thu nhập hoặc chi
                  tiêu.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTransferOpen(false)}
                className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={handleTransferSubmit}
              className="min-h-0 flex flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-6 sm:pb-6">
                {wallets.length < 2 ? (
                  <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-700">
                    Bạn cần ít nhất 2 ví để dùng tính năng chuyển tiền.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <WalletSelect
                      label="Từ ví"
                      wallets={wallets}
                      value={transferForm.fromWalletId}
                      onChange={(value) => {
                        setTransferForm((prev) => ({
                          ...prev,
                          fromWalletId: value,
                          toWalletId:
                            prev.toWalletId && prev.toWalletId !== value
                              ? prev.toWalletId
                              : (wallets.find((wallet) => wallet.id !== value)
                                  ?.id ?? ""),
                        }));
                      }}
                    />

                    <WalletSelect
                      label="Đến ví"
                      wallets={wallets.filter(
                        (wallet) => wallet.id !== transferForm.fromWalletId,
                      )}
                      value={transferForm.toWalletId}
                      onChange={(value) =>
                        setTransferForm((prev) => ({
                          ...prev,
                          toWalletId: value,
                        }))
                      }
                    />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="mb-1.5 text-sm font-black text-slate-700">
                          Số tiền chuyển
                        </p>
                        <CurrencyInput
                          value={transferForm.amount}
                          onChange={(raw: string) =>
                            setTransferForm((prev) => ({
                              ...prev,
                              amount: raw,
                            }))
                          }
                          placeholder="0"
                        />
                      </div>
                      <FormInput
                        label="Ngày chuyển"
                        type="date"
                        value={transferForm.date}
                        onChange={(value) =>
                          setTransferForm((prev) => ({ ...prev, date: value }))
                        }
                      />
                    </div>

                    <FormInput
                      label="Ghi chú"
                      value={transferForm.note}
                      onChange={(value) =>
                        setTransferForm((prev) => ({ ...prev, note: value }))
                      }
                      placeholder="VD: Rút tiền mặt, chuyển sang ví chi tiêu..."
                    />
                  </div>
                )}

                <SaveError
                  message={saveError}
                  onDismiss={() => setSaveError(null)}
                />
              </div>

              <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsTransferOpen(false)}
                    className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={wallets.length < 2}
                    className="flex-1 rounded-2xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Chuyển tiền
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          CRUD Modal
          ══════════════════════════════════════════════════════════════════ */}
      {isFormOpen && (
        <div className="fixed inset-0 z-100 flex items-end justify-center bg-slate-900/40 px-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[calc(100dvh-0.75rem)] w-full flex-col overflow-hidden rounded-t-4xl bg-white shadow-2xl sm:max-w-lg sm:rounded-4xl">
            {/* Modal header */}
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:p-6 sm:pb-5">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {form.id ? "Sửa ví tiền" : "Thêm ví tiền"}
                </h2>
                <p className="mt-0.5 text-sm text-slate-400">
                  Nhập thông tin ví hoặc tài khoản tài chính.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="min-h-0 flex flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-6 sm:pb-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormInput
                    label="Tên ví"
                    value={form.name}
                    onChange={(v) => setForm((p) => ({ ...p, name: v }))}
                    placeholder="VD: Vietcombank, Tiền mặt..."
                  />
                  {/* Balance with ₫ prefix */}
                  <div>
                    <p className="mb-1.5 text-sm font-black text-slate-700">
                      Số dư hiện tại
                    </p>
                    <CurrencyInput
                      value={form.balance}
                      onChange={(raw: string) =>
                        setForm((p) => ({ ...p, balance: raw }))
                      }
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Wallet type */}
                <div className="mt-4">
                  <p className="mb-2.5 text-sm font-black text-slate-700">
                    Loại ví
                  </p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {walletTypeOptions.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() =>
                          setForm((p) => ({ ...p, type: o.value }))
                        }
                        className={
                          "flex items-center gap-3 rounded-2xl border p-4 text-left transition-all " +
                          (form.type === o.value
                            ? "border-blue-300 bg-blue-50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50")
                        }
                      >
                        <WalletIcon type={o.value} />
                        <div>
                          <p
                            className={
                              "text-sm font-black " +
                              (form.type === o.value
                                ? "text-blue-700"
                                : "text-slate-900")
                            }
                          >
                            {o.label}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {o.description}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <SaveError
                  message={saveError}
                  onDismiss={() => setSaveError(null)}
                />
              </div>

              {/* Actions */}
              <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="flex-1 rounded-2xl bg-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700 active:scale-[.98]"
                  >
                    {form.id ? "Lưu thay đổi" : "Thêm ví tiền"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        action={pendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  gradient,
  iconBg,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  gradient: string;
  iconBg: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={"rounded-2xl bg-linear-to-br p-4 shadow-sm " + gradient}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-wide text-white/80">
          {label}
        </p>
        <div
          className={
            "flex size-6 shrink-0 items-center justify-center rounded-lg text-white " +
            iconBg
          }
        >
          {icon}
        </div>
      </div>
      <p className="mt-2 truncate text-lg font-black text-white">{value}</p>
      <p className="mt-0.5 text-[10px] text-white/70 truncate">{sub}</p>
    </div>
  );
}

function WalletIcon({ type }: { type: FinanceWalletType }) {
  const base =
    "flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm";
  if (type === "bank")
    return (
      <div className={base + " bg-linear-to-br from-blue-600 to-cyan-500"}>
        <Landmark size={20} />
      </div>
    );
  if (type === "ewallet")
    return (
      <div className={base + " bg-linear-to-br from-violet-500 to-indigo-500"}>
        <Wallet size={20} />
      </div>
    );
  if (type === "investment")
    return (
      <div className={base + " bg-linear-to-br from-emerald-500 to-teal-400"}>
        <BriefcaseBusiness size={20} />
      </div>
    );
  return (
    <div className={base + " bg-linear-to-br from-amber-400 to-orange-500"}>
      <Banknote size={20} />
    </div>
  );
}

function WalletBrandLogo({
  wallet,
  size = "sm",
}: {
  wallet?: Pick<WalletType, "name" | "type"> | null;
  size?: "sm" | "md";
}) {
  const name = (wallet?.name ?? "").toLowerCase();
  const type = wallet?.type ?? "cash";
  const dimension =
    size === "md" ? "size-10 rounded-2xl text-sm" : "size-8 rounded-xl text-xs";

  if (type === "bank") {
    if (name.includes("vietcombank") || name.includes("vcb")) {
      return (
        <span
          className={`flex ${dimension} shrink-0 items-center justify-center bg-emerald-50 text-emerald-700 shadow-sm`}
        >
          <span className="font-black">VCB</span>
        </span>
      );
    }

    if (name.includes("mb") || name.includes("mbbank")) {
      return (
        <span
          className={`flex ${dimension} shrink-0 items-center justify-center bg-blue-50 text-blue-700 shadow-sm`}
        >
          <span className="font-black">MB</span>
        </span>
      );
    }

    if (name.includes("techcombank") || name.includes("tcb")) {
      return (
        <span
          className={`flex ${dimension} shrink-0 items-center justify-center bg-red-50 text-red-600 shadow-sm`}
        >
          <span className="font-black">TCB</span>
        </span>
      );
    }

    if (name.includes("vpbank") || name.includes("vpb")) {
      return (
        <span
          className={`flex ${dimension} shrink-0 items-center justify-center bg-emerald-50 text-emerald-600 shadow-sm`}
        >
          <span className="font-black">VP</span>
        </span>
      );
    }

    return (
      <span
        className={`flex ${dimension} shrink-0 items-center justify-center bg-blue-50 text-blue-600 shadow-sm`}
      >
        <Landmark size={size === "md" ? 18 : 15} />
      </span>
    );
  }

  if (type === "ewallet") {
    if (name.includes("momo")) {
      return (
        <span
          className={`flex ${dimension} shrink-0 items-center justify-center bg-pink-50 text-pink-600 shadow-sm`}
        >
          <span className="font-black">mo</span>
        </span>
      );
    }

    if (name.includes("zalopay") || name.includes("zalo")) {
      return (
        <span
          className={`flex ${dimension} shrink-0 items-center justify-center bg-blue-50 text-blue-600 shadow-sm`}
        >
          <span className="font-black">ZP</span>
        </span>
      );
    }

    if (name.includes("vn pay") || name.includes("vnpay")) {
      return (
        <span
          className={`flex ${dimension} shrink-0 items-center justify-center bg-indigo-50 text-indigo-600 shadow-sm`}
        >
          <span className="font-black">VN</span>
        </span>
      );
    }

    return (
      <span
        className={`flex ${dimension} shrink-0 items-center justify-center bg-violet-50 text-violet-600 shadow-sm`}
      >
        <Wallet size={size === "md" ? 18 : 15} />
      </span>
    );
  }

  return <WalletIcon type={type} />;
}

function getWalletTypeLabel(type: FinanceWalletType) {
  if (type === "bank") return "Ngân hàng";
  if (type === "ewallet") return "Ví điện tử";
  if (type === "investment") return "Đầu tư";
  return "Tiền mặt";
}

function WalletSelect({
  label,
  wallets,
  value,
  onChange,
}: {
  label: string;
  wallets: WalletType[];
  value: string;
  onChange: (value: string) => void;
}) {
  const selectedWallet = wallets.find((wallet) => wallet.id === value);

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-black text-slate-700">
        {label}
      </span>
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-3">
        <div className="relative">
          {selectedWallet && (
            <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2">
              <WalletBrandLogo wallet={selectedWallet} />
            </div>
          )}
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={
              "w-full rounded-2xl border border-slate-200 bg-white py-3 pr-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 " +
              (selectedWallet ? "pl-14" : "pl-4")
            }
          >
            <option value="">Chọn ví</option>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name} · {formatVND(wallet.balance)}
              </option>
            ))}
          </select>
        </div>
        {selectedWallet && (
          <div className="mt-3 flex items-center justify-between rounded-2xl bg-white px-3 py-2 text-xs">
            <span className="flex items-center gap-2 font-bold text-slate-500">
              <WalletBrandLogo wallet={selectedWallet} />
              {getWalletTypeLabel(selectedWallet.type)}
            </span>
            <span className="font-black text-slate-900">
              {formatVND(selectedWallet.balance)}
            </span>
          </div>
        )}
      </div>
    </label>
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-black text-slate-700">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
      />
    </label>
  );
}
