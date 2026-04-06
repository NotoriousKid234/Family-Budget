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
  try {
    const authCheck = await fetch(supabaseUrl + '/auth/v1/user', {
      headers: { 'Authorization': 'Bearer ' + userToken, 'apikey': supabaseKey }
    });
    if (!authCheck.ok) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  } catch (e) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const ALLOWED_MODELS = ['claude-haiku-4-5-20251001', 'claude-haiku-3-5-20241022', 'claude-3-5-haiku-20241022'];
  const requestedModel = body.model;
  const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : ALLOWED_MODELS[0];

  const MAX_TOKENS_CAP = 2048;
  const requestedTokens = parseInt(body.max_tokens, 10);
  const max_tokens = (!isNaN(requestedTokens) && requestedTokens > 0 && requestedTokens <= MAX_TOKENS_CAP)
    ? requestedTokens : 1024;

  const system = typeof body.system === 'string' ? body.system.substring(0, 4000) : '';
  const messages = Array.isArray(body.messages) ? body.messages : null;

  if (!messages || messages.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing messages' }) };
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
