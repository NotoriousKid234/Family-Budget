// This script runs during Netlify build (see netlify.toml).
// It reads SUPABASE_URL and SUPABASE_ANON_KEY from Netlify environment variables
// and writes them into config.js, which app.html loads at runtime.
// config.js is NEVER committed to Git — it only exists after a Netlify build.

const fs = require('fs');

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || '';

if (!url || !key) {
  console.error('[generate-config] WARNING: SUPABASE_URL or SUPABASE_ANON_KEY is not set in Netlify environment variables.');
  console.error('[generate-config] The app will not connect to Supabase until these are configured.');
}

const content = `// AUTO-GENERATED at build time by generate-config.js
// Do NOT commit this file to Git.
window.__APP_SUPABASE_URL = '${url}';
window.__APP_SUPABASE_KEY = '${key}';
`;

fs.writeFileSync('config.js', content);
console.log('[generate-config] config.js written successfully.');
