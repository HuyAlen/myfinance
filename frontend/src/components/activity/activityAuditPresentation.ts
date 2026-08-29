import type { Json } from "@/src/lib/database.types";
import type {
  AuditAction,
  AuditEntityType,
  FinanceAuditEvent,
} from "@/src/services/finance/auditService";

export type AuditRecord = Record<string, Json | undefined>;

export type AuditReferenceLabels = {
  wallets: Record<string, string>;
  categories: Record<string, string>;
  savings: Record<string, string>;
  forexAccounts: Record<string, string>;
};

export type AuditFieldRow = {
  key: string;
  label: string;
  before: Json | undefined;
  after: Json | undefined;
  beforeText: string;
  afterText: string;
};

export type AuditDetailMode =
  | "changes"
  | "created"
  | "deleted"
  | "snapshot"
  | "empty";

export type AuditPresentation = {
  action: AuditAction;
  mode: AuditDetailMode;
  heading: string;
  rows: AuditFieldRow[];
  countText: string;
  primaryText: string;
  comparisonAvailable: boolean;
  incompleteComparison: boolean;
};

export const EMPTY_AUDIT_REFERENCE_LABELS: AuditReferenceLabels = {
  wallets: {},
  categories: {},
  savings: {},
  forexAccounts: {},
};

const HIDDEN_FIELDS = new Set([
  "id",
  "user_id",
  "userId",
  "household_id",
  "finance_owner_user_id",
  "created_at",
  "createdAt",
  "updated_at",
  "updatedAt",
]);

const FIELD_PRIORITY = [
  "name",
  "type",
  "amount",
  "balance",
  "totalamount",
  "remainingamount",
  "minimumpayment",
  "targetamount",
  "currentamount",
  "limitamount",
  "rolloveramount",
  "investedamount",
  "currentvalue",
  "averagecost",
  "currentprice",
  "current_equity",
  "date",
  "transaction_date",
  "month",
  "note",
  "notes",
  "categoryid",
  "category_id",
  "walletid",
  "wallet_id",
  "transfertowalletid",
  "transfer_to_wallet_id",
  "source_type",
  "destination_type",
];

const MONEY_FIELDS = new Set([
  "amount",
  "balance",
  "totalamount",
  "remainingamount",
  "targetamount",
  "currentamount",
  "limitamount",
  "rolloveramount",
  "investedamount",
  "currentvalue",
  "averagecost",
  "currentprice",
  "currentequity",
  "fee",
  "transferfee",
  "defaultamount",
  "minimumpayment",
]);

export const FIELD_LABELS: Record<string, string> = {
  name: "Tên",
  type: "Loại",
  amount: "Số tiền",
  balance: "Số dư",
  currency: "Tiền tệ",
  totalamount: "Tổng nợ",
  remainingamount: "Nợ còn lại",
  interestrate: "Lãi suất",
  minimumpayment: "Thanh toán tối thiểu",
  duedate: "Ngày đến hạn",
  loantermmonths: "Kỳ hạn",
  targetamount: "Mục tiêu",
  currentamount: "Đã tích lũy",
  categoryid: "Danh mục",
  category_id: "Danh mục",
  walletid: "Ví",
  wallet_id: "Ví",
  transfertowalletid: "Ví nhận",
  transfer_to_wallet_id: "Ví nhận",
  defaultwalletid: "Ví mặc định",
  default_wallet_id: "Ví mặc định",
  isrecurring: "Định kỳ",
  is_recurring: "Định kỳ",
  nextrundate: "Lần chạy tiếp",
  next_run_date: "Lần chạy tiếp",
  limitamount: "Hạn mức",
  rolloveramount: "Chuyển dư",
  warningthreshold: "Cảnh báo",
  criticalthreshold: "Nguy cấp",
  investedamount: "Vốn đầu tư",
  currentvalue: "Giá trị hiện tại",
  purchasedate: "Ngày mua",
  averagecost: "Giá vốn TB",
  currentprice: "Giá hiện tại",
  totalAmount: "Tổng nợ",
  remainingAmount: "Nợ còn lại",
  interestRate: "Lãi suất",
  minimumPayment: "Thanh toán tối thiểu",
  dueDate: "Ngày đến hạn",
  loanTermMonths: "Kỳ hạn",
  targetAmount: "Mục tiêu",
  currentAmount: "Đã tích lũy",
  categoryId: "Danh mục",
  walletId: "Ví",
  transferToWalletId: "Ví nhận",
  defaultWalletId: "Ví mặc định",
  date: "Ngày",
  month: "Tháng",
  limitAmount: "Hạn mức",
  rolloverAmount: "Chuyển dư",
  warningThreshold: "Cảnh báo",
  criticalThreshold: "Nguy cấp",
  investedAmount: "Vốn đầu tư",
  currentValue: "Giá trị hiện tại",
  current_equity: "Equity",
  quantity: "Số lượng",
  averageCost: "Giá vốn TB",
  currentPrice: "Giá hiện tại",
  saving_id: "Khoản tiết kiệm",
  forex_account_id: "Tài khoản Forex",
  interest_rate: "Lãi suất",
  maturity_date: "Ngày đáo hạn",
  transaction_date: "Ngày giao dịch",
  transaction_time: "Giờ giao dịch",
  note: "Ghi chú",
  notes: "Ghi chú",
  status: "Trạng thái",
  broker: "Broker",
  account_number: "Số tài khoản",
  isRecurring: "Định kỳ",
  recurrence: "Chu kỳ",
  nextRunDate: "Lần chạy tiếp",
  transfer_fee: "Phí chuyển",
  exchange_rate: "Tỷ giá",
  transfer_reference: "Tham chiếu chuyển",
  transfer_reference_type: "Loại chuyển",
  transferReferenceType: "Loại chuyển",
  source_type: "Nguồn",
  sourceType: "Nguồn",
  destination_type: "Đích",
  destinationType: "Đích",
  planning_group: "Nhóm kế hoạch",
  financial_group: "Nhóm tài chính",
  default_amount: "Số tiền mặc định",
  saving_category_ids: "Liên kết mục tiêu",
  opened_at: "Ngày mở",
};

