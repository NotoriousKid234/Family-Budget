const fetch = require('node-fetch');

exports.handler = async (event) => {
    // 🛡️ SECURITY SHIELD: Check for the VIP Pass (Token)
    // This stops unauthorized people from using your API credits.
    const secureToken = event.headers['x-ai-proxy-token'];
    const expectedToken = process.env.AI_PROXY_TOKEN || 'fallback-secret-123';

    if (!secureToken || secureToken !== expectedToken) {
        return {
            statusCode: 403,
            body: JSON.stringify({ error: "Unauthorized: Missing or invalid security token." })
        };
    }

    // --- ORIGINAL AI PROXY LOGIC BELOW ---
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body);
        const { system, prompt, image, mediaType, message, action, symbols } = body;

        // Handle Stock API Requests
        if (action === 'stocks') {
            const stockRes = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}`);
            const stockData = await stockRes.json();
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(stockData)
            };
        }

        // Handle Anthropic AI Requests
        const anthropicPayload = {
            model: "claude-3-haiku-20240307",
            max_tokens: 1024,
            system: system || "You are a helpful financial assistant.",
            messages: []
        };

        if (image && mediaType) {
            anthropicPayload.messages.push({
                role: "user",
                content: [
                    { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
                    { type: "text", text: prompt || "Analyze this image." }
                ]
            });
        } else {
            anthropicPayload.messages.push({
                role: "user",
                content: message || prompt
            });
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(anthropicPayload)
        });

        const data = await response.json();
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error('Proxy Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
