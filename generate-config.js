// Runs at Netlify build time (see netlify.toml).
// Reads env vars set in Netlify dashboard and writes config.js.
// config.js is gitignored and never committed.
//
// Supports two common env var naming conventions:
//   FLINT_SB_URL  / FLINT_SB_KEY       (app-specific)
//   SUPABASE_URL  / SUPABASE_ANON_KEY  (standard Supabase/Netlify convention)
const fs = require('fs');
const url = process.env.FLINT_SB_URL || process.env.SUPABASE_URL || '';
const key = process.env.FLINT_SB_KEY || process.env.SUPABASE_ANON_KEY || '';
if (!url || !key) {
  console.error('[generate-config] ERROR: Supabase credentials not found in env vars.');
  console.error('Set FLINT_SB_URL + FLINT_SB_KEY  OR  SUPABASE_URL + SUPABASE_ANON_KEY in Netlify.');
  process.exit(1);
}
const out = 'window.__APP_SUPABASE_URL="' + url + '";window.__APP_SUPABASE_KEY="' + key + '";';
fs.writeFileSync('config.js', out);
console.log('[generate-config] config.js written. URL: ' + url.substring(0, 35) + '...');