const VALUE_LABELS_BY_FIELD: Record<string, Record<string, string>> = {
  type: {
    income: "Thu nhập",
    expense: "Chi tiêu",
    transfer: "Chuyển tiền",
    saving: "Tiết kiệm",
    investment: "Đầu tư",
    cash: "Tiền mặt",
    bank: "Ngân hàng",
    ewallet: "Ví điện tử",
    stock: "Cổ phiếu",
    crypto: "Crypto",
    fund: "Quỹ",
    gold: "Vàng",
    other: "Khác",
    deposit: "Nạp",
    withdrawal: "Rút",
    savings_account: "Tài khoản tiết kiệm",
    term_deposit: "Tiền gửi có kỳ hạn",
    certificate: "Chứng chỉ tiền gửi",
    emergency_fund: "Quỹ khẩn cấp",
  },
  source_type: {
    wallet: "Ví tiền",
    saving: "Tiết kiệm",
    external: "Bên ngoài",
    forex: "Forex",
  },
  sourceType: {
    wallet: "Ví tiền",
    saving: "Tiết kiệm",
    external: "Bên ngoài",
    forex: "Forex",
  },
  destination_type: {
    wallet: "Ví tiền",
    saving: "Tiết kiệm",
    external: "Bên ngoài",
    forex: "Forex",
  },
  destinationType: {
    wallet: "Ví tiền",
    saving: "Tiết kiệm",
    external: "Bên ngoài",
    forex: "Forex",
  },
  transfer_reference_type: {
    wallet: "Chuyển giữa ví",
    saving: "Tiết kiệm",
    forex: "Forex",
  },
  transferReferenceType: {
    wallet: "Chuyển giữa ví",
    saving: "Tiết kiệm",
    forex: "Forex",
  },
  status: {
    active: "Đang hoạt động",
    inactive: "Không hoạt động",
    archived: "Đã lưu trữ",
    open: "Đang mở",
    closed: "Đã đóng",
  },
  recurrence: {
    daily: "Hằng ngày",
    weekly: "Hằng tuần",
    monthly: "Hằng tháng",
    yearly: "Hằng năm",
  },
  planning_group: {
    income: "Thu nhập",
    fixed: "Cố định",
    variable: "Linh hoạt",
    saving: "Tiết kiệm",
    investment: "Đầu tư",
  },
  financial_group: {
    income: "Thu nhập",
    needs: "Nhu cầu",
    wants: "Mong muốn",
    saving: "Tiết kiệm",
  },
};

function normalizeFieldKey(key: string) {
  return key.replaceAll("_", "").toLowerCase();
}

function isRecord(value: Json | null): value is AuditRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function auditAction(value: string): AuditAction {
  return value === "insert" || value === "delete" ? value : "update";
}

function comparableJson(value: Json | undefined): unknown {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map((item) => comparableJson(item));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, comparableJson(item)]),
    );
  }
  return value;
}

function valuesEqual(left: Json | undefined, right: Json | undefined) {
  return JSON.stringify(comparableJson(left)) === JSON.stringify(comparableJson(right));
}

