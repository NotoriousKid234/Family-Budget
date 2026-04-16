// ── Flint Finance Service Worker ──
// Bump CACHE version any time you want to force all clients to get fresh files.
const CACHE = 'flint-v4';

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
                    // cache: 'no-store' bypasses the browser HTTP cache so we always
                    // pre-cache the freshest version of each shell file.
                    fetch(url, { cache: 'no-store' }).then(res => {
                        if (res.ok) return cache.put(url, res);
                    }).catch(() => { /* skip files that fail */ })
                )
            )
        ).then(() => self.skipWaiting())
    );
});

// ── Activate: remove every old cache version ──
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ── Fetch: cache-first for static assets, network-only for everything else ──
self.addEventListener('fetch', event => {
    const { request } = event;

    // Only intercept GET requests
    if (request.method !== 'GET') return;

    const url = request.url;

    // Always go network-only for APIs, credentials, and external CDNs.
    // Use cache: 'no-store' so the browser HTTP cache is also bypassed —
    // without this flag fetch() can still serve a stale HTTP-cached response.
    if (isBypass(url)) {
        event.respondWith(
            fetch(request, { cache: 'no-store' }).catch(() => {
                // For config.js specifically, a failure means the app can't init —
                // return an empty script rather than a JSON error so the page loads.
                if (url.includes('config.js')) {
                    return new Response('', {
                        status: 200,
                        headers: { 'Content-Type': 'application/javascript' },
                    });
                }
                return new Response(JSON.stringify({ error: 'offline' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' },
                });
            })
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
                    return new Response('', {
                        status: 503,
                        statusText: 'Service Unavailable',
                    });
                });
        })
    );
});
