import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../../..");

function readFrontend(relativePath: string) {
  return readFileSync(path.join(frontendRoot, relativePath), "utf8").replace(
    /\r\n/g,
    "\n",
  );
}

const component = readFrontend(
  "src/components/pwa/ServiceWorkerRegistration.tsx",
);
const helper = readFrontend("src/lib/pwa/serviceWorkerRegistration.ts");
const serviceWorker = readFrontend("public/sw.js");
const layout = readFrontend("app/layout.tsx");
const manifest = readFrontend("app/manifest.ts");

describe("PWA-SERVICE-WORKER-REGISTRATION-1 — P2", () => {
  it("keeps one root-layout registration component mounted", () => {
    expect(layout).toContain(
      'import ServiceWorkerRegistration from "@/src/components/pwa/ServiceWorkerRegistration"',
    );
    expect(layout.split("<ServiceWorkerRegistration />").length - 1).toBe(1);
  });

  it("registers only after load in a secure production browser", () => {
    expect(component).toContain('"serviceWorker" in navigator');
    expect(component).toContain("process.env.NODE_ENV");
    expect(component).toContain("window.isSecureContext");
    expect(component).toContain('document.readyState === "complete"');
    expect(component).toContain(
      'window.addEventListener("load", register, { once: true })',
    );
    expect(component).toContain(
      'window.removeEventListener("load", register)',
    );
    expect(component).not.toContain(".unregister(");
  });

  it("uses a revisioned root worker URL, root scope, and bypasses HTTP cache for updates", () => {
    expect(helper).toContain(
      'export const MYFINANCE_SERVICE_WORKER_URL = "/sw.js"',
    );
    expect(helper).toContain(
      'export const MYFINANCE_SERVICE_WORKER_SCOPE = "/"',
    );
    expect(helper).toContain("buildMyFinanceServiceWorkerUrl");
    expect(helper).toContain("?rev=");
    expect(component).toContain(
      "process.env.NEXT_PUBLIC_MYFINANCE_DEPLOYMENT_REVISION",
    );
    expect(helper).toContain('updateViaCache: "none"');
  });

  it("treats registration failure as progressive-enhancement failure", () => {
    expect(component).toContain(
      "[PWA] Service worker registration failed:",
    );
    expect(component).toContain("serviceWorkerRegistrationErrorMessage(error)");
    expect(component).not.toContain("throw error");
  });

  it("never intercepts non-GET, cross-origin, Supabase, or application API traffic", () => {
    expect(serviceWorker).toContain('request.method !== "GET"');
    expect(serviceWorker).toContain("url.origin !== self.location.origin");
    expect(serviceWorker).toContain('url.hostname.includes("supabase.co")');
    expect(serviceWorker).toContain('url.pathname.startsWith("/api/")');
  });

  it("keeps navigation network-first and delegates only failures to the dedicated offline shell", () => {
    const navigationStart = serviceWorker.indexOf(
      'if (request.mode === "navigate")',
    );
    const cacheFirstStart = serviceWorker.indexOf(
      "async function cacheFirst(request, event)",
      navigationStart,
    );

    expect(navigationStart).toBeGreaterThan(-1);
    expect(cacheFirstStart).toBeGreaterThan(navigationStart);

    const navigationBlock = serviceWorker.slice(
      navigationStart,
      cacheFirstStart,
    );

    expect(navigationBlock).toContain(
      "fetch(request).catch(() => offlineNavigationResponse())",
    );
    expect(navigationBlock).not.toContain("caches.match");
    expect(navigationBlock).not.toContain("cache.put");
    expect(serviceWorker).toContain('const OFFLINE_URL = "/offline.html"');
    expect(serviceWorker).toContain('"Cache-Control": "no-store"');
  });

  it("limits precache to static icons instead of authenticated application routes", () => {
    const precacheStart = serviceWorker.indexOf("const PRECACHE_URLS");
    const installStart = serviceWorker.indexOf(
      'self.addEventListener("install"',
      precacheStart,
    );
    const precacheBlock = serviceWorker.slice(precacheStart, installStart);

    expect(precacheBlock).toContain('"/icon-192.svg"');
    expect(precacheBlock).toContain('"/icon-512.svg"');

    for (const route of [
      '"/"',
      '"/transactions"',
      '"/wallets"',
      '"/budgets"',
      '"/goals"',
      '"/settings"',
    ]) {
      expect(precacheBlock).not.toContain(route);
    }
  });

  it("keeps cache-first limited to hashed Next assets and static media/font extensions", () => {
    expect(serviceWorker).toContain('url.pathname.startsWith("/_next/static/")');
    expect(serviceWorker).toContain(
      String.raw`/\.(svg|png|ico|webp|jpg|jpeg|woff2?|ttf|otf)$/i`,
    );
    expect(serviceWorker).toContain(
      "event.respondWith(cacheFirst(request, event))",
    );
  });

  it("keeps manifest root scope/installability aligned with the registered worker", () => {
    expect(manifest).toContain('start_url: "/"');
    expect(manifest).toContain('scope: "/"');
    expect(manifest).toContain('display: "standalone"');
  });
});