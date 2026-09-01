require('dotenv').config();
const https = require('https');
const { ethers } = require('ethers');

const logger = require('./bot-logger');
const botState = require('./bot-state');
const rpcPoller = require('./rpc-poller');
const txFilter = require('./tx-filter');
const notifier = require('./telegram-notifier');

const CHAINS = [
    { id: 'ethereum', name: 'Ethereum Mainnet', symbol: 'ETH', icon: '🔷', explorer: 'https://etherscan.io' },
    { id: 'ritual', name: 'Ritual Testnet', symbol: 'RITUAL', icon: '🔮', explorer: 'https://explorer.ritualfoundation.org' },
    { id: 'bsc', name: 'BNB Smart Chain', symbol: 'BNB', icon: '🟡', explorer: 'https://bscscan.com' },
    { id: 'arbitrum', name: 'Arbitrum One', symbol: 'ETH', icon: '🔵', explorer: 'https://arbiscan.io' },
    { id: 'optimism', name: 'Optimism', symbol: 'ETH', icon: '🔴', explorer: 'https://optimistic.etherscan.io' },
    { id: 'base', name: 'Base', symbol: 'ETH', icon: '🔵', explorer: 'https://basescan.org' }
];

const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

let state = botState.loadState();
const chatLastTargetMap = {};
const pendingRenameMap = {};
let telegramOffset = 0;

const chainScannerState = {}; // { chainId: { mode: 'websocket'|'rest', provider, restTimer, lastScannedBlock } }
const tokenMetadataCache = {}; // Cache for contract token metadata { chainId_addressLower: { symbol, name, decimals } }

logger.info('====================================================');
logger.info('🤖 RitAlert Telegram Bot Engine Started');
logger.info('Multi-Chain WSS Subscriptions & Scoped Target List Active');
logger.info('====================================================');

function isAddress(input) {
    return /^0x[a-fA-F0-9]{40}$/.test(input.trim());
}

async function getTokenMetadata(provider, contractAddress, chainId) {
    if (!contractAddress || contractAddress === '0x' || !isAddress(contractAddress)) {
        return { symbol: '', name: '', decimals: 18 };
    }
    const key = `${chainId}_${contractAddress.toLowerCase()}`;
    if (tokenMetadataCache[key]) return tokenMetadataCache[key];

    try {
        const contract = new ethers.Contract(contractAddress, [
            "function symbol() view returns (string)",
            "function name() view returns (string)",
            "function decimals() view returns (uint8)"
        ], provider);

        const [symbolRes, nameRes, decimalsRes] = await Promise.allSettled([
            contract.symbol(),
            contract.name(),
            contract.decimals()
        ]);

        const symbol = symbolRes.status === 'fulfilled' ? symbolRes.value : '';
        const name = nameRes.status === 'fulfilled' ? nameRes.value : '';
        const decimals = decimalsRes.status === 'fulfilled' ? decimalsRes.value : 18;

        const meta = { symbol, name, decimals };
        if (symbol || name) {
            tokenMetadataCache[key] = meta;
        }
        return meta;
    } catch (e) {
        return { symbol: '', name: '', decimals: 18 };
    }
}

async function fetchMultiChainData(addressHex) {
    let normalizedAddress = addressHex;
    try {
        normalizedAddress = ethers.getAddress(addressHex.toLowerCase());
    } catch (e) {}

    let ethCode = '0x';
    let ritualCode = '0x';

    try {
        const ethProvider = await rpcPoller.getWorkingHttpProvider('ethereum');
        ethCode = await ethProvider.getCode(normalizedAddress);
    } catch (e) {}

    try {
        const ritualProvider = await rpcPoller.getWorkingHttpProvider('ritual');
        ritualCode = await ritualProvider.getCode(normalizedAddress);
    } catch (e) {}

    const isContract = (ethCode !== '0x' && ethCode !== '0x0') || (ritualCode !== '0x' && ritualCode !== '0x0');

    const balances = await Promise.allSettled(CHAINS.map(async (c) => {
        try {
            const provider = await rpcPoller.getWorkingHttpProvider(c.id);
            const rawBal = await provider.getBalance(normalizedAddress);
            const formatted = parseFloat(ethers.formatEther(rawBal)).toFixed(4);
            return { id: c.id, name: c.name, icon: c.icon, symbol: c.symbol, balance: `${formatted} ${c.symbol}` };
        } catch (e) {
            return { id: c.id, name: c.name, icon: c.icon, symbol: c.symbol, balance: `0.0000 ${c.symbol}` };
        }
    }));

    const chainBalances = balances.map(b => b.value || { name: 'Unknown', balance: '0.0000' });

    let contractMetadata = null;
    if (isContract) {
        try {
            const ethProvider = await rpcPoller.getWorkingHttpProvider('ethereum');
            const tokenContract = new ethers.Contract(normalizedAddress, [
                "function name() view returns (string)",
                "function symbol() view returns (string)",
                "function totalSupply() view returns (uint256)",
                "function decimals() view returns (uint8)"
            ], ethProvider);

            const [nameRes, symbolRes, supplyRes, decRes] = await Promise.allSettled([
                tokenContract.name(),
                tokenContract.symbol(),
                tokenContract.totalSupply(),
                tokenContract.decimals()
            ]);

            let supplyStr = '';
            if (supplyRes.status === 'fulfilled' && decRes.status === 'fulfilled') {
                supplyStr = parseFloat(ethers.formatUnits(supplyRes.value, decRes.value)).toLocaleString();
            }

            contractMetadata = {
                tokenName: nameRes.status === 'fulfilled' ? nameRes.value : 'Smart Contract',
                tokenSymbol: symbolRes.status === 'fulfilled' ? symbolRes.value : '',
                totalSupply: supplyStr
            };
        } catch (e) {}
    }

    return {
        address: normalizedAddress,
        isContract,
        contractMetadata,
        chainBalances
    };
}

