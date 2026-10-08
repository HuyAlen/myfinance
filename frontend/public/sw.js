// MyFinance Service Worker
// Strategies:
//   • Navigation: network-first, no HTML runtime caching
//   • /_next/static/**: cache-first
//   • Images/SVG/fonts: cache-first
//   • API, Supabase, SSE and non-GET: pass-through

const CACHE_PREFIX = "myfinance-";

function normalizeCacheRevision(value) {
  const normalized = String(value || "unversioned")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);

  return normalized || "unversioned";
}

const CACHE_REVISION = normalizeCacheRevision(
  new URL(self.location.href).searchParams.get("rev"),
);
const CACHE = `${CACHE_PREFIX}${CACHE_REVISION}`;

const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [OFFLINE_URL, "/icon-192.svg", "/icon-512.svg"];
const MAX_RUNTIME_ASSET_ENTRIES = 96;

// ─── Install ────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // The offline shell is part of the worker's availability contract.
      // If it cannot be cached, keep the previous worker instead of activating
      // a deployment that cannot provide the promised navigation fallback.
      await cache.add(OFFLINE_URL);

      // Icons are useful for installability but are not critical to the worker
      // lifecycle, so a transient icon failure must not block an update.
      await Promise.allSettled(
        PRECACHE_URLS.filter((url) => url !== OFFLINE_URL).map((url) =>
          cache.add(url),
        ),
      );
    }),
  );
});

// ─── Activate ───────────────────────────────────────────────────────────────

function isOwnedStaleCache(key) {
  return key.startsWith(CACHE_PREFIX) && key !== CACHE;
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter(isOwnedStaleCache).map((key) => caches.delete(key)),
        ),
      ),
  );
});

// ─── Explicit update activation ─────────────────────────────────────────────

self.addEventListener("message", (event) => {
  if (event.data?.type !== "MYFINANCE_SKIP_WAITING") {
    return;
  }

  // Only explicit user intent from the client may bypass the normal waiting
  // lifecycle. Never call skipWaiting during install.
  event.waitUntil(self.skipWaiting());
});

// ─── Fetch ──────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept unsupported or sensitive requests.
  if (
    request.method !== "GET" ||
    url.protocol === "chrome-extension:" ||
    url.origin !== self.location.origin ||
    url.hostname.includes("supabase.co") ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  // Next.js immutable hashed assets.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, event));
    return;
  }

  // Images, icons and fonts.
  if (/\.(svg|png|ico|webp|jpg|jpeg|woff2?|ttf|otf)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, event));
    return;
  }

  // Navigation must always fetch fresh HTML. Only a real network failure may
  // fall back to the dedicated, non-authenticated offline shell.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => offlineNavigationResponse()));
  }
});

async function cacheFirst(request, event) {
  const resolution = resolveAssetRequest(request);

  const cacheWrite = resolution
    .then(async ({ cache, responseForCache }) => {
      if (!responseForCache) {
        return;
      }

      try {
        await cache.put(request, responseForCache);

        if (!isProtectedCacheRequest(request)) {
          await trimRuntimeAssetEntries(cache);
        }
      } catch (error) {
        console.warn("[Service Worker] Cache write failed:", error);
      }
    })
    // Network failures still reject the response promise below. The lifecycle
    // sidecar must not create a second unhandled rejection.
    .catch(() => undefined);

  event.waitUntil(cacheWrite);

  return resolution.then(({ response }) => response);
}

async function resolveAssetRequest(request) {
  // Read only from the active MyFinance cache. `caches.match()` searches every
  // cache on the origin and can accidentally consume another app's response.
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);

  if (cached) {
    return {
      cache,
      response: cached,
      responseForCache: null,
    };
  }

  const response = await fetch(request);

  return {
    cache,
    response,
    // Clone before the response is returned to the browser and its body can
    // become consumed.
    responseForCache: isCacheableAssetResponse(response)
      ? response.clone()
      : null,
  };
}

function isCacheableAssetResponse(response) {
  const cacheControl = (
    response.headers.get("cache-control") || ""
  ).toLowerCase();
  const contentType = (
    response.headers.get("content-type") || ""
  ).toLowerCase();

  return (
    response.ok &&
    response.type === "basic" &&
    !response.redirected &&
    !cacheControl.includes("no-store") &&
    !cacheControl.includes("no-cache") &&
    !cacheControl.includes("private") &&
    !contentType.includes("text/html")
  );
}

function isProtectedCacheRequest(request) {
  const pathname = new URL(request.url).pathname;

  return (
    pathname.startsWith("/_next/static/") ||
    PRECACHE_URLS.includes(pathname)
  );
}

async function trimRuntimeAssetEntries(cache) {
  const keys = await cache.keys();
  const runtimeKeys = keys.filter(
    (request) => !isProtectedCacheRequest(request),
  );
  const overflow = runtimeKeys.length - MAX_RUNTIME_ASSET_ENTRIES;

  if (overflow <= 0) {
    return;
  }

  await Promise.all(
    runtimeKeys
      .slice(0, overflow)
      .map((request) => cache.delete(request)),
  );
}

async function offlineNavigationResponse() {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(OFFLINE_URL);

  const headers = {
    "Cache-Control": "no-store",
    "Content-Language": "vi",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  };

  if (!cached) {
    return new Response(
      "Không có kết nối. Vui lòng kiểm tra mạng và thử lại.",
      {
        status: 503,
        statusText: "Service Unavailable",
        headers: {
          ...headers,
          "Content-Type": "text/plain; charset=utf-8",
        },
      },
    );
  }

  return new Response(await cached.text(), {
    status: 503,
    statusText: "Service Unavailable",
    headers: {
      ...headers,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}