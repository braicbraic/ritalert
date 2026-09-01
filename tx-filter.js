const { ethers } = require('ethers');

function abbreviate(addr) {
    if (!addr) return '';
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
}

function filterNativeTransactions(transactions, activeTargetsMap, chainId) {
    const detectedAlerts = [];
    const trackedAddressesList = Object.keys(activeTargetsMap);

    for (const tx of transactions) {
        if (!tx || !tx.hash) continue;

        const fromAddr = tx.from ? tx.from.toLowerCase() : '';
        const toAddr = tx.to ? tx.to.toLowerCase() : '';

        for (const rawTargetAddr of trackedAddressesList) {
            const targetAddr = rawTargetAddr.toLowerCase();
            if (fromAddr === targetAddr || toAddr === targetAddr) {
                const subscribers = activeTargetsMap[rawTargetAddr];
                for (const sub of subscribers) {
                    const enabledChains = sub.enabledChains || ['ethereum', 'ritual'];
                    if (!enabledChains.includes(chainId)) continue;

                    const isIncoming = toAddr === targetAddr;
                    const valFormatted = parseFloat(ethers.formatEther(tx.value || 0)).toFixed(4);

                    detectedAlerts.push({
                        txHash: tx.hash,
                        chatId: sub.chatId,
                        targetAddress: sub.address,
                        customName: sub.customName || 'Monitored Target',
                        isIncoming,
                        amountFormatted: valFormatted,
                        fromAddr: tx.from,
                        toAddr: tx.to || 'Contract Creation',
                        blockNumber: tx.blockNumber,
                        type: 'native'
                    });
                }
            }
        }
    }

    return detectedAlerts;
}

function filterEventLogs(logs, activeTargetsMap, chainId) {
    const detectedAlerts = [];
    const trackedAddressesList = Object.keys(activeTargetsMap);

    for (const log of logs) {
        if (!log.topics || log.topics.length < 3) continue;

        const fromAddressLog = '0x' + log.topics[1].slice(26).toLowerCase();
        const toAddressLog = '0x' + log.topics[2].slice(26).toLowerCase();

        for (const rawTargetAddr of trackedAddressesList) {
            const targetAddr = rawTargetAddr.toLowerCase();
            if (fromAddressLog === targetAddr || toAddressLog === targetAddr) {
                const subscribers = activeTargetsMap[rawTargetAddr];
                for (const sub of subscribers) {
                    const enabledChains = sub.enabledChains || ['ethereum', 'ritual'];
                    if (!enabledChains.includes(chainId)) continue;

                    const isIncoming = toAddressLog === targetAddr;

                    detectedAlerts.push({
                        txHash: log.transactionHash,
                        chatId: sub.chatId,
                        targetAddress: sub.address,
                        customName: sub.customName || 'Monitored Target',
                        isIncoming,
                        contractAddress: log.address,
                        fromAddr: fromAddressLog,
                        toAddr: toAddressLog,
                        blockNumber: log.blockNumber,
                        type: 'erc20_token'
                    });
                }
            }
        }
    }

    return detectedAlerts;
}

module.exports = {
    filterNativeTransactions,
    filterEventLogs,
    abbreviate
};