function buildCardMessage(targetInfo, customName = null, enabledChains = ['ethereum', 'ritual', 'bsc', 'arbitrum', 'optimism', 'base']) {
    const { address, isContract, contractMetadata, chainBalances } = targetInfo;
    const nameLabel = customName || (isContract ? (contractMetadata?.tokenName || 'Smart Contract') : 'Personal Wallet (EOA)');

    let msg = `⚡ *RITALERT LIVE MONITORING* ⚡\n`;
    msg += `─────────────────────────\n`;
    msg += `🏷️ *Target Label:* \`${nameLabel}\`\n`;
    msg += `📍 *Address:* \`${address}\`\n`;
    msg += `📦 *Type:* ${isContract ? `📜 Smart Contract (${contractMetadata?.tokenSymbol || 'Bytecode'})` : '👛 Personal Wallet (EOA)'}\n\n`;

    if (isContract && contractMetadata?.totalSupply) {
        msg += `💎 *Total Supply:* \`${contractMetadata.totalSupply} ${contractMetadata.tokenSymbol}\`\n\n`;
    }

    msg += `📊 *CHAIN-BY-CHAIN BALANCES:*\n`;
    msg += `─────────────────────────\n`;

    const ethData = chainBalances.find(c => c.id === 'ethereum');
    if (ethData) msg += `🔷 *Ethereum Mainnet:* \`${ethData.balance}\`\n`;

    const ritualData = chainBalances.find(c => c.id === 'ritual');
    if (ritualData) msg += `🔮 *Ritual Testnet:* \`${ritualData.balance}\`\n`;

    chainBalances.filter(c => c.id !== 'ethereum' && c.id !== 'ritual').forEach(c => {
        msg += `${c.icon} *${c.name}:* \`${c.balance}\`\n`;
    });

    msg += `\n─────────────────────────\n`;
    msg += `⚡ *REAL-TIME BLOCK MONITORING ACTIVE FOR:*\n`;

    const activeChainsList = CHAINS.filter(c => enabledChains.includes(c.id));

    if (activeChainsList.length === 0) {
        msg += `⚠️ *No networks currently selected.* Click *[⚙️ Configure Networks]* below to tick networks!`;
    } else {
        activeChainsList.forEach(c => {
            const scanner = chainScannerState[c.id];
            const modeText = scanner?.mode === 'websocket' ? 'WebSocket (Live ⚡)' : 'REST (10s Fallback 🔄)';
            msg += `• ${c.icon} *${c.name}:* ${modeText} ✅\n`;
        });
        msg += `• 🟢 *Multi-Chain Alerts:* Instant Notifications Enabled ✅`;
    }

    const inlineKeyboard = {
        inline_keyboard: [
            [
                { text: '✏️ Edit Label', callback_data: `rn_${address}` },
                { text: '⚙️ Configure Networks', callback_data: `cfg_${address}` },
                { text: '🔄 Refresh', callback_data: `rf_${address}` }
            ],
            [
                { text: '📋 View All Tracked Targets', callback_data: `list_targets` }
            ],
            [
                { text: '🔷 Etherscan', url: `https://etherscan.io/address/${address}` },
                { text: '🔮 Ritual Explorer', url: `https://explorer.ritualfoundation.org/address/${address}` }
            ]
        ]
    };

    return { msg, inlineKeyboard };
}

