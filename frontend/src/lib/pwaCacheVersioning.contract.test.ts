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

const nextConfig = read("next.config.ts");
const component = read("src/components/pwa/ServiceWorkerRegistration.tsx");
const helper = read("src/lib/pwa/serviceWorkerRegistration.ts");
const serviceWorker = read("public/sw.js");

describe("PWA-CACHE-VERSIONING-1 — P2", () => {
  it("derives one client-visible deployment revision at build time", () => {
    expect(nextConfig).toContain("VERCEL_GIT_COMMIT_SHA");
    expect(nextConfig).toContain("GITHUB_SHA");
    expect(nextConfig).toContain("SOURCE_VERSION");
    expect(nextConfig).toContain("Date.now().toString(36)");
    expect(nextConfig).toContain(
      "NEXT_PUBLIC_MYFINANCE_DEPLOYMENT_REVISION: deploymentRevision",
    );
  });

  it("registers the worker with the deployment revision in its script URL", () => {
    expect(component).toContain(
      "process.env.NEXT_PUBLIC_MYFINANCE_DEPLOYMENT_REVISION",
    );
    expect(helper).toContain("buildMyFinanceServiceWorkerUrl");
    expect(helper).toContain("?rev=");
    expect(helper).toContain("encodeURIComponent");
  });

  it("derives the active cache name from the registered worker script URL", () => {
    expect(serviceWorker).toContain("new URL(self.location.href)");
    expect(serviceWorker).toContain('searchParams.get("rev")');
    expect(serviceWorker).toContain("normalizeCacheRevision");
    expect(serviceWorker).toContain(
      'const CACHE = `${CACHE_PREFIX}${CACHE_REVISION}`;',
    );
  });

  it("does not rely on a manually bumped myfinance-vN cache literal", () => {
    expect(serviceWorker).not.toMatch(/myfinance-v\d+/);
    expect(serviceWorker).not.toContain("`${CACHE_PREFIX}v2`");
    expect(serviceWorker).not.toContain("`${CACHE_PREFIX}v3`");
  });

  it("keeps stale cleanup constrained to MyFinance-owned caches", () => {
    expect(serviceWorker).toContain(
      "return key.startsWith(CACHE_PREFIX) && key !== CACHE;",
    );
    expect(serviceWorker).toContain("keys.filter(isOwnedStaleCache)");
  });
});