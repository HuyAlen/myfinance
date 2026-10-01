import { describe, expect, it } from "vitest";
import type { Category, Transaction, Wallet } from "@/src/types/finance";
import {
  buildTransactionCsvFingerprint,
  buildTransactionCsvImportPreview,
  materializeTransactionCsvImportRows,
  parseTransactionCsvAmount,
  parseTransactionCsvDate,
  serializeTransactionsCsv,
} from "@/src/lib/transactions/transactionCsvImport";

const wallets: Wallet[] = [
  { id: "wallet-main", name: "VCB Chính", type: "bank", balance: 10_000_000 },
  { id: "wallet-cash", name: "Tiền mặt", type: "cash", balance: 2_000_000 },
];

const categories: Category[] = [
  { id: "cat-salary", name: "Lương", type: "income", planningGroup: "income" },
  { id: "cat-food", name: "Ăn uống", type: "expense", planningGroup: "variable" },
  { id: "cat-rent", name: "Nhà ở", type: "expense", planningGroup: "fixed" },
  { id: "cat-saving", name: "Tiết kiệm", type: "expense", planningGroup: "saving" },
];

function preview(csvText: string, existingTransactions: Transaction[] = []) {
  return buildTransactionCsvImportPreview({
    csvText,
    wallets,
    categories,
    existingTransactions,
  });
}

describe("TRANSACTION-CSV-IMPORT-1 parsing", () => {
  it("accepts canonical and Vietnamese display date/amount formats", () => {
    expect(parseTransactionCsvDate("2026-10-01")).toBe("2026-10-01");
    expect(parseTransactionCsvDate("01/10/2026")).toBe("2026-10-01");
    expect(parseTransactionCsvDate("31/02/2026")).toBeNull();

    expect(parseTransactionCsvAmount("1.250.000 ₫")).toBe(1_250_000);
    expect(parseTransactionCsvAmount("1,250,000 VND")).toBe(1_250_000);
    expect(parseTransactionCsvAmount("1250000")).toBe(1_250_000);
    expect(parseTransactionCsvAmount("-1000")).toBeNull();
    expect(parseTransactionCsvAmount("10.50")).toBeNull();
  });

  it("round-trips the app export format including commas, quotes and transfer wallet pairs", () => {
    const transactions: Transaction[] = [
      {
        id: "tx-1",
        type: "expense",
        amount: 125_000,
        categoryId: "cat-food",
        walletId: "wallet-main",
        note: 'Ăn trưa, gọi món "đặc biệt"',
        date: "2026-10-01",
      },
      {
        id: "tx-2",
        type: "transfer",
        amount: 500_000,
        categoryId: "",
        walletId: "wallet-main",
        transferToWalletId: "wallet-cash",
        note: "Rút tiền mặt",
        date: "2026-10-01",
      },
    ];

    const csv = serializeTransactionsCsv({
      transactions,
      categoryNameById: new Map(categories.map((item) => [item.id, item.name])),
      walletNameById: new Map(wallets.map((item) => [item.id, item.name])),
    });
    const result = preview(csv);

    expect(result.fatalError).toBeNull();
    expect(result.errorCount).toBe(0);
    expect(result.readyCount).toBe(2);
    expect(result.rows[0].draft?.note).toBe('Ăn trưa, gọi món "đặc biệt"');
    expect(result.rows[1].draft?.transferToWalletId).toBe("wallet-cash");
  });

  it("auto-detects semicolon delimiters and common English headers", () => {
    const csv = [
      "Date;Type;Description;Category;Wallet;Amount",
      "01/10/2026;Expense;Lunch;Ăn uống;VCB Chính;120000",
      "02/10/2026;Income;Salary;Lương;VCB Chính;5000000",
    ].join("\n");
    const result = preview(csv);

    expect(result.fatalError).toBeNull();
    expect(result.readyCount).toBe(2);
    expect(result.errorCount).toBe(0);
  });

  it("supports a separate destination-wallet column for transfers", () => {
    const csv = [
      "Ngày,Loại,Ghi chú,Danh mục,Ví,Ví nhận,Số tiền",
      "2026-10-01,Chuyển,Rút tiền,,VCB Chính,Tiền mặt,700000",
    ].join("\n");
    const result = preview(csv);

    expect(result.readyCount).toBe(1);
    expect(result.rows[0].draft?.walletId).toBe("wallet-main");
    expect(result.rows[0].draft?.transferToWalletId).toBe("wallet-cash");
  });
});

