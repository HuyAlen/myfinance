import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/src/lib/supabase", () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: mockFrom,
  },
}));

const { addBudget, deleteBudget, updateBudget } = await import("./financeStorage");

const AUTH_SESSION = { data: { session: { user: { id: "user-1" } } } };
const BUDGET = {
  id: "budget-food-2026-10",
  categoryId: "cat-food",
  month: "2026-10",
  limitAmount: 5_000_000,
  rolloverAmount: 750_000,
  warningThreshold: 80,
  criticalThreshold: 95,
};
const UPDATE_INTEGRITY_ERROR =
  "Không thể xác nhận cập nhật ngân sách. Vui lòng tải lại và thử lại.";
const DELETE_INTEGRITY_ERROR =
  "Không thể xác nhận xóa ngân sách. Vui lòng tải lại và thử lại.";
const DUPLICATE_ERROR =
  "Danh mục này đã có ngân sách trong tháng đã chọn.";

type MutationResult = { data: unknown; error: unknown };

function makeMutationQuery(result: MutationResult) {
  const thenable = Promise.resolve(result);
  const chain: {
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    then: typeof thenable.then;
    catch: typeof thenable.catch;
  } = {} as never;

  chain.update = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = thenable.then.bind(thenable);
  chain.catch = thenable.catch.bind(thenable);
  return chain;
}

beforeEach(() => {
  mockGetSession.mockReset().mockResolvedValue(AUTH_SESSION);
  mockFrom.mockReset();
});

describe("BUDGET-MUTATION-INTEGRITY-1 storage receipts", () => {
  it("updates only form-owned budget fields and requires the requested id receipt", async () => {
    const query = makeMutationQuery({ data: { id: BUDGET.id }, error: null });
    mockFrom.mockReturnValue(query);

    await expect(updateBudget(BUDGET)).resolves.toEqual({ error: null });

    expect(mockFrom).toHaveBeenCalledWith("budgets");
    expect(query.update).toHaveBeenCalledWith({
      categoryId: BUDGET.categoryId,
      month: BUDGET.month,
      limitAmount: BUDGET.limitAmount,
    });
    expect(query.update.mock.calls[0]?.[0]).not.toHaveProperty("rolloverAmount");
    expect(query.update.mock.calls[0]?.[0]).not.toHaveProperty("warningThreshold");
    expect(query.update.mock.calls[0]?.[0]).not.toHaveProperty("criticalThreshold");
    expect(query.update.mock.calls[0]?.[0]).not.toHaveProperty("user_id");
    expect(query.select).toHaveBeenCalledWith("id");
    expect(query.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("fails closed when update matches no budget row", async () => {
    const query = makeMutationQuery({ data: null, error: null });
    mockFrom.mockReturnValue(query);

    await expect(updateBudget(BUDGET)).resolves.toEqual({
      error: UPDATE_INTEGRITY_ERROR,
    });
  });

  it("fails closed when update returns a different budget id", async () => {
    const query = makeMutationQuery({
      data: { id: "budget-other" },
      error: null,
    });
    mockFrom.mockReturnValue(query);

    await expect(updateBudget(BUDGET)).resolves.toEqual({
      error: UPDATE_INTEGRITY_ERROR,
    });
  });

  it("maps a duplicate category-month update to a stable user-facing error", async () => {
    const query = makeMutationQuery({
      data: null,
      error: {
        code: "23505",
        message: "duplicate key value violates unique constraint",
      },
    });
    mockFrom.mockReturnValue(query);

    await expect(updateBudget(BUDGET)).resolves.toEqual({
      error: DUPLICATE_ERROR,
    });
  });

  it("maps a duplicate category-month insert to the same stable user-facing error", async () => {
    const insert = vi.fn().mockResolvedValue({
      error: {
        code: "23505",
        message: "duplicate key value violates unique constraint",
      },
    });
    mockFrom.mockReturnValue({ insert });

    await expect(addBudget(BUDGET)).resolves.toEqual({
      error: DUPLICATE_ERROR,
    });
  });

  it("accepts delete success only after Supabase returns the requested budget id", async () => {
    const query = makeMutationQuery({ data: { id: BUDGET.id }, error: null });
    mockFrom.mockReturnValue(query);

    await expect(deleteBudget(BUDGET.id)).resolves.toEqual({ error: null });

    expect(mockFrom).toHaveBeenCalledWith("budgets");
    expect(query.delete).toHaveBeenCalledTimes(1);
    expect(query.select).toHaveBeenCalledWith("id");
    expect(query.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("fails closed when delete matches no budget row", async () => {
    const query = makeMutationQuery({ data: null, error: null });
    mockFrom.mockReturnValue(query);

    await expect(deleteBudget(BUDGET.id)).resolves.toEqual({
      error: DELETE_INTEGRITY_ERROR,
    });
  });

  it("fails closed when delete returns a different budget id", async () => {
    const query = makeMutationQuery({
      data: { id: "budget-other" },
      error: null,
    });
    mockFrom.mockReturnValue(query);

    await expect(deleteBudget(BUDGET.id)).resolves.toEqual({
      error: DELETE_INTEGRITY_ERROR,
    });
  });
});
