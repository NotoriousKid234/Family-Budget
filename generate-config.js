// Runs at Netlify build time (see netlify.toml).
// Reads env vars set in Netlify dashboard and writes config.js.
// config.js is gitignored and never committed.
const fs = require('fs');
const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || '';
if (!url || !key) {
  console.error('[generate-config] ERROR: SUPABASE_URL or SUPABASE_ANON_KEY not set.');
  process.exit(1);
}
const out = 'window.__APP_SUPABASE_URL=\"' + url + '\";window.__APP_SUPABASE_KEY=\"' + key + '\";';
fs.writeFileSync('config.js', out);
console.log('[generate-config] config.js written.');
