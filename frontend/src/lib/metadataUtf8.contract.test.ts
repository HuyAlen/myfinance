import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../..");

function read(relativePath: string) {
  return readFileSync(path.join(frontendRoot, relativePath), "utf8").replace(
    /\r\n/g,
    "\n",
  );
}

const layout = read("app/layout.tsx");
const manifest = read("app/manifest.ts");

const CANONICAL_DESCRIPTION =
  "Ứng dụng quản lý tài chính cá nhân thông minh với AI";

function getMojibakeMarkers() {
  return [
    String.fromCharCode(0x00c3),
    String.fromCharCode(0x00e1, 0x00ba),
    String.fromCharCode(0x00e1, 0x00bb),
    String.fromCharCode(0x00e2, 0x20ac),
    "\uFFFD",
  ];
}

describe("METADATA-UTF8-1 — P2", () => {
  it("keeps root metadata and PWA manifest on one canonical Vietnamese description", () => {
    expect(layout).toContain(`description: "${CANONICAL_DESCRIPTION}"`);
    expect(manifest).toContain(`description: "${CANONICAL_DESCRIPTION}"`);
  });

  it("rejects common UTF-8 mojibake markers on metadata surfaces", () => {
    for (const source of [layout, manifest]) {
      for (const marker of getMojibakeMarkers()) {
        expect(source).not.toContain(marker);
      }
    }
  });

  it("preserves Vietnamese language/font metadata while fixing copy only", () => {
    expect(layout).toContain('<html lang="vi"');
    expect(layout).toContain('subsets: ["latin", "vietnamese"]');
    expect(layout).toContain('title: "MyFinance"');
    expect(layout).toContain('manifest: "/manifest.webmanifest"');
  });

  it("keeps the PWA product identity unchanged", () => {
    expect(manifest).toContain('name: "MyFinance — Quản lý tài chính cá nhân"');
    expect(manifest).toContain('short_name: "MyFinance"');
    expect(manifest).toContain('start_url: "/"');
    expect(manifest).toContain('display: "standalone"');
  });
});