function buildConfigMenu(addressHex, enabledChains = ['ethereum', 'ritual', 'bsc', 'arbitrum', 'optimism', 'base']) {
    let msg = `⚙️ *NETWORK MONITORING CONFIGURATION*\n`;
    msg += `─────────────────────────\n`;
    msg += `📍 *Target Address:* \`${addressHex}\`\n\n`;
    msg += `Click any network button below to toggle monitoring ON (✅) or OFF (❌).\n`;
    msg += `When finished, click *[💾 Save & Apply]* to save your settings.\n`;

    const keyboardRows = CHAINS.map(c => {
        const isChecked = enabledChains.includes(c.id);
        const modeLabel = chainScannerState[c.id]?.mode === 'websocket' ? 'WSS ⚡' : 'REST';
        return [{
            text: `${isChecked ? '✅' : '❌'} ${c.icon} ${c.name} (${modeLabel})`,
            callback_data: `tgl_${addressHex}_${c.id}`
        }];
    });

    keyboardRows.push([
        { text: '💾 Save & Apply Configuration', callback_data: `sav_${addressHex}` },
        { text: '📋 Back to Target List', callback_data: `list_targets` }
    ]);

    return { msg, inlineKeyboard: { inline_keyboard: keyboardRows } };
}

async function sendTargetList(chatId) {
    const trackedTargets = botState.getTrackedTargets();
    const userMap = trackedTargets[chatId] || {};
    const addrs = Object.keys(userMap);

    if (addrs.length === 0) {
        await notifier.sendTelegramMessage(
            chatId,
            `📭 *NO MONITORED TARGETS SET YET*\n\nPaste any Web3 wallet or smart contract address (\`0x...\`) into chat to start live multi-chain monitoring!`
        );
        return;
    }

    await notifier.sendTelegramMessage(
        chatId,
        `📋 *YOUR MONITORED TARGETS (${addrs.length})*\n` +
        `─────────────────────────\n` +
        `Below are your active target wallets & contracts being monitored across 6 networks:`
    );

    for (const aKey of addrs) {
        const item = userMap[aKey];
        const label = item.customName || 'Unnamed Target';
        const enabledChains = item.enabledChains || ['ethereum', 'ritual', 'bsc', 'arbitrum', 'optimism', 'base'];
        const activeCount = enabledChains.length;
        const chainIcons = CHAINS.filter(c => enabledChains.includes(c.id)).map(c => c.icon).join(' ');

        const targetMsg = 
            `🏷️ *${label}*\n` +
            `─────────────────────────\n` +
            `📍 *Address:* \`${item.address}\`\n` +
            `🌐 *Networks Monitored:* *${activeCount}/6 Chains Active*\n` +
            `${chainIcons ? `• ${chainIcons}` : '⚠️ *No networks enabled*'}`;

        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: '✏️ Rename', callback_data: `rn_${item.address}` },
                    { text: '⚙️ Chains', callback_data: `cfg_${item.address}` },
                    { text: '🔍 View', callback_data: `vw_${item.address}` },
                    { text: '🗑️ Remove', callback_data: `del_${item.address}` }
                ]
            ]
        };

        await notifier.sendTelegramMessage(chatId, targetMsg, inlineKeyboard);
    }
}

