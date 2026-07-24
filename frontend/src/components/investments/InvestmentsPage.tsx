"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Edit3,
  Landmark,
  Plus,
  RefreshCw,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import ConfirmDialog, {
  type PendingConfirm,
} from "@/src/components/ui/ConfirmDialog";
import { SaveError } from "@/src/components/ui/SaveError";
import { useToast } from "@/src/components/ui/ToastProvider";
import { supabase } from "@/src/lib/supabase";
import { getWallets } from "@/src/services/finance/financeStorage";
import type { Wallet as FinanceWallet } from "@/src/types/finance";

type ForexAccountStatus = "active" | "inactive" | "archived";
type ForexCashTransactionType = "deposit" | "withdrawal";

type ForexAccount = {
  id: string;
  name: string;
  broker: string;
  accountNumber: string | null;
  currency: string;
  status: ForexAccountStatus;
  openedAt: string | null;
  notes: string | null;
  currentEquity: number | null;
  createdAt: string;
  updatedAt: string;
};

type ForexCashTransaction = {
  id: string;
  forexAccountId: string;
  walletId: string;
  type: ForexCashTransactionType;
  amount: number;
  currency: string;
  fee: number;
  transactionDate: string;
  transactionTime: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type ForexAccountRow = {
  id: string;
  name: string;
  broker: string;
  account_number: string | null;
  currency: string | null;
  status: ForexAccountStatus | null;
  opened_at: string | null;
  notes: string | null;
  current_equity?: number | string | null;
  created_at: string;
  updated_at: string;
};

type ForexCashTransactionRow = {
  id: string;
  forex_account_id: string;
  wallet_id: string;
  type: ForexCashTransactionType;
  amount: number | string;
  currency: string | null;
  fee: number | string | null;
  transaction_date: string;
  transaction_time: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type AccountFormState = {
  id: string;
  name: string;
  broker: string;
  accountNumber: string;
  status: ForexAccountStatus;
  openedAt: string;
  notes: string;
  currentEquity: string;
};

type TransactionFormState = {
  id: string;
  forexAccountId: string;
  walletId: string;
  type: ForexCashTransactionType;
  amount: string;
  fee: string;
  transactionDate: string;
  transactionTime: string;
  notes: string;
};

type AccountCashMetric = ForexAccount & {
  deposits: number;
  withdrawals: number;
  fees: number;
  netCashFlow: number;
  tradingProfitLoss: number | null;
  roi: number | null;
  transactionCount: number;
};

type ForexPageData = {
  accounts: ForexAccount[];
  transactions: ForexCashTransaction[];
  wallets: FinanceWallet[];
  loadError: string | null;
};

const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowTime(): string {
  return new Date().toTimeString().slice(0, 5);
}

function createEmptyAccountForm(): AccountFormState {
  return {
    id: "",
    name: "",
    broker: "",
    accountNumber: "",
    status: "active",
    openedAt: today(),
    notes: "",
    currentEquity: "",
  };
}

function createEmptyTransactionForm(
  forexAccountId = "",
  walletId = "",
): TransactionFormState {
  return {
    id: "",
    forexAccountId,
    walletId,
    type: "deposit",
    amount: "",
    fee: "0",
    transactionDate: today(),
    transactionTime: nowTime(),
    notes: "",
  };
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapAccountRow(row: ForexAccountRow): ForexAccount {
  return {
    id: row.id,
    name: row.name,
    broker: row.broker,
    accountNumber: row.account_number,
    currency: row.currency ?? "VND",
    status: row.status ?? "active",
    openedAt: row.opened_at,
    notes: row.notes,
    currentEquity: nullableNumber(row.current_equity),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTransactionRow(row: ForexCashTransactionRow): ForexCashTransaction {
  return {
    id: row.id,
    forexAccountId: row.forex_account_id,
    walletId: row.wallet_id,
    type: row.type,
    amount: toNumber(row.amount),
    currency: row.currency ?? "VND",
    fee: toNumber(row.fee),
    transactionDate: row.transaction_date,
    transactionTime: String(row.transaction_time ?? "00:00").slice(0, 5),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatMoney(value: number, currency = "VND"): string {
  try {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "VND" ? 0 : 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString("vi-VN")} ${currency}`;
  }
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatTransactionDateTime(transaction: ForexCashTransaction): string {
  const [year, month, day] = transaction.transactionDate.split("-");
  const date =
    year && month && day
      ? `${day}/${month}/${year}`
      : transaction.transactionDate;
  return `${date} · ${transaction.transactionTime}`;
}

function normalizeTimeInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function validateAccountForm(form: AccountFormState): string | null {
  if (!form.name.trim()) return "Vui lòng nhập tên tài khoản.";
  if (!form.broker.trim()) return "Vui lòng nhập broker hoặc nền tảng.";
  if (form.currentEquity.trim()) {
    const equity = Number(form.currentEquity);
    if (!Number.isFinite(equity) || equity < 0) {
      return "Equity hiện tại phải là số không âm.";
    }
  }
  return null;
}

function validateTransactionForm(form: TransactionFormState): string | null {
  if (!form.forexAccountId) return "Vui lòng chọn tài khoản Forex.";
  if (!form.walletId) return "Vui lòng chọn ví nguồn hoặc ví nhận.";
  const amount = Number(form.amount);
  const fee = Number(form.fee || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Số tiền phải lớn hơn 0.";
  }
  if (!Number.isFinite(fee) || fee < 0) {
    return "Phí không hợp lệ.";
  }
  if (!form.transactionDate) return "Vui lòng chọn ngày giao dịch.";
  if (!/^\d{2}:\d{2}$/.test(form.transactionTime)) {
    return "Giờ giao dịch phải theo định dạng HH:mm.";
  }
  if (form.type === "withdrawal" && fee > amount) {
    return "Phí rút không được lớn hơn số tiền rút.";
  }
  return null;
}

export default function InvestmentsPage() {
  const [accounts, setAccounts] = useState<ForexAccount[]>([]);
  const [transactions, setTransactions] = useState<ForexCashTransaction[]>([]);
  const [wallets, setWallets] = useState<FinanceWallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [accountForm, setAccountForm] = useState<AccountFormState>(
    createEmptyAccountForm,
  );
  const [transactionForm, setTransactionForm] = useState<TransactionFormState>(
    () => createEmptyTransactionForm(),
  );
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingConfirm | null>(
    null,
  );
  const { toast } = useToast();

  const fetchForexPageData = useCallback(async (): Promise<ForexPageData> => {
    const loadedWallets = await getWallets();

    if (!isSupabaseConfigured) {
      return {
        accounts: [],
        transactions: [],
        wallets: loadedWallets,
        loadError: "Supabase chưa được cấu hình.",
      };
    }

    const [accountResult, transactionResult] = await Promise.all([
      supabase
        .from("forex_accounts")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("forex_cash_transactions")
        .select("*")
        .order("transaction_date", { ascending: false })
        .order("transaction_time", { ascending: false }),
    ]);

    if (accountResult.error) throw accountResult.error;
    if (transactionResult.error) throw transactionResult.error;

    return {
      accounts: ((accountResult.data ?? []) as ForexAccountRow[]).map(
        mapAccountRow,
      ),
      transactions: (
        (transactionResult.data ?? []) as ForexCashTransactionRow[]
      ).map(mapTransactionRow),
      wallets: loadedWallets,
      loadError: null,
    };
  }, []);

  const applyForexPageData = useCallback((data: ForexPageData) => {
    setAccounts(data.accounts);
    setTransactions(data.transactions);
    setWallets(data.wallets);
    setLoadError(data.loadError);
  }, []);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await fetchForexPageData();
      applyForexPageData(data);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Không thể tải dữ liệu Forex.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [applyForexPageData, fetchForexPageData]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      try {
        const data = await fetchForexPageData();
        if (cancelled) return;

        applyForexPageData(data);
      } catch (error) {
        if (cancelled) return;

        setLoadError(
          error instanceof Error
            ? error.message
            : "Không thể tải dữ liệu Forex.",
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [applyForexPageData, fetchForexPageData]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel("investments-forex-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "forex_accounts" },
        () => void reload(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "forex_cash_transactions",
        },
        () => void reload(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [reload]);

  const accountMetrics = useMemo<AccountCashMetric[]>(() => {
    return accounts.map((account) => {
      const related = transactions.filter(
        (transaction) => transaction.forexAccountId === account.id,
      );
      const deposits = related
        .filter((transaction) => transaction.type === "deposit")
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      const withdrawals = related
        .filter((transaction) => transaction.type === "withdrawal")
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      const fees = related.reduce(
        (sum, transaction) => sum + transaction.fee,
        0,
      );
      const netCashFlow = deposits - withdrawals;
      const tradingProfitLoss =
        account.currentEquity === null
          ? null
          : account.currentEquity - netCashFlow;
      const roi =
        tradingProfitLoss === null || netCashFlow <= 0
          ? null
          : (tradingProfitLoss / netCashFlow) * 100;

      return {
        ...account,
        deposits,
        withdrawals,
        fees,
        netCashFlow,
        tradingProfitLoss,
        roi,
        transactionCount: related.length,
      };
    });
  }, [accounts, transactions]);

  const summary = useMemo(() => {
    const totalDeposited = accountMetrics.reduce(
      (sum, account) => sum + account.deposits,
      0,
    );
    const totalWithdrawn = accountMetrics.reduce(
      (sum, account) => sum + account.withdrawals,
      0,
    );
    const totalFees = accountMetrics.reduce(
      (sum, account) => sum + account.fees,
      0,
    );
    const knownEquityAccounts = accountMetrics.filter(
      (account) => account.currentEquity !== null,
    );
    const totalEquity = knownEquityAccounts.reduce(
      (sum, account) => sum + (account.currentEquity ?? 0),
      0,
    );
    const totalProfitLoss = knownEquityAccounts.reduce(
      (sum, account) => sum + (account.tradingProfitLoss ?? 0),
      0,
    );
    const capitalBase = knownEquityAccounts.reduce(
      (sum, account) => sum + Math.max(account.netCashFlow, 0),
      0,
    );
    const roi =
      knownEquityAccounts.length > 0 && capitalBase > 0
        ? (totalProfitLoss / capitalBase) * 100
        : null;

    return {
      accountCount: accounts.length,
      activeCount: accounts.filter((account) => account.status === "active")
        .length,
      totalDeposited,
      totalWithdrawn,
      totalFees,
      netCashFlow: totalDeposited - totalWithdrawn,
      totalEquity,
      totalProfitLoss,
      roi,
      hasEquity: knownEquityAccounts.length > 0,
    };
  }, [accounts, accountMetrics]);

  function openCreateAccount() {
    setAccountForm(createEmptyAccountForm());
    setSaveError(null);
    setAccountModalOpen(true);
  }

  function openEditAccount(account: ForexAccount) {
    setAccountForm({
      id: account.id,
      name: account.name,
      broker: account.broker,
      accountNumber: account.accountNumber ?? "",
      status: account.status,
      openedAt: account.openedAt ?? "",
      notes: account.notes ?? "",
      currentEquity:
        account.currentEquity === null ? "" : String(account.currentEquity),
    });
    setSaveError(null);
    setAccountModalOpen(true);
  }

  function openCreateTransaction(
    accountId = accounts[0]?.id ?? "",
    type: ForexCashTransactionType = "deposit",
  ) {
    setTransactionForm({
      ...createEmptyTransactionForm(accountId, wallets[0]?.id ?? ""),
      type,
    });
    setSaveError(null);
    setTransactionModalOpen(true);
  }

  function openEditTransaction(transaction: ForexCashTransaction) {
    setTransactionForm({
      id: transaction.id,
      forexAccountId: transaction.forexAccountId,
      walletId: transaction.walletId,
      type: transaction.type,
      amount: String(transaction.amount),
      fee: String(transaction.fee),
      transactionDate: transaction.transactionDate,
      transactionTime: transaction.transactionTime,
      notes: transaction.notes ?? "",
    });
    setSaveError(null);
    setTransactionModalOpen(true);
  }

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    const validationError = validateAccountForm(accountForm);
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const payload = {
        id: accountForm.id || createId("fxa"),
        name: accountForm.name.trim(),
        broker: accountForm.broker.trim(),
        account_number: accountForm.accountNumber.trim() || null,
        currency: "VND",
        status: accountForm.status,
        opened_at: accountForm.openedAt || null,
        notes: accountForm.notes.trim() || null,
        current_equity:
          accountForm.currentEquity.trim() === ""
            ? null
            : Number(accountForm.currentEquity),
        updated_at: new Date().toISOString(),
      };

      const result = accountForm.id
        ? await supabase
            .from("forex_accounts")
            .update(payload)
            .eq("id", accountForm.id)
        : await supabase.from("forex_accounts").insert({
            ...payload,
            created_at: new Date().toISOString(),
          });

      if (result.error) throw result.error;

      await reload();
      setAccountModalOpen(false);
      toast({
        variant: "success",
        message: accountForm.id
          ? "Đã cập nhật tài khoản Forex."
          : "Đã thêm tài khoản Forex.",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Không thể lưu tài khoản Forex.";

      if (
        message.toLowerCase().includes("current_equity") ||
        message.toLowerCase().includes("column")
      ) {
        setSaveError(
          "Cột current_equity chưa tồn tại trong bảng forex_accounts. Hãy chạy migration SQL được cung cấp bên dưới.",
        );
      } else {
        setSaveError(message);
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    const validationError = validateTransactionForm(transactionForm);
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    const amount = Number(transactionForm.amount);
    const fee = Number(transactionForm.fee || 0);
    const id = transactionForm.id || createId("fxt");

    setIsSaving(true);
    setSaveError(null);

    try {
      const rpcName = transactionForm.id
        ? "update_forex_cash_transaction"
        : "create_forex_cash_transaction";

      const result = await supabase.rpc(rpcName, {
        p_id: id,
        p_forex_account_id: transactionForm.forexAccountId,
        p_wallet_id: transactionForm.walletId,
        p_type: transactionForm.type,
        p_amount: amount,
        p_currency: "VND",
        p_fee: fee,
        p_transaction_date: transactionForm.transactionDate,
        p_transaction_time: transactionForm.transactionTime,
        p_notes: transactionForm.notes.trim() || null,
      });

      if (result.error) throw result.error;

      await reload();
      setTransactionModalOpen(false);
      toast({
        variant: "success",
        message: transactionForm.id
          ? "Đã cập nhật giao dịch Forex."
          : transactionForm.type === "deposit"
            ? "Đã ghi nhận nạp tiền vào Forex."
            : "Đã ghi nhận rút tiền từ Forex.",
      });
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Không thể lưu giao dịch Forex.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function requestDeleteAccount(account: ForexAccount) {
    setPendingAction({
      title: "Xóa tài khoản Forex?",
      description: `Tài khoản ${account.name} và lịch sử liên quan sẽ bị xóa.`,
      variant: "danger",
      onConfirm: async () => {
        const transactionIds = transactions
          .filter((transaction) => transaction.forexAccountId === account.id)
          .map((transaction) => transaction.id);

        for (const transactionId of transactionIds) {
          const deleteTransactionResult = await supabase.rpc(
            "delete_forex_cash_transaction",
            { p_id: transactionId },
          );
          if (deleteTransactionResult.error) {
            toast({
              variant: "error",
              message: deleteTransactionResult.error.message,
            });
            return;
          }
        }

        const result = await supabase
          .from("forex_accounts")
          .delete()
          .eq("id", account.id);

        if (result.error) {
          toast({ variant: "error", message: result.error.message });
          return;
        }

        await reload();
        toast({ variant: "success", message: "Đã xóa tài khoản Forex." });
      },
    });
  }

  function requestDeleteTransaction(transaction: ForexCashTransaction) {
    setPendingAction({
      title: "Xóa giao dịch nạp/rút?",
      description:
        "Giao dịch sẽ bị xóa và số dư ví liên kết được hoàn tác theo RPC.",
      variant: "danger",
      onConfirm: async () => {
        const result = await supabase.rpc("delete_forex_cash_transaction", {
          p_id: transaction.id,
        });

        if (result.error) {
          toast({ variant: "error", message: result.error.message });
          return;
        }

        await reload();
        toast({ variant: "success", message: "Đã xóa giao dịch Forex." });
      },
    });
  }

  return (
    <section className="space-y-5">
      <div className="rounded-4xl border border-sky-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-100">
              <Landmark size={21} />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-600">
                Forex Management
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                Đầu tư Forex
              </h1>
              <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-slate-500">
                Quản lý tài khoản, nạp/rút vốn, giá trị tài khoản hiện tại và
                lời/lỗ trading trên một trang duy nhất.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void reload()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 transition hover:bg-slate-50"
            >
              <RefreshCw size={16} />
              Làm mới
            </button>
            <button
              type="button"
              onClick={() => openCreateTransaction()}
              disabled={accounts.length === 0}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 text-sm font-black text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowUpRight size={16} />
              Ghi nạp/rút
            </button>
            <button
              type="button"
              onClick={openCreateAccount}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 text-sm font-black text-white shadow-lg shadow-sky-100 transition hover:bg-sky-700"
            >
              <Plus size={16} />
              Thêm tài khoản
            </button>
          </div>
        </div>

        {loadError ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {loadError}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <SummaryCard
            label="Tài khoản"
            value={`${summary.activeCount}/${summary.accountCount}`}
            note="đang hoạt động"
            tone="sky"
            icon={<Landmark size={17} />}
          />
          <SummaryCard
            label="Tổng đã nạp"
            value={formatMoney(summary.totalDeposited)}
            note="Dòng tiền vào Forex"
            tone="emerald"
            icon={<ArrowUpRight size={17} />}
          />
          <SummaryCard
            label="Tổng đã rút"
            value={formatMoney(summary.totalWithdrawn)}
            note="Dòng tiền về ví"
            tone="blue"
            icon={<ArrowDownLeft size={17} />}
          />
          <SummaryCard
            label="Dòng tiền ròng"
            value={formatMoney(summary.netCashFlow)}
            note="Tổng nạp trừ tổng rút"
            tone={summary.netCashFlow >= 0 ? "violet" : "rose"}
            icon={<WalletCards size={17} />}
          />
          <SummaryCard
            label="Giá trị tài khoản hiện tại"
            value={
              summary.hasEquity
                ? formatMoney(summary.totalEquity)
                : "Chưa cập nhật"
            }
            note="Tổng giá trị hiện tại các tài khoản"
            tone="amber"
            icon={<Activity size={17} />}
          />
          <SummaryCard
            label="Lời / lỗ"
            value={
              summary.hasEquity
                ? formatMoney(summary.totalProfitLoss)
                : "Chưa có dữ liệu"
            }
            note={
              summary.hasEquity
                ? `ROI ${formatPercent(summary.roi)}`
                : "Nhập giá trị tài khoản để tính"
            }
            tone={
              !summary.hasEquity
                ? "amber"
                : summary.totalProfitLoss >= 0
                  ? "emerald"
                  : "rose"
            }
            icon={<Activity size={17} />}
          />
        </div>
      </div>

      <div className="rounded-4xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
              Accounts
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              Tài khoản Forex
            </h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
            {accounts.length} tài khoản
          </span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {isLoading && accounts.length === 0 ? (
            <div className="col-span-full rounded-3xl bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">
              Đang tải dữ liệu Forex...
            </div>
          ) : null}

          {!isLoading && accounts.length === 0 ? (
            <button
              type="button"
              onClick={openCreateAccount}
              className="col-span-full flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-sky-200 bg-sky-50/40 p-8 text-center"
            >
              <Landmark size={24} className="text-sky-600" />
              <p className="mt-4 text-lg font-black text-sky-800">
                Chưa có tài khoản Forex
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Tạo tài khoản đầu tiên để bắt đầu quản lý vốn và lời/lỗ.
              </p>
            </button>
          ) : null}

          {accountMetrics.map((account) => (
            <article
              key={account.id}
              className="rounded-3xl border border-slate-200 bg-white p-5 transition hover:border-sky-200 hover:shadow-lg hover:shadow-sky-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-black text-slate-950">
                      {account.name}
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                        account.status === "active"
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {account.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {account.broker}
                    {account.accountNumber ? ` · ${account.accountNumber}` : ""}
                  </p>
                </div>

                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEditAccount(account)}
                    className="flex size-9 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:bg-sky-50 hover:text-sky-600"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => requestDeleteAccount(account)}
                    className="flex size-9 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric
                  label="Vốn ròng"
                  value={formatMoney(account.netCashFlow)}
                  tone="violet"
                />
                <Metric
                  label="Giá trị tài khoản"
                  value={
                    account.currentEquity === null
                      ? "Chưa nhập"
                      : formatMoney(account.currentEquity)
                  }
                  tone="blue"
                />
                <Metric
                  label="Lời / lỗ"
                  value={
                    account.tradingProfitLoss === null
                      ? "—"
                      : formatMoney(account.tradingProfitLoss)
                  }
                  tone={
                    account.tradingProfitLoss === null ||
                    account.tradingProfitLoss >= 0
                      ? "emerald"
                      : "rose"
                  }
                />
                <Metric
                  label="ROI"
                  value={formatPercent(account.roi)}
                  tone={
                    account.roi === null || account.roi >= 0
                      ? "emerald"
                      : "rose"
                  }
                />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-3">
                <TinyMetric
                  label="Đã nạp"
                  value={formatMoney(account.deposits)}
                />
                <TinyMetric
                  label="Đã rút"
                  value={formatMoney(account.withdrawals)}
                />
                <TinyMetric label="Phí" value={formatMoney(account.fees)} />
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-slate-400">
                  {account.transactionCount} giao dịch
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => openEditAccount(account)}
                    className="min-h-10 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-black text-amber-700 transition hover:bg-amber-100"
                  >
                    {account.currentEquity === null
                      ? "Nhập giá trị hiện tại"
                      : "Cập nhật giá trị"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openCreateTransaction(account.id, "deposit")}
                    className="min-h-10 rounded-xl bg-emerald-100 px-3 text-xs font-black text-emerald-700"
                  >
                    Nạp
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      openCreateTransaction(account.id, "withdrawal")
                    }
                    className="min-h-10 rounded-xl bg-blue-100 px-3 text-xs font-black text-blue-700"
                  >
                    Rút
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="rounded-4xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
              Cash Flow History
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              Lịch sử nạp/rút
            </h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
            {transactions.length} giao dịch
          </span>
        </div>

        {transactions.length === 0 ? (
          <div className="mt-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-sm font-semibold text-slate-500">
            Chưa có giao dịch nạp/rút.
          </div>
        ) : (
          <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-3xl border border-slate-200">
            {transactions.slice(0, 30).map((transaction) => {
              const account = accounts.find(
                (item) => item.id === transaction.forexAccountId,
              );
              const wallet = wallets.find(
                (item) => item.id === transaction.walletId,
              );
              const isDeposit = transaction.type === "deposit";

              return (
                <div
                  key={transaction.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900">
                      {isDeposit ? "Nạp vào Forex" : "Rút từ Forex"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {account?.name ?? "Tài khoản đã xóa"} ·{" "}
                      {wallet?.name ?? "Ví đã xóa"} ·{" "}
                      {formatTransactionDateTime(transaction)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="text-left sm:text-right">
                      <p
                        className={`font-black ${
                          isDeposit ? "text-emerald-600" : "text-blue-700"
                        }`}
                      >
                        {isDeposit ? "+" : "-"}
                        {formatMoney(transaction.amount)}
                      </p>
                      {transaction.fee > 0 ? (
                        <p className="text-xs text-slate-400">
                          Phí {formatMoney(transaction.fee)}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => openEditTransaction(transaction)}
                      className="flex size-9 items-center justify-center rounded-xl border border-slate-200 text-slate-400"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDeleteTransaction(transaction)}
                      className="flex size-9 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {accountModalOpen ? (
        <Modal
          title={
            accountForm.id ? "Cập nhật tài khoản Forex" : "Thêm tài khoản Forex"
          }
          description="Nhập giá trị Equity đang hiển thị trên MT4/MT5 hoặc ứng dụng broker để tính lời/lỗ và ROI."
          onClose={() => !isSaving && setAccountModalOpen(false)}
        >
          <form onSubmit={submitAccount} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label="Tên tài khoản *"
                value={accountForm.name}
                onChange={(value) =>
                  setAccountForm((current) => ({
                    ...current,
                    name: value,
                  }))
                }
                placeholder="Forex Main"
              />
              <Field
                label="Broker / nền tảng *"
                value={accountForm.broker}
                onChange={(value) =>
                  setAccountForm((current) => ({
                    ...current,
                    broker: value,
                  }))
                }
                placeholder="Exness"
              />
              <Field
                label="Account number"
                value={accountForm.accountNumber}
                onChange={(value) =>
                  setAccountForm((current) => ({
                    ...current,
                    accountNumber: value,
                  }))
                }
              />
              <CurrencyField
                label="Giá trị tài khoản hiện tại (Equity) *"
                value={accountForm.currentEquity}
                onChange={(value) =>
                  setAccountForm((current) => ({
                    ...current,
                    currentEquity: value,
                  }))
                }
              />
              <div className="md:col-span-2 -mt-1 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs font-semibold leading-5 text-sky-700">
                Nhập số Equity đang hiển thị trên MT4/MT5 hoặc ứng dụng broker.
                Giá trị được định dạng tự động theo VND.
                <span className="font-black">
                  {" "}
                  Lời/lỗ = Giá trị tài khoản hiện tại - Vốn ròng
                </span>
                .
              </div>
              <div className="md:col-span-2 -mt-1 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-700">
                Equity là giá trị thực của tài khoản hiện tại, gồm Balance cộng
                hoặc trừ lời/lỗ đang chạy. Hệ thống dùng:
                <span className="font-black"> Lời/lỗ = Equity - Vốn ròng</span>.
              </div>
              <label>
                <span className="mb-1.5 block text-[13px] font-black text-slate-700">
                  Trạng thái
                </span>
                <select
                  value={accountForm.status}
                  onChange={(event) =>
                    setAccountForm((current) => ({
                      ...current,
                      status: event.target.value as ForexAccountStatus,
                    }))
                  }
                  className="min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold sm:text-sm"
                >
                  <option value="active">Đang hoạt động</option>
                  <option value="inactive">Tạm ngưng</option>
                  <option value="archived">Lưu trữ</option>
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-[13px] font-black text-slate-700">
                  Ngày mở
                </span>
                <input
                  type="date"
                  value={accountForm.openedAt}
                  onChange={(event) =>
                    setAccountForm((current) => ({
                      ...current,
                      openedAt: event.target.value,
                    }))
                  }
                  className="min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold sm:text-sm"
                />
              </label>
              <label className="md:col-span-2">
                <span className="mb-1.5 block text-[13px] font-black text-slate-700">
                  Ghi chú
                </span>
                <textarea
                  value={accountForm.notes}
                  onChange={(event) =>
                    setAccountForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-semibold sm:text-sm"
                />
              </label>
            </div>
            <FormActions
              isSaving={isSaving}
              saveError={saveError}
              onDismissError={() => setSaveError(null)}
              onCancel={() => setAccountModalOpen(false)}
            />
          </form>
        </Modal>
      ) : null}

      {transactionModalOpen ? (
        <Modal
          title={
            transactionForm.id
              ? "Cập nhật giao dịch Forex"
              : "Ghi nhận nạp/rút Forex"
          }
          description="Giao dịch sẽ đồng bộ trực tiếp với số dư ví liên kết."
          onClose={() => !isSaving && setTransactionModalOpen(false)}
        >
          <form onSubmit={submitTransaction} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="mb-1.5 block text-[13px] font-black text-slate-700">
                  Loại giao dịch
                </span>
                <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
                  {(["deposit", "withdrawal"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        setTransactionForm((current) => ({
                          ...current,
                          type,
                        }))
                      }
                      className={`min-h-12 rounded-xl text-sm font-black ${
                        transactionForm.type === type
                          ? type === "deposit"
                            ? "bg-emerald-500 text-white"
                            : "bg-blue-600 text-white"
                          : "text-slate-500"
                      }`}
                    >
                      {type === "deposit" ? "Nạp vào Forex" : "Rút từ Forex"}
                    </button>
                  ))}
                </div>
              </label>

              <SelectField
                label="Tài khoản Forex *"
                value={transactionForm.forexAccountId}
                onChange={(value) =>
                  setTransactionForm((current) => ({
                    ...current,
                    forexAccountId: value,
                  }))
                }
                options={accounts.map((account) => ({
                  value: account.id,
                  label: `${account.name} · ${account.broker}`,
                }))}
              />

              <SelectField
                label={
                  transactionForm.type === "deposit"
                    ? "Ví dùng để nạp *"
                    : "Ví nhận tiền rút *"
                }
                value={transactionForm.walletId}
                onChange={(value) =>
                  setTransactionForm((current) => ({
                    ...current,
                    walletId: value,
                  }))
                }
                options={wallets.map((wallet) => ({
                  value: wallet.id,
                  label: `${wallet.name} · ${formatMoney(wallet.balance)}`,
                }))}
              />

              <CurrencyField
                label="Số tiền (VND) *"
                value={transactionForm.amount}
                onChange={(value) =>
                  setTransactionForm((current) => ({
                    ...current,
                    amount: value,
                  }))
                }
              />
              <CurrencyField
                label="Phí (VND)"
                value={transactionForm.fee}
                onChange={(value) =>
                  setTransactionForm((current) => ({
                    ...current,
                    fee: value,
                  }))
                }
              />

              <label>
                <span className="mb-1.5 block text-[13px] font-black text-slate-700">
                  Ngày giao dịch *
                </span>
                <input
                  type="date"
                  value={transactionForm.transactionDate}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      transactionDate: event.target.value,
                    }))
                  }
                  className="min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold sm:text-sm"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-[13px] font-black text-slate-700">
                  Giờ giao dịch *
                </span>
                <input
                  value={transactionForm.transactionTime}
                  inputMode="numeric"
                  maxLength={5}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      transactionTime: normalizeTimeInput(event.target.value),
                    }))
                  }
                  className="min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 font-mono text-base font-semibold sm:text-sm"
                />
              </label>

              <label className="md:col-span-2">
                <span className="mb-1.5 block text-[13px] font-black text-slate-700">
                  Ghi chú
                </span>
                <textarea
                  value={transactionForm.notes}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-semibold sm:text-sm"
                />
              </label>
            </div>

            <FormActions
              isSaving={isSaving}
              saveError={saveError}
              onDismissError={() => setSaveError(null)}
              onCancel={() => setTransactionModalOpen(false)}
            />
          </form>
        </Modal>
      ) : null}

      <ConfirmDialog
        action={pendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </section>
  );
}

function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-100 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="flex h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-4xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-4 pb-3 pt-[calc(0.875rem+env(safe-area-inset-top))] sm:px-6 sm:py-4">
          <div>
            <h3 className="text-xl font-black tracking-tight text-slate-950">
              {title}
            </h3>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 sm:size-9"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {children}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  note,
  tone,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  tone: "sky" | "emerald" | "blue" | "amber" | "violet" | "rose";
  icon: ReactNode;
}) {
  const tones = {
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
  };

  return (
    <div className={`rounded-3xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.15em] opacity-70">
          {label}
        </p>
        {icon}
      </div>
      <p className="mt-3 truncate text-lg font-black">{value}</p>
      <p className="mt-1 text-xs font-semibold opacity-70">{note}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "blue" | "violet" | "rose";
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    violet: "bg-violet-50 text-violet-700",
    rose: "bg-rose-50 text-rose-700",
  };

  return (
    <div className={`rounded-2xl p-3 ${tones[tone]}`}>
      <p className="text-[9px] font-black uppercase opacity-65">{label}</p>
      <p className="mt-1 truncate text-sm font-black">{value}</p>
    </div>
  );
}

function TinyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-black uppercase text-slate-400">{label}</p>
      <p className="mt-1 truncate text-xs font-black text-slate-700">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label>
      <span className="mb-1.5 block text-[13px] font-black text-slate-700">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold outline-none sm:text-sm"
      />
    </label>
  );
}

function CurrencyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const numericValue = value.replace(/\D/g, "");
  const formattedValue = numericValue
    ? new Intl.NumberFormat("vi-VN").format(Number(numericValue))
    : "";

  return (
    <label>
      <span className="mb-1.5 block text-[13px] font-black text-slate-700">
        {label}
      </span>

      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={formattedValue}
          placeholder="0"
          onChange={(event) => {
            const rawValue = event.target.value.replace(/\D/g, "");
            onChange(rawValue);
          }}
          className="min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 pr-12 text-base font-semibold tabular-nums outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100 sm:text-sm"
        />

        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-black text-slate-400">
          ₫
        </span>
      </div>
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label>
      <span className="mb-1.5 block text-[13px] font-black text-slate-700">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold outline-none sm:text-sm"
      >
        <option value="">Chọn</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FormActions({
  isSaving,
  saveError,
  onDismissError,
  onCancel,
}: {
  isSaving: boolean;
  saveError: string | null;
  onDismissError: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <SaveError message={saveError} onDismiss={onDismissError} />
      <div className="sticky bottom-0 -mx-4 mt-5 flex gap-2 border-t border-slate-100 bg-white/95 px-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] pt-3 sm:-mx-6 sm:px-6 sm:pb-0">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="min-h-11 flex-1 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-600"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="min-h-11 flex-1 rounded-2xl bg-sky-600 px-4 text-sm font-black text-white disabled:opacity-60"
        >
          {isSaving ? "Đang lưu..." : "Lưu"}
        </button>
      </div>
    </>
  );
}