describe("TRANSACTION-CSV-IMPORT-1 validation and dedupe", () => {
  it("marks exact historical and in-file repeats as duplicates instead of ready", () => {
    const existing: Transaction = {
      id: "existing-1",
      type: "expense",
      amount: 100_000,
      categoryId: "cat-food",
      walletId: "wallet-main",
      note: "Ăn sáng",
      date: "2026-10-01",
    };
    const csv = [
      "Ngày,Loại,Ghi chú,Danh mục,Ví,Số tiền",
      "2026-10-01,Chi,Ăn sáng,Ăn uống,VCB Chính,100000",
      "2026-10-02,Chi,Ăn trưa,Ăn uống,VCB Chính,150000",
      "2026-10-02,Chi,Ăn trưa,Ăn uống,VCB Chính,150000",
    ].join("\n");

    const result = preview(csv, [existing]);
    expect(result.readyCount).toBe(1);
    expect(result.duplicateCount).toBe(2);
    expect(result.rows.map((row) => row.status)).toEqual([
      "duplicate",
      "ready",
      "duplicate",
    ]);
  });

  it("rejects missing entities, mismatched categories and planning-only categories", () => {
    const csv = [
      "Ngày,Loại,Ghi chú,Danh mục,Ví,Số tiền",
      "2026-10-01,Thu,Sai loại,Ăn uống,VCB Chính,100000",
      "2026-10-02,Chi,Không dùng nhóm tiết kiệm,Tiết kiệm,VCB Chính,100000",
      "2026-10-03,Chi,Không có ví,Ăn uống,Ví lạ,100000",
    ].join("\n");
    const result = preview(csv);

    expect(result.readyCount).toBe(0);
    expect(result.errorCount).toBe(3);
    expect(result.rows[0].errors.join(" ")).toContain("không phù hợp");
    expect(result.rows[1].errors.join(" ")).toContain("Tiết kiệm");
    expect(result.rows[2].errors.join(" ")).toContain("Không tìm thấy ví");
  });

  it("fails closed when required headers are missing or the row cap is exceeded", () => {
    const missingHeader = preview("Ngày,Loại,Ví,Số tiền\n2026-10-01,Chi,VCB Chính,1000");
    expect(missingHeader.fatalError).toContain("Danh mục");

    const header = "Ngày,Loại,Ghi chú,Danh mục,Ví,Số tiền";
    const rows = Array.from({ length: 3 }, (_, index) =>
      `2026-10-0${index + 1},Chi,Dòng ${index + 1},Ăn uống,VCB Chính,1000`,
    );
    const capped = buildTransactionCsvImportPreview({
      csvText: [header, ...rows].join("\n"),
      wallets,
      categories,
      existingTransactions: [],
      maxRows: 2,
    });
    expect(capped.fatalError).toContain("tối đa 2");
  });

  it("materializes only ready rows and generates ids at commit time", () => {
    const csv = [
      "Ngày,Loại,Ghi chú,Danh mục,Ví,Số tiền",
      "2026-10-01,Chi,Ăn sáng,Ăn uống,VCB Chính,100000",
      "2026-10-01,Chi,Ăn sáng,Ăn uống,VCB Chính,100000",
    ].join("\n");
    const result = preview(csv);
    let counter = 0;
    const materialized = materializeTransactionCsvImportRows(result, () =>
      `generated-${++counter}`,
    );

    expect(materialized).toHaveLength(1);
    expect(materialized[0].transaction.id).toBe("generated-1");
    expect(buildTransactionCsvFingerprint(materialized[0].transaction)).toBe(
      result.rows[0].fingerprint,
    );
  });
});
