const https = require('https');

const BOT_TOKEN = '8903424188:AAGsyvjW_HGvP0p8cSWVz9jaZnnH5loZEt4';
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

let offset = 0;

console.log('====================================================');
console.log('🤖 RitAlert Telegram Bot Helper successfully started');
console.log('Listening for messages on @ritalert_bot...');
console.log('====================================================');

function sendMessage(chatId, text) {
    const data = JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    };

    const req = https.request(options, (res) => {
        res.on('data', () => {});
    });

    req.on('error', (e) => {
        console.error(`Error sending message: ${e.message}`);
    });

    req.write(data);
    req.end();
}

function pollUpdates() {
    https.get(`${BASE_URL}/getUpdates?offset=${offset}&timeout=30`, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (data.ok && data.result.length > 0) {
                    data.result.forEach(update => {
                        offset = update.update_id + 1;
                        if (update.message && update.message.text) {
                            const chatId = update.message.chat.id;
                            const text = update.message.text.trim();
                            const firstName = update.message.from.first_name || 'there';

                            console.log(`[Message] From ${firstName} (ID: ${chatId}): "${text}"`);

                            if (text.startsWith('/start')) {
                                const responseText = `👋 *Hello ${firstName}!*\n\nWelcome to *RitAlert* 🔔\n\nYour Telegram Chat ID is:\n\`${chatId}\`\n\nCopy and paste this Chat ID into the RitAlert Notifications hub in your browser to link your account.`;
                                sendMessage(chatId, responseText);
                            }
                        }
                    });
                }
            } catch (err) {
                console.error('Error parsing response:', err);
            }
            // Continue polling
            setTimeout(pollUpdates, 1000);
        });
    }).on('error', (e) => {
        console.error(`Polling error: ${e.message}`);
        setTimeout(pollUpdates, 5000); // Retry after 5s on network error
    });
}

pollUpdates();
