import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/src/lib/supabase", () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    rpc: mockRpc,
  },
}));

const {
  acceptCurrentHouseholdInvite,
  getCachedFinanceOwnerUserId,
  getFinanceOwnerUserId,
  getHouseholdContext,
  invalidateFinanceScopeCache,
} = await import("./householdService");

const AUTH_USER_ID = "member-user";
const FINANCE_OWNER_ID = "owner-user";
const AUTH_SESSION = { data: { session: { user: { id: AUTH_USER_ID } } } };

const HOUSEHOLD_CONTEXT = {
  household: {
    id: "household-1",
    name: "Gia dinh",
    owner_user_id: FINANCE_OWNER_ID,
    created_at: "2026-08-28T00:00:00.000Z",
    updated_at: "2026-08-28T00:00:00.000Z",
  },
  role: "member",
  finance_owner_user_id: FINANCE_OWNER_ID,
  members: [
    {
      user_id: FINANCE_OWNER_ID,
      email: "owner@example.com",
      role: "owner",
      joined_at: "2026-08-28T00:00:00.000Z",
    },
    {
      user_id: AUTH_USER_ID,
      email: "member@example.com",
      role: "member",
      joined_at: "2026-08-28T00:01:00.000Z",
    },
  ],
  invites: [],
  pending_invite: null,
};

beforeEach(() => {
  invalidateFinanceScopeCache();
  mockGetSession.mockReset().mockResolvedValue(AUTH_SESSION);
  mockRpc.mockReset();
});

describe("HOUSEHOLD-IDENTITY-1 finance scope cache", () => {
  it("primes the stable finance-owner scope from household context and reuses it without another RPC", async () => {
    mockRpc.mockResolvedValue({ data: HOUSEHOLD_CONTEXT, error: null });

    const context = await getHouseholdContext();

    expect(context.financeOwnerUserId).toBe(FINANCE_OWNER_ID);
    expect(getCachedFinanceOwnerUserId(AUTH_USER_ID)).toBe(FINANCE_OWNER_ID);
    await expect(getFinanceOwnerUserId()).resolves.toBe(FINANCE_OWNER_ID);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("get_current_household_context");
  });

  it("rejects a stale household response when the authenticated account changes mid-load", async () => {
    mockGetSession
      .mockResolvedValueOnce(AUTH_SESSION)
      .mockResolvedValueOnce({
        data: { session: { user: { id: "other-user" } } },
      });
    mockRpc.mockResolvedValue({ data: HOUSEHOLD_CONTEXT, error: null });

    await expect(getHouseholdContext()).rejects.toThrow(/thay \u0111\u1ed5i/i);
    expect(getCachedFinanceOwnerUserId(AUTH_USER_ID)).toBeNull();
    expect(getCachedFinanceOwnerUserId("other-user")).toBeNull();
  });

  it("falls back to the dedicated scope RPC when no provider cache exists", async () => {
    mockRpc.mockResolvedValue({ data: FINANCE_OWNER_ID, error: null });

    await expect(getFinanceOwnerUserId()).resolves.toBe(FINANCE_OWNER_ID);
    expect(mockRpc).toHaveBeenCalledWith("get_finance_scope_owner_user_id");
    expect(getCachedFinanceOwnerUserId(AUTH_USER_ID)).toBe(FINANCE_OWNER_ID);
  });
});

describe("HOUSEHOLD-IDENTITY-1 invite acceptance", () => {
  it("maps the confirmed-email server guard instead of accepting an unverified identity", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "MFH10", message: "Confirmed email required" },
    });

    await expect(acceptCurrentHouseholdInvite()).rejects.toThrow(/x\u00e1c nh\u1eadn email/i);
  });

  it("fails closed when the server does not return an accepted receipt", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await expect(acceptCurrentHouseholdInvite()).rejects.toThrow(/ch\u01b0a x\u00e1c nh\u1eadn/i);
  });
});