// ====================================================
// 🚨 SINGLE BLOCK EXECUTION ENGINE (All 6 Chains)
// ====================================================
async function scanBlockNumber(chainObj, blockNum, provider) {
    const trackedTargets = botState.getTrackedTargets();
    const activeTargetsMap = {}; // { addressLower: [ { chatId, address, customName, enabledChains } ] }

    for (const chatId in trackedTargets) {
        const userMap = trackedTargets[chatId];
        for (const addrKey in userMap) {
            if (!activeTargetsMap[addrKey]) activeTargetsMap[addrKey] = [];
            activeTargetsMap[addrKey].push({
                chatId,
                ...userMap[addrKey]
            });
        }
    }

    const trackedAddrs = Object.keys(activeTargetsMap);
    if (trackedAddrs.length === 0) return; // No targets set yet

    const arrivalTimestamp = new Date();
    const startTimeMs = Date.now();

    logger.info(`[BLOCK RECEIVED] [${chainObj.name}] Block #${blockNum} received at ${arrivalTimestamp.toISOString()}`);

    let alertCount = 0;

    try {
        // Run Native Block Fetching & Event Log Fetching IN PARALLEL for maximum speed
        const [blockRes, logsRes] = await Promise.allSettled([
            rpcPoller.fetchRawBlockWithTxs(provider, blockNum, chainObj.id),
            rpcPoller.fetchEventLogs(provider, blockNum, blockNum, ERC20_TRANSFER_TOPIC, chainObj.id)
        ]);

        const block = blockRes.status === 'fulfilled' ? blockRes.value : null;
        const logs = logsRes.status === 'fulfilled' ? logsRes.value : [];

        // 1. Scan Native Transactions
        const resolvedTxs = (block && block.transactions) ? block.transactions : [];

        if (resolvedTxs.length > 0) {
            const nativeAlerts = txFilter.filterNativeTransactions(resolvedTxs, activeTargetsMap, chainObj.id);

            for (const alert of nativeAlerts) {
                if (botState.hasProcessedTx(alert.txHash)) continue;
                botState.markTxProcessed(alert.txHash);
                alertCount++;

                const alertMsg = 
                    `🚨 *RITALERT TRANSACTION DETECTED* | ${chainObj.icon} *${chainObj.name}*\n` +
                    `─────────────────────────\n` +
                    `🏷️ *Monitored Wallet:* *${alert.customName}*\n` +
                    `📍 *Address:* \`${alert.targetAddress}\`\n` +
                    `⚡ *Type:* ${alert.isIncoming ? '📥 *INCOMING TRANSFER*' : '📤 *OUTGOING TRANSFER*'}\n\n` +
                    `💎 *Currency:* *${chainObj.symbol}*\n` +
                    `💵 *Amount:* \`${alert.amountFormatted} ${chainObj.symbol}\`\n` +
                    `👤 *From:* \`${txFilter.abbreviate(alert.fromAddr)}\`\n` +
                    `👥 *To:* \`${txFilter.abbreviate(alert.toAddr)}\`\n` +
                    `📦 *Block:* \`#${alert.blockNumber}\`\n` +
                    `🔑 *Tx Hash:* \`${txFilter.abbreviate(alert.txHash)}\`\n` +
                    `─────────────────────────\n` +
                    `🔗 [View Explorer Transaction](${chainObj.explorer}/tx/${alert.txHash})`;

                logger.tx(`[ALERT DETECTED] Native Tx ${alert.txHash} on ${chainObj.name} for Target ${alert.targetAddress}`);
                await notifier.sendTelegramMessage(alert.chatId, alertMsg);
            }
        }

        // 2. Scan Contract Event Logs (ERC-20 / Token Transfers)
        if (Array.isArray(logs) && logs.length > 0) {
            const tokenAlerts = txFilter.filterEventLogs(logs, activeTargetsMap, chainObj.id);

            for (const alert of tokenAlerts) {
                if (botState.hasProcessedTx(alert.txHash)) continue;
                botState.markTxProcessed(alert.txHash);
                alertCount++;

                // Resolve Token Symbol & Name
                const meta = await getTokenMetadata(provider, alert.contractAddress, chainObj.id);
                const tokenSymbol = meta.symbol || 'TOKEN';
                const tokenFullName = meta.name ? `_(${meta.name})_` : '';

                const alertMsg = 
                    `🚨 *RITALERT TOKEN TRANSFER* | ${chainObj.icon} *${chainObj.name}*\n` +
                    `─────────────────────────\n` +
                    `🏷️ *Monitored Wallet:* *${alert.customName}*\n` +
                    `📍 *Address:* \`${alert.targetAddress}\`\n` +
                    `⚡ *Type:* ${alert.isIncoming ? '📥 *INCOMING TOKEN TRANSFER*' : '📤 *OUTGOING TOKEN TRANSFER*'}\n\n` +
                    `🪙 *Token Name:* *${tokenSymbol}* ${tokenFullName}\n` +
                    `📜 *Contract Address:* \`${txFilter.abbreviate(alert.contractAddress)}\`\n` +
                    `👤 *From:* \`${txFilter.abbreviate(alert.fromAddr)}\`\n` +
                    `👥 *To:* \`${txFilter.abbreviate(alert.toAddr)}\`\n` +
                    `📦 *Block:* \`#${alert.blockNumber}\`\n` +
                    `🔑 *Tx Hash:* \`${txFilter.abbreviate(alert.txHash)}\`\n` +
                    `─────────────────────────\n` +
                    `🔗 [View Explorer Transaction](${chainObj.explorer}/tx/${alert.txHash})`;

                logger.tx(`[TOKEN ALERT DETECTED] ${tokenSymbol} Tx ${alert.txHash} on ${chainObj.name} for Target ${alert.targetAddress}`);
                await notifier.sendTelegramMessage(alert.chatId, alertMsg);
            }
        }

        botState.setLastBlock(chainObj.id, blockNum);

        const latencyMs = Date.now() - startTimeMs;
        const completionTime = new Date().toISOString();
        logger.info(`[BLOCK SCANNED] [${chainObj.name}] Block #${blockNum} completed at ${completionTime} | Latency: ${latencyMs}ms | Alerts: ${alertCount}`);
    } catch (err) {
        logger.error(`Block scan error for block #${blockNum} on [${chainObj.id}]: ${err.message}`);
    }
}

process.on('uncaughtException', (err) => {
    logger.warn(`[UNCAUGHT EXCEPTION GUARDED] ${err.message}`);
});

process.on('unhandledRejection', (reason) => {
    logger.warn(`[UNHANDLED REJECTION GUARDED] ${reason?.message || reason}`);
});

