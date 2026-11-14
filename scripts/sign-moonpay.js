const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// 1. Simple helper to parse the .env file
function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
        console.error("Error: .env file not found. Run this script in the project root.");
        process.exit(1);
    }
    const content = fs.readFileSync(envPath, 'utf8');
    const env = {};
    content.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            const key = match[1];
            let value = match[2] || '';
            // Remove quotes if present
            if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
                value = value.substring(1, value.length - 1);
            }
            env[key] = value.trim();
        }
    });
    return env;
}

const env = loadEnv();

const publishableKey = env.MOONPAY_PUBLISHABLE_KEY;
const secretKey = env.MOONPAY_SECRET_KEY;
const targetAddress = env.WALLET_ADDRESS || '0x03eA261b6d93d2Efd6FA11D2AAbEC8501F5b394E';

if (!publishableKey || !secretKey) {
    console.error("Error: MOONPAY_PUBLISHABLE_KEY or MOONPAY_SECRET_KEY not found in .env.");
    process.exit(1);
}

// 2. Formulate the base URL to sign
const baseUrl = "https://buy-sandbox.moonpay.com/";
const queryParams = `?apiKey=${publishableKey}&currencyCode=usdc&walletAddress=${targetAddress}`;
const urlToSign = `${baseUrl}${queryParams}`;

console.log("\n================ MOONPAY URL SIGNER ==================");
console.log(`> Base URL:       ${baseUrl}`);
console.log(`> Query Params:   ${queryParams}`);
console.log(`> Target Wallet:  ${targetAddress}`);

// 3. Extract query string (everything starting with '?')
const queryString = queryParams;

// 4. Generate the HMAC-SHA256 signature using the Secret Key
const signature = crypto
    .createHmac('sha256', secretKey)
    .update(queryString)
    .digest('base64');

// 5. Append the URL-encoded signature to your checkout session
const signedUrl = `${urlToSign}&signature=${encodeURIComponent(signature)}`;

console.log("\n🔑 Generated Signature (Base64):");
console.log(signature);

console.log("\n🚀 Copy & paste the following Signed URL into your browser to test:");
console.log(signedUrl);
console.log("=====================================================\n");
