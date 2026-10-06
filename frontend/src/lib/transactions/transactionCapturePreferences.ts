export const TRANSACTION_CAPTURE_PREFERENCES_STORAGE_KEY =
  "myfinance:transaction-capture-preferences-v1";

const MAX_RECENT_CATEGORY_IDS = 3;

export type TransactionCapturePreferenceMode =
  | "income"
  | "expense"
  | "transfer";

export type TransactionCapturePreferences = {
  version: 1;
  lastWalletIdByMode: Record<TransactionCapturePreferenceMode, string>;
  lastTransferToWalletId: string;
  recentCategoryIds: {
    income: string[];
    expense: string[];
  };
};

function cleanId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeIdList(value: unknown) {
  if (!Array.isArray(value)) return [];

  const result: string[] = [];
  for (const raw of value) {
    const id = cleanId(raw);
    if (!id || result.includes(id)) continue;
    result.push(id);
    if (result.length >= MAX_RECENT_CATEGORY_IDS) break;
  }
  return result;
}

export function createDefaultTransactionCapturePreferences(): TransactionCapturePreferences {
  return {
    version: 1,
    lastWalletIdByMode: {
      income: "",
      expense: "",
      transfer: "",
    },
    lastTransferToWalletId: "",
    recentCategoryIds: {
      income: [],
      expense: [],
    },
  };
}

export function normalizeTransactionCapturePreferences(
  value: unknown,
): TransactionCapturePreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createDefaultTransactionCapturePreferences();
  }

  const candidate = value as {
    lastWalletIdByMode?: Partial<
      Record<TransactionCapturePreferenceMode, unknown>
    >;
    lastTransferToWalletId?: unknown;
    recentCategoryIds?: {
      income?: unknown;
      expense?: unknown;
    };
  };

  return {
    version: 1,
    lastWalletIdByMode: {
      income: cleanId(candidate.lastWalletIdByMode?.income),
      expense: cleanId(candidate.lastWalletIdByMode?.expense),
      transfer: cleanId(candidate.lastWalletIdByMode?.transfer),
    },
    lastTransferToWalletId: cleanId(candidate.lastTransferToWalletId),
    recentCategoryIds: {
      income: normalizeIdList(candidate.recentCategoryIds?.income),
      expense: normalizeIdList(candidate.recentCategoryIds?.expense),
    },
  };
}

export function readTransactionCapturePreferences() {
  if (typeof window === "undefined") {
    return createDefaultTransactionCapturePreferences();
  }

  try {
    const raw = window.localStorage.getItem(
      TRANSACTION_CAPTURE_PREFERENCES_STORAGE_KEY,
    );
    if (!raw) return createDefaultTransactionCapturePreferences();
    return normalizeTransactionCapturePreferences(JSON.parse(raw));
  } catch {
    return createDefaultTransactionCapturePreferences();
  }
}

export function persistTransactionCapturePreferences(
  preferences: TransactionCapturePreferences,
) {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(
      TRANSACTION_CAPTURE_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalizeTransactionCapturePreferences(preferences)),
    );
    return true;
  } catch {
    return false;
  }
}

export function getRecentTransactionCaptureCategoryIds(
  preferences: TransactionCapturePreferences,
  mode: Exclude<TransactionCapturePreferenceMode, "transfer">,
) {
  return [...normalizeTransactionCapturePreferences(preferences).recentCategoryIds[mode]];
}

export function resolveTransactionCaptureDefaults(input: {
  mode: TransactionCapturePreferenceMode;
  preferences: TransactionCapturePreferences;
  walletIds: string[];
  categoryIds: string[];
}) {
  const preferences = normalizeTransactionCapturePreferences(input.preferences);
  const walletIds = input.walletIds.map(cleanId).filter(Boolean);
  const categoryIds = input.categoryIds.map(cleanId).filter(Boolean);
  const validWalletIds = new Set(walletIds);
  const validCategoryIds = new Set(categoryIds);

  const preferredWalletId = preferences.lastWalletIdByMode[input.mode];
  const walletId = validWalletIds.has(preferredWalletId)
    ? preferredWalletId
    : (walletIds[0] ?? "");

  if (input.mode === "transfer") {
    const preferredTarget = preferences.lastTransferToWalletId;
    const transferToWalletId =
      preferredTarget !== walletId && validWalletIds.has(preferredTarget)
        ? preferredTarget
        : (walletIds.find((id) => id !== walletId) ?? "");

    return {
      walletId,
      categoryId: "",
      transferToWalletId,
    };
  }

  const recentCategoryIds = getRecentTransactionCaptureCategoryIds(
    preferences,
    input.mode,
  );
  const categoryId =
    recentCategoryIds.find((id) => validCategoryIds.has(id)) ??
    categoryIds[0] ??
    "";

  return {
    walletId,
    categoryId,
    transferToWalletId: "",
  };
}

export function rememberTransactionCaptureSuccess(
  preferences: TransactionCapturePreferences,
  input: {
    mode: TransactionCapturePreferenceMode;
    walletId: string;
    categoryId?: string;
    transferToWalletId?: string;
  },
): TransactionCapturePreferences {
  const next = normalizeTransactionCapturePreferences(preferences);
  const walletId = cleanId(input.walletId);

  if (walletId) {
    next.lastWalletIdByMode[input.mode] = walletId;
  }

  if (input.mode === "transfer") {
    const targetId = cleanId(input.transferToWalletId);
    if (targetId && targetId !== walletId) {
      next.lastTransferToWalletId = targetId;
    }
    return next;
  }

  const categoryId = cleanId(input.categoryId);
  if (categoryId) {
    next.recentCategoryIds[input.mode] = [
      categoryId,
      ...next.recentCategoryIds[input.mode].filter((id) => id !== categoryId),
    ].slice(0, MAX_RECENT_CATEGORY_IDS);
  }

  return next;
}