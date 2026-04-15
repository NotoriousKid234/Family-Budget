// In-memory rate limiter (per Netlify function instance; sufficient for a personal/family app)
const rateLimitMap = new Map(); // userId -> [timestamp, ...]
const RATE_WINDOW_MS = 60_000;  // 1 minute
const RATE_MAX_CALLS = 20;      // 20 AI calls per user per minute

function checkRateLimit(userId) {
  const now = Date.now();
  const calls = (rateLimitMap.get(userId) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (calls.length >= RATE_MAX_CALLS) return false;
  calls.push(now);
  rateLimitMap.set(userId, calls);
  return true;
}

const INDEX_SYMBOLS = new Set(['SPY', 'QQQ', 'DIA', 'IWM', 'VTI', 'GLD', 'TLT', 'EEM', 'AGG']);

exports.handler = async function (event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Verify Supabase auth token
  const authHeader = event.headers && (event.headers['authorization'] || event.headers['Authorization']);
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  const userToken = authHeader.slice(7);
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  let userId;
  try {
    const authCheck = await fetch(supabaseUrl + '/auth/v1/user', {
      headers: { 'Authorization': 'Bearer ' + userToken, 'apikey': supabaseKey }
    });
    if (!authCheck.ok) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    const userData = await authCheck.json();
    userId = userData?.id;
    if (!userId) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  } catch (e) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // Rate limit check
  if (!checkRateLimit(userId)) {
    return { statusCode: 429, body: JSON.stringify({ error: 'Too many requests. Please wait a moment.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  // ── Stock market data action ──────────────────────────────────────────────
  if (body.action === 'stocks') {
    const rawSymbols = Array.isArray(body.symbols) ? body.symbols : [];
    const symbols = rawSymbols
      .filter(s => typeof s === 'string' && /^[A-Z0-9^.-]{1,10}$/.test(s))
      .slice(0, 10);
    if (!symbols.length) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No valid symbols provided' }) };
    }

    // Client-supplied type hints (validated server-side)
    const rawTypes = typeof body.types === 'object' && body.types !== null ? body.types : {};

    try {
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) throw new Error('Yahoo Finance returned ' + res.status);
      const data = await res.json();

      const quotes = (data?.quoteResponse?.result || []).map(q => {
        const clientType = rawTypes[q.symbol];
        const type = clientType === 'stock' || clientType === 'index'
          ? clientType
          : (q.symbol.startsWith('^') || INDEX_SYMBOLS.has(q.symbol) ? 'index' : 'stock');
        return {
          symbol: q.symbol,
          name: q.shortName || q.longName || q.symbol,
          price: q.regularMarketPrice || 0,
          change: q.regularMarketChangePercent || 0,
          type
        };
      });

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quotes })
      };
    } catch (e) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Market data temporarily unavailable', quotes: [] }) };
    }
  }

  // ── Claude AI action ──────────────────────────────────────────────────────
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  const ALLOWED_MODELS = ['claude-haiku-4-5-20251001'];
  const requestedModel = body.model;
  const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : ALLOWED_MODELS[0];

  const MAX_TOKENS_CAP = 1024;
  const requestedTokens = parseInt(body.max_tokens, 10);
  const max_tokens = (!isNaN(requestedTokens) && requestedTokens > 0 && requestedTokens <= MAX_TOKENS_CAP)
    ? requestedTokens : 400;

  const MAX_SYSTEM_LEN   = 4000;
  const MAX_PROMPT_LEN   = 8000;
  const MAX_MSG_CONTENT  = 4000;
  const MAX_MSGS         = 20;

  const system = typeof body.system === 'string' ? body.system.substring(0, MAX_SYSTEM_LEN) : '';
  const prompt = typeof body.prompt === 'string' ? body.prompt.substring(0, MAX_PROMPT_LEN) : null;
  const rawMessages = Array.isArray(body.messages) ? body.messages : null;

  if (!prompt && !rawMessages) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing prompt or messages' }) };
  }

  // Validate mediaType if image data is provided (for future vision calls)
  const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (body.image && body.mediaType && !ALLOWED_MEDIA_TYPES.includes(body.mediaType)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid or unsupported image media type' }) };
  }

  // Sanitize messages array: cap count, cap content length, enforce valid roles
  const messages = rawMessages
    ? rawMessages.slice(0, MAX_MSGS).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: typeof m.content === 'string' ? m.content.substring(0, MAX_MSG_CONTENT) : ''
      })).filter(m => m.content.length > 0)
    : [{ role: 'user', content: prompt }];

  if (!messages.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No valid messages to send' }) };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ model, max_tokens, system, messages })
    });
    const data = await response.json();
    return {
      statusCode: response.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'AI request failed' }) };
  }
};