function sortFields(keys: string[]) {
  return [...keys].sort((left, right) => {
    const leftNormalized = normalizeFieldKey(left);
    const rightNormalized = normalizeFieldKey(right);
    const leftPriority = FIELD_PRIORITY.findIndex(
      (key) => normalizeFieldKey(key) === leftNormalized,
    );
    const rightPriority = FIELD_PRIORITY.findIndex(
      (key) => normalizeFieldKey(key) === rightNormalized,
    );
    if (leftPriority >= 0 || rightPriority >= 0) {
      if (leftPriority < 0) return 1;
      if (rightPriority < 0) return -1;
      return leftPriority - rightPriority;
    }
    return left.localeCompare(right, "vi");
  });
}

function visibleKeys(record: AuditRecord) {
  return sortFields(
    Object.keys(record).filter((key) => !HIDDEN_FIELDS.has(key)),
  );
}

function formatVND(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function abbreviateId(value: string) {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function resolveReference(
  key: string,
  value: string,
  references: AuditReferenceLabels,
): string | null {
  const normalized = normalizeFieldKey(key);
  if (
    normalized === "categoryid"
  ) {
    return references.categories[value] ?? `Danh mục (${abbreviateId(value)})`;
  }
  if (
    normalized === "walletid" ||
    normalized === "transfertowalletid" ||
    normalized === "defaultwalletid"
  ) {
    return references.wallets[value] ?? `Ví (${abbreviateId(value)})`;
  }
  if (normalized === "savingid") {
    return references.savings[value] ?? `Khoản tiết kiệm (${abbreviateId(value)})`;
  }
  if (normalized === "forexaccountid") {
    return references.forexAccounts[value] ?? `Tài khoản Forex (${abbreviateId(value)})`;
  }
  return null;
}

function resolveLinkedGoalValue(
  value: string,
  references: AuditReferenceLabels,
): string {
  if (value.startsWith("saving:")) {
    const id = value.slice("saving:".length);
    return references.savings[id] ?? `Khoản tiết kiệm (${abbreviateId(id)})`;
  }
  if (value.startsWith("category:")) {
    const id = value.slice("category:".length);
    return references.categories[id] ?? `Danh mục (${abbreviateId(id)})`;
  }
  return value;
}

export function formatAuditValue(
  key: string,
  value: Json | undefined,
  references: AuditReferenceLabels = EMPTY_AUDIT_REFERENCE_LABELS,
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Có" : "Không";

  if (typeof value === "number") {
    return MONEY_FIELDS.has(normalizeFieldKey(key))
      ? formatVND(value)
      : new Intl.NumberFormat("vi-VN").format(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (normalizeFieldKey(key) === "savingcategoryids") {
      return value
        .map((item) =>
          typeof item === "string"
            ? resolveLinkedGoalValue(item, references)
            : String(item ?? ""),
        )
        .join(", ");
    }
    return value.map((item) => String(item ?? "")).join(", ");
  }

  if (typeof value === "object") return JSON.stringify(value) ?? "—";

  const reference = resolveReference(key, value, references);
  if (reference) return reference;

  const fieldLabels = VALUE_LABELS_BY_FIELD[key] ?? VALUE_LABELS_BY_FIELD[key.toLowerCase()];
  const enumLabel = fieldLabels?.[value.toLowerCase()];
  if (enumLabel) return enumLabel;

  if (
    (key.toLowerCase().includes("date") || key.endsWith("_at")) &&
    /^\d{4}-\d{2}-\d{2}/.test(value)
  ) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(parsed);
    }
  }

  return value;
}

function fieldLabel(key: string) {
  return FIELD_LABELS[key] ?? FIELD_LABELS[normalizeFieldKey(key)] ?? key;
}

function makeRow(
  key: string,
  before: Json | undefined,
  after: Json | undefined,
  references: AuditReferenceLabels,
): AuditFieldRow {
  return {
    key,
    label: fieldLabel(key),
    before,
    after,
    beforeText: formatAuditValue(key, before, references),
    afterText: formatAuditValue(key, after, references),
  };
}

function getChangedRows(
  before: AuditRecord,
  after: AuditRecord,
  references: AuditReferenceLabels,
) {
  const keys = sortFields(
    Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(
      (key) => !HIDDEN_FIELDS.has(key),
    ),
  );
  return keys
    .filter((key) => !valuesEqual(before[key], after[key]))
    .map((key) => makeRow(key, before[key], after[key], references));
}

function getSnapshotRows(
  snapshot: AuditRecord,
  side: "before" | "after",
  references: AuditReferenceLabels,
) {
  return visibleKeys(snapshot).map((key) =>
    makeRow(
      key,
      side === "before" ? snapshot[key] : undefined,
      side === "after" ? snapshot[key] : undefined,
      references,
    ),
  );
}

function countText(mode: AuditDetailMode, count: number) {
  if (mode === "changes") return `${count} trường thay đổi`;
  if (mode === "created" || mode === "deleted" || mode === "snapshot") {
    return `${count} trường dữ liệu`;
  }
  return "Không có dữ liệu hiển thị";
}

function primaryText(
  mode: AuditDetailMode,
  rows: AuditFieldRow[],
): string {
  const first = rows[0];
  if (!first) {
    return mode === "changes"
      ? "Không có thay đổi nghiệp vụ hiển thị"
      : "Không có dữ liệu nghiệp vụ hiển thị";
  }
  if (mode === "created") return `${first.label}: ${first.afterText}`;
  if (mode === "deleted") return `${first.label}: ${first.beforeText}`;
  if (mode === "snapshot") {
    return `Audit cũ: ${first.label}: ${first.afterText !== "—" ? first.afterText : first.beforeText}`;
  }
  return `${first.label}: ${first.beforeText} → ${first.afterText}`;
}

export function buildAuditPresentation(
  event: FinanceAuditEvent,
  references: AuditReferenceLabels = EMPTY_AUDIT_REFERENCE_LABELS,
): AuditPresentation {
  const action = auditAction(event.action);
  const before: AuditRecord | null = isRecord(event.before_data)
    ? event.before_data
    : null;
  const after: AuditRecord | null = isRecord(event.after_data)
    ? event.after_data
    : null;

  if (action === "insert") {
    const rows = after ? getSnapshotRows(after, "after", references) : [];
    const mode: AuditDetailMode = rows.length > 0 ? "created" : "empty";
    return {
      action,
      mode,
      heading: "Dữ liệu đã tạo",
      rows,
      countText: countText(mode, rows.length),
      primaryText: primaryText(mode, rows),
      comparisonAvailable: false,
      incompleteComparison: false,
    };
  }

  if (action === "delete") {
    const rows = before ? getSnapshotRows(before, "before", references) : [];
    const mode: AuditDetailMode = rows.length > 0 ? "deleted" : "empty";
    return {
      action,
      mode,
      heading: "Dữ liệu đã xóa",
      rows,
      countText: countText(mode, rows.length),
      primaryText: primaryText(mode, rows),
      comparisonAvailable: false,
      incompleteComparison: false,
    };
  }

  if (before && after) {
    const rows = getChangedRows(before, after, references);
    return {
      action,
      mode: "changes",
      heading: "Trước → Sau",
      rows,
      countText: countText("changes", rows.length),
      primaryText: primaryText("changes", rows),
      comparisonAvailable: true,
      incompleteComparison: false,
    };
  }

  const snapshot = after ?? before;
  const side = after ? "after" : "before";
  const rows = snapshot
    ? getSnapshotRows(snapshot, side, references)
    : [];
  const mode: AuditDetailMode = rows.length > 0 ? "snapshot" : "empty";
  return {
    action,
    mode,
    heading: "Dữ liệu ghi nhận",
    rows,
    countText: countText(mode, rows.length),
    primaryText:
      rows.length > 0
        ? "Audit cũ không đủ snapshot trước/sau để xác định thay đổi"
        : "Audit cũ không có dữ liệu nghiệp vụ hiển thị",
    comparisonAvailable: false,
    incompleteComparison: true,
  };
}

export function getEntityName(
  event: FinanceAuditEvent,
  entityLabel: string,
): string {
  const row = isRecord(event.after_data)
    ? event.after_data
    : isRecord(event.before_data)
      ? event.before_data
      : {};
  for (const key of ["name", "note", "notes"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  if (typeof row.amount === "number") {
    return `${entityLabel} ${formatVND(row.amount)}`;
  }
  if (typeof row.month === "string" && row.month) return row.month;
  return event.entity_id ? `#${event.entity_id.slice(0, 8)}` : entityLabel;
}

export function createAuditReferenceLabels(input: {
  wallets?: Array<{ id: string; name: string }>;
  categories?: Array<{ id: string; name: string }>;
  savings?: Array<{ id: string; name: string }>;
  forexAccounts?: Array<{ id: string; name: string }>;
}): AuditReferenceLabels {
  const toRecord = (items: Array<{ id: string; name: string }> | undefined) =>
    Object.fromEntries((items ?? []).map((item) => [item.id, item.name]));

  return {
    wallets: toRecord(input.wallets),
    categories: toRecord(input.categories),
    savings: toRecord(input.savings),
    forexAccounts: toRecord(input.forexAccounts),
  };
}

export function auditEntityType(value: string): AuditEntityType | null {
  const supported: readonly AuditEntityType[] = [
    "wallets",
    "categories",
    "transactions",
    "debts",
    "goals",
    "budgets",
    "investments",
    "savings",
    "saving_transactions",
    "forex_accounts",
    "forex_cash_transactions",
  ];
  return (supported as readonly string[]).includes(value)
    ? (value as AuditEntityType)
    : null;
}
