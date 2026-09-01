const fs = require('fs');
const path = require('path');

const LOG_FILE_PATH = path.join(__dirname, 'bot-scanner.log');

function formatTimestamp() {
    return new Date().toISOString();
}

function writeLog(level, message) {
    const timestamp = formatTimestamp();
    const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    console.log(logLine.trim());

    try {
        fs.appendFileSync(LOG_FILE_PATH, logLine, 'utf8');
    } catch (err) {
        console.error(`[${timestamp}] [ERROR] Failed to write to log file: ${err.message}`);
    }
}

module.exports = {
    info: (msg) => writeLog('info', msg),
    warn: (msg) => writeLog('warn', msg),
    error: (msg) => writeLog('error', msg),
    tx: (msg) => writeLog('tx_detected', msg),
    logFilePath: LOG_FILE_PATH
};
