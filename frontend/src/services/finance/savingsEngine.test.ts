import { beforeEach, describe, expect, it, vi } from "vitest";

// financeStorage.ts imports the real `@/src/lib/supabase` singleton, which
// throws at module load time if NEXT_PUBLIC_SUPABASE_URL/ANON_KEY aren't
// set — never true in this test environment. Mocking the module (hoisted
// above all imports by Vitest) avoids ever touching the real client.
const mockGetSession = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/src/lib/supabase", () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    rpc: mockRpc,
  },
}));

const { createSavingAccount, createSavingMovement, deleteSavingAccount } =
  await import("./financeStorage");
const { calculateNetWorth } = await import("./financeCalculations");

const AUTH_SESSION = { data: { session: { user: { id: "user-1" } } } };

function wallet(balance: number) {
  return { id: "wallet-1", name: "Wallet", type: "cash" as const, balance };
}

/**
 * NOTE ON TEST LEVELS — what this file proves and what it does not.
 *
 * These are JS-layer unit tests: they prove createSavingAccount/
 * createSavingMovement build the correct RPC name + params from their
 * inputs, and correctly map the RPC's success/error response into the
 * function's return contract (including the MFS0x -> Vietnamese message
 * mapping). They run against a mocked `supabase.rpc`, not a real Postgres
 * instance.
 *
 * They do NOT and cannot prove that
 * supabase/finance-engine-3-savings-atomic.sql is itself transactionally
 * atomic (row locking, rollback-on-error, concurrent-safety) — that
 * requires a real database and is outside what Vitest can exercise in this
 * environment. That SQL-level behavior is reviewed by inspection (see
 * INTEGRATION-1.2's final report) and should additionally be verified with
 * a real Supabase project (staging) before this migration ships.
 */
describe("createSavingAccount (JS-layer contract)", () => {
  beforeEach(() => {
    mockGetSession.mockReset().mockResolvedValue(AUTH_SESSION);
    mockRpc.mockReset();
  });

  it("calls the create_saving_account RPC with the expected params", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          saving: { id: "saving-1", name: "Quỹ", type: "savings_account", balance: 100 },
          wallet: { id: "wallet-1", name: "Wallet", type: "cash", balance: 900 },
          saving_transaction: {
            id: "stx-1",
            saving_id: "saving-1",
            type: "deposit",
            amount: 100,
            wallet_id: "wallet-1",
            transaction_date: "2026-01-01",
            note: "Số dư ban đầu khi tạo khoản tiết kiệm",
          },
        },
      ],
      error: null,
    });

    const result = await createSavingAccount({
      id: "saving-1",
      name: "Quỹ",
      type: "savings_account",
      balance: 100,
      walletId: "wallet-1",
      savingTransactionId: "stx-1",
      transactionDate: "2026-01-01",
    });

    expect(mockRpc).toHaveBeenCalledWith("create_saving_account", {
      p_saving_id: "saving-1",
      p_name: "Quỹ",
      p_type: "savings_account",
      p_balance: 100,
      p_wallet_id: "wallet-1",
      p_saving_transaction_id: "stx-1",
      p_transaction_date: "2026-01-01",
      p_interest_rate: null,
      p_maturity_date: null,
      p_notes: null,
    });
    expect(result.error).toBeNull();
    expect(result.data?.saving.balance).toBe(100);
    expect(result.data?.wallet.balance).toBe(900);
  });

  it("maps MFS05 (insufficient wallet balance) to a Vietnamese error and returns no data", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "MFS05", message: "Insufficient wallet balance" },
    });

    const result = await createSavingAccount({
      id: "saving-1",
      name: "Quỹ",
      type: "savings_account",
      balance: 1_000_000,
      walletId: "wallet-1",
      savingTransactionId: "stx-1",
      transactionDate: "2026-01-01",
    });

    expect(result.data).toBeNull();
    expect(result.error).toMatch(/không đủ/);
  });

  it("returns an auth error without calling the RPC when there is no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const result = await createSavingAccount({
      id: "saving-1",
      name: "Quỹ",
      type: "savings_account",
      balance: 100,
      walletId: "wallet-1",
      savingTransactionId: "stx-1",
      transactionDate: "2026-01-01",
    });

    expect(mockRpc).not.toHaveBeenCalled();
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });
});

