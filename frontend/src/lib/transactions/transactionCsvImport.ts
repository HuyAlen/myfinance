import type { Category, Transaction, TransactionType, Wallet } from "@/src/types/finance";
import { getCategoryPlanningGroup } from "@/src/services/finance/financeCalculations";
import {
  applyTransactionRuleMatch,
  evaluateTransactionRules,
  type TransactionRule,
} from "@/src/lib/transactions/transactionRules";

export const TRANSACTION_CSV_IMPORT_MAX_ROWS = 500;

export type TransactionCsvImportDraft = Omit<
  Transaction,
  "id" | "isRecurring" | "recurrence" | "nextRunDate"
>;

export type TransactionCsvImportRowStatus = "ready" | "duplicate" | "error";

export type TransactionCsvImportPreviewRow = {
  rowNumber: number;
  status: TransactionCsvImportRowStatus;
  errors: string[];
  draft: TransactionCsvImportDraft | null;
  fingerprint: string | null;
  appliedRuleId?: string;
  appliedRuleName?: string;
};

export type TransactionCsvImportPreview = {
  rows: TransactionCsvImportPreviewRow[];
  readyCount: number;
  duplicateCount: number;
  errorCount: number;
  fatalError: string | null;
  ruleAppliedCount?: number;
};

type HeaderKey =
  | "date"
  | "type"
  | "note"
  | "category"
  | "wallet"
  | "destinationWallet"
  | "amount";

type HeaderIndex = Partial<Record<HeaderKey, number>>;

type CsvRecord = {
  fields: string[];
  sourceRowNumber: number;
};

type CsvParseResult = {
  records: CsvRecord[];
  fatalError: string | null;
};

const REQUIRED_HEADER_LABELS: Array<[HeaderKey, string]> = [
  ["date", "Ngày"],
  ["type", "Loại"],
  ["category", "Danh mục"],
  ["wallet", "Ví"],
  ["amount", "Số tiền"],
];

const HEADER_ALIASES: Record<HeaderKey, readonly string[]> = {
  date: ["ngay", "date", "transactiondate", "transaction_date"],
  type: ["loai", "type", "transactiontype", "transaction_type"],
  note: ["ghichu", "note", "notes", "description", "mota"],
  category: ["danhmuc", "category", "categoryname", "category_name"],
  wallet: [
    "vi",
    "wallet",
    "walletname",
    "wallet_name",
    "account",
    "taikhoan",
    "vinguon",
    "sourcewallet",
    "source_wallet",
  ],
  destinationWallet: [
    "vinhan",
    "vidich",
    "destinationwallet",
    "destination_wallet",
    "towallet",
    "to_wallet",
  ],
  amount: ["sotien", "amount", "value", "transactionamount", "transaction_amount"],
};

