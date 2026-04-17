// ── Flint Finance Service Worker ──
// Bump CACHE version any time you want to force all clients to get fresh files.
const CACHE = 'flint-v5';

// Static assets to pre-cache on install (app.html intentionally excluded —
// navigations always go to the network so the page is never served stale).
const SHELL = [
    '/offline.html',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
];

// Patterns for requests that must NEVER be served from cache.
const BYPASS = [
    'supabase.co',          // Supabase API (auth, realtime, DB)
    '.netlify/functions',   // Serverless functions (AI, stocks, config)
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
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE).then(cache =>
            Promise.allSettled(
                SHELL.map(url =>
                    fetch(url, { cache: 'no-store' }).then(res => {
                        if (res.ok) return cache.put(url, res);
                    }).catch(() => {})
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

// ── Fetch ──
self.addEventListener('fetch', event => {
    const { request } = event;

    if (request.method !== 'GET') return;

    const url = request.url;

    // Network-only for page navigations — app.html is never served from cache
    // so users always get the latest version on every visit.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request, { cache: 'no-store' }).catch(() =>
                caches.match('/offline.html')
            )
        );
        return;
    }

    // Network-only for APIs, credentials, and external CDNs.
    if (isBypass(url)) {
        event.respondWith(
            fetch(request, { cache: 'no-store' }).catch(() => {
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

    // Cache-first with network fallback for static assets (icons, manifest, etc.)
    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;
            return fetch(request)
                .then(response => {
                    if (response && response.status === 200 && response.type !== 'opaque') {
                        const clone = response.clone();
                        caches.open(CACHE).then(cache => cache.put(request, clone));
                    }
                    return response;
                })
                .catch(() => new Response('', {
                    status: 503,
                    statusText: 'Service Unavailable',
                }));
        })
    );
});
