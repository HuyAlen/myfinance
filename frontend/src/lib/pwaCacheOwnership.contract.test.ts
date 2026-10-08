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

const serviceWorker = read("public/sw.js");

describe("PWA-CACHE-OWNERSHIP-1 — P2", () => {
  it("names MyFinance caches behind one explicit ownership prefix", () => {
    expect(serviceWorker).toContain('const CACHE_PREFIX = "myfinance-";');
    expect(serviceWorker).toContain(
      'const CACHE = `${CACHE_PREFIX}${CACHE_REVISION}`;',
    );
  });

  it("deletes only stale caches owned by MyFinance during activation", () => {
    expect(serviceWorker).toContain(
      "return key.startsWith(CACHE_PREFIX) && key !== CACHE;",
    );
    expect(serviceWorker).toContain("keys.filter(isOwnedStaleCache)");
    expect(serviceWorker).toContain("caches.delete(key)");
  });

  it("does not use blanket origin-wide cache deletion", () => {
    expect(serviceWorker).not.toContain(
      "keys.filter((key) => key !== CACHE)",
    );
    expect(serviceWorker).not.toContain(
      "keys.filter(key => key !== CACHE)",
    );
  });

  it("keeps existing request-safety and fetch strategies unchanged", () => {
    expect(serviceWorker).toContain('request.method !== "GET"');
    expect(serviceWorker).toContain("url.origin !== self.location.origin");
    expect(serviceWorker).toContain('url.hostname.includes("supabase.co")');
    expect(serviceWorker).toContain('url.pathname.startsWith("/api/")');
    expect(serviceWorker).toContain('url.pathname.startsWith("/_next/static/")');
    expect(serviceWorker).toContain('if (request.mode === "navigate")');
    expect(serviceWorker).toContain("fetch(request).catch");
  });
});