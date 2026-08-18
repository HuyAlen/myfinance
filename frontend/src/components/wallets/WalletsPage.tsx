"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import { useQuickActionCreateIntent } from "@/src/lib/navigation/quickActionIntent";
import { buildTransactionsHref } from "@/src/lib/navigation/financeNavigation";
import { useSuppressGlobalFabsWhileOpen } from "@/src/components/layout/FabVisibilityProvider";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Edit3,
  Landmark,
  Plus,
  ReceiptText,
  Trash2,
  Wallet,
  X,
} from "lucide-react";

import type {
  Transaction,
  Wallet as WalletType,
  WalletType as FinanceWalletType,
} from "@/src/types/finance";

import {
  addTransaction,
  addWallet,
  deleteWallet,
  getForexCashWalletLinks,
  getTransactionWalletLinks,
  getTransactionsInRange,
  getWallets,
  hasWalletReferences,
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
import { useToast } from "@/src/components/ui/ToastProvider";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Wallets page only manages liquid, transferable accounts. "investment" is
 * a legacy/legitimate `FinanceWalletType` value (still used by the
 * Investments domain's Dashboard liquidity math), but it is not part of the
 * Wallet domain's own UI — no new investment wallet can be created/selected
 * here, and existing investment-typed rows are hidden rather than migrated.
 */
type WalletUiType = "cash" | "bank" | "ewallet";
type SpendableWallet = WalletType & { type: WalletUiType };

function isSpendableWallet(wallet: WalletType): wallet is SpendableWallet {
  return wallet.type !== "investment";
}

type FormState = {
  id?: string;
  name: string;
  type: WalletUiType;
  balance: string;
};

type TransferFormState = {
  fromWalletId: string;
  toWalletId: string;
  amount: string;
  date: string;
  note: string;
};

/**
 * `toISOString()` is UTC-based — at UTC+7, calling it between 00:00 and
 * 06:59 local time returns the PREVIOUS calendar day. Transfer dates are a
 * local calendar concept, so the default must come from local Y/M/D fields.
 */
function getLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * [startDate, endDate] (inclusive, "YYYY-MM-DD") for the CURRENT local
 * calendar month — Wallets page analytics intentionally follow the actual
 * current month, not the app-wide DateFilterProvider selection. Uses local
 * Date components, never UTC, so the boundary can't shift near midnight.
 */
function getCurrentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  return { startDate, endDate };
}

const createEmptyTransferForm = (): TransferFormState => ({
  fromWalletId: "",
  toWalletId: "",
  amount: "",
  date: getLocalDateInputValue(),
  note: "",
});

const emptyForm: FormState = {
  name: "",
  type: "cash",
  balance: "",
};

const walletTypeOptions: {
  label: string;
  value: WalletUiType;
  description: string;
}[] = [
  { label: "Tiền mặt", value: "cash", description: "Tiền mặt đang giữ" },
  { label: "Ngân hàng", value: "bank", description: "Tài khoản ngân hàng" },
  {
    label: "Ví điện tử",
    value: "ewallet",
    description: "Momo, ZaloPay, ShopeePay...",
  },
];

const TYPE_COLORS: Record<WalletUiType, string> = {
  cash: "#f59e0b",
  bank: "#2563eb",
  ewallet: "#7c3aed",
};

type EngineTransferTransaction = Transaction & {
  transferReferenceType?: string | null;
  transfer_reference_type?: string | null;
  sourceType?: string | null;
  source_type?: string | null;
  destinationType?: string | null;
  destination_type?: string | null;
};

function getTransferReferenceType(transaction: Transaction) {
  const tx = transaction as EngineTransferTransaction;
  return tx.transferReferenceType ?? tx.transfer_reference_type ?? null;
}

function isWalletTransfer(transaction: Transaction) {
  if (transaction.type !== "transfer") return false;

  const referenceType = getTransferReferenceType(transaction);

  // Old wallet-transfer rows did not have transfer_reference_type yet,
  // but they always have transferToWalletId. Keep them visible as wallet transfers.
  if (!referenceType) return Boolean(transaction.transferToWalletId);

  return referenceType === "wallet";
}

// Bursts of realtime events from a single multi-table write (e.g. a
// transfer touching both source and destination wallets) are coalesced
// within this window instead of triggering one reload per event.
const REALTIME_REFRESH_DEBOUNCE_MS = 100;

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WalletsPage() {
  const [wallets, setWallets] = useState<WalletType[]>([]);
  // FINANCE-DATA-1B: `wallets` starts at [] the same as a genuine
  // zero-wallet account, so the empty-state CTA below must not trust
  // `wallets.length === 0` until a load has actually SUCCEEDED at least
  // once — otherwise an initial read failure (getWallets now rejects
  // instead of silently resolving []) would render "Chưa có ví tiền nào"
  // as if it were a validated conclusion.
  const [isLoadingWallets, setIsLoadingWallets] = useState(true);
  const [walletsLoadError, setWalletsLoadError] = useState<string | null>(
    null,
  );
  const [currentMonthTransactions, setCurrentMonthTransactions] = useState<
    Transaction[]
  >([]);
  // All-time per-wallet linked-record count, for the wallet card caption
  // only. Built from a narrow id-only projection (see
  // getTransactionWalletLinks/getForexCashWalletLinks) instead of full
  // transaction rows, so it stays cheap even across a full history.
  const [walletLinkCounts, setWalletLinkCounts] = useState<
    Map<string, number>
  >(new Map());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [transferForm, setTransferForm] = useState<TransferFormState>(
    createEmptyTransferForm,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WalletType | null>(null);
  const [isCheckingDelete, setIsCheckingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingWallet, setIsSavingWallet] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const { toast } = useToast();

  // Stable identity: unlike Transactions/Dashboard, Wallets analytics always
  // follow the actual current calendar month (not a user-selectable prop),
  // so reloadData never needs to change identity across renders.
  const reloadData = useCallback(async () => {
    // FINANCE-DATA-1: getWallets/getTransactionsInRange/etc. now reject on
    // a genuine query failure instead of silently resolving to [] — this
    // try/catch keeps that rejection from becoming an unhandled promise
    // rejection at every caller (mount effect, realtime refresh). Every
    // state setter below only runs after a successful resolve, so a
    // caught failure simply leaves the previously-loaded wallets/counts
    // on screen instead of clearing them to an empty list.
    // FINANCE-DATA-1B: `walletsLoadError` is cleared on success (so a
    // later successful reload after a transient failure doesn't leave a
    // stale error around) and set — WITHOUT touching `wallets` — on
    // failure, so the empty-state gate below can tell "genuinely no
    // wallets" apart from "we don't actually know yet".
    try {
      const { startDate, endDate } = getCurrentMonthRange();
      const [w, monthTxns, txnLinks, forexLinks] = await Promise.all([
        getWallets(),
        getTransactionsInRange(startDate, endDate),
        getTransactionWalletLinks(),
        getForexCashWalletLinks(),
      ]);

      const counts = new Map<string, number>();
      for (const link of txnLinks) {
        counts.set(link.walletId, (counts.get(link.walletId) ?? 0) + 1);
        if (link.transferToWalletId) {
          counts.set(
            link.transferToWalletId,
            (counts.get(link.transferToWalletId) ?? 0) + 1,
          );
        }
      }
      for (const link of forexLinks) {
        counts.set(link.walletId, (counts.get(link.walletId) ?? 0) + 1);
      }

      setWallets(w);
      setCurrentMonthTransactions(monthTxns);
      setWalletLinkCounts(counts);
      setWalletsLoadError(null);
    } catch (error) {
      console.error("[WalletsPage] reloadData failed:", error);
      setWalletsLoadError(
        "Không thể tải dữ liệu ví. Vui lòng tải lại trang.",
      );
    } finally {
      setIsLoadingWallets(false);
    }
  }, []);

  // ── Reload coordinator ──────────────────────────────────────────────────
  // Coalesces overlapping reload requests (realtime bursts from a single
  // multi-table write, e.g. a transfer touching both wallets) into at most
  // one trailing run instead of one Promise.all group per event.
  const isReloadingRef = useRef(false);
  const hasPendingReloadRef = useRef(false);

  const runReload = useCallback(async () => {
    if (isReloadingRef.current) {
      hasPendingReloadRef.current = true;
      return;
    }
    isReloadingRef.current = true;
    try {
      do {
        hasPendingReloadRef.current = false;
        await reloadData();
      } while (hasPendingReloadRef.current);
    } finally {
      isReloadingRef.current = false;
    }
  }, [reloadData]);

  const realtimeDebounceTimerRef = useRef<number | null>(null);
  const requestRealtimeRefresh = useCallback(() => {
    if (realtimeDebounceTimerRef.current) {
      window.clearTimeout(realtimeDebounceTimerRef.current);
    }
    realtimeDebounceTimerRef.current = window.setTimeout(() => {
      realtimeDebounceTimerRef.current = null;
      void runReload();
    }, REALTIME_REFRESH_DEBOUNCE_MS);
  }, [runReload]);

  useEffect(() => {
    return () => {
      if (realtimeDebounceTimerRef.current) {
        window.clearTimeout(realtimeDebounceTimerRef.current);
      }
    };
  }, []);

  // Initial load: immediate, no artificial delay.
  useEffect(() => {
    void runReload();
  }, [runReload]);

  // Forex/savings writes go through server-side RPCs that also update
  // `wallets.balance` directly, so watching `wallets` already catches them —
  // no separate forex_cash_transactions subscription needed here.
  useRealtimeTable(["wallets", "transactions"], requestRealtimeRefresh);

  // ── Existing computations ─────────────────────────────────────────────────
  // Wallets page only manages liquid, transferable accounts (cash/bank/
  // ewallet). Legacy "investment"-typed rows are neither deleted nor
  // converted — they're simply excluded from this page's lists, counts,
  // totals, and transfer selectors, since that domain now belongs to the
  // Investments page (which reads Wallet rows independently, unaffected by
  // this page-local filter, and holds its own asset value via `Investment[]`).
  const spendableWallets = useMemo(
    () => wallets.filter(isSpendableWallet),
    [wallets],
  );

  const totalAssets = useMemo(
    () => getTotalAssets(spendableWallets),
    [spendableWallets],
  );

  const walletStats = useMemo(
    () =>
      walletTypeOptions.map((o) => ({
        ...o,
        total: spendableWallets
          .filter((w) => w.type === o.value)
          .reduce((s, w) => s + w.balance, 0),
        count: spendableWallets.filter((w) => w.type === o.value).length,
      })),
    [spendableWallets],
  );

  // ── New analytics ─────────────────────────────────────────────────────────
  const now = new Date();
  const currentMonth =
    now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");

  // currentMonthTransactions is already fetched scoped to the current month
  // (see getCurrentMonthRange/getTransactionsInRange in reloadData); this
  // filter is a cheap defensive re-check, not the primary scoping mechanism.
  const currentMonthTxns = useMemo(
    () => currentMonthTransactions.filter((t) => t.date.startsWith(currentMonth)),
    [currentMonthTransactions, currentMonth],
  );
  const currentMonthNet = useMemo(
    () => getTotalIncome(currentMonthTxns) - getTotalExpense(currentMonthTxns),
    [currentMonthTxns],
  );

  const currentMonthTransfers = useMemo(
    () => currentMonthTxns.filter(isWalletTransfer),
    [currentMonthTxns],
  );

  const currentMonthTransferTotal = useMemo(
    () => currentMonthTransfers.reduce((sum, t) => sum + t.amount, 0),
    [currentMonthTransfers],
  );

  // Per-wallet monthly flow — one pass over currentMonthTxns to bucket by
  // wallet and one pass over currentMonthTransfers for transfer totals,
  // instead of re-filtering the shared arrays once per wallet. Income/expense
  // classification still goes through the canonical getTotalIncome/
  // getTotalExpense helpers (applied to each wallet's pre-bucketed slice),
  // so the actual amounts are identical to before.
  const walletFlow = useMemo(() => {
    const txnsByWallet = new Map<string, Transaction[]>();
    for (const t of currentMonthTxns) {
      if (!txnsByWallet.has(t.walletId)) txnsByWallet.set(t.walletId, []);
      txnsByWallet.get(t.walletId)!.push(t);
    }

    const transferInByWallet = new Map<string, number>();
    const transferOutByWallet = new Map<string, number>();
    for (const t of currentMonthTransfers) {
      transferOutByWallet.set(
        t.walletId,
        (transferOutByWallet.get(t.walletId) ?? 0) + t.amount,
      );
      if (t.transferToWalletId) {
        transferInByWallet.set(
          t.transferToWalletId,
          (transferInByWallet.get(t.transferToWalletId) ?? 0) + t.amount,
        );
      }
    }

    const map = new Map<
      string,
      {
        income: number;
        expense: number;
        transferIn: number;
        transferOut: number;
      }
    >();
    for (const w of spendableWallets) {
      const wt = txnsByWallet.get(w.id) ?? [];
      map.set(w.id, {
        income: getTotalIncome(wt),
        expense: getTotalExpense(wt),
        transferIn: transferInByWallet.get(w.id) ?? 0,
        transferOut: transferOutByWallet.get(w.id) ?? 0,
      });
    }
    return map;
  }, [spendableWallets, currentMonthTxns, currentMonthTransfers]);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  function openCreateForm() {
    setForm(emptyForm);
    setSaveError(null);
    setIsFormOpen(true);
  }

  useQuickActionCreateIntent(openCreateForm);
  useSuppressGlobalFabsWhileOpen(isFormOpen || isTransferOpen || !!deleteTarget);

  function openEditForm(wallet: SpendableWallet) {
    setForm({
      id: wallet.id,
      name: wallet.name,
      type: wallet.type,
      balance: String(wallet.balance),
    });
    setSaveError(null);
    setIsFormOpen(true);
  }

  function openTransferForm(defaultFromWalletId?: string) {
    const fromWalletId = defaultFromWalletId ?? spendableWallets[0]?.id ?? "";
    const toWalletId =
      spendableWallets.find((wallet) => wallet.id !== fromWalletId)?.id ?? "";

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
    if (isTransferring) return;

    const amount = Number(transferForm.amount);
    // Restricted to spendableWallets, not the raw fetched list — investment
    // is excluded from wallet-to-wallet transfer, so a stale/tampered id
    // referencing an investment wallet correctly fails as "not found"
    // instead of silently transferring against it.
    const fromWallet = spendableWallets.find(
      (wallet) => wallet.id === transferForm.fromWalletId,
    );
    const toWallet = spendableWallets.find(
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

    const transaction = {
      id: crypto.randomUUID(),
      type: "transfer",
      // Canonical for transfer transactions per schema contract (see
      // supabase_schema.sql: 'Empty string for transfer transactions; UUID/slug
      // for income and expense') and matches TransactionsPage's own transfer
      // payload — not a category id, so never a fake/invented UUID.
      categoryId: "",
      amount,
      walletId: fromWallet.id,
      transferToWalletId: toWallet.id,
      note:
        transferForm.note.trim() ||
        `Chuyển tiền từ ${fromWallet.name} sang ${toWallet.name}`,
      date: transferForm.date,
      transferReferenceType: "wallet",
      transfer_reference_type: "wallet",
      sourceType: "wallet",
      source_type: "wallet",
      destinationType: "wallet",
      destination_type: "wallet",
    } as Transaction & EngineTransferTransaction;

    setSaveError(null);
    setIsTransferring(true);
    try {
      // Finance Engine v2 rule:
      // WalletsPage only creates the transfer transaction.
      // addTransaction() is the single place that applies wallet balance effects.
      // Do not call updateWallet() here, otherwise the source/destination balances
      // are deducted/added twice.
      const transactionResult = await addTransaction(transaction);
      if (transactionResult.error) {
        setSaveError(transactionResult.error);
        return;
      }

      toast({
        variant: "success",
        message: `Đã chuyển ${formatVND(amount)} từ ${fromWallet.name} sang ${toWallet.name}.`,
      });
      await runReload();
      setIsTransferOpen(false);
      setTransferForm(createEmptyTransferForm());
    } finally {
      setIsTransferring(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isSavingWallet) return;

    if (!form.name.trim()) {
      setSaveError("Vui lòng nhập tên ví");
      return;
    }

    // Restricted to spendableWallets: a legacy investment wallet is hidden
    // from this page entirely, so it can never be reached/edited here — if
    // form.id somehow referenced one, this correctly reports "not found"
    // rather than silently editing it.
    const existingWallet = form.id
      ? spendableWallets.find((item) => item.id === form.id)
      : undefined;
    if (form.id && !existingWallet) {
      setSaveError("Không tìm thấy ví cần cập nhật.");
      return;
    }

    // WALLET-BALANCE-EDIT-1: wallet.balance is a persisted field, atomically
    // incremented/decremented by addTransaction()/updateTransaction()/
    // deleteTransaction() (never recomputed from a transaction sum — see
    // financeStorage.ts) — proven Model A, not a derived value. A manual
    // edit here is therefore a direct correction to that same persisted
    // field via updateWallet(), exactly like editing name/type already is —
    // not a fake transaction, so it can never pollute income/expense/cash-
    // flow reports or duplicate a transfer's effect. Same validation for a
    // brand-new wallet's opening balance and an existing wallet's
    // correction, since both are just "the balance this wallet starts
    // reflecting from now on."
    //
    // Known trade-off (disclosed, not silently ignored): the Dashboard's
    // Net Worth Trend chart reconstructs past net worth by walking
    // transaction deltas backward from the CURRENT total. A balance
    // correction has no transaction to walk back through, so — exactly
    // like a new wallet's opening balance already does today — it will
    // read as if the higher/lower balance had always been there, rather
    // than appearing at the specific date of the edit.
    const balance = Number(form.balance);
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
    setIsSavingWallet(true);
    try {
      const { error } = form.id
        ? await updateWallet(wallet)
        : await addWallet(wallet);
      if (error) {
        setSaveError(error);
        return;
      }
      await runReload();
      setIsFormOpen(false);
      setForm(emptyForm);
    } finally {
      setIsSavingWallet(false);
    }
  }

  async function handleDelete(id: string) {
    if (isCheckingDelete) return;

    // Restricted to spendableWallets — legacy investment wallets are hidden
    // from this page (no delete button is ever rendered for one), so this
    // correctly reports "not found" if ever called with such an id.
    const wallet = spendableWallets.find((item) => item.id === id);
    if (!wallet) {
      toast({
        variant: "error",
        message: "Không tìm thấy ví cần xóa.",
      });
      return;
    }

    // On-demand, lightweight dependency check (head-only counts, no row
    // data) instead of relying on in-memory current-month data — an old
    // transaction from a prior month/year would otherwise be missed. No DB
    // FK enforces this (walletId/transferToWalletId → wallets is
    // intentionally omitted; see supabase_schema.sql), so this remains the
    // integrity guard before delete.
    setIsCheckingDelete(true);
    try {
      const { hasReferences, error } = await hasWalletReferences(id);
      if (error) {
        toast({
          variant: "error",
          message: "Không thể kiểm tra giao dịch liên kết: " + error,
        });
        return;
      }

      if (hasReferences) {
        toast({
          variant: "warning",
          message: `Không thể xóa ví "${wallet.name}" vì đang có giao dịch liên kết. Hãy xóa hoặc chuyển các giao dịch trước.`,
        });
        return;
      }

      setDeleteTarget(wallet);
    } finally {
      setIsCheckingDelete(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || isDeleting) return;

    const walletToDelete = deleteTarget;
    setIsDeleting(true);

    try {
      const { error } = await deleteWallet(walletToDelete.id);

      if (error) {
        toast({
          variant: "error",
          message: "Lỗi xóa ví: " + error,
        });
        return;
      }

      setWallets((current) =>
        current.filter((wallet) => wallet.id !== walletToDelete.id),
      );
      setDeleteTarget(null);

      toast({
        variant: "success",
        message: `Đã xóa ví "${walletToDelete.name}" thành công.`,
      });

      await runReload();
    } finally {
      setIsDeleting(false);
    }
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 overflow-x-hidden pb-24 md:space-y-6 md:pb-0">
      {/* SECTION 1 · Wallet Overview */}
      <section className="rounded-4xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-500">
              Wallet Center
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">
              Ví tiền
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Quản lý tiền mặt, tài khoản ngân hàng và ví điện tử.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => openTransferForm()}
              disabled={spendableWallets.length < 2}
              className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-black text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowLeftRight size={16} />
              Chuyển tiền
            </button>
            <button
              onClick={openCreateForm}
              className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-200/60 transition hover:bg-blue-700 active:scale-[.98]"
            >
              <Plus size={16} />
              Thêm ví
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
          <WalletSummaryCard
            label="Tổng số dư"
            value={formatVND(totalAssets)}
            note={`${spendableWallets.length} ví đang quản lý`}
            tone="blue"
          />
          <WalletSummaryCard
            label="Tiền vào tháng này"
            value={formatVND(getTotalIncome(currentMonthTxns))}
            note={`Tháng ${now.getMonth() + 1}/${now.getFullYear()}`}
            tone="emerald"
          />
          <WalletSummaryCard
            label="Tiền ra tháng này"
            value={formatVND(getTotalExpense(currentMonthTxns))}
            note={
              currentMonthNet >= 0 ? "Dòng tiền đang dương" : "Chi lớn hơn thu"
            }
            tone="rose"
          />
          <WalletSummaryCard
            label="Chuyển giữa ví"
            value={formatVND(currentMonthTransferTotal)}
            note={`${currentMonthTransfers.length} giao dịch`}
            tone="indigo"
          />
        </div>
      </section>
      {/* SECTION 2 · Wallet Types */}
      <section className="rounded-4xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900">
              Phân loại ví
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Tổng số dư theo loại ví đang sử dụng.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
            {spendableWallets.length} ví
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {walletStats.map((stat) => {
            const percentage =
              totalAssets > 0
                ? Math.round((stat.total / totalAssets) * 100)
                : 0;
            return (
              <button
                key={stat.value}
                type="button"
                onClick={() => {
                  const wallet = spendableWallets.find(
                    (item) => item.type === stat.value,
                  );
                  if (wallet) openEditForm(wallet);
                  else {
                    setForm({ ...emptyForm, type: stat.value });
                    setSaveError(null);
                    setIsFormOpen(true);
                  }
                }}
                className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <WalletIcon type={stat.value} compact />
                    <div>
                      <p className="text-sm font-black text-slate-900">
                        {stat.label}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {stat.count} ví
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-black text-slate-700">
                    {percentage}%
                  </span>
                </div>
                <p className="mt-4 whitespace-nowrap text-xl font-black tabular-nums text-slate-900">
                  {formatVND(stat.total)}
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(percentage, 100)}%`,
                      background: TYPE_COLORS[stat.value],
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3 · Wallet List
          ══════════════════════════════════════════════════════════════════ */}
      <section>
        <div className="mb-4 flex items-center gap-2 px-1">
          <div className="size-1.5 rounded-full bg-blue-600" />
          <p className="text-sm font-black text-slate-700">Danh sách ví</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {spendableWallets.map((wallet) => {
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
            const txCount = walletLinkCounts.get(wallet.id) ?? 0;
            const color = TYPE_COLORS[wallet.type];

            return (
              <div
                key={wallet.id}
                className="group relative rounded-4xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-md"
              >
                {/* Header */}
                <div className="min-w-0 pr-24 sm:pr-20">
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

                  <div className="absolute right-5 top-5 z-10 flex shrink-0 gap-1.5 opacity-100 transition-opacity sm:right-6 sm:top-6 sm:opacity-0 sm:group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => openEditForm(wallet)}
                      className="flex size-10 items-center justify-center rounded-2xl border border-slate-200 bg-white/95 text-slate-400 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 sm:size-8 sm:rounded-xl"
                      aria-label="Sửa ví"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(wallet.id)}
                      disabled={isCheckingDelete}
                      className="flex size-10 items-center justify-center rounded-2xl border border-rose-100 bg-rose-50 text-rose-500 shadow-sm transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:size-8 sm:rounded-xl sm:border-slate-200 sm:bg-white/95 sm:text-slate-400 sm:hover:border-rose-200 sm:hover:bg-rose-50 sm:hover:text-rose-500"
                      aria-label="Xóa ví"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Balance */}
                <div className="mt-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Số dư hiện tại
                  </p>
                  <p className="mt-1 whitespace-nowrap text-2xl font-black tabular-nums text-blue-700">
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
                <div className="mt-3">
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-xs">
                    <span className="text-slate-500">Tỷ trọng tài sản</span>
                    <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
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

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => openTransferForm(wallet.id)}
                    disabled={spendableWallets.length < 2}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-2.5 text-xs font-black text-indigo-600 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ArrowLeftRight size={13} />
                    Chuyển tiền
                  </button>
                  <Link
                    href={buildTransactionsHref({ walletId: wallet.id })}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-black text-slate-600 transition hover:bg-slate-100"
                  >
                    <ReceiptText size={13} />
                    Giao dịch
                  </Link>
                </div>
              </div>
            );
          })}

          {/* FINANCE-DATA-1B: three distinct states share this slot — an
              initial read failure must render neither the loading nor the
              legitimate "Chưa có ví tiền nào" (add your first wallet) CTA,
              since neither is true when we simply don't know yet. */}
          {spendableWallets.length === 0 && isLoadingWallets && (
            <div className="flex flex-col items-center justify-center rounded-4xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-12 text-center md:col-span-2 xl:col-span-3">
              <div className="flex size-16 items-center justify-center rounded-3xl bg-slate-100">
                <Wallet size={24} className="text-slate-400" />
              </div>
              <h3 className="mt-4 text-base font-black text-slate-700">
                Đang tải dữ liệu ví...
              </h3>
            </div>
          )}

          {spendableWallets.length === 0 &&
            !isLoadingWallets &&
            walletsLoadError && (
              <div className="flex flex-col items-center justify-center rounded-4xl border-2 border-dashed border-rose-200 bg-rose-50/40 p-12 text-center md:col-span-2 xl:col-span-3">
                <div className="flex size-16 items-center justify-center rounded-3xl bg-rose-100">
                  <Wallet size={24} className="text-rose-400" />
                </div>
                <h3 className="mt-4 text-base font-black text-slate-700">
                  Không thể tải dữ liệu ví
                </h3>
                <p className="mt-2 text-sm text-slate-400">
                  {walletsLoadError}
                </p>
              </div>
            )}

          {/* Empty state */}
          {spendableWallets.length === 0 &&
            !isLoadingWallets &&
            !walletsLoadError && (
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
        <div className="fixed inset-0 z-100 flex items-stretch justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <div className="flex h-dvh w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:rounded-4xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 pb-2.5 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:p-6 sm:pb-4">
              <div>
                <div className="mb-1.5 flex size-8 items-center justify-center rounded-xl bg-linear-to-br from-indigo-600 to-blue-500 text-white shadow-lg shadow-indigo-100">
                  <ArrowLeftRight size={18} />
                </div>
                <h2 className="text-[1.2rem] font-black leading-tight text-slate-900">
                  Chuyển tiền giữa các ví
                </h2>
                <p className="mt-1 max-w-[16rem] text-[11px] leading-4 text-slate-400 sm:max-w-none sm:text-xs sm:leading-5">
                  Chuyển tiền chỉ thay đổi số dư giữa các ví.
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
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2.5 sm:px-6 sm:py-5">
                {spendableWallets.length < 2 ? (
                  <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-700">
                    Bạn cần ít nhất 2 ví để dùng tính năng chuyển tiền.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <WalletSelect
                      label="Từ ví"
                      wallets={spendableWallets}
                      value={transferForm.fromWalletId}
                      onChange={(value) => {
                        setTransferForm((prev) => ({
                          ...prev,
                          fromWalletId: value,
                          toWalletId:
                            prev.toWalletId && prev.toWalletId !== value
                              ? prev.toWalletId
                              : (spendableWallets.find(
                                  (wallet) => wallet.id !== value,
                                )?.id ?? ""),
                        }));
                      }}
                    />

                    <WalletSelect
                      label="Đến ví"
                      wallets={spendableWallets.filter(
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

                    <div className="grid gap-2 md:grid-cols-2">
                      <div>
                        <p className="mb-1 text-[13px] font-black text-slate-700 sm:mb-1.5 sm:text-sm">
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

              <div className="shrink-0 border-t border-slate-100 bg-white px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 sm:px-6 sm:py-4">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsTransferOpen(false)}
                    disabled={isTransferring}
                    className="min-h-11 flex-1 rounded-2xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={spendableWallets.length < 2 || isTransferring}
                    className="min-h-11 flex-1 rounded-2xl bg-indigo-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isTransferring ? "Đang chuyển..." : "Chuyển tiền"}
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
        <div className="fixed inset-0 z-100 flex items-stretch justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <div className="flex h-dvh w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:rounded-4xl">
            {/* Modal header */}
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 pb-2.5 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:p-6 sm:pb-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {form.id ? "Sửa ví tiền" : "Thêm ví tiền"}
                </h2>
                <p className="mt-0.5 text-sm text-slate-400">
                  Nhập thông tin ví hoặc tài khoản thanh toán.
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
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6 sm:py-5">
                <div className="grid gap-2.5 md:grid-cols-2">
                  <FormInput
                    label="Tên ví"
                    value={form.name}
                    onChange={(v) => setForm((p) => ({ ...p, name: v }))}
                    placeholder="VD: Vietcombank, Tiền mặt..."
                  />
                  {/* Balance with ₫ prefix */}
                  <div>
                    <p className="mb-1.5 text-sm font-black text-slate-700">
                      {form.id ? "Số dư hiện tại" : "Số dư ban đầu"}
                    </p>
                    <CurrencyInput
                      value={form.balance}
                      onChange={(raw: string) =>
                        setForm((p) => ({ ...p, balance: raw }))
                      }
                      placeholder="0"
                    />
                    {form.id && (
                      <p className="mt-1.5 text-[11px] font-medium leading-4 text-slate-400">
                        Bạn có thể cập nhật số dư hiện tại của ví. Thay đổi sẽ
                        không tạo giao dịch mới.
                      </p>
                    )}
                  </div>
                </div>

                {/* Wallet type */}
                <div className="mt-4">
                  <p className="mb-2 text-[13px] font-black text-slate-700 sm:text-sm">
                    Loại ví
                  </p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {walletTypeOptions.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() =>
                          setForm((p) => ({ ...p, type: o.value }))
                        }
                        className={
                          "flex items-center gap-3 rounded-2xl border p-2.5 text-left transition-all " +
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
              <div className="shrink-0 border-t border-slate-100 bg-white px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2.5 sm:px-6 sm:py-4">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    disabled={isSavingWallet}
                    className="min-h-11 flex-1 rounded-2xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingWallet}
                    className="min-h-11 flex-1 rounded-2xl bg-blue-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSavingWallet
                      ? "Đang lưu..."
                      : form.id
                        ? "Lưu thay đổi"
                        : "Thêm ví tiền"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget ? (
        <div className="fixed inset-0 z-140 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Đóng xác nhận xóa ví"
            className="absolute inset-0 cursor-default"
            onClick={() => {
              if (!isDeleting) setDeleteTarget(null);
            }}
          />

          <div className="relative z-10 w-full overflow-hidden rounded-t-[30px] bg-white shadow-2xl sm:max-w-md sm:rounded-4xl">
            <div className="px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
              <div className="flex items-start justify-between gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                  <Trash2 size={21} />
                </span>

                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={isDeleting}
                  className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 disabled:opacity-50"
                  aria-label="Đóng"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-rose-500">
                Xác nhận xóa
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                Xóa ví tiền?
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                Bạn sắp xóa{" "}
                <span className="font-black text-slate-800">
                  {deleteTarget.name}
                </span>
                . Hành động này không thể hoàn tác.
              </p>

              <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-wide text-rose-400">
                  Số dư hiện tại
                </p>
                <p className="mt-1 whitespace-nowrap text-xl font-black tabular-nums text-rose-700">
                  {formatVND(deleteTarget.balance)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-5">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Hủy
              </button>

              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={isDeleting}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 text-sm font-black text-white shadow-lg shadow-rose-100 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 size={17} />
                {isDeleting ? "Đang xóa..." : "Xóa ví"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function WalletSummaryCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "blue" | "emerald" | "rose" | "indigo";
}) {
  const styles = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-700",
  };

  return (
    <div className={"rounded-3xl border p-3 sm:p-4 " + styles[tone]}>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
        {label}
      </p>
      <p className="mt-2 whitespace-nowrap text-[clamp(0.85rem,4.2vw,1.25rem)] leading-none font-black tabular-nums sm:text-xl">
        {value}
      </p>
      <p className="mt-1 text-xs font-bold opacity-70">{note}</p>
    </div>
  );
}

function WalletIcon({
  type,
  compact = false,
}: {
  type: WalletUiType;
  compact?: boolean;
}) {
  const base = compact
    ? "flex size-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
    : "flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm";

  if (type === "bank") {
    return (
      <div className={base + " bg-linear-to-br from-blue-600 to-cyan-500"}>
        <Landmark size={20} />
      </div>
    );
  }

  if (type === "ewallet") {
    return (
      <div className={base + " bg-linear-to-br from-violet-500 to-indigo-500"}>
        <Wallet size={20} />
      </div>
    );
  }

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

  return (
    <span
      className={`flex ${dimension} shrink-0 items-center justify-center bg-amber-50 text-amber-600 shadow-sm`}
    >
      <Banknote size={size === "md" ? 18 : 15} />
    </span>
  );
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
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
        <div className="flex items-center gap-2">
          {selectedWallet && (
            <div className="shrink-0">
              <WalletBrandLogo wallet={selectedWallet} size="md" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <select
              value={value}
              onChange={(event) => onChange(event.target.value)}
              className="min-h-10 w-full truncate rounded-xl border border-slate-200 bg-white px-3 py-2 pr-9 text-[15px] font-bold text-slate-700 outline-none focus:border-blue-400 sm:min-h-11 sm:py-2.5 sm:text-sm"
            >
              <option value="">Chọn ví</option>
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name} · {formatVND(wallet.balance)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedWallet && (
          <div className="mt-1.5 flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-1.5 text-xs">
            <span className="min-w-0 truncate font-bold text-slate-500">
              {getWalletTypeLabel(selectedWallet.type)}
            </span>
            <span className="shrink-0 font-black tabular-nums text-slate-900">
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
        className="min-h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-base outline-none focus:border-blue-400 focus:bg-white sm:min-h-11 sm:px-4 sm:py-2.5 sm:text-sm"
      />
    </label>
  );
}
