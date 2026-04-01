exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };


  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }


  try {
    const body = JSON.parse(event.body);


    // ── STOCK DATA ACTION ──────────────────────────────────────────────────────
    if (body.action === 'stocks') {
      const symbols = (body.symbols || ['AAPL','NVDA','TSLA','MSFT','SPY','QQQ']).join(',');


      const urls = [
        `https://query1.finance.yahoo.com/v8/finance/quote?symbols=${symbols}`,
        `https://query2.finance.yahoo.com/v8/finance/quote?symbols=${symbols}`,
      ];


      let quotes = null;
      for (const url of urls) {
        try {
          const res = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
              'Accept-Language': 'en-US,en;q=0.9',
            },
            signal: AbortSignal.timeout(8000)
          });
          if (!res.ok) continue;
          const data = await res.json();
          const result = data?.quoteResponse?.result || [];
          if (result.length > 0) { quotes = result; break; }
        } catch (e) { continue; }
      }


      if (!quotes) {
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ quotes: [], error: 'market_closed' })
        };
      }


      const stripped = quotes.map(q => ({
        symbol: q.symbol,
        name:   q.shortName || q.longName || q.symbol,
        price:  q.regularMarketPrice || 0,
        change: q.regularMarketChangePercent || 0,
        type:   ['SPY','QQQ','^DJI','^GSPC','^IXIC'].includes(q.symbol) ? 'index' : 'stock',
      }));


      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ quotes: stripped })
      };
    }


    // ── ANTHROPIC AI ACTION ────────────────────────────────────────────────────
    const { prompt, system, image, mediaType, message } = body;
    const userText = prompt || message || '';


    let messageContent;
    if (image) {
      messageContent = [
        { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image } },
        { type: 'text', text: userText }
      ];
    } else {
      messageContent = userText;
    }


    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        system: system || '',
        messages: [{ role: 'user', content: messageContent }]
