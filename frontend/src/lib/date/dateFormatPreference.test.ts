import { afterEach, describe, expect, it, vi } from "vitest";
import { accountSettingsKey, readAccountDateFormat, SETTINGS_DATE_FORMAT_VERSION } from "./dateFormatPreference";

// dateFormatPreference contains a React hook that imports AuthProvider. Stub
// that boundary for pure storage tests: otherwise Vitest imports Supabase and
// requires production NEXT_PUBLIC_SUPABASE_URL before any tests can run.
// vi.mock is hoisted before the module import by Vitest.
vi.mock("@/src/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user: null }),
}));

afterEach(()=>vi.unstubAllGlobals());
describe("MYFINANCE-DATE-FORMAT-SSOT-1 per-account persistence",()=>{
  it("reads existing versioned settings, not a duplicate preference key",()=>{
    const values = new Map([
      [accountSettingsKey("user-a"),JSON.stringify({version:1,dateFormat:"mm/dd/yyyy"})],
      [accountSettingsKey("user-b"),JSON.stringify({version:1,dateFormat:"yyyy-mm-dd"})],
    ]);
    vi.stubGlobal("window",{localStorage:{getItem:(k:string)=>values.get(k)??null}});
    expect(SETTINGS_DATE_FORMAT_VERSION).toBe(1);
    expect(readAccountDateFormat("user-a")).toBe("mm/dd/yyyy");
    expect(readAccountDateFormat("user-b")).toBe("yyyy-mm-dd");
    expect(readAccountDateFormat(null)).toBe("dd/mm/yyyy");
    expect(readAccountDateFormat("user-c")).toBe("dd/mm/yyyy");
  });
  it("rejects malformed, obsolete or unknown preferences safely",()=>{
    const values = new Map([[accountSettingsKey("user"),"broken"]]);
    vi.stubGlobal("window",{localStorage:{getItem:(key:string)=>values.get(key)??null}});
    expect(readAccountDateFormat("user")).toBe("dd/mm/yyyy");
    values.set(accountSettingsKey("user"),JSON.stringify({version:2,dateFormat:"mm/dd/yyyy"}));
    expect(readAccountDateFormat("user")).toBe("dd/mm/yyyy");
    values.set(accountSettingsKey("user"),JSON.stringify({version:1,dateFormat:"weird"}));
    expect(readAccountDateFormat("user")).toBe("dd/mm/yyyy");
  });
});
