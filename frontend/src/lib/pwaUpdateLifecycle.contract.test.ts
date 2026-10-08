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
const component = read("src/components/pwa/ServiceWorkerRegistration.tsx");
const helper = read("src/lib/pwa/serviceWorkerRegistration.ts");

describe("PWA-UPDATE-LIFECYCLE-1 — P2", () => {
  it("does not force a newly installed worker to activate during install", () => {
    const installStart = serviceWorker.indexOf(
      'self.addEventListener("install"',
    );
    const activateStart = serviceWorker.indexOf(
      'self.addEventListener("activate"',
    );
    const installBlock = serviceWorker.slice(installStart, activateStart);

    expect(installStart).toBeGreaterThan(-1);
    expect(activateStart).toBeGreaterThan(installStart);
    expect(installBlock).not.toContain("skipWaiting");
  });

  it("does not claim already-open clients during activation", () => {
    expect(serviceWorker).not.toContain("self.clients.claim(");
    expect(serviceWorker).not.toContain(".clients.claim(");
  });

  it("keeps install work lifecycle-bound while allowing the browser to decide activation timing", () => {
    const installStart = serviceWorker.indexOf(
      'self.addEventListener("install"',
    );
    const activateStart = serviceWorker.indexOf(
      'self.addEventListener("activate"',
    );
    const installBlock = serviceWorker.slice(installStart, activateStart);

    expect(installStart).toBeGreaterThan(-1);
    expect(activateStart).toBeGreaterThan(installStart);
    expect(installBlock).toContain("event.waitUntil(");
    expect(installBlock).toMatch(/caches\s*\.open\(CACHE\)/);
    expect(installBlock).toContain("Promise.allSettled(");
  });

  it("keeps stale-cache cleanup attached to activation instead of installation", () => {
    const installStart = serviceWorker.indexOf(
      'self.addEventListener("install"',
    );
    const activateStart = serviceWorker.indexOf(
      'self.addEventListener("activate"',
    );
    const messageStart = serviceWorker.indexOf(
      'self.addEventListener("message"',
    );

    const installBlock = serviceWorker.slice(installStart, activateStart);
    const activateBlock = serviceWorker.slice(activateStart, messageStart);

    expect(installBlock).not.toContain("caches.delete(");
    expect(activateBlock).toContain("event.waitUntil(");
    expect(activateBlock).toMatch(/caches\s*\.keys\(\)/);
    expect(activateBlock).toContain("keys.filter(isOwnedStaleCache)");
    expect(activateBlock).toContain("caches.delete(key)");
  });

  it("allows takeover only behind explicit client-side update intent", () => {
    const messageStart = serviceWorker.indexOf(
      'self.addEventListener("message"',
    );
    const fetchStart = serviceWorker.indexOf(
      'self.addEventListener("fetch"',
    );
    const messageBlock = serviceWorker.slice(messageStart, fetchStart);

    expect(messageBlock).toContain("MYFINANCE_SKIP_WAITING");
    expect(messageBlock).toContain("event.waitUntil(self.skipWaiting())");
    expect(helper).toContain("requestMyFinanceServiceWorkerActivation");
    expect(helper).toContain("worker.postMessage");
    expect(component).toContain("updateRequestedRef.current = true");
  });

  it("preserves revisioned registration and HTTP-cache bypass for update discovery", () => {
    expect(component).toContain(
      "process.env.NEXT_PUBLIC_MYFINANCE_DEPLOYMENT_REVISION",
    );
    expect(helper).toContain("buildMyFinanceServiceWorkerUrl");
    expect(helper).toContain("?rev=");
    expect(helper).toContain('updateViaCache: "none"');
  });
});