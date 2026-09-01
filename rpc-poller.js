const { ethers } = require('ethers');
const logger = require('./bot-logger');

const RPC_POOLS = {
    ethereum: {
        wss: [process.env.INFURA_ETH_WSS_URL, process.env.ETH_WSS_URL].filter(Boolean),
        http: [process.env.INFURA_ETH_RPC_URL, process.env.ALCHEMY_ETH_RPC_URL, 'https://eth-mainnet.public.blastapi.io', 'https://1rpc.io/eth'].filter(Boolean)
    },
    ritual: {
        wss: [process.env.RITUAL_WSS_URL].filter(Boolean),
        http: [process.env.RPC_URL || 'https://rpc.ritualfoundation.org'].filter(Boolean)
    },
    bsc: {
        wss: [process.env.BNB_WSS_URL].filter(Boolean),
        http: [process.env.BSC_RPC_URL, 'https://binance.llamarpc.com', 'https://bsc-dataseed.binance.org', 'https://bsc-dataseed1.defibit.io'].filter(Boolean)
    },
    arbitrum: {
        wss: [process.env.ARBITRUM_WSS_URL].filter(Boolean),
        http: [process.env.ARBITRUM_RPC_URL, 'https://arbitrum.llamarpc.com', 'https://arb1.arbitrum.io/rpc'].filter(Boolean)
    },
    optimism: {
        wss: [process.env.OPTIMISM_WSS_URL].filter(Boolean),
        http: [process.env.OPTIMISM_RPC_URL, 'https://optimism.llamarpc.com', 'https://mainnet.optimism.io'].filter(Boolean)
    },
    base: {
        wss: [process.env.BASE_WSS_URL].filter(Boolean),
        http: [process.env.BASE_RPC_URL, 'https://base.llamarpc.com', 'https://mainnet.base.org'].filter(Boolean)
    }
};

const CHAIN_NUMERIC_IDS = {
    ethereum: 1,
    ritual: 901,
    bsc: 56,
    arbitrum: 42161,
    optimism: 10,
    base: 8453
};

const httpProviderCache = {};

function createHttpProvider(url, chainId = 'ethereum') {
    if (!url) return null;
    if (httpProviderCache[url]) return httpProviderCache[url];

    const numericId = CHAIN_NUMERIC_IDS[chainId] || 1;
    const provider = new ethers.JsonRpcProvider(url, numericId, { staticNetwork: true });
    httpProviderCache[url] = provider;
    return provider;
}

function createWsProvider(url) {
    if (!url) return null;
    return new ethers.WebSocketProvider(url);
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getWorkingHttpProvider(chainId) {
    const pool = (RPC_POOLS[chainId] && RPC_POOLS[chainId].http) || RPC_POOLS.ethereum.http;
    for (const url of pool) {
        try {
            const provider = createHttpProvider(url, chainId);
            return provider;
        } catch (err) {
            logger.warn(`HTTP RPC Provider check failed for ${url} (${chainId}): ${err.message}. Trying next fallback...`);
        }
    }
    return createHttpProvider(pool[0], chainId);
}

async function executeWithRetry(fn, description = 'RPC Operation', maxRetries = 2) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const backoffMs = 500 * attempt;
            logger.warn(`Attempt ${attempt}/${maxRetries} failed for [${description}]: ${err.message}. Retrying in ${backoffMs}ms...`);
            if (attempt === maxRetries) {
                logger.error(`All ${maxRetries} retries exhausted for [${description}]: ${err.message}`);
                throw err;
            }
            await sleep(backoffMs);
        }
    }
}

async function fetchLatestBlockNumber(provider, chainId) {
    return executeWithRetry(
        () => provider.getBlockNumber(),
        `Get Latest Block Number (${chainId})`
    );
}

async function fetchBlock(provider, blockNumber, chainId) {
    return executeWithRetry(
        () => provider.getBlock(blockNumber),
        `Fetch Block #${blockNumber} (${chainId})`
    );
}

async function fetchRawBlockWithTxs(provider, blockNumber, chainId) {
    return executeWithRetry(async () => {
        const hexBlock = typeof blockNumber === 'number' ? `0x${blockNumber.toString(16)}` : blockNumber;
        const rawBlock = await provider.send('eth_getBlockByNumber', [hexBlock, true]);
        if (!rawBlock) return null;

        const txs = (rawBlock.transactions || []).map(tx => {
            if (typeof tx === 'string') return { hash: tx };
            return {
                hash: tx.hash,
                from: tx.from,
                to: tx.to,
                value: tx.value,
                blockNumber: rawBlock.number ? parseInt(rawBlock.number, 16) : blockNumber
            };
        });

        return {
            number: rawBlock.number ? parseInt(rawBlock.number, 16) : blockNumber,
            hash: rawBlock.hash,
            transactions: txs
        };
    }, `Fetch Raw Block #${blockNumber} (${chainId})`);
}

async function fetchTransaction(provider, txHash, chainId) {
    return executeWithRetry(
        () => provider.getTransaction(txHash),
        `Fetch Tx ${txHash} (${chainId})`
    );
}

async function fetchEventLogs(provider, fromBlock, toBlock, topic, chainId) {
    return executeWithRetry(
        () => provider.getLogs({ fromBlock, toBlock, topics: [topic] }),
        `Fetch Logs Blocks #${fromBlock}-${toBlock} (${chainId})`
    );
}

module.exports = {
    createHttpProvider,
    createWsProvider,
    getWorkingHttpProvider,
    executeWithRetry,
    fetchLatestBlockNumber,
    fetchBlock,
    fetchRawBlockWithTxs,
    fetchTransaction,
    fetchEventLogs,
    RPC_POOLS
};
