const fs = require('fs');
const path = require('path');
const logger = require('./bot-logger');

const STATE_FILE_PATH = path.join(__dirname, 'bot-state.json');

const defaultState = {
    lastProcessedBlock: {
        ethereum: 0,
        ritual: 0
    },
    processedTxHashes: [],
    trackedTargets: {} // { chatId: { addressLower: { address, customName, enabledChains } } }
};

let currentState = { ...defaultState };

function sanitizeCustomName(str) {
    if (!str || typeof str !== 'string') return '';
    let cleaned = str.trim();
    cleaned = cleaned.replace(/0x[a-fA-F0-9]{40}/gi, '').trim();
    cleaned = cleaned.replace(/^\/(name|rename|label)\s+/gi, '').trim();
    cleaned = cleaned.replace(/\/(name|rename|label)\s+/gi, '').trim();
    return cleaned;
}

function sanitizeState(stateObj) {
    if (stateObj && stateObj.trackedTargets) {
        for (const chatId in stateObj.trackedTargets) {
            const userMap = stateObj.trackedTargets[chatId];
            for (const addrKey in userMap) {
                const item = userMap[addrKey];
                if (item && item.customName) {
                    item.customName = sanitizeCustomName(item.customName);
                }
            }
        }
    }
}

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE_PATH)) {
            const raw = fs.readFileSync(STATE_FILE_PATH, 'utf8');
            currentState = JSON.parse(raw);
            if (!currentState.lastProcessedBlock) currentState.lastProcessedBlock = { ethereum: 0, ritual: 0 };
            if (!currentState.processedTxHashes) currentState.processedTxHashes = [];
            if (!currentState.trackedTargets) currentState.trackedTargets = {};
            sanitizeState(currentState);
            saveState();
            logger.info(`State loaded from disk & sanitized. Active tracked chats: ${Object.keys(currentState.trackedTargets).length}`);
        } else {
            saveState();
        }
    } catch (err) {
        logger.error(`Error reading bot-state.json: ${err.message}. Initializing clean state.`);
        currentState = { ...defaultState };
        saveState();
    }
    return currentState;
}

function saveState() {
    try {
        // Keep processed tx hashes bounded to last 5000 items
        if (currentState.processedTxHashes.length > 5000) {
            currentState.processedTxHashes = currentState.processedTxHashes.slice(-2500);
        }
        fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(currentState, null, 2), 'utf8');
    } catch (err) {
        logger.error(`Failed to save state to disk: ${err.message}`);
    }
}

function getLastBlock(chainId) {
    return currentState.lastProcessedBlock[chainId] || 0;
}

function setLastBlock(chainId, blockNum) {
    currentState.lastProcessedBlock[chainId] = blockNum;
    saveState();
}

function hasProcessedTx(txHash) {
    return currentState.processedTxHashes.includes(txHash.toLowerCase());
}

function markTxProcessed(txHash) {
    const lower = txHash.toLowerCase();
    if (!currentState.processedTxHashes.includes(lower)) {
        currentState.processedTxHashes.push(lower);
        saveState();
    }
}

function getTrackedTargets() {
    return currentState.trackedTargets;
}

function setTrackedTargets(targetsMap) {
    currentState.trackedTargets = targetsMap;
    saveState();
}

module.exports = {
    loadState,
    saveState,
    getLastBlock,
    setLastBlock,
    hasProcessedTx,
    markTxProcessed,
    getTrackedTargets,
    setTrackedTargets,
    sanitizeCustomName,
    stateFilePath: STATE_FILE_PATH
};
