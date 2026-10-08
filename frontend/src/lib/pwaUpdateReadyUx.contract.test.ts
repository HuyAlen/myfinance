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

const component = read("src/components/pwa/ServiceWorkerRegistration.tsx");
const helper = read("src/lib/pwa/serviceWorkerRegistration.ts");
const serviceWorker = read("public/sw.js");

describe("PWA-UPDATE-READY-UX-1 — P2", () => {
  it("detects both an already-waiting worker and a later updatefound worker", () => {
    expect(component).toContain("revealUpdate(nextRegistration.waiting)");
    expect(component).toContain(
      'nextRegistration.addEventListener("updatefound", onUpdateFound)',
    );
    expect(component).toContain("registration?.installing ?? null");
    expect(component).toContain(
      'installingWorker.addEventListener(\n        "statechange"',
    );
  });

  it("does not offer first-install activation as an application update", () => {
    expect(helper).toContain("input.hasController");
    expect(helper).toContain('input.workerState === "installed"');
    expect(component).toContain(
      "hasController: Boolean(navigator.serviceWorker.controller)",
    );
  });

  it("renders a dismissible non-modal Vietnamese update prompt", () => {
    expect(component).toContain("Phiên bản mới đã sẵn sàng");
    expect(component).toContain("Cập nhật ngay");
    expect(component).toContain("Để sau");
    expect(component).toContain('role="status"');
    expect(component).toContain('aria-live="polite"');
    expect(component).not.toContain('role="dialog"');
  });

  it("sends SKIP_WAITING only from the explicit update action", () => {
    expect(component).toContain("const handleUpdate = () =>");
    expect(component).toContain("updateRequestedRef.current = true");
    expect(component).toContain(
      "requestMyFinanceServiceWorkerActivation(waitingWorker)",
    );
    expect(helper).toContain(
      'MYFINANCE_SKIP_WAITING_MESSAGE = "MYFINANCE_SKIP_WAITING"',
    );
    expect(helper).toContain("worker.postMessage");
  });

  it("reloads only after requested activation produces controllerchange", () => {
    expect(component).toContain(
      'navigator.serviceWorker.addEventListener(\n      "controllerchange"',
    );
    expect(component).toContain("!updateRequestedRef.current");
    expect(component).toContain("reloadTriggeredRef.current");
    expect(component).toContain("reloadTriggeredRef.current = true");
    expect(component).toContain("window.location.reload()");
  });

  it("guards against reload loops and cleans all lifecycle listeners", () => {
    expect(component).toContain("reloadTriggeredRef.current");
    expect(component).toContain(
      'navigator.serviceWorker.removeEventListener(\n        "controllerchange"',
    );
    expect(component).toContain(
      'registration?.removeEventListener("updatefound", onUpdateFound)',
    );
    expect(component).toContain("detachInstallingWorker()");
  });

  it("keeps worker-side skipWaiting message-gated instead of install-gated", () => {
    const installStart = serviceWorker.indexOf(
      'self.addEventListener("install"',
    );
    const activateStart = serviceWorker.indexOf(
      'self.addEventListener("activate"',
    );
    const messageStart = serviceWorker.indexOf(
      'self.addEventListener("message"',
    );
    const fetchStart = serviceWorker.indexOf(
      'self.addEventListener("fetch"',
    );

    const installBlock = serviceWorker.slice(installStart, activateStart);
    const messageBlock = serviceWorker.slice(messageStart, fetchStart);

    expect(installBlock).not.toContain("skipWaiting");
    expect(messageBlock).toContain("MYFINANCE_SKIP_WAITING");
    expect(messageBlock).toContain("event.waitUntil(self.skipWaiting())");
  });
});