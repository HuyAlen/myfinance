import { describe, expect, it } from "vitest";

import {
  formatSupabasePublicEnvError,
  requireSupabasePublicEnv,
  validateSupabasePublicEnv,
} from "./supabasePublicEnv.mjs";

describe("SUPABASE-BOOTSTRAP-ENV-1 validator", () => {
  it("accepts a valid Supabase URL and either publishable/anon key shape as opaque text", () => {
    expect(
      validateSupabasePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_example",
      }),
    ).toEqual({
      ok: true,
      issues: [],
      values: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "sb_publishable_example",
      },
    });
  });

  it("aggregates both missing required variables instead of failing one-at-a-time", () => {
    const result = validateSupabasePublicEnv({});

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.variable)).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]);
  });

  it("rejects malformed or non-http Supabase URLs", () => {
    const malformed = validateSupabasePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "key",
    });
    const unsupportedProtocol = validateSupabasePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "ftp://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "key",
    });

    expect(malformed.issues[0]?.message).toContain("valid absolute URL");
    expect(unsupportedProtocol.issues[0]?.message).toContain(
      "http:// or https://",
    );
  });

  it("never echoes the configured key into validation errors", () => {
    const secretLookingValue = "secret-value-that-must-not-appear";
    const result = validateSupabasePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "invalid",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: secretLookingValue,
    });

    const message = formatSupabasePublicEnvError(result.issues);
    expect(message).not.toContain(secretLookingValue);
    expect(message).toContain("npm run env:check");
  });

  it("returns trimmed runtime values and throws one actionable error for invalid config", () => {
    expect(
      requireSupabasePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "  http://127.0.0.1:54321  ",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "  local-key  ",
      }),
    ).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseAnonKey: "local-key",
    });

    expect(() => requireSupabasePublicEnv({})).toThrow(
      "Invalid Supabase public environment",
    );
  });
});