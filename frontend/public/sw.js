// MyFinance Service Worker — v2
// Strategies:
//   • Navigation: network-first, no HTML runtime caching
//   • /_next/static/**: cache-first
//   • Images/SVG/fonts: cache-first
//   • API, Supabase, SSE and non-GET: pass-through

const CACHE = "myfinance-v2";

const PRECACHE_URLS = ["/icon-192.svg", "/icon-512.svg"];

// ─── Install ────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))),
      ),
  );

  self.skipWaiting();
});

// ─── Activate ───────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      ),
  );

  self.clients.claim();
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
    event.respondWith(cacheFirst(request));
    return;
  }

  // Images, icons and fonts.
  if (/\.(svg|png|ico|webp|jpg|jpeg|woff2?|ttf|otf)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigation must always fetch fresh HTML.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(
            `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Không có kết nối</title>
</head>
<body style="
  font-family:system-ui;
  display:flex;
  align-items:center;
  justify-content:center;
  min-height:100vh;
  margin:0;
  background:#f8fafc;
  color:#0f172a
">
  <div style="text-align:center">
    <p style="font-size:3rem;margin:0">📴</p>
    <h1 style="font-size:1.5rem;font-weight:900;margin:.5rem 0">
      Không có kết nối
    </h1>
    <p style="color:#64748b">
      Vui lòng kiểm tra mạng và thử lại.
    </p>
  </div>
</body>
</html>`,
            {
              status: 503,
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
              },
            },
          ),
      ),
    );
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);

  if (!response.ok) {
    return response;
  }

  // Clone immediately, before returning/consuming the original response.
  const responseForCache = response.clone();

  eventSafeCachePut(request, responseForCache);

  return response;
}

function eventSafeCachePut(request, response) {
  caches
    .open(CACHE)
    .then((cache) => cache.put(request, response))
    .catch((error) => {
      console.warn("[Service Worker] Cache write failed:", error);
    });
}