// ====================================================
// 🌐 PER-CHAIN ISOLATED WSS SUBSCRIPTION & REST FALLBACK MANAGER
// ====================================================
async function setupChainScanner(chainObj) {
    const chainId = chainObj.id;
    const wssUrls = rpcPoller.RPC_POOLS[chainId]?.wss || [];

    chainScannerState[chainId] = {
        mode: 'rest',
        provider: null,
        restTimer: null,
        lastScannedBlock: botState.getLastBlock(chainId)
    };

    // Try WebSocket connection first if WSS URL available
    if (wssUrls.length > 0) {
        for (const wssUrl of wssUrls) {
            try {
                logger.info(`Attempting WebSocket connection for ${chainObj.name} via ${wssUrl}...`);
                const wsProvider = rpcPoller.createWsProvider(wssUrl);

                // Attach error / close listeners IMMEDIATELY to prevent uncaught 429 socket exceptions
                if (wsProvider._websocket) {
                    wsProvider._websocket.on('error', (err) => {
                        logger.warn(`[WSS ERROR] ${chainObj.name} WebSocket error: ${err.message}. Switching to REST fallback...`);
                        fallbackToRestPolling(chainObj);
                    });
                    wsProvider._websocket.on('close', () => {
                        logger.warn(`[WSS DISCONNECTED] ${chainObj.name} WebSocket connection dropped. Switching to REST fallback...`);
                        fallbackToRestPolling(chainObj);
                    });
                }

                await wsProvider.getBlockNumber(); // Test connection

                chainScannerState[chainId].mode = 'websocket';
                chainScannerState[chainId].provider = wsProvider;

                logger.info(`[MODE] [${chainObj.name}] WebSocket (Live) - Instant Block Subscriptions Active ⚡`);

                const inProgressBlocks = new Set();
                wsProvider.on('block', async (blockNum) => {
                    if (inProgressBlocks.has(blockNum)) return;
                    const lastBlock = chainScannerState[chainId].lastScannedBlock;
                    if (blockNum <= lastBlock) return;

                    inProgressBlocks.add(blockNum);
                    chainScannerState[chainId].lastScannedBlock = blockNum;

                    try {
                        await scanBlockNumber(chainObj, blockNum, wsProvider);
                    } finally {
                        inProgressBlocks.delete(blockNum);
                    }
                });

                return; // Successfully established WSS
            } catch (err) {
                logger.warn(`Failed WebSocket connection for ${chainObj.name} on ${wssUrl}: ${err.message}`);
            }
        }
    }

    // If no WSS URL or WSS failed, initialize REST Polling Fallback
    fallbackToRestPolling(chainObj);
}

function fallbackToRestPolling(chainObj) {
    const chainId = chainObj.id;
    if (chainScannerState[chainId].restTimer) return; // Already running REST loop

    chainScannerState[chainId].mode = 'rest';
    logger.info(`[MODE] [${chainObj.name}] REST (Fallback) - 10s Isolated Polling Active 🔄`);

    // Run immediate check then set 10-second interval
    runRestCycleForChain(chainObj);
    chainScannerState[chainId].restTimer = setInterval(() => runRestCycleForChain(chainObj), 10000);
}

async function runRestCycleForChain(chainObj) {
    const chainId = chainObj.id;
    try {
        const httpProvider = await rpcPoller.getWorkingHttpProvider(chainId);
        chainScannerState[chainId].provider = httpProvider;

        const latestBlock = await rpcPoller.fetchLatestBlockNumber(httpProvider, chainId);
        let lastProcessed = botState.getLastBlock(chainId);

        if (lastProcessed === 0) {
            lastProcessed = latestBlock - 1;
            botState.setLastBlock(chainId, lastProcessed);
        }

        if (latestBlock > lastProcessed) {
            for (let blockNum = lastProcessed + 1; blockNum <= latestBlock; blockNum++) {
                chainScannerState[chainId].lastScannedBlock = blockNum;
                await scanBlockNumber(chainObj, blockNum, httpProvider);
            }
        }
    } catch (err) {
        logger.error(`REST cycle error for ${chainObj.name}: ${err.message}`);
    }
}

// Initialize all 6 chains independently
async function initAllChainScanners() {
    for (const chainObj of CHAINS) {
        await setupChainScanner(chainObj);
    }
}

initAllChainScanners();