describe("createSavingMovement (JS-layer contract)", () => {
  beforeEach(() => {
    mockGetSession.mockReset().mockResolvedValue(AUTH_SESSION);
    mockRpc.mockReset();
  });

  it("calls the create_saving_movement RPC with the expected params for a deposit", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          saving: { id: "saving-1", balance: 150 },
          wallet: { id: "wallet-1", name: "Wallet", type: "cash", balance: 850 },
          saving_transaction: {
            id: "stx-2",
            saving_id: "saving-1",
            type: "deposit",
            amount: 50,
            wallet_id: "wallet-1",
            transaction_date: "2026-01-02",
            note: "Nạp thêm",
          },
        },
      ],
      error: null,
    });

    const result = await createSavingMovement({
      savingId: "saving-1",
      walletId: "wallet-1",
      type: "deposit",
      amount: 50,
      note: "Nạp thêm",
      transactionDate: "2026-01-02",
      savingTransactionId: "stx-2",
      financeTransactionId: "ftx-1",
    });

    expect(mockRpc).toHaveBeenCalledWith("create_saving_movement", {
      p_saving_id: "saving-1",
      p_wallet_id: "wallet-1",
      p_type: "deposit",
      p_amount: 50,
      p_note: "Nạp thêm",
      p_transaction_date: "2026-01-02",
      p_saving_transaction_id: "stx-2",
      p_finance_transaction_id: "ftx-1",
    });
    expect(result.data?.saving.balance).toBe(150);
    expect(result.data?.wallet.balance).toBe(850);
  });

  it("maps MFS02 (insufficient savings balance) to a Vietnamese error", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "MFS02", message: "Insufficient savings balance" },
    });

    const result = await createSavingMovement({
      savingId: "saving-1",
      walletId: "wallet-1",
      type: "withdraw",
      amount: 999,
      note: "Rút tiền",
      transactionDate: "2026-01-02",
      savingTransactionId: "stx-3",
      financeTransactionId: "ftx-2",
    });

    expect(result.data).toBeNull();
    expect(result.error).toMatch(/Số dư tiết kiệm không đủ/);
  });

  it("maps a nested MFE05 (insufficient wallet balance, from create_finance_transaction) to a Vietnamese error", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "MFE05", message: "Insufficient wallet balance" },
    });

    const result = await createSavingMovement({
      savingId: "saving-1",
      walletId: "wallet-1",
      type: "deposit",
      amount: 999,
      note: "Nạp thêm",
      transactionDate: "2026-01-02",
      savingTransactionId: "stx-4",
      financeTransactionId: "ftx-3",
    });

    expect(result.data).toBeNull();
    expect(result.error).toMatch(/không đủ/);
  });
});

describe("deleteSavingAccount (JS-layer contract)", () => {
  beforeEach(() => {
    mockGetSession.mockReset().mockResolvedValue(AUTH_SESSION);
    mockRpc.mockReset();
  });

  it("calls the delete_saving_account RPC with the expected params on a zero-balance account", async () => {
    mockRpc.mockResolvedValue({ data: "saving-1", error: null });

    const result = await deleteSavingAccount("saving-1");

    expect(mockRpc).toHaveBeenCalledWith("delete_saving_account", {
      p_saving_id: "saving-1",
    });
    expect(result.error).toBeNull();
  });

  it("maps MFS06 (balance not zero) to a Vietnamese error — the server-authoritative rejection for a funded account", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "MFS06", message: "Saving balance must be zero" },
    });

    const result = await deleteSavingAccount("saving-1");

    expect(result.error).toMatch(/vẫn còn số dư/);
  });

  it("maps MFS03 (not found / not owned) to a Vietnamese error — an unauthorized/not-owned saving id behaves as not found, never as a silent success", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "MFS03", message: "Saving account not found" },
    });

    const result = await deleteSavingAccount("someone-elses-saving");

    expect(result.error).toMatch(/Không tìm thấy/);
  });

  it("returns an auth error without calling the RPC when there is no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const result = await deleteSavingAccount("saving-1");

    expect(mockRpc).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });
});

/**
 * The live "savings"/"saving_transactions" primary keys are uuid columns
 * (confirmed against the real database — see finance-engine-3-savings-
 * atomic.sql's header), and SavingsPage.tsx generates saving/saving-
 * transaction ids via crypto.randomUUID() (confirmed by inspection, not
 * changed by this patch — it was already correct). These tests use real
 * crypto.randomUUID() values, not arbitrary placeholder strings like
 * "saving-1" used elsewhere in this file, to prove the JS wrapper layer
 * passes such ids through to the RPC call completely unchanged (no
 * truncation, reformatting, or validation that could corrupt a real UUID).
 */
