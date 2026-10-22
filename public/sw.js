// Service worker for the Leomed Pharma ERP install (/erp scope only — see
// app/manifest.ts and app/erp/ErpServiceWorker.tsx).
//
// Deliberately conservative: the ERP is per-user, per-role, and almost
// every page is force-dynamic — caching a PAGE response would risk showing
// one person stale or even another person's data after a role change. So
// this never caches navigations or API/server-action responses. It only
// caches immutable, content-hashed static assets (Next.js's /_next/static
// bundle, the app icons), which is purely a "feels instant on repeat visits"
// win with zero staleness risk, plus a tiny offline fallback page for when
// there's genuinely no connection at all.

const STATIC_CACHE = 'leomed-erp-static-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL])),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return // never intercept POSTs (server actions, form submits)

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // never touch Supabase/third-party calls

  // Immutable static assets: cache-first, so a repeat visit doesn't even
  // wait on the network for JS/CSS/icons.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      }),
    )
    return
  }

  // Page navigations: always go to the network first (fresh, per-user data)
  // — only fall back to the offline page if the network request itself
  // fails outright (no connection), never to a cached copy of the page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL)),
    )
  }
})