async function handleIncomingMessage(chatId, text, firstName) {
    const trimmed = text.trim();
    const trackedTargets = botState.getTrackedTargets();

    if (pendingRenameMap[chatId] && !trimmed.startsWith('/')) {
        const targetAddr = pendingRenameMap[chatId];
        delete pendingRenameMap[chatId];

        const cleanLabel = botState.sanitizeCustomName(trimmed);

        if (!trackedTargets[chatId]) trackedTargets[chatId] = {};
        if (!trackedTargets[chatId][targetAddr.toLowerCase()]) {
            trackedTargets[chatId][targetAddr.toLowerCase()] = { address: targetAddr, enabledChains: ['ethereum', 'ritual', 'bsc', 'arbitrum', 'optimism', 'base'] };
        }

        trackedTargets[chatId][targetAddr.toLowerCase()].customName = cleanLabel;
        botState.setTrackedTargets(trackedTargets);
        await notifier.sendTelegramMessage(chatId, `🎉 *Label Saved!* Target \`${txFilter.abbreviate(targetAddr)}\` is now named:\n👉 *${cleanLabel}*`);

        const updatedData = await fetchMultiChainData(targetAddr);
        const enabledChains = trackedTargets[chatId][targetAddr.toLowerCase()].enabledChains || ['ethereum', 'ritual', 'bsc', 'arbitrum', 'optimism', 'base'];
        const { msg, inlineKeyboard } = buildCardMessage(updatedData, cleanLabel, enabledChains);
        await notifier.sendTelegramMessage(chatId, msg, inlineKeyboard);
        return;
    }

    if (trimmed.startsWith('/name') || trimmed.startsWith('/rename') || trimmed.startsWith('/label')) {
        const parts = trimmed.split(/\s+/);
        let targetAddr = chatLastTargetMap[chatId];
        let customNameRaw = '';

        if (parts.length >= 3 && isAddress(parts[1])) {
            targetAddr = parts[1];
            customNameRaw = parts.slice(2).join(' ');
        } else if (parts.length >= 2 && isAddress(parts[1])) {
            targetAddr = parts[1];
            customNameRaw = '';
        } else if (parts.length >= 2) {
            customNameRaw = parts.slice(1).join(' ');
        }

        const customName = botState.sanitizeCustomName(customNameRaw);

        if (targetAddr && customName) {
            let norm = targetAddr;
            try { norm = ethers.getAddress(targetAddr.toLowerCase()); } catch(e){}
            if (!trackedTargets[chatId]) trackedTargets[chatId] = {};
            if (!trackedTargets[chatId][norm.toLowerCase()]) {
                trackedTargets[chatId][norm.toLowerCase()] = { address: norm, enabledChains: ['ethereum', 'ritual', 'bsc', 'arbitrum', 'optimism', 'base'] };
            }
            trackedTargets[chatId][norm.toLowerCase()].customName = customName;
            botState.setTrackedTargets(trackedTargets);
            await notifier.sendTelegramMessage(chatId, `🎉 *Label Saved!* Target \`${txFilter.abbreviate(norm)}\` is now named:\n👉 *${customName}*`);

            const updatedData = await fetchMultiChainData(norm);
            const enabledChains = trackedTargets[chatId][norm.toLowerCase()].enabledChains || ['ethereum', 'ritual', 'bsc', 'arbitrum', 'optimism', 'base'];
            const { msg, inlineKeyboard } = buildCardMessage(updatedData, customName, enabledChains);
            await notifier.sendTelegramMessage(chatId, msg, inlineKeyboard);
            return;
        }

        await notifier.sendTelegramMessage(chatId, `💡 *How to Label a Target:*\n\n1. Type \`/name My Treasury Wallet\` to label your last target.\n2. Or click the *[✏️ Rename]* button under any target!`);
        return;
    }

    if (trimmed.startsWith('/start') || trimmed.startsWith('/help')) {
        const responseText = 
            `👋 *Hello ${firstName}! Welcome to RitAlert Bot* 🔔\n\n` +
            `• *Your Chat ID:* \`${chatId}\`\n\n` +
            `*Commands & Features:*\n` +
            `• Paste any address (\`0x...\`) to inspect multi-chain balances & activate real-time transaction notifications.\n` +
            `• \`/list\` — View all your monitored targets with per-address action buttons.\n` +
            `• \`/name <Custom Label>\` — Assign a custom label to your active target wallet or contract.\n` +
            `• \`/test\` — Send test notification alerts to Telegram.\n\n` +
            `Copy your Chat ID \`${chatId}\` into RitAlert dashboard to sync web alerts directly to Telegram!`;
        await notifier.sendTelegramMessage(chatId, responseText);
        return;
    }

    if (trimmed.startsWith('/test')) {
        const testNativeMsg = 
            `🚨 *RITALERT TRANSACTION DETECTED* | 🔷 *Ethereum Mainnet*\n` +
            `─────────────────────────\n` +
            `🏷️ *Monitored Wallet:* *main wallet*\n` +
            `📍 *Address:* \`0xD3915edd200b5B586288D84a1143a7CA00Deb7BF\`\n` +
            `⚡ *Type:* 📤 *OUTGOING TRANSFER*\n\n` +
            `💎 *Currency:* *ETH*\n` +
            `💵 *Amount:* \`0.0001 ETH\`\n` +
            `👤 *From:* \`0xD391...b7BF\`\n` +
            `👥 *To:* \`0x99e6...190e\`\n` +
            `📦 *Block:* \`#49053694\`\n` +
            `🔑 *Tx Hash:* \`0x1461...d486\`\n` +
            `─────────────────────────\n` +
            `🔗 [View Explorer Transaction](https://etherscan.io/tx/0x1461d486)`;

        const testTokenMsg = 
            `🚨 *RITALERT TOKEN TRANSFER* | 🔴 *Optimism*\n` +
            `─────────────────────────\n` +
            `🏷️ *Monitored Wallet:* *main wallet*\n` +
            `📍 *Address:* \`0xD3915edd200b5B586288D84a1143a7CA00Deb7BF\`\n` +
            `⚡ *Type:* 📥 *INCOMING TOKEN TRANSFER*\n\n` +
            `🪙 *Token Name:* *USDC* _(USD Coin)_\n` +
            `📜 *Contract Address:* \`0x0b2C...Ff85\`\n` +
            `👤 *From:* \`0x08db...85f2\`\n` +
            `👥 *To:* \`0xd391...b7bf\`\n` +
            `📦 *Block:* \`#154648903\`\n` +
            `🔑 *Tx Hash:* \`0x8799...bc65\`\n` +
            `─────────────────────────\n` +
            `🔗 [View Explorer Transaction](https://optimistic.etherscan.io/tx/0x8799bc65)`;

        await notifier.sendTelegramMessage(chatId, testNativeMsg);
        await notifier.sendTelegramMessage(chatId, testTokenMsg);
        return;
    }

    if (trimmed.startsWith('/list')) {
        await sendTargetList(chatId);
        return;
    }

    let address = trimmed;
    if (!isAddress(address)) {
        const match = trimmed.match(/0x[a-fA-F0-9]{40}/);
        if (match) address = match[0];
    }

    if (isAddress(address)) {
        await notifier.sendTelegramMessage(chatId, `🔍 *Querying 6 blockchains for target:* \`${address}\`...`);
        try {
            let norm = address;
            try { norm = ethers.getAddress(address.toLowerCase()); } catch(e){}

            chatLastTargetMap[chatId] = norm;

            const data = await fetchMultiChainData(norm);

            if (!trackedTargets[chatId]) trackedTargets[chatId] = {};
            const existing = trackedTargets[chatId][norm.toLowerCase()] || {};
            const enabledChains = existing.enabledChains || ['ethereum', 'ritual', 'bsc', 'arbitrum', 'optimism', 'base'];

            trackedTargets[chatId][norm.toLowerCase()] = {
                address: norm,
                customName: existing.customName,
                enabledChains: enabledChains,
                ...data
            };
            botState.setTrackedTargets(trackedTargets);

            const { msg, inlineKeyboard } = buildCardMessage(data, existing.customName, enabledChains);
            await notifier.sendTelegramMessage(chatId, msg, inlineKeyboard);
        } catch (err) {
            await notifier.sendTelegramMessage(chatId, `❌ *Blockchain query error:* ${err.message}`);
        }
        return;
    }

    await notifier.sendTelegramMessage(chatId, `💡 Please paste a valid Web3 wallet or smart contract address (\`0x...\`), or type \`/help\` for commands.`);
}

