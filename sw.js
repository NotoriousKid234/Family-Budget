// ── Flint Finance Service Worker ──
// Cache version — bump this string whenever you deploy a breaking change
// so old caches are flushed automatically.
const CACHE = 'flint-v1';

// Files that make up the app shell — pre-cached on install
const SHELL = [
    '/',
    '/app.html',
    '/offline.html',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
];

// Origins/paths that must NEVER be cached (always-fresh financial data)
const BYPASS = [
    'supabase.co',          // Supabase API
    '.netlify/functions',   // Serverless functions (AI, stocks)
    'api.coingecko.com',    // Crypto prices
    'finance.yahoo.com',    // Stock prices
    'anthropic.com',        // Claude API (called server-side, but safety net)
];

function isBypass(url) {
    return BYPASS.some(pattern => url.includes(pattern));
}

// ── Install: pre-cache the app shell ──
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE)
            .then(cache => cache.addAll(SHELL))
            .then(() => self.skipWaiting())
    );
});

// ── Activate: remove stale caches ──
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ── Fetch: cache-first for assets, network-only for APIs ──
self.addEventListener('fetch', event => {
    const { request } = event;

    // Only intercept GET requests
    if (request.method !== 'GET') return;

    const url = request.url;

    // Always go to the network for API / real-time data calls
    if (isBypass(url)) {
        event.respondWith(
            fetch(request).catch(() => new Response('', { status: 503 }))
        );
        return;
    }

    // Cache-first with network fallback for everything else
    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;

            return fetch(request).then(response => {
                // Only cache successful same-origin responses
                if (response && response.status === 200 && response.type !== 'opaque') {
                    const clone = response.clone();
                    caches.open(CACHE).then(cache => cache.put(request, clone));
                }
                return response;
            }).catch(() => {
                // Offline fallback for page navigations
                if (request.mode === 'navigate') {
                    return caches.match('/offline.html');
                }
            });
        })
    );
});
