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
const offline = read("public/offline.html");

describe("PWA-OFFLINE-FALLBACK-POLISH-1 — P2", () => {
  it("keeps navigation network-first and uses the offline shell only after network failure", () => {
    const navigationStart = serviceWorker.indexOf(
      'if (request.mode === "navigate")',
    );
    const cacheFirstStart = serviceWorker.indexOf(
      "async function cacheFirst(request, event)",
      navigationStart,
    );
    const navigationBlock = serviceWorker.slice(
      navigationStart,
      cacheFirstStart,
    );

    expect(navigationBlock).toContain(
      "fetch(request).catch(() => offlineNavigationResponse())",
    );
    expect(navigationBlock).not.toContain("cache.put");
    expect(navigationBlock).not.toContain("caches.match");
  });

  it("precaches the dedicated offline shell as a required install asset", () => {
    const installStart = serviceWorker.indexOf(
      'self.addEventListener("install"',
    );
    const activateStart = serviceWorker.indexOf(
      'self.addEventListener("activate"',
    );
    const installBlock = serviceWorker.slice(installStart, activateStart);

    expect(serviceWorker).toContain('const OFFLINE_URL = "/offline.html"');
    expect(serviceWorker).toContain(
      "const PRECACHE_URLS = [OFFLINE_URL,",
    );
    expect(installBlock).toContain("await cache.add(OFFLINE_URL)");
    expect(installBlock).toContain("Promise.allSettled(");
    expect(installBlock).toContain("url !== OFFLINE_URL");
  });

  it("reads the fallback only from the active MyFinance deployment cache", () => {
    expect(serviceWorker).toContain(
      "async function offlineNavigationResponse()",
    );
    expect(serviceWorker).toContain("const cache = await caches.open(CACHE);");
    expect(serviceWorker).toContain(
      "const cached = await cache.match(OFFLINE_URL);",
    );
    expect(serviceWorker).not.toContain("caches.match(OFFLINE_URL)");
  });

  it("serves fallback responses as explicit non-cacheable 503 content", () => {
    expect(serviceWorker).toContain('status: 503');
    expect(serviceWorker).toContain('statusText: "Service Unavailable"');
    expect(serviceWorker).toContain('"Cache-Control": "no-store"');
    expect(serviceWorker).toContain('"Content-Language": "vi"');
    expect(serviceWorker).toContain(
      '"Content-Type": "text/html; charset=utf-8"',
    );
    expect(serviceWorker).toContain(
      '"Content-Type": "text/plain; charset=utf-8"',
    );
  });

  it("keeps a minimal text fallback if the offline shell is unexpectedly unavailable", () => {
    expect(serviceWorker).toContain("if (!cached)");
    expect(serviceWorker).toContain(
      '"Không có kết nối. Vui lòng kiểm tra mạng và thử lại."',
    );
  });

  it("keeps the offline document self-contained and script-free", () => {
    expect(offline).toContain("<!doctype html>");
    expect(offline).toContain('<html lang="vi">');
    expect(offline).toContain("<style>");
    expect(offline).not.toContain("<script");
    expect(offline).not.toMatch(
      /<link[^>]+rel=["']stylesheet["']/i,
    );
    expect(offline).not.toContain("/_next/");
  });

  it("supports iPhone safe areas, dynamic viewport height, dark mode, and reduced motion", () => {
    expect(offline).toContain("viewport-fit=cover");
    expect(offline).toContain("100dvh");
    expect(offline).toContain("env(safe-area-inset-top)");
    expect(offline).toContain("env(safe-area-inset-bottom)");
    expect(offline).toContain("@media (prefers-color-scheme: dark)");
    expect(offline).toContain("@media (prefers-reduced-motion: reduce)");
    expect(offline).toContain('name="color-scheme"');
  });

  it("provides accessible Vietnamese recovery content with a same-route retry action", () => {
    expect(offline).toContain('aria-labelledby="offline-title"');
    expect(offline).toContain('id="offline-title">Bạn đang ngoại tuyến</h1>');
    expect(offline).toContain('id="offline-copy"');
    expect(offline).toContain('class="retry" href=""');
    expect(offline).toContain(">Thử lại</a>");
    expect(offline).toContain("min-height: 46px");
  });
});