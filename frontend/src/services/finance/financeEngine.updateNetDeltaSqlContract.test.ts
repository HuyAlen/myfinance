import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const forwardMigrationPath = path.resolve(
  __dirname,
  "../../../supabase/finance-engine-2.1-update-net-delta.sql",
);
const canonicalSchemaPath = path.resolve(
  __dirname,
  "../../../../supabase/schema.sql",
);

function normalize(input: string) {
  return input.replace(/\s+/g, " ").trim().toLowerCase();
}

function updateFunctionBody(sql: string) {
  const normalized = normalize(sql);
  const start = normalized.indexOf(
    "create or replace function public.update_finance_transaction(",
  );
  expect(start).toBeGreaterThanOrEqual(0);
  const end = normalized.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return normalized.slice(start, end + 3);
}

type Effect = { walletId: string; delta: number };

function computeNet(oldEffects: Effect[], newEffects: Effect[]) {
  const result = new Map<string, number>();
  const add = (walletId: string, delta: number) =>
    result.set(walletId, (result.get(walletId) ?? 0) + delta);

  for (const effect of oldEffects) add(effect.walletId, -effect.delta);
  for (const effect of newEffects) add(effect.walletId, effect.delta);
  return Object.fromEntries(result);
}

describe("FINANCE-TRANSACTION-EDIT-1 net-delta SQL contract", () => {
  it("ships a forward migration for already-deployed databases", () => {
    expect(existsSync(forwardMigrationPath)).toBe(true);
    const migration = readFileSync(forwardMigrationPath, "utf8");
    expect(migration).toContain(
      "FINANCE-TRANSACTION-EDIT-1 — Net-Delta Transaction Update Correctness",
    );
    expect(normalize(migration)).toContain(
      "create or replace function public.update_finance_transaction(",
    );
  });

  it("applies one combined net wallet mutation and never reverse-old/apply-new writes", () => {
    const sources = [
      readFileSync(forwardMigrationPath, "utf8"),
      readFileSync(canonicalSchemaPath, "utf8"),
    ];

    for (const source of sources) {
      const body = updateFunctionBody(source);
      expect(body).toContain(
        "v_net := (v_balances->>v_wallet_id)::numeric; if v_balance + v_net < 0 then",
      );
      expect(body).toContain(
        "if v_net <> 0 then update wallets set balance = balance + v_net",
      );
      expect(body).not.toContain(
        "update wallets set balance = balance - p_old_effect_delta_1",
      );
      expect(body).not.toContain(
        "update wallets set balance = balance - p_old_effect_delta_2",
      );
      expect(body).not.toContain(
        "update wallets set balance = balance + p_new_effect_delta_1",
      );
      expect(body).not.toContain(
        "update wallets set balance = balance + p_new_effect_delta_2",
      );
    }
  });

  it("preserves final-balance rejection, optimistic concurrency and atomic row update", () => {
    const sources = [
      readFileSync(forwardMigrationPath, "utf8"),
      readFileSync(canonicalSchemaPath, "utf8"),
    ];

    for (const source of sources) {
      const body = updateFunctionBody(source);
      expect(body).toContain("using errcode = 'mfe05'");
      expect(body).toContain("using errcode = 'mfe07'");
      expect(body).toContain("for update");
      expect(body).toContain("update transactions set");
      expect(body).toContain("returning * into v_row");
    }
  });

  it("makes metadata-only income and expense edits zero-net", () => {
    expect(
      computeNet(
        [{ walletId: "vcb", delta: 3_795_000 }],
        [{ walletId: "vcb", delta: 3_795_000 }],
      ),
    ).toEqual({ vcb: 0 });

    expect(
      computeNet(
        [{ walletId: "vcb", delta: -1_000_000 }],
        [{ walletId: "vcb", delta: -1_000_000 }],
      ),
    ).toEqual({ vcb: 0 });
  });

  it("checks only the incremental delta when an amount changes", () => {
    expect(
      computeNet(
        [{ walletId: "vcb", delta: -1_000_000 }],
        [{ walletId: "vcb", delta: -1_500_000 }],
      ),
    ).toEqual({ vcb: -500_000 });

    expect(
      computeNet(
        [{ walletId: "vcb", delta: -1_500_000 }],
        [{ walletId: "vcb", delta: -1_000_000 }],
      ),
    ).toEqual({ vcb: 500_000 });

    expect(
      computeNet(
        [{ walletId: "vcb", delta: 1_500_000 }],
        [{ walletId: "vcb", delta: 1_000_000 }],
      ),
    ).toEqual({ vcb: -500_000 });
  });

  it("keeps wallet changes and transfers independent per wallet", () => {
    expect(
      computeNet(
        [{ walletId: "a", delta: 1_000_000 }],
        [{ walletId: "b", delta: 1_000_000 }],
      ),
    ).toEqual({ a: -1_000_000, b: 1_000_000 });

    expect(
      computeNet(
        [
          { walletId: "a", delta: -1_000_000 },
          { walletId: "b", delta: 1_000_000 },
        ],
        [
          { walletId: "a", delta: -1_500_000 },
          { walletId: "c", delta: 1_500_000 },
        ],
      ),
    ).toEqual({ a: -500_000, b: -1_000_000, c: 1_500_000 });
  });
});
