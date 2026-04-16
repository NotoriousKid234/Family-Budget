// Serves Supabase public credentials as a JavaScript snippet at request time.
// Using a function instead of a build-time file means the credentials are read
// from env vars on every request — no build step required.
// The Supabase anon key is intentionally public; it is safe to expose and is
// protected by Row-Level Security policies in Supabase.
exports.handler = async function () {
    const url = process.env.SUPABASE_URL || process.env.FLINT_SB_URL || '';
    const key = process.env.SUPABASE_ANON_KEY || process.env.FLINT_SB_KEY || '';

    const body = (url && key)
        ? `window.__APP_SUPABASE_URL="${url}";window.__APP_SUPABASE_KEY="${key}";`
        : '/* config unavailable */';

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-store',
        },
        body,
    };
};