function pollTelegramUpdates() {
    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${notifier.BOT_TOKEN}/getUpdates?offset=${telegramOffset}&timeout=30`,
        method: 'GET'
    };

    https.get(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', async () => {
            try {
                const data = JSON.parse(body);
                if (data.ok && data.result.length > 0) {
                    for (const update of data.result) {
                        telegramOffset = update.update_id + 1;

                        if (update.callback_query) {
                            const cb = update.callback_query;
                            const chatId = cb.message.chat.id;
                            const messageId = cb.message.message_id;
                            const cbData = cb.data;

                            const trackedTargets = botState.getTrackedTargets();
                            const userMap = trackedTargets[chatId] || {};

                            if (cbData === 'list_targets') {
                                notifier.answerCallbackQuery(cb.id, '📋 Monitored Target List');
                                await sendTargetList(chatId);
                            } else if (cbData.startsWith('rn_')) {
                                const targetAddr = cbData.replace('rn_', '').toLowerCase();
                                notifier.answerCallbackQuery(cb.id, '✏️ Type your new custom label in chat!');
                                pendingRenameMap[chatId] = targetAddr;
                                chatLastTargetMap[chatId] = targetAddr;
                                await notifier.sendTelegramMessage(chatId, `✏️ *Type and send the custom label for target:* \`${txFilter.abbreviate(targetAddr)}\` below:\n\n*(e.g. "My Primary Wallet", "USDT Vault", "Ritual Contract")*`);
                            } else if (cbData.startsWith('cfg_')) {
                                const targetAddr = cbData.replace('cfg_', '').toLowerCase();
                                notifier.answerCallbackQuery(cb.id, '⚙️ Opening Network Configuration Menu');
                                chatLastTargetMap[chatId] = targetAddr;
                                const targetData = userMap[targetAddr];
                                const currentEnabled = targetData?.enabledChains || ['ethereum', 'ritual', 'bsc', 'arbitrum', 'optimism', 'base'];
                                const { msg, inlineKeyboard } = buildConfigMenu(targetData?.address || targetAddr, currentEnabled);
                                await notifier.editTelegramMessage(chatId, messageId, msg, inlineKeyboard);
                            } else if (cbData.startsWith('tgl_')) {
                                notifier.answerCallbackQuery(cb.id, 'Toggled network');
                                const rawPart = cbData.replace('tgl_', '');
                                const lastUnderscore = rawPart.lastIndexOf('_');
                                const targetAddr = rawPart.substring(0, lastUnderscore).toLowerCase();
                                const chainToToggle = rawPart.substring(lastUnderscore + 1);

                                const targetData = userMap[targetAddr];
                                if (targetData) {
                                    if (!targetData.enabledChains) targetData.enabledChains = ['ethereum', 'ritual', 'bsc', 'arbitrum', 'optimism', 'base'];
                                    const idx = targetData.enabledChains.indexOf(chainToToggle);
                                    if (idx > -1) {
                                        targetData.enabledChains.splice(idx, 1);
                                    } else {
                                        targetData.enabledChains.push(chainToToggle);
                                    }
                                    botState.setTrackedTargets(trackedTargets);
                                    const { msg, inlineKeyboard } = buildConfigMenu(targetData.address, targetData.enabledChains);
                                    await notifier.editTelegramMessage(chatId, messageId, msg, inlineKeyboard);
                                }
                            } else if (cbData.startsWith('sav_')) {
                                notifier.answerCallbackQuery(cb.id, '💾 Configuration Saved!');
                                const targetAddr = cbData.replace('sav_', '').toLowerCase();
                                botState.setTrackedTargets(trackedTargets);
                                await notifier.editTelegramMessage(chatId, messageId, `✅ *Network Configuration Saved for:* \`${txFilter.abbreviate(targetAddr)}\`!\n\nUse \`/list\` anytime to view your active targets.`);
                            } else if (cbData.startsWith('rf_')) {
                                const targetAddr = cbData.replace('rf_', '').toLowerCase();
                                notifier.answerCallbackQuery(cb.id, '🔄 Syncing balances...');
                                const targetData = userMap[targetAddr];
                                const refreshedData = await fetchMultiChainData(targetAddr);
                                const enabledChains = targetData?.enabledChains || ['ethereum', 'ritual', 'bsc', 'arbitrum', 'optimism', 'base'];
                                const { msg, inlineKeyboard } = buildCardMessage(refreshedData, targetData?.customName, enabledChains);
                                await notifier.editTelegramMessage(chatId, messageId, msg, inlineKeyboard);
                            } else if (cbData.startsWith('vw_')) {
                                const targetAddr = cbData.replace('vw_', '').toLowerCase();
                                notifier.answerCallbackQuery(cb.id, '🔍 Opening Target Card...');
                                chatLastTargetMap[chatId] = targetAddr;
                                const targetData = userMap[targetAddr];
                                const refreshedData = await fetchMultiChainData(targetAddr);
                                const enabledChains = targetData?.enabledChains || ['ethereum', 'ritual', 'bsc', 'arbitrum', 'optimism', 'base'];
                                const { msg, inlineKeyboard } = buildCardMessage(refreshedData, targetData?.customName, enabledChains);
                                await notifier.sendTelegramMessage(chatId, msg, inlineKeyboard);
                            } else if (cbData.startsWith('del_')) {
                                const targetAddr = cbData.replace('del_', '').toLowerCase();
                                notifier.answerCallbackQuery(cb.id, '🗑️ Target Removed');
                                if (userMap[targetAddr]) {
                                    delete userMap[targetAddr];
                                    botState.setTrackedTargets(trackedTargets);
                                }
                                await notifier.editTelegramMessage(chatId, messageId, `🗑️ *Target Removed:* \`${txFilter.abbreviate(targetAddr)}\` is no longer monitored.`);
                            }
                        }

                        if (update.message && update.message.text) {
                            const chatId = update.message.chat.id;
                            const text = update.message.text;
                            const firstName = update.message.from.first_name || 'there';
                            logger.info(`[TELEGRAM INPUT] From ${firstName} (${chatId}): "${text}"`);
                            await handleIncomingMessage(chatId, text, firstName);
                        }
                    }
                }
            } catch (err) {
                logger.error(`Telegram updates parsing error: ${err.message}`);
            }
            setTimeout(pollTelegramUpdates, 1000);
        });
    }).on('error', (err) => {
        logger.error(`Telegram polling network error: ${err.message}`);
        setTimeout(pollTelegramUpdates, 5000);
    });
}

pollTelegramUpdates();
