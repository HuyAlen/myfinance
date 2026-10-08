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

describe("PWA-ASSET-CACHE-INTEGRITY-1 — P2", () => {
  it("reads only from the active MyFinance cache instead of every origin cache", () => {
    expect(serviceWorker).toContain("const cache = await caches.open(CACHE);");
    expect(serviceWorker).toContain("const cached = await cache.match(request);");
    expect(serviceWorker).not.toContain("caches.match(request)");
  });

  it("refuses unsafe or misleading responses before writing them to Cache Storage", () => {
    expect(serviceWorker).toContain("response.ok");
    expect(serviceWorker).toContain('response.type === "basic"');
    expect(serviceWorker).toContain("!response.redirected");
    expect(serviceWorker).toContain('cacheControl.includes("no-store")');
    expect(serviceWorker).toContain('cacheControl.includes("no-cache")');
    expect(serviceWorker).toContain('cacheControl.includes("private")');
    expect(serviceWorker).toContain('contentType.includes("text/html")');
  });

  it("keeps cache writes attached to the fetch-event lifetime", () => {
    expect(serviceWorker).toContain("event.waitUntil(cacheWrite)");
    expect(serviceWorker).toContain("response.clone()");
    expect(serviceWorker).toContain(
      "event.respondWith(cacheFirst(request, event))",
    );
    expect(serviceWorker).not.toContain("eventSafeCachePut");
  });

  it("bounds runtime media growth without evicting deployment-static assets", () => {
    expect(serviceWorker).toContain("const MAX_RUNTIME_ASSET_ENTRIES = 96;");
    expect(serviceWorker).toContain("isProtectedCacheRequest(request)");
    expect(serviceWorker).toContain(
      'pathname.startsWith("/_next/static/")',
    );
    expect(serviceWorker).toContain("PRECACHE_URLS.includes(pathname)");
    expect(serviceWorker).toContain(
      "runtimeKeys.length - MAX_RUNTIME_ASSET_ENTRIES",
    );
    expect(serviceWorker).toContain(".slice(0, overflow)");
  });

  it("preserves the existing navigation and sensitive-request bypass contract", () => {
    expect(serviceWorker).toContain('if (request.mode === "navigate")');
    expect(serviceWorker).toContain("fetch(request).catch");
    expect(serviceWorker).toContain('request.method !== "GET"');
    expect(serviceWorker).toContain("url.origin !== self.location.origin");
    expect(serviceWorker).toContain('url.pathname.startsWith("/api/")');
    expect(serviceWorker).toContain('url.hostname.includes("supabase.co")');
  });
});