import type { TransactionType } from "@/src/types/finance";

export type TransactionRuleType = Extract<TransactionType, "income" | "expense">;

export type TransactionRule = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  transactionType: TransactionRuleType;
  noteContains: string | null;
  walletId: string | null;
  amountMin: number | null;
  amountMax: number | null;
  actionCategoryId: string | null;
  actionWalletId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TransactionRuleCandidate = {
  type: TransactionType;
  amount: number;
  note: string;
  walletId: string;
  categoryId?: string;
};

export type TransactionRulePatch = {
  categoryId?: string;
  walletId?: string;
};

export type TransactionRuleMatch = {
  rule: TransactionRule;
  patch: TransactionRulePatch;
  changesCategory: boolean;
  changesWallet: boolean;
};

export function normalizeTransactionRuleText(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function transactionRuleMatches(
  rule: TransactionRule,
  candidate: TransactionRuleCandidate,
) {
  if (!rule.enabled) return false;
  if (candidate.type !== rule.transactionType) return false;

  const amount = Number(candidate.amount);
  if (!Number.isFinite(amount) || amount <= 0) return false;

  if (rule.noteContains) {
    const needle = normalizeTransactionRuleText(rule.noteContains);
    const haystack = normalizeTransactionRuleText(candidate.note);
    if (!needle || !haystack.includes(needle)) return false;
  }

  if (rule.walletId && candidate.walletId !== rule.walletId) return false;
  if (rule.amountMin !== null && amount < rule.amountMin) return false;
  if (rule.amountMax !== null && amount > rule.amountMax) return false;

  return true;
}

export function buildTransactionRulePatch(
  rule: TransactionRule,
  candidate: TransactionRuleCandidate,
): TransactionRulePatch {
  const patch: TransactionRulePatch = {};
  if (rule.actionCategoryId && rule.actionCategoryId !== candidate.categoryId) {
    patch.categoryId = rule.actionCategoryId;
  }
  if (rule.actionWalletId && rule.actionWalletId !== candidate.walletId) {
    patch.walletId = rule.actionWalletId;
  }
  return patch;
}

export function evaluateTransactionRules(
  rules: readonly TransactionRule[],
  candidate: TransactionRuleCandidate,
): TransactionRuleMatch | null {
  const sorted = [...rules].sort(
    (left, right) =>
      left.priority - right.priority ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );

  for (const rule of sorted) {
    if (!transactionRuleMatches(rule, candidate)) continue;
    const patch = buildTransactionRulePatch(rule, candidate);
    const changesCategory = Boolean(patch.categoryId);
    const changesWallet = Boolean(patch.walletId);
    if (!changesCategory && !changesWallet) continue;
    return { rule, patch, changesCategory, changesWallet };
  }

  return null;
}

export function applyTransactionRuleMatch<T extends TransactionRuleCandidate>(
  candidate: T,
  match: TransactionRuleMatch,
): T {
  return {
    ...candidate,
    ...(match.patch.categoryId ? { categoryId: match.patch.categoryId } : {}),
    ...(match.patch.walletId ? { walletId: match.patch.walletId } : {}),
  };
}
