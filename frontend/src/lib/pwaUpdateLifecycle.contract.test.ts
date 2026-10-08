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
  it("does not force a newly installed worker to activate over an existing session", () => {
    expect(serviceWorker).not.toContain("self.skipWaiting(");
    expect(serviceWorker).not.toContain(".skipWaiting(");
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
    const fetchStart = serviceWorker.indexOf(
      'self.addEventListener("fetch"',
    );

    const installBlock = serviceWorker.slice(installStart, activateStart);
    const activateBlock = serviceWorker.slice(activateStart, fetchStart);

    expect(installBlock).not.toContain("caches.delete(");
    expect(activateBlock).toContain("event.waitUntil(");
    expect(activateBlock).toMatch(/caches\s*\.keys\(\)/);
    expect(activateBlock).toContain("keys.filter(isOwnedStaleCache)");
    expect(activateBlock).toContain("caches.delete(key)");
  });

  it("does not add a hidden client-side force-update or reload path", () => {
    expect(component).not.toContain("controllerchange");
    expect(component).not.toContain("window.location.reload");
    expect(component).not.toContain("registration.waiting");
    expect(component).not.toContain(".postMessage(");
    expect(helper).not.toContain(".postMessage(");
    expect(helper).not.toContain("SKIP_WAITING");
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