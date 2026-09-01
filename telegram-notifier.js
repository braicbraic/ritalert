require('dotenv').config();
const https = require('https');
const logger = require('./bot-logger');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set in environment variables.');
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function sendHttpRequest(method, path, bodyData) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(bodyData);
        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}${path}`,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            let resBody = '';
            res.on('data', chunk => resBody += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(resBody);
                    if (parsed.ok) {
                        resolve(parsed);
                    } else {
                        reject(new Error(parsed.description || 'Telegram API Error'));
                    }
                } catch (e) {
                    reject(new Error(`Response parse error: ${e.message}`));
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.write(payload);
        req.end();
    });
}

async function sendTelegramMessage(chatId, text, replyMarkup = null, maxRetries = 3) {
    const payload = {
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
    };
    if (replyMarkup) {
        payload.reply_markup = replyMarkup;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await sendHttpRequest('POST', '/sendMessage', payload);
            logger.info(`[TELEGRAM SUCCESS] Message sent to Chat ID ${chatId}`);
            return result;
        } catch (err) {
            const backoffMs = Math.pow(2, attempt) * 1000;
            logger.warn(`Attempt ${attempt}/${maxRetries} failed sending Telegram message to ${chatId}: ${err.message}. Retrying in ${backoffMs}ms...`);
            if (attempt === maxRetries) {
                logger.error(`Failed to deliver Telegram message to ${chatId} after ${maxRetries} retries: ${err.message}`);
                throw err;
            }
            await sleep(backoffMs);
        }
    }
}

async function editTelegramMessage(chatId, messageId, text, replyMarkup = null) {
    const payload = {
        chat_id: chatId,
        message_id: messageId,
        text: text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
    };
    if (replyMarkup) {
        payload.reply_markup = replyMarkup;
    }
    return sendHttpRequest('POST', '/editMessageText', payload);
}

async function answerCallbackQuery(callbackQueryId, text = '') {
    return sendHttpRequest('POST', '/answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text: text
    }).catch(() => {});
}

module.exports = {
    sendTelegramMessage,
    editTelegramMessage,
    answerCallbackQuery,
    BOT_TOKEN
};