describe("UUID id contract (real crypto.randomUUID() shapes)", () => {
  beforeEach(() => {
    mockGetSession.mockReset().mockResolvedValue(AUTH_SESSION);
    mockRpc.mockReset();
  });

  it("createSavingAccount passes real UUIDs through unchanged for p_saving_id/p_saving_transaction_id", async () => {
    const savingId = crypto.randomUUID();
    const savingTransactionId = crypto.randomUUID();
    mockRpc.mockResolvedValue({
      data: [
        {
          saving: { id: savingId, balance: 100 },
          wallet: { id: "wallet-1", name: "Wallet", type: "cash", balance: 900 },
          saving_transaction: { id: savingTransactionId, saving_id: savingId },
        },
      ],
      error: null,
    });

    await createSavingAccount({
      id: savingId,
      name: "Quỹ",
      type: "savings_account",
      balance: 100,
      walletId: "wallet-1",
      savingTransactionId,
      transactionDate: "2026-01-01",
    });

    const params = mockRpc.mock.calls[0][1];
    expect(params.p_saving_id).toBe(savingId);
    expect(params.p_saving_transaction_id).toBe(savingTransactionId);
  });

  it("createSavingMovement passes real UUIDs through unchanged for p_saving_id/p_saving_transaction_id (p_finance_transaction_id stays the project's existing text-id convention)", async () => {
    const savingId = crypto.randomUUID();
    const savingTransactionId = crypto.randomUUID();
    const financeTransactionId = crypto.randomUUID();
    mockRpc.mockResolvedValue({
      data: [
        {
          saving: { id: savingId, balance: 150 },
          wallet: { id: "wallet-1", name: "Wallet", type: "cash", balance: 850 },
          saving_transaction: { id: savingTransactionId, saving_id: savingId },
        },
      ],
      error: null,
    });

    await createSavingMovement({
      savingId,
      walletId: "wallet-1",
      type: "deposit",
      amount: 50,
      note: "Nạp thêm",
      transactionDate: "2026-01-02",
      savingTransactionId,
      financeTransactionId,
    });

    const params = mockRpc.mock.calls[0][1];
    expect(params.p_saving_id).toBe(savingId);
    expect(params.p_saving_transaction_id).toBe(savingTransactionId);
    expect(params.p_finance_transaction_id).toBe(financeTransactionId);
  });

  it("deleteSavingAccount passes a real UUID through unchanged for p_saving_id", async () => {
    const savingId = crypto.randomUUID();
    mockRpc.mockResolvedValue({ data: savingId, error: null });

    await deleteSavingAccount(savingId);

    expect(mockRpc).toHaveBeenCalledWith("delete_saving_account", {
      p_saving_id: savingId,
    });
  });
});

/**
 * IMPORTANT SCOPE NOTE: every test above proves the JS service-layer
 * contract only (correct RPC name/params, correct error-code -> message
 * mapping). None of them exercise a real PostgreSQL instance, so none of
 * them prove:
 *   - that delete_saving_account's FOR UPDATE lock + balance re-check
 *     actually runs inside one atomic transaction,
 *   - that a rejected delete leaves the saving row and its
 *     saving_transactions history fully intact (no partial delete),
 *   - or that create_saving_account/create_saving_movement's nested call
 *     into create_finance_transaction is genuinely atomic against a real
 *     database.
 * Those require a real (at minimum staging) Supabase project — see
 * INTEGRATION-1.2's pre-commit verification report for the schema
 * verification script to run there, and for which of these claims remain
 * unverified in this sandboxed environment.
 */

describe("Test I — Net Worth transfer invariant for Wallet <-> Savings", () => {
  it("a pure wallet-to-savings transfer leaves canonical net worth unchanged", () => {
    const before = calculateNetWorth({
      wallets: [wallet(100)],
      savings: [],
      investments: [],
      debts: [],
    });

    // Deposit 30: wallet -30, savings +30.
    const afterDeposit = calculateNetWorth({
      wallets: [wallet(70)],
      savings: [{ id: "s1", name: "Saving", type: "savings_account", balance: 30 }],
      investments: [],
      debts: [],
    });

    expect(afterDeposit.netWorth).toBe(before.netWorth);
    expect(afterDeposit.netWorth).toBe(100);

    // Withdraw 20: wallet +20, savings -20.
    const afterWithdrawal = calculateNetWorth({
      wallets: [wallet(90)],
      savings: [{ id: "s1", name: "Saving", type: "savings_account", balance: 10 }],
      investments: [],
      debts: [],
    });

    expect(afterWithdrawal.netWorth).toBe(before.netWorth);
    expect(afterWithdrawal.netWorth).toBe(100);
  });
});
