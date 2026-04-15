// ── Flint Finance Service Worker ──
// Bump CACHE version any time you want to force all clients to get fresh files.
const CACHE = 'flint-v3';

// Files that make up the app shell — pre-cached on install.
// NOTE: config.js is intentionally excluded — it must always be fetched
// fresh from the server so Supabase credentials are never served stale.
const SHELL = [
    '/app.html',
    '/offline.html',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
];

// Patterns for requests that must NEVER be served from cache.
const BYPASS = [
    'supabase.co',          // Supabase API (auth, realtime, DB)
    '.netlify/functions',   // Serverless functions (AI, stocks)
    'api.coingecko.com',    // Crypto prices
    'finance.yahoo.com',    // Stock prices
    'anthropic.com',        // Claude API safety net
    'config.js',            // Runtime Supabase credentials — always fresh
    'cdn.jsdelivr.net',     // External CDN scripts — skip caching
    'cdnjs.cloudflare.com', // External CDN scripts — skip caching
    'fonts.googleapis.com', // Google Fonts CSS
    'fonts.gstatic.com',    // Google Fonts files
];

function isBypass(url) {
    return BYPASS.some(pattern => url.includes(pattern));
}

// ── Install: pre-cache the app shell ──
// Uses individual fetches so one missing file doesn't block the whole install.
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE).then(cache =>
            Promise.allSettled(
                SHELL.map(url =>
                    fetch(url).then(res => {
                        if (res.ok) return cache.put(url, res);
                    }).catch(() => { /* skip files that fail */ })
                )
            )
        ).then(() => self.skipWaiting())
    );
});

// ── Activate: remove every old cache version, then notify all open tabs ──
// We post a message rather than force-navigating so the app can decide
// whether a reload is safe (e.g. not mid-transaction).
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
            .then(() => self.clients.matchAll({ type: 'window' }))
            .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' })))
    );
});

// ── Fetch: cache-first for static assets, network-only for everything else ──
self.addEventListener('fetch', event => {
    const { request } = event;

    // Only intercept GET requests
    if (request.method !== 'GET') return;

    const url = request.url;

    // Always go network-first for APIs, credentials, and external CDNs
    if (isBypass(url)) {
        event.respondWith(
            fetch(request).catch(() =>
                new Response(JSON.stringify({ error: 'offline' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' },
                })
            )
        );
        return;
    }

    // Cache-first with network fallback for app shell assets
    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;

            return fetch(request)
                .then(response => {
                    // Only cache successful same-origin responses
                    if (response && response.status === 200 && response.type !== 'opaque') {
                        const clone = response.clone();
                        caches.open(CACHE).then(cache => cache.put(request, clone));
                    }
                    return response;
                })
                .catch(() => {
                    // Offline fallback for page navigations
                    if (request.mode === 'navigate') {
                        return caches.match('/offline.html');
                    }
                    // For other asset failures return a proper empty response
                    return new Response('', {
                        status: 503,
                        statusText: 'Service Unavailable',
                    });
                });
        })
    );
});
