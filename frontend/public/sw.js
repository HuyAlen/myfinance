// MyFinance Service Worker — v1
// Strategies:
//   • Navigation:        Network-first → cached fallback → 503 offline
//   • /_next/static/**:  Cache-first (immutable hashed chunks)
//   • Images/SVG/fonts:  Cache-first
//   • Supabase / non-GET: Pass-through (never cached)

const CACHE = "myfinance-v1";

const PRECACHE_URLS = [
  "/",
  "/transactions",
  "/wallets",
  "/budgets",
  "/goals",
  "/ai-insights",
  "/settings",
  "/icon-192.svg",
  "/icon-512.svg",
];

// ─── Install ─────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // addAll can fail for routes that need auth — ignore individual failures
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))),
    ),
  );
  // Activate immediately — don't wait for old tabs to close
  self.skipWaiting();
});

// ─── Activate ────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

// ─── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip: non-GET, chrome-extension, Supabase API calls
  if (
    request.method !== "GET" ||
    url.protocol === "chrome-extension:" ||
    url.hostname.includes("supabase.co")
  ) {
    return;
  }

  // ── Immutable static assets (/_next/static/) — cache-first ──
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((res) => {
            if (res.ok) {
              caches.open(CACHE).then((c) => c.put(request, res.clone()));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // ── Images / SVG / fonts / icons — cache-first ──
  if (url.pathname.match(/\.(svg|png|ico|webp|jpg|jpeg|woff2?|ttf|otf)$/)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((res) => {
            if (res.ok) {
              caches.open(CACHE).then((c) => c.put(request, res.clone()));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // ── Navigation (HTML pages) — network-first ──
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            caches.open(CACHE).then((c) => c.put(request, res.clone()));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached ?? caches.match("/"))
            .then(
              (fallback) =>
                fallback ??
                new Response(
                  "<!DOCTYPE html><html><head><meta charset=utf-8><title>Offline</title></head><body style='font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#0f172a'><div style='text-align:center'><p style='font-size:3rem;margin:0'>📴</p><h1 style='font-size:1.5rem;font-weight:900;margin:.5rem 0'>Không có kết nối</h1><p style='color:#64748b'>Vui lòng kiểm tra mạng và thử lại.</p></div></body></html>",
                  { headers: { "Content-Type": "text/html" }, status: 503 },
                ),
            ),
        ),
    );
    return;
  }
});
