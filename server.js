const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ethers } = require('ethers');
const db = require('./db');

const PORT = 8000;

// Helper to parse the .env file
function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
        return {};
    }
    const content = fs.readFileSync(envPath, 'utf8');
    const env = {};
    content.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            const key = match[1];
            let value = match[2] || '';
            if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
                value = value.substring(1, value.length - 1);
            }
            env[key] = value.trim();
        }
    });
    return env;
}

const env = loadEnv();
Object.keys(env).forEach(key => {
    process.env[key] = env[key];
});

const MOONPAY_SECRET_KEY = process.env.MOONPAY_SECRET_KEY;
const MOONPAY_PUBLISHABLE_KEY = process.env.MOONPAY_PUBLISHABLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const ONRAMPER_PUBLIC_KEY = process.env.ONRAMPER_PUBLIC_KEY;
const ONRAMPER_SECRET_KEY = process.env.ONRAMPER_SECRET_KEY;

// Fail-fast startup validation for required environments
const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'STRIPE_SECRET_KEY', 'TELEGRAM_BOT_TOKEN'];
requiredEnv.forEach(key => {
    if (!process.env[key]) {
        console.error(`❌ CRITICAL STARTUP ERROR: Missing environment variable: ${key}`);
        process.exit(1);
    }
});

// Content type mapper for static files
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Helper to parse POST request body as JSON
function parseJsonBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                resolve({});
            }
        });
    });
}

// Helper to verify Web3 signature for sessions
function verifySignature(claimedAddress, signature, message = "Authenticate RitAlert Session") {
    if (!claimedAddress || !signature) return false;
    try {
        const recoveredAddress = ethers.verifyMessage(message, signature);
        return recoveredAddress.toLowerCase() === claimedAddress.toLowerCase();
    } catch (err) {
        return false;
    }
}

