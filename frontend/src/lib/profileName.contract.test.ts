import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");
const settings = readFileSync(
  path.join(repoRoot, "frontend/src/components/settings/SettingsPage.tsx"),
  "utf8",
);
const header = readFileSync(
  path.join(repoRoot, "frontend/src/components/layout/Header.tsx"),
  "utf8",
);

describe("PROFILE-NAME-1 cloud profile name and header display", () => {
  it("persists the trimmed profile name to Supabase Auth metadata", () => {
    expect(settings).toContain('import { supabase } from "@/src/lib/supabase";');
    expect(settings).toContain("supabase.auth.updateUser");
    expect(settings).toContain("full_name: trimmedProfileName");
    expect(settings).toContain("name: trimmedProfileName");
  });

  it("keeps browser settings but makes cloud profile name authoritative", () => {
    expect(settings).toContain("const authProfileName =");
    expect(settings).toContain("!authProfileName && typeof saved.profileName");
    expect(settings).toContain("[authProfileName, localSettingsKey, user?.id]");
    expect(settings).toContain("setProfileName(authProfileName)");
  });

  it("normalizes the stored profile name before save", () => {
    expect(settings).toContain("const trimmedProfileName = profileName.trim()");
    expect(settings).toContain("trimmedProfileName.length > 80");
    expect(settings).toContain("profileName: trimmedProfileName");
  });

  it("updates the profile through an async save boundary", () => {
    expect(settings).toContain("async function handleSavePrefs()");
    expect(settings).toContain("if (profileError) throw profileError");
    expect(settings).toContain("Đã lưu hồ sơ và tùy chỉnh.");
  });

  it("states the real cloud-vs-browser persistence contract in the profile UI", () => {
    expect(settings).toContain(
      "Họ tên được đồng bộ với tài khoản; các tùy chỉnh khác lưu trên trình duyệt",
    );
  });

  it("prefers full_name/name metadata in the global header", () => {
    expect(header).toContain("const metadataName =");
    expect(header).toContain("user?.user_metadata?.full_name");
    expect(header).toContain("user?.user_metadata?.name");
    expect(header).toContain("metadataName || fallbackCompactName || \"Tài khoản\"");
  });

  it("keeps a readable email fallback when no cloud profile name exists", () => {
    expect(header).toContain('displayEmail.split("@")[0].replace(/[._-]+/g, " ")');
    expect(header).toContain("fallbackCompactName");
  });

  it("derives the avatar letter from the displayed name first", () => {
    expect(header).toContain("compactName.charAt(0).toUpperCase()");
    expect(header).toContain("displayEmail.charAt(0).toUpperCase()");
  });
});