function normalizeText(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeHeader(value: string) {
  return normalizeText(value).replace(/[\s_\-./\\]+/g, "");
}

function normalizeLookupValue(value: string) {
  return normalizeText(value);
}

function normalizeNote(value: string) {
  return value.normalize("NFC").toLowerCase().trim().replace(/\s+/g, " ");
}

function detectDelimiter(input: string): "," | ";" | "\t" {
  const firstLogicalLine = input.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  let inQuotes = false;
  const counts = { comma: 0, semicolon: 0, tab: 0 };

  for (let index = 0; index < firstLogicalLine.length; index += 1) {
    const char = firstLogicalLine[index];
    if (char === '"') {
      if (inQuotes && firstLogicalLine[index + 1] === '"') {
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (char === ",") counts.comma += 1;
    if (char === ";") counts.semicolon += 1;
    if (char === "\t") counts.tab += 1;
  }

  if (counts.tab > counts.comma && counts.tab > counts.semicolon) return "\t";
  if (counts.semicolon > counts.comma) return ";";
  return ",";
}

function parseCsvRecords(input: string): CsvParseResult {
  const source = input.replace(/^\uFEFF/, "");
  if (!source.trim()) {
    return { records: [], fatalError: "File CSV đang trống." };
  }

  const delimiter = detectDelimiter(source);
  const records: CsvRecord[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let physicalLine = 1;
  let recordStartLine = 1;

  function pushField() {
    row.push(field);
    field = "";
  }

  function pushRow() {
    pushField();
    const hasValue = row.some((value) => value.trim().length > 0);
    if (hasValue) {
      records.push({ fields: row, sourceRowNumber: recordStartLine });
    }
    row = [];
    recordStartLine = physicalLine + 1;
  }

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (char === '"') {
      if (inQuotes && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (inQuotes) {
        inQuotes = false;
      } else if (field.length === 0) {
        inQuotes = true;
      } else {
        // A quote in an unquoted field is ordinary text rather than a parser
        // control character. This keeps bank-export descriptions resilient.
        field += char;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      pushField();
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      pushRow();
      physicalLine += 1;
      continue;
    }

    if (char === "\n") physicalLine += 1;
    field += char;
  }

  if (inQuotes) {
    return {
      records: [],
      fatalError: "CSV có dấu ngoặc kép chưa đóng. Hãy kiểm tra lại file.",
    };
  }

  if (field.length > 0 || row.length > 0) pushRow();

  return { records, fatalError: null };
}

function resolveHeaderIndex(headers: string[]): HeaderIndex {
  const normalizedHeaders = headers.map(normalizeHeader);
  const result: HeaderIndex = {};

  (Object.keys(HEADER_ALIASES) as HeaderKey[]).forEach((key) => {
    const aliases = new Set(HEADER_ALIASES[key].map(normalizeHeader));
    const index = normalizedHeaders.findIndex((header) => aliases.has(header));
    if (index >= 0) result[key] = index;
  });

  return result;
}

function cell(fields: string[], index: number | undefined) {
  return index === undefined ? "" : String(fields[index] ?? "").trim();
}

function isValidDateParts(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function parseTransactionCsvDate(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  let match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!isValidDateParts(year, month, day)) return null;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(value);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    if (!isValidDateParts(year, month, day)) return null;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

export function parseTransactionCsvAmount(raw: string): number | null {
  let value = raw
    .trim()
    .replace(/\bVND\b/gi, "")
    .replace(/[₫đ]/gi, "")
    .replace(/\s+/g, "");

  if (!value || value.startsWith("-")) return null;
  value = value.replace(/^\+/, "");

  if (/^\d+$/.test(value)) {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }

  // VND files commonly use either 1.234.567 or 1,234,567 grouping.
  if (/^\d{1,3}([.,]\d{3})+$/.test(value)) {
    const amount = Number(value.replace(/[.,]/g, ""));
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }

  return null;
}

function parseTransactionType(raw: string): TransactionType | null {
  const value = normalizeText(raw);
  if (["thu", "thu nhap", "income", "in"].includes(value)) return "income";
  if (["chi", "chi tieu", "expense", "out"].includes(value)) return "expense";
  if (["chuyen", "chuyen tien", "transfer", "internal transfer"].includes(value)) {
    return "transfer";
  }
  return null;
}

function splitTransferWalletCell(value: string): [string, string] | null {
  const parts = value
    .split(/\s*(?:->|=>|→)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length === 2 ? [parts[0], parts[1]] : null;
}

type LookupResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "missing" | "ambiguous" };

function buildLookup<T extends { id: string; name: string }>(items: T[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const byName = new Map<string, T[]>();
  for (const item of items) {
    const key = normalizeLookupValue(item.name);
    const bucket = byName.get(key) ?? [];
    bucket.push(item);
    byName.set(key, bucket);
  }

  return (raw: string): LookupResult<T> => {
    const trimmed = raw.trim();
    const exactId = byId.get(trimmed);
    if (exactId) return { ok: true, value: exactId };

    const matches = byName.get(normalizeLookupValue(trimmed)) ?? [];
    if (matches.length === 1) return { ok: true, value: matches[0] };
    if (matches.length > 1) return { ok: false, reason: "ambiguous" };
    return { ok: false, reason: "missing" };
  };
}

function formatLookupError(label: string, raw: string, reason: "missing" | "ambiguous") {
  if (reason === "ambiguous") {
    return `${label} “${raw}” bị trùng tên. Hãy đổi tên trong MyFinance hoặc dùng ID.`;
  }
  return `Không tìm thấy ${label.toLowerCase()} “${raw}”.`;
}

export function buildTransactionCsvFingerprint(
  transaction: Pick<
    Transaction,
    "type" | "amount" | "categoryId" | "walletId" | "transferToWalletId" | "note" | "date"
  >,
) {
  return [
    transaction.date.slice(0, 10),
    transaction.type,
    String(Number(transaction.amount) || 0),
    transaction.categoryId || "",
    transaction.walletId || "",
    transaction.transferToWalletId || "",
    normalizeNote(transaction.note || ""),
  ].join("|");
}

export function buildTransactionCsvImportPreview(input: {
  csvText: string;
  wallets: Wallet[];
  categories: Category[];
  existingTransactions: Transaction[];
  maxRows?: number;
}): TransactionCsvImportPreview {
  const parsed = parseCsvRecords(input.csvText);
  if (parsed.fatalError) {
    return {
      rows: [],
      readyCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      fatalError: parsed.fatalError,
    };
  }

  if (parsed.records.length < 2) {
    return {
      rows: [],
      readyCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      fatalError: "CSV cần có hàng tiêu đề và ít nhất một giao dịch.",
    };
  }

  const headers = parsed.records[0].fields;
  const headerIndex = resolveHeaderIndex(headers);
  const missingHeaders = REQUIRED_HEADER_LABELS.filter(
    ([key]) => headerIndex[key] === undefined,
  ).map(([, label]) => label);

  if (missingHeaders.length > 0) {
    return {
      rows: [],
      readyCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      fatalError: `Thiếu cột bắt buộc: ${missingHeaders.join(", ")}.`,
    };
  }

  const dataRecords = parsed.records.slice(1);
  const maxRows = input.maxRows ?? TRANSACTION_CSV_IMPORT_MAX_ROWS;
  if (dataRecords.length > maxRows) {
    return {
      rows: [],
      readyCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      fatalError: `Mỗi lần chỉ nhập tối đa ${maxRows} giao dịch. Hãy chia CSV thành nhiều file nhỏ hơn.`,
    };
  }

  const findWallet = buildLookup(input.wallets);
  const findCategory = buildLookup(input.categories);
  const existingFingerprints = new Set(
    input.existingTransactions.map(buildTransactionCsvFingerprint),
  );
  const fileFingerprints = new Set<string>();

  const rows = dataRecords.map<TransactionCsvImportPreviewRow>((record) => {
    const errors: string[] = [];
    const rawDate = cell(record.fields, headerIndex.date);
    const rawType = cell(record.fields, headerIndex.type);
    const rawCategory = cell(record.fields, headerIndex.category);
    const rawWallet = cell(record.fields, headerIndex.wallet);
    const rawDestinationWallet = cell(record.fields, headerIndex.destinationWallet);
    const rawAmount = cell(record.fields, headerIndex.amount);
    const note = cell(record.fields, headerIndex.note);

    const date = parseTransactionCsvDate(rawDate);
    if (!date) errors.push(`Ngày “${rawDate || "(trống)"}” không hợp lệ.`);

    const type = parseTransactionType(rawType);
    if (!type) errors.push(`Loại “${rawType || "(trống)"}” không được hỗ trợ.`);

    const amount = parseTransactionCsvAmount(rawAmount);
    if (!amount) errors.push(`Số tiền “${rawAmount || "(trống)"}” không hợp lệ.`);

    let sourceWalletRaw = rawWallet;
    let destinationWalletRaw = rawDestinationWallet;
    if (type === "transfer" && !destinationWalletRaw) {
      const transferPair = splitTransferWalletCell(rawWallet);
      if (transferPair) {
        [sourceWalletRaw, destinationWalletRaw] = transferPair;
      }
    }

    let walletId = "";
    let transferToWalletId: string | undefined;
    if (!sourceWalletRaw) {
      errors.push(type === "transfer" ? "Thiếu Ví nguồn." : "Thiếu Ví.");
    } else {
      const sourceWallet = findWallet(sourceWalletRaw);
      if (sourceWallet.ok) walletId = sourceWallet.value.id;
      else errors.push(formatLookupError("Ví", sourceWalletRaw, sourceWallet.reason));
    }

    if (type === "transfer") {
      if (!destinationWalletRaw) {
        errors.push("Giao dịch Chuyển cần Ví đích, ví dụ “Ví A -> Ví B” hoặc cột Ví nhận.");
      } else {
        const destinationWallet = findWallet(destinationWalletRaw);
        if (destinationWallet.ok) transferToWalletId = destinationWallet.value.id;
        else {
          errors.push(
            formatLookupError("Ví nhận", destinationWalletRaw, destinationWallet.reason),
          );
        }
      }
      if (walletId && transferToWalletId && walletId === transferToWalletId) {
        errors.push("Ví nguồn và Ví đích phải khác nhau.");
      }
    }

    let categoryId = "";
    if (type === "income" || type === "expense") {
      if (!rawCategory) {
        errors.push("Thiếu Danh mục.");
      } else {
        const categoryResult = findCategory(rawCategory);
        if (!categoryResult.ok) {
          errors.push(
            formatLookupError("Danh mục", rawCategory, categoryResult.reason),
          );
        } else {
          const category = categoryResult.value;
          if (category.type !== type) {
            errors.push(
              `Danh mục “${category.name}” không phù hợp với loại ${type === "income" ? "Thu" : "Chi"}.`,
            );
          } else {
            const planningGroup = getCategoryPlanningGroup(category);
            const allowed =
              type === "income"
                ? planningGroup === "income"
                : planningGroup === "fixed" || planningGroup === "variable";
            if (!allowed) {
              errors.push(
                `Danh mục “${category.name}” thuộc nhóm ${planningGroup === "saving" ? "Tiết kiệm" : "Đầu tư"} và không thể nhập như giao dịch ${type === "income" ? "Thu" : "Chi"} thông thường.`,
              );
            } else {
              categoryId = category.id;
            }
          }
        }
      }
    }

    if (!date || !type || !amount || !walletId || errors.length > 0) {
      return {
        rowNumber: record.sourceRowNumber,
        status: "error",
        errors,
        draft: null,
        fingerprint: null,
      };
    }

    const draft: TransactionCsvImportDraft = {
      type,
      amount,
      categoryId: type === "transfer" ? "" : categoryId,
      walletId,
      transferToWalletId: type === "transfer" ? transferToWalletId : undefined,
      note,
      date,
      ...(type === "transfer"
        ? ({
            transferReferenceType: "wallet",
            sourceType: "wallet",
            destinationType: "wallet",
            transfer_reference_type: "wallet",
            source_type: "wallet",
            destination_type: "wallet",
          } as Record<string, unknown>)
        : {}),
    } as TransactionCsvImportDraft;

    const fingerprint = buildTransactionCsvFingerprint(draft);
    const duplicate =
      existingFingerprints.has(fingerprint) || fileFingerprints.has(fingerprint);
    fileFingerprints.add(fingerprint);

    return {
      rowNumber: record.sourceRowNumber,
      status: duplicate ? "duplicate" : "ready",
      errors: [],
      draft,
      fingerprint,
    };
  });

  return {
    rows,
    readyCount: rows.filter((row) => row.status === "ready").length,
    duplicateCount: rows.filter((row) => row.status === "duplicate").length,
    errorCount: rows.filter((row) => row.status === "error").length,
    fatalError: null,
  };
}

export function buildTransactionCsvImportPreviewWithRules(input: {
  csvText: string;
  wallets: Wallet[];
  categories: Category[];
  existingTransactions: Transaction[];
  rules: readonly TransactionRule[];
  maxRows?: number;
}): TransactionCsvImportPreview {
  const base = buildTransactionCsvImportPreview(input);
  if (base.fatalError || input.rules.length === 0) {
    return { ...base, ruleAppliedCount: 0 };
  }

  const existingFingerprints = new Set(
    input.existingTransactions.map(buildTransactionCsvFingerprint),
  );
  const fileFingerprints = new Set<string>();
  let ruleAppliedCount = 0;

  const rows = base.rows.map<TransactionCsvImportPreviewRow>((row) => {
    if (!row.draft) return row;

    const match = evaluateTransactionRules(input.rules, {
      type: row.draft.type,
      amount: row.draft.amount,
      note: row.draft.note,
      walletId: row.draft.walletId,
      categoryId: row.draft.categoryId,
    });

    const nextDraft = match
      ? ({
          ...row.draft,
          ...applyTransactionRuleMatch(
            {
              type: row.draft.type,
              amount: row.draft.amount,
              note: row.draft.note,
              walletId: row.draft.walletId,
              categoryId: row.draft.categoryId,
            },
            match,
          ),
        } as TransactionCsvImportDraft)
      : row.draft;

    const changed = Boolean(
      match &&
        (nextDraft.categoryId !== row.draft.categoryId ||
          nextDraft.walletId !== row.draft.walletId),
    );
    if (changed) ruleAppliedCount += 1;

    const fingerprint = buildTransactionCsvFingerprint(nextDraft);
    const duplicate =
      existingFingerprints.has(fingerprint) || fileFingerprints.has(fingerprint);
    fileFingerprints.add(fingerprint);

    return {
      ...row,
      draft: nextDraft,
      fingerprint,
      status: duplicate ? "duplicate" : "ready",
      appliedRuleId: changed ? match?.rule.id : undefined,
      appliedRuleName: changed ? match?.rule.name : undefined,
    };
  });

  return {
    rows,
    readyCount: rows.filter((row) => row.status === "ready").length,
    duplicateCount: rows.filter((row) => row.status === "duplicate").length,
    errorCount: rows.filter((row) => row.status === "error").length,
    fatalError: null,
    ruleAppliedCount,
  };
}
function csvEscape(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function serializeTransactionsCsv(input: {
  transactions: Transaction[];
  categoryNameById: ReadonlyMap<string, string>;
  walletNameById: ReadonlyMap<string, string>;
}) {
  const rows = [
    ["Ngày", "Loại", "Ghi chú", "Danh mục", "Ví", "Số tiền"],
    ...input.transactions.map((transaction) => {
      const category = input.categoryNameById.get(transaction.categoryId) ?? "";
      const wallet = input.walletNameById.get(transaction.walletId) ?? "";
      const destinationWallet = transaction.transferToWalletId
        ? (input.walletNameById.get(transaction.transferToWalletId) ?? "")
        : "";
      return [
        transaction.date,
        transaction.type === "income"
          ? "Thu"
          : transaction.type === "transfer"
            ? "Chuyển"
            : "Chi",
        transaction.note,
        category,
        transaction.type === "transfer" && destinationWallet
          ? `${wallet} -> ${destinationWallet}`
          : wallet,
        String(transaction.amount),
      ];
    }),
  ];

  return `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}`;
}

export function materializeTransactionCsvImportRows(
  preview: TransactionCsvImportPreview,
  idFactory: () => string,
): Array<{ rowNumber: number; transaction: Transaction }> {
  return preview.rows
    .filter(
      (row): row is TransactionCsvImportPreviewRow & { draft: TransactionCsvImportDraft } =>
        row.status === "ready" && row.draft !== null,
    )
    .map((row) => ({
      rowNumber: row.rowNumber,
      transaction: {
        ...row.draft,
        id: idFactory(),
      } as Transaction,
    }));
}