const server = http.createServer(async (req, res) => {
    // Parse URL and query params
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    // --- DATABASE API ROUTES ---
    if (pathname === '/api/db/subscription' && req.method === 'GET') {
        const walletAddress = parsedUrl.searchParams.get('walletAddress');
        const sub = await db.dbGetSubscription(walletAddress);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:8000' });
        return res.end(JSON.stringify({ subscription: sub }));
    }

    if (pathname === '/api/db/activate-trial' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const { walletAddress, signature } = body;
        if (!verifySignature(walletAddress, signature)) {
            res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:8000' });
            return res.end(JSON.stringify({ error: "Unauthorized: Invalid Web3 session signature" }));
        }
        const success = await db.dbActivateTrial(walletAddress);
        res.writeHead(success ? 200 : 500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:8000' });
        return res.end(JSON.stringify({ success }));
    }

    if (pathname === '/api/db/tracked-addresses' && req.method === 'GET') {
        const walletAddress = parsedUrl.searchParams.get('walletAddress');
        const list = await db.dbGetTrackedAddresses(walletAddress);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:8000' });
        return res.end(JSON.stringify({ addresses: list }));
    }

    if (pathname === '/api/db/save-address' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const { userWallet, targetAddress, blockchain, alias, signature } = body;
        if (!verifySignature(userWallet, signature)) {
            res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:8000' });
            return res.end(JSON.stringify({ error: "Unauthorized: Invalid Web3 session signature" }));
        }
        const data = await db.dbSaveTrackedAddress(userWallet, targetAddress, blockchain, alias);
        res.writeHead(data ? 200 : 500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:8000' });
        return res.end(JSON.stringify({ success: !!data, address: data }));
    }

    if (pathname === '/api/db/delete-address' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const { id, userWallet, signature } = body;
        if (!verifySignature(userWallet, signature)) {
            res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:8000' });
            return res.end(JSON.stringify({ error: "Unauthorized: Invalid Web3 session signature" }));
        }
        const success = await db.dbDeleteTrackedAddress(id, userWallet);
        res.writeHead(success ? 200 : 500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:8000' });
        return res.end(JSON.stringify({ success }));
    }

    if (pathname === '/api/db/socials' && req.method === 'GET') {
        const walletAddress = parsedUrl.searchParams.get('walletAddress');
        const socials = await db.dbGetSocials(walletAddress);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:8000' });
        return res.end(JSON.stringify({ socials }));
    }

    if (pathname === '/api/db/save-socials' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const { walletAddress, platform, handleValue, signature } = body;
        if (!verifySignature(walletAddress, signature)) {
            res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:8000' });
            return res.end(JSON.stringify({ error: "Unauthorized: Invalid Web3 session signature" }));
        }
        const success = await db.dbSaveSocials(walletAddress, platform, handleValue);
        res.writeHead(success ? 200 : 500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:8000' });
        return res.end(JSON.stringify({ success }));
    }

    // --- SECURE TELEGRAM SENDER ROUTE ---
    if (pathname === '/api/payments/test-telegram' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const { chatId, message } = body;
        const botToken = process.env.TELEGRAM_BOT_TOKEN;

        if (!botToken) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: "Telegram Bot Token not configured on backend" }));
        }

        const postData = JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML'
        });

        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${botToken}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const tgReq = https.request(options, (tgRes) => {
            let tgBody = '';
            tgRes.on('data', (chunk) => { tgBody += chunk; });
            tgRes.on('end', () => {
                try {
                    const data = JSON.parse(tgBody);
                    if (data.ok) {
                        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:8000' });
                        res.end(JSON.stringify({ success: true }));
                    } else {
                        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:8000' });
                        res.end(JSON.stringify({ success: false, error: data.description }));
                    }
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:8000' });
                    res.end(JSON.stringify({ success: false, error: "Failed to parse Telegram response" }));
                }
            });
        });

        tgReq.on('error', (err) => {
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:8000' });
            res.end(JSON.stringify({ success: false, error: err.message }));
        });

        tgReq.write(postData);
        tgReq.end();
        return;
    }

    // --- SECURE API ROUTE: CREATE STRIPE CHECKOUT SESSION ---
    if (pathname === '/api/payments/stripe-session' && req.method === 'GET') {
        const planName = parsedUrl.searchParams.get('planName') || 'Pro';
        const price = parsedUrl.searchParams.get('price') || '1.99';
        
        // Convert dollar amount to cents for Stripe
        const amountCents = Math.round(parseFloat(price) * 100);

        if (!STRIPE_SECRET_KEY) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: "Stripe Secret Key not configured in backend .env file" }));
        }

        const postData = new URLSearchParams({
            'success_url': `http://localhost:8000/app.html?session_id={CHECKOUT_SESSION_ID}`,
            'cancel_url': `http://localhost:8000/app.html`,
            'mode': 'payment',
            'line_items[0][price_data][currency]': 'usd',
            'line_items[0][price_data][product_data][name]': `RitAlert Subscription - ${planName}`,
            'line_items[0][price_data][unit_amount]': amountCents,
            'line_items[0][quantity]': 1
        }).toString();

        const options = {
            hostname: 'api.stripe.com',
            port: 443,
            path: '/v1/checkout/sessions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const stripeReq = https.request(options, (stripeRes) => {
            let body = '';
            stripeRes.on('data', (chunk) => { body += chunk; });
            stripeRes.on('end', () => {
                try {
                    const session = JSON.parse(body);
                    if (session.url) {
                        console.log(`[API] Generated Stripe Checkout Session for ${planName} ($${price})`);
                        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                        res.end(JSON.stringify({ url: session.url }));
                    } else {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: session.error ? session.error.message : "Failed to create Stripe session" }));
                    }
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: "Failed to parse Stripe API response" }));
                }
            });
        });

        stripeReq.on('error', (err) => {
            console.error(err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        });

        stripeReq.write(postData);
        stripeReq.end();
        return;
    }

    // --- SECURE API ROUTE: SIGN MOONPAY WIDGET URL ---
    if (pathname === '/api/payments/moonpay-url' && req.method === 'GET') {
        const walletAddress = parsedUrl.searchParams.get('walletAddress') || '0x0000000000000000000000000000000000000000';
        const currencyCode = parsedUrl.searchParams.get('currencyCode') || 'usdc';

        if (!MOONPAY_SECRET_KEY || !MOONPAY_PUBLISHABLE_KEY) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: "MoonPay credentials not configured on backend .env file" }));
        }

        try {
            // Formulate base sandbox params
            const targetParams = `?apiKey=${MOONPAY_PUBLISHABLE_KEY}&currencyCode=${currencyCode}&walletAddress=${walletAddress}`;
            const targetUrl = `https://buy-sandbox.moonpay.com/${targetParams}`;

            // Create HMAC-SHA256 signature using Secret Key
            const signature = crypto
                .createHmac('sha256', MOONPAY_SECRET_KEY)
                .update(targetParams)
                .digest('base64');

            // Encode signature for URL
            const signedUrl = `${targetUrl}&signature=${encodeURIComponent(signature)}`;

            console.log(`[API] Generated secure signature for wallet: ${walletAddress}`);

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify({ url: signedUrl }));
        } catch (err) {
            console.error(err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: "Failed to generate signature" }));
        }
    }

    // --- SECURE API ROUTE: SIGN ONRAMPER WIDGET URL ---
    if (pathname === '/api/payments/onramper-url' && req.method === 'GET') {
        const walletAddress = parsedUrl.searchParams.get('walletAddress') || '0x0000000000000000000000000000000000000000';
        
        if (!ONRAMPER_SECRET_KEY || !ONRAMPER_PUBLIC_KEY) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: "Onramper credentials not configured on backend .env file" }));
        }

        try {
            // Sensitive content to sign (unencoded parameter)
            const signContent = `wallets=usdc:${walletAddress}`;

            // Create HMAC-SHA256 signature using Secret Key
            const signature = crypto
                .createHmac('sha256', ONRAMPER_SECRET_KEY)
                .update(signContent)
                .digest('hex');

            // Construct full signed url
            const signedUrl = `https://buy.onramper.dev/?apiKey=${ONRAMPER_PUBLIC_KEY}&defaultCrypto=usdc&mode=buy&wallets=usdc:${walletAddress}&signature=${signature}`;

            console.log(`[API] Generated secure Onramper URL for wallet: ${walletAddress}`);

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify({ url: signedUrl }));
        } catch (err) {
            console.error(err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: "Failed to generate Onramper signature" }));
        }
    }

    // --- STATIC FILES SERVER (Replaces Python server on port 8000) ---
    let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
    
    // Safety check to prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('Forbidden');
    }

    fs.exists(filePath, (exists) => {
        if (!exists) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('Not Found');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 RitAlert Secure Development Server running!`);
    console.log(`👉 Access App:   http://localhost:${PORT}/app.html`);
    console.log(`👉 Access API:   http://localhost:${PORT}/api/payments/moonpay-url`);
    console.log(`======================================================\n`);
});
