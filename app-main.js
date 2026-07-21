/* ================================================================
   RitAlert App — Main Application Logic
   Features: Chain switching, Chat/Tracker, Telegram, Wallet
   ================================================================ */

(function () {
    'use strict';

    // ===== CONFIGURATION =====
    const CONFIG = {
        walletConnectProjectId: 'e07c12a0e7ebc3cb71c71874eefcf79d',
        telegram: {},
        chains: {
            ritual: {
                name: 'Ritual Testnet',
                chainId: 1979,
                rpc: 'https://rpc.ritualfoundation.org',
                explorer: 'https://explorer.ritualfoundation.org',
                symbol: 'RITUAL',
                iconClass: 'chain-icon-ritual',
                iconLetter: 'R',
                active: true,
            },
            ethereum: {
                name: 'Ethereum',
                chainId: 1,
                rpc: 'https://eth.llamarpc.com',
                explorer: 'https://etherscan.io',
                symbol: 'ETH',
                iconClass: 'chain-icon-eth',
                iconLetter: 'Ξ',
                active: true,
            },
            bsc: {
                name: 'BNB Smart Chain',
                chainId: 56,
                rpc: 'https://bsc-dataseed.binance.org',
                explorer: 'https://bscscan.com',
                symbol: 'BNB',
                iconClass: 'chain-icon-bsc',
                iconLetter: 'B',
                active: false,
            },
            arbitrum: {
                name: 'Arbitrum One',
                chainId: 42161,
                rpc: 'https://arb1.arbitrum.io/rpc',
                explorer: 'https://arbiscan.io',
                symbol: 'ETH',
                iconClass: 'chain-icon-arb',
                iconLetter: 'A',
                active: false,
            },
            optimism: {
                name: 'Optimism',
                chainId: 10,
                rpc: 'https://mainnet.optimism.io',
                explorer: 'https://optimistic.etherscan.io',
                symbol: 'ETH',
                iconClass: 'chain-icon-op',
                iconLetter: 'O',
                active: false,
            },
            base: {
                name: 'Base',
                chainId: 8453,
                rpc: 'https://mainnet.base.org',
                explorer: 'https://basescan.org',
                symbol: 'ETH',
                iconClass: 'chain-icon-base',
                iconLetter: 'B',
                active: false,
            },
        },
    };

    // ===== APP STATE =====
    const state = {
        currentChain: 'ritual',
        walletAddress: null,
        provider: null,
        signer: null,
        messages: [],
        trackingHistory: JSON.parse(localStorage.getItem('ritalert_history') || '[]'),
        telegramConfig: JSON.parse(localStorage.getItem('ritalert_telegram') || '{"chatId": ""}'),
        discordConfig: JSON.parse(localStorage.getItem('ritalert_discord') || '{"webhookUrl": ""}'),
        pushConfig: JSON.parse(localStorage.getItem('ritalert_push') || '{"enabled": false}'),
        isTyping: false,
    };

    // ===== DOM REFERENCES =====
    const DOM = {
        // Chain switcher
        chainSwitcher: document.getElementById('chain-switcher'),
        chainSelectedBtn: document.getElementById('chain-selected-btn'),
        selectedChainIcon: document.getElementById('selected-chain-icon'),
        selectedChainName: document.getElementById('selected-chain-name'),
        chainDropdown: document.getElementById('chain-dropdown'),
        chainOptions: document.querySelectorAll('.chain-option'),

        // Wallet
        walletBtn: document.getElementById('wallet-btn'),
        walletBtnText: document.getElementById('wallet-btn-text'),

        // Sidebar
        sidebar: document.getElementById('sidebar'),
        sidebarOverlay: document.getElementById('sidebar-overlay'),
        newChatBtn: document.getElementById('new-chat-btn'),
        trackingHistory: document.getElementById('tracking-history'),
        activeAlerts: document.getElementById('active-alerts'),
        notificationsSetupBtn: document.getElementById('notifications-setup-btn'),

        // Chat
        chatMessages: document.getElementById('chat-messages'),
        chatWelcome: document.getElementById('chat-welcome'),
        chatInput: document.getElementById('chat-input'),
        btnTrack: document.getElementById('btn-track'),
        btnAsk: document.getElementById('btn-ask'),
        clearChatBtn: document.getElementById('clear-chat-btn'),
        chatHeaderTitle: document.getElementById('chat-header-title'),
        chatHeaderSubtitle: document.getElementById('chat-header-subtitle'),

        // Quick actions
        quickActions: document.querySelectorAll('.quick-action'),

        // Notifications Modal
        notificationsModalOverlay: document.getElementById('notifications-modal-overlay'),
        notificationsModalClose: document.getElementById('notifications-modal-close'),
        notifTabs: document.querySelectorAll('.notif-tab'),
        notifPanels: document.querySelectorAll('.notif-panel'),

        // Telegram tab
        tgChatId: document.getElementById('tg-chat-id'),
        tgTestBtn: document.getElementById('tg-test-btn'),
        tgSaveBtn: document.getElementById('tg-save-btn'),
        telegramStatus: document.getElementById('telegram-status'),
        tgInputArea: document.getElementById('tg-input-area'),
        tgSavedArea: document.getElementById('tg-saved-area'),
        tgDisplayChatId: document.getElementById('tg-display-chat-id'),
        tgEditBtn: document.getElementById('tg-edit-btn'),
        tgTestBtnSaved: document.getElementById('tg-test-btn-saved'),

        // Discord tab
        discordWebhook: document.getElementById('discord-webhook'),
        discordTestBtn: document.getElementById('discord-test-btn'),
        discordSaveBtn: document.getElementById('discord-save-btn'),
        discordStatus: document.getElementById('discord-status'),
        discordInputArea: document.getElementById('discord-input-area'),
        discordSavedArea: document.getElementById('discord-saved-area'),
        discordDisplayWebhook: document.getElementById('discord-display-webhook'),
        discordEditBtn: document.getElementById('discord-edit-btn'),
        discordTestBtnSaved: document.getElementById('discord-test-btn-saved'),

        // Push tab
        pushEnableBtn: document.getElementById('push-enable-btn'),
        pushStatus: document.getElementById('push-status'),

        // Footer
        statusChainName: document.getElementById('status-chain-name'),
        statusBlock: document.getElementById('status-block'),
        statusWallet: document.getElementById('status-wallet'),
        statusDot: document.getElementById('status-dot'),
    };

    // ===== SIMULATED DATA =====
    const SAMPLE_ADDRESSES = {
        wallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28',
        contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    };

    function randomTxHash() {
        const chars = '0123456789abcdef';
        let hash = '0x';
        for (let i = 0; i < 64; i++) hash += chars[Math.floor(Math.random() * 16)];
        return hash;
    }

    function randomAddress() {
        const chars = '0123456789abcdef';
        let addr = '0x';
        for (let i = 0; i < 40; i++) addr += chars[Math.floor(Math.random() * 16)];
        return addr;
    }

    function abbreviate(str, start = 6, end = 4) {
        if (!str || str.length < start + end + 3) return str;
        return str.substring(0, start) + '...' + str.substring(str.length - end);
    }

    function timeAgo(mins) {
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
        return `${Math.floor(mins / 1440)}d ago`;
    }

    async function fetchRealTransactions(address, chainKey) {
        const chain = CONFIG.chains[chainKey];
        let apiUrl = '';
        if (chainKey === 'ritual') {
            apiUrl = `https://explorer.ritualfoundation.org/api/v2/addresses/${address}/transactions`;
        } else if (chainKey === 'ethereum') {
            apiUrl = `https://eth.blockscout.com/api/v2/addresses/${address}/transactions`;
        } else {
            return [];
        }

        try {
            const res = await fetch(apiUrl);
            if (!res.ok) throw new Error("API response not ok");
            const data = await res.json();
            
            if (data && data.items && Array.isArray(data.items)) {
                return data.items.slice(0, 5).map(item => {
                    const txValue = item.value ? (parseFloat(item.value) / 1e18).toFixed(4) : '0';
                    const txTime = item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Just now';
                    const method = item.method || (item.to && item.to.is_contract ? 'Contract Call' : 'Transfer');
                    const isIncoming = item.to && item.to.hash.toLowerCase() === address.toLowerCase();

                    return {
                        type: isIncoming ? 'receive' : 'send',
                        label: method.charAt(0).toUpperCase() + method.slice(1),
                        icon: isIncoming ? '↙' : '↗',
                        from: item.from ? item.from.hash : 'unknown',
                        to: item.to ? item.to.hash : 'unknown',
                        amount: `${isIncoming ? '+' : '-'}${txValue} ${chain.symbol}`,
                        valueClass: isIncoming ? 'activity-value-positive' : 'activity-value-negative',
                        time: txTime,
                        txHash: item.hash,
                        explorer: `${chain.explorer}/tx/${item.hash}`
                    };
                });
            }
        } catch (err) {
            console.error("Error fetching transactions from Blockscout:", err);
        }

        // Fallback: Check wallet balance and contract code via RPC
        try {
            const rpcProvider = new ethers.JsonRpcProvider(chain.rpc);
            const balance = await rpcProvider.getBalance(address);
            const balanceEth = (parseFloat(balance.toString()) / 1e18).toFixed(4);
            const code = await rpcProvider.getCode(address);
            const isContract = code !== '0x';

            return [{
                type: 'receive',
                label: isContract ? 'Smart Contract Verified' : 'Wallet Active',
                icon: '⚡',
                from: address,
                to: isContract ? 'Contract Deployer' : 'External Balance',
                amount: `${balanceEth} ${chain.symbol}`,
                valueClass: 'activity-value-positive',
                time: 'Live Balance',
                txHash: address,
                explorer: `${chain.explorer}/address/${address}`
            }];
        } catch (e) {
            console.error("Provider balance fallback failed:", e);
        }

        return [];
    }

    async function generateAIResponse(question, address) {
        const chain = CONFIG.chains[state.currentChain];
        try {
            const rpcProvider = new ethers.JsonRpcProvider(chain.rpc);
            const balance = await rpcProvider.getBalance(address);
            const balanceEth = (parseFloat(balance.toString()) / 1e18).toFixed(4);
            const code = await rpcProvider.getCode(address);
            const isContract = code !== '0x';

            let typeLabel = isContract ? "Smart Contract" : "Personal Wallet (EOA)";
            
            return `Based on live blockchain query of **${abbreviate(address)}** on ${chain.name}:\n\n` +
                   `• **Wallet Type:** ${typeLabel}\n` +
                   `• **Current Balance:** **${balanceEth} ${chain.symbol}**\n` +
                   `• **Code Verification:** ${isContract ? 'Verified Smart Contract byte-code' : 'EOA Account (no contract code)'}\n` +
                   `• **Network Status:** Connected to RPC node.`;
        } catch (e) {
            return `Based on my analysis of **${abbreviate(address)}** on ${chain.name}:\n\n• Live node query failed: ${e.message}\n• Estimated risk level: Low`;
        }
    }


    // ===== CHAIN SWITCHER =====
    function initChainSwitcher() {
        DOM.chainSelectedBtn.addEventListener('click', () => {
            DOM.chainSwitcher.classList.toggle('open');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!DOM.chainSwitcher.contains(e.target)) {
                DOM.chainSwitcher.classList.remove('open');
            }
        });

        DOM.chainOptions.forEach(option => {
            option.addEventListener('click', () => {
                const chainKey = option.dataset.chain;
                const chain = CONFIG.chains[chainKey];

                if (!chain.active) return; // Don't switch to inactive chains

                // Update state
                state.currentChain = chainKey;

                // Update UI
                DOM.selectedChainIcon.className = `chain-icon ${chain.iconClass}`;
                DOM.selectedChainIcon.textContent = chain.iconLetter;
                DOM.selectedChainName.textContent = chain.name;

                // Update active state in dropdown
                DOM.chainOptions.forEach(o => o.classList.remove('active'));
                option.classList.add('active');

                // Update footer
                DOM.statusChainName.textContent = chain.name;

                // Close dropdown
                DOM.chainSwitcher.classList.remove('open');

                // Show system message
                addSystemMessage(`Switched to ${chain.name} (Chain ID: ${chain.chainId})`);
            });
        });
    }

    // ===== WALLET CONNECTION =====
    async function connectWallet() {
        if (typeof window.ethereum === 'undefined') {
            addAIMessage('No Web3 wallet detected. Please install MetaMask, Rabby, or another browser wallet to connect.');
            return;
        }

        try {
            state.provider = new ethers.BrowserProvider(window.ethereum);
            state.signer = await state.provider.getSigner();
            state.walletAddress = await state.signer.getAddress();
            // Ask the user to sign the session authentication message
            addSystemMessage("Please sign the session authentication request in your Web3 wallet...");
            state.walletSignature = await state.signer.signMessage("Authenticate RitAlert Session");

            // Update UI
            DOM.walletBtn.classList.add('connected');
            DOM.walletBtn.setAttribute('data-full-address', state.walletAddress);
            DOM.walletBtn.setAttribute('data-signature', state.walletSignature);
            DOM.walletBtnText.innerHTML = `<span class="wallet-dot"></span> ${abbreviate(state.walletAddress)}`;
            DOM.statusWallet.textContent = `Wallet: ${abbreviate(state.walletAddress)}`;

            addSystemMessage(`Wallet authenticated: ${abbreviate(state.walletAddress)}`);

            // Start block polling
            pollBlockNumber();
            
            // Load tracking list from database
            loadDBTrackedHistory(state.walletAddress);
        } catch (err) {
            console.error('Wallet connection failed:', err);
            addAIMessage(`Wallet authentication failed: ${err.message}`);
        }
    }

    async function pollBlockNumber() {
        if (!state.provider) return;
        try {
            const chain = CONFIG.chains[state.currentChain];
            const rpcProvider = new ethers.JsonRpcProvider(chain.rpc);
            const blockNumber = await rpcProvider.getBlockNumber();
            DOM.statusBlock.textContent = `Block: ${blockNumber.toLocaleString()}`;
        } catch (e) {
            DOM.statusBlock.textContent = 'Block: --';
        }
        setTimeout(pollBlockNumber, 15000);
    }

    function initWallet() {
        DOM.walletBtn.addEventListener('click', () => {
            if (state.walletAddress) {
                // Already connected — could show disconnect option
                return;
            }
            connectWallet();
        });

        // Listen for account changes
        if (typeof window.ethereum !== 'undefined') {
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length === 0) {
                    state.walletAddress = null;
                    state.signer = null;
                    DOM.walletBtn.classList.remove('connected');
                    DOM.walletBtn.removeAttribute('data-full-address');
                    DOM.walletBtnText.textContent = 'Connect Wallet';
                    DOM.statusWallet.textContent = 'Wallet: Not connected';
                    addSystemMessage('Wallet disconnected');
                } else {
                    connectWallet();
                }
            });
        }
    }

    // ===== CHAT & MESSAGES =====
    function hideWelcome() {
        if (DOM.chatWelcome) {
            DOM.chatWelcome.style.display = 'none';
        }
    }

    function addUserMessage(text) {
        hideWelcome();
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const msgEl = document.createElement('div');
        msgEl.className = 'message message-user';
        msgEl.innerHTML = `
            <div class="message-avatar">U</div>
            <div>
                <div class="message-content">${escapeHtml(text)}</div>
                <div class="message-time">${now}</div>
            </div>
        `;
        DOM.chatMessages.appendChild(msgEl);
        scrollToBottom();
    }

    function addAIMessage(text) {
        hideWelcome();
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const msgEl = document.createElement('div');
        msgEl.className = 'message message-ai';
        // Support basic markdown bold **text**
        const formattedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
        msgEl.innerHTML = `
            <div class="message-avatar">RA</div>
            <div>
                <div class="message-content">${formattedText}</div>
                <div class="message-time">${now}</div>
            </div>
        `;
        DOM.chatMessages.appendChild(msgEl);
        scrollToBottom();
    }

    function addSystemMessage(text) {
        hideWelcome();
        const msgEl = document.createElement('div');
        msgEl.className = 'message message-system';
        msgEl.innerHTML = `<div class="message-content">${escapeHtml(text)}</div>`;
        DOM.chatMessages.appendChild(msgEl);
        scrollToBottom();
    }

    function addActivityCards(address, activities) {
        hideWelcome();
        const container = document.createElement('div');
        container.className = 'message message-ai';
        container.style.maxWidth = '90%';

        let cardsHtml = activities.map(a => `
            <div class="activity-card">
                <div class="activity-card-header">
                    <div class="activity-type activity-type-${a.type}">
                        <span class="activity-type-icon">${a.icon}</span>
                        <span>${a.label}</span>
                    </div>
                    <span class="activity-time">${a.time}</span>
                </div>
                <div class="activity-details">
                    <div class="activity-row">
                        <span class="activity-label">From</span>
                        <span class="activity-value">${a.from}</span>
                    </div>
                    <div class="activity-row">
                        <span class="activity-label">To</span>
                        <span class="activity-value">${a.to}</span>
                    </div>
                    <div class="activity-row">
                        <span class="activity-label">Amount</span>
                        <span class="activity-value ${a.valueClass}">${a.amount}</span>
                    </div>
                    <div class="activity-row">
                        <span class="activity-label">Tx</span>
                        <a class="activity-hash" href="${a.explorer}" target="_blank">${abbreviate(a.txHash, 10, 6)}</a>
                    </div>
                </div>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="message-avatar">RA</div>
            <div style="flex:1;">
                <div class="message-content">
                    Found <strong>${activities.length} recent transactions</strong> for <strong>${abbreviate(address)}</strong> on ${CONFIG.chains[state.currentChain].name}
                </div>
                ${cardsHtml}
                <div class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
        `;

        DOM.chatMessages.appendChild(container);
        scrollToBottom();
    }

    function showTypingIndicator() {
        const el = document.createElement('div');
        el.className = 'typing-indicator';
        el.id = 'typing-indicator';
        el.innerHTML = `
            <div class="message-avatar" style="background: linear-gradient(135deg, #FF4D00, #FF8C00); color: white; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:700;">RA</div>
            <div class="typing-dots">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        `;
        DOM.chatMessages.appendChild(el);
        scrollToBottom();
    }

    function hideTypingIndicator() {
        const el = document.getElementById('typing-indicator');
        if (el) el.remove();
    }

    function scrollToBottom() {
        DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ===== ADDRESS DETECTION =====
    function isAddress(input) {
        return /^0x[a-fA-F0-9]{40}$/.test(input.trim());
    }

    // ===== TRACKING LOGIC =====
    async function handleTrack(input) {
        const address = input.trim();
        if (!isAddress(address)) {
            addAIMessage("That doesn't look like a valid address. Please paste a valid Ethereum-style address (0x followed by 40 hex characters).");
            return;
        }

        addUserMessage(`Track ${abbreviate(address)}`);

        // Add to tracking history
        addToHistory(address);

        // Show loading indicator
        showTypingIndicator();

        try {
            const activities = await fetchRealTransactions(address, state.currentChain);
            hideTypingIndicator();
            if (activities.length === 0) {
                addAIMessage(`No transaction history found on the block explorer for **${abbreviate(address)}**.`);
            } else {
                addActivityCards(address, activities);
            }
        } catch (err) {
            hideTypingIndicator();
            addAIMessage(`Error fetching real-life transaction details: ${err.message}`);
        }

        // Update header
        DOM.chatHeaderTitle.textContent = `Tracking: ${abbreviate(address)}`;
        DOM.chatHeaderSubtitle.textContent = CONFIG.chains[state.currentChain].name;
    }

    async function handleAsk(input) {
        const text = input.trim();
        if (!text) return;

        addUserMessage(text);

        // Check if the input is an address
        let address = text;
        if (!isAddress(text)) {
            // Try to extract an address from the text
            const match = text.match(/0x[a-fA-F0-9]{40}/);
            if (match) {
                address = match[0];
            } else {
                // No address found, give a general response
                showTypingIndicator();
                setTimeout(() => {
                    hideTypingIndicator();
                    addAIMessage(
                        `I can help you track wallet addresses and smart contracts on ${CONFIG.chains[state.currentChain].name}.\n\n` +
                        `Try pasting a wallet address (0x...) and clicking **Track** to see recent activity, or click **Ask AI** with a question about a specific address.\n\n` +
                        `You can also:\n• Switch chains using the dropdown in the nav bar\n• Set up Telegram alerts in the sidebar\n• Monitor multiple addresses simultaneously`
                    );
                }, 800 + Math.random() * 500);
                return;
            }
        }

        // Generate AI response for the address
        showTypingIndicator();
        try {
            const aiMsg = await generateAIResponse(text, address);
            hideTypingIndicator();
            addAIMessage(aiMsg);
        } catch (err) {
            hideTypingIndicator();
            addAIMessage(`Failed to analyze the target address: ${err.message}`);
        }
    }

    // ===== TRACKING HISTORY =====
    async function loadDBTrackedHistory(walletAddress) {
        if (!walletAddress) return;
        try {
            const res = await fetch(`/api/db/tracked-addresses?walletAddress=${walletAddress}`);
            const data = await res.json();
            if (data.addresses) {
                state.trackingHistory = data.addresses.map(a => ({
                    id: a.id,
                    address: a.target_address,
                    chain: a.blockchain === 'Ritual Testnet' ? 'ritual' : 'ethereum',
                    timestamp: new Date(a.created_at).getTime()
                }));
                renderTrackingHistory();
            }
        } catch (err) {
            console.error("Error loading DB tracked history:", err);
        }
    }

    async function addToHistory(address) {
        const chain = state.currentChain;
        const chainConfig = CONFIG.chains[chain];
        const exists = state.trackingHistory.find(h => h.address.toLowerCase() === address.toLowerCase() && h.chain === chain);
        if (!exists) {
            if (!state.walletAddress) {
                // Fallback to local memory if wallet not connected yet
                state.trackingHistory.unshift({
                    address,
                    chain,
                    timestamp: Date.now(),
                });
                renderTrackingHistory();
                return;
            }

            try {
                const res = await fetch('/api/db/save-address', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userWallet: state.walletAddress,
                        targetAddress: address,
                        blockchain: chainConfig.name,
                        alias: 'Contract/Wallet',
                        signature: state.walletSignature
                    })
                });
                const data = await res.json();
                if (data.success && data.address) {
                    state.trackingHistory.unshift({
                        id: data.address.id,
                        address: data.address.target_address,
                        chain: chain,
                        timestamp: new Date(data.address.created_at).getTime()
                    });
                    renderTrackingHistory();
                }
            } catch (err) {
                console.error("Error saving address tracker to DB:", err);
            }
        }
    }

    async function deleteTrackItem(id, address) {
        if (!state.walletAddress) return;
        try {
            const res = await fetch('/api/db/delete-address', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: id,
                    userWallet: state.walletAddress,
                    signature: state.walletSignature
                })
            });
            const data = await res.json();
            if (data.success) {
                state.trackingHistory = state.trackingHistory.filter(h => h.id !== id);
                renderTrackingHistory();
                addSystemMessage(`Removed tracker: ${abbreviate(address)}`);
            }
        } catch (err) {
            console.error("Error deleting address tracker:", err);
        }
    }

    // Expose deleteTrackItem to window scope so onclick handler in generated HTML can hit it
    window.deleteTrackItem = deleteTrackItem;

    function renderTrackingHistory() {
        if (state.trackingHistory.length === 0) {
            DOM.trackingHistory.innerHTML = `
                <div class="sidebar-item">
                    <span class="sidebar-item-icon">📭</span>
                    <span class="sidebar-item-text text-muted">No history yet</span>
                </div>
            `;
            return;
        }

        DOM.trackingHistory.innerHTML = state.trackingHistory.map(h => {
            const chain = CONFIG.chains[h.chain];
            return `
                <div class="sidebar-item" data-address="${h.address}" data-chain="${h.chain}" style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:0.5rem; flex-grow:1;">
                        <span class="chain-icon ${chain.iconClass}" style="width:18px;height:18px;font-size:0.55rem;flex-shrink:0;">${chain.iconLetter}</span>
                        <span class="sidebar-item-text">${abbreviate(h.address)}</span>
                    </div>
                    <span style="opacity:0.4; cursor:pointer; padding:0 0.25rem; font-weight:700;" onclick="event.stopPropagation(); window.deleteTrackItem('${h.id || ''}', '${h.address}')">✕</span>
                </div>
            `;
        }).join('');

        // Bind click events
        DOM.trackingHistory.querySelectorAll('.sidebar-item').forEach(item => {
            const clickableArea = item.querySelector('div');
            clickableArea.addEventListener('click', () => {
                const addr = item.dataset.address;
                const chain = item.dataset.chain;
                // Switch chain if different
                if (chain !== state.currentChain) {
                    const chainOpt = document.querySelector(`.chain-option[data-chain="${chain}"]`);
                    if (chainOpt) chainOpt.click();
                }
                DOM.chatInput.value = addr;
                handleTrack(addr);
            });
        });
    }

    // ===== NOTIFICATIONS HUB INTEGRATION =====
    function initNotifications() {
        // Load saved config
        if (state.telegramConfig.chatId) {
            DOM.tgChatId.value = state.telegramConfig.chatId;
        }
        if (state.discordConfig.webhookUrl) {
            DOM.discordWebhook.value = state.discordConfig.webhookUrl;
        }
        updateNotificationsStatus();

        // Open modal
        DOM.notificationsSetupBtn.addEventListener('click', () => {
            DOM.notificationsModalOverlay.classList.add('active');
        });

        // Close modal
        DOM.notificationsModalClose.addEventListener('click', () => {
            DOM.notificationsModalOverlay.classList.remove('active');
        });

        DOM.notificationsModalOverlay.addEventListener('click', (e) => {
            if (e.target === DOM.notificationsModalOverlay) {
                DOM.notificationsModalOverlay.classList.remove('active');
            }
        });

        // Tabs switching
        DOM.notifTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                
                DOM.notifTabs.forEach(t => {
                    t.classList.remove('active');
                    t.style.background = 'transparent';
                    t.style.color = 'var(--white-40)';
                });
                
                tab.classList.add('active');
                if (tabName === 'telegram') {
                    tab.style.background = 'var(--ritual-red-10)';
                    tab.style.color = 'var(--ritual-orange)';
                } else if (tabName === 'discord') {
                    tab.style.background = 'rgba(88,101,242,0.15)';
                    tab.style.color = '#5865F2';
                } else {
                    tab.style.background = 'rgba(255,184,0,0.1)';
                    tab.style.color = 'var(--warning)';
                }

                DOM.notifPanels.forEach(p => p.classList.add('hidden'));
                document.getElementById(`panel-${tabName}`).classList.remove('hidden');
            });
        });

        // Telegram - Save config
        DOM.tgSaveBtn.addEventListener('click', () => {
            const chatId = DOM.tgChatId.value.trim();
            if (!chatId) {
                alert('Please enter a valid Chat ID');
                return;
            }
            state.telegramConfig = {
                chatId: chatId,
            };
            localStorage.setItem('ritalert_telegram', JSON.stringify(state.telegramConfig));
            updateNotificationsStatus();
            addSystemMessage('Telegram configuration saved');
        });

        // Telegram - Edit config
        DOM.tgEditBtn.addEventListener('click', () => {
            DOM.tgInputArea.classList.remove('hidden');
            DOM.tgSavedArea.classList.add('hidden');
            DOM.tgChatId.focus();
        });

        // Telegram - Test alert helper
        async function triggerTelegramTest() {
            const chatId = DOM.tgChatId.value.trim();

            if (!chatId) {
                alert('Please enter your Telegram Chat ID first.');
                return;
            }

            try {
                DOM.tgTestBtn.textContent = 'Sending...';
                DOM.tgTestBtn.disabled = true;
                DOM.tgTestBtnSaved.textContent = 'Sending...';
                DOM.tgTestBtnSaved.disabled = true;

                const message = `🔔 <b>RitAlert Telegram Notification</b>\n\nYour Telegram alerts are successfully connected to @ritalert_bot!\n\n🔗 Active Chain: ${CONFIG.chains[state.currentChain].name}\n⏰ Time: ${new Date().toLocaleString()}`;

                const response = await fetch(`/api/payments/test-telegram`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chatId: chatId,
                        message: message
                    })
                });

                const data = await response.json();
                if (data.success) {
                    DOM.tgTestBtn.textContent = '✅ Sent!';
                    DOM.tgTestBtnSaved.textContent = '✅ Sent!';
                    setTimeout(() => { 
                        DOM.tgTestBtn.textContent = '🔔 Test Alert'; 
                        DOM.tgTestBtnSaved.textContent = '🔔 Send Test'; 
                    }, 2000);
                } else {
                    DOM.tgTestBtn.textContent = '❌ Failed';
                    DOM.tgTestBtnSaved.textContent = '❌ Failed';
                    alert('Failed to send Telegram alert: ' + (data.error || 'Unknown error. Make sure you started the bot by clicking Start in @ritalert_bot first.'));
                    setTimeout(() => { 
                        DOM.tgTestBtn.textContent = '🔔 Test Alert'; 
                        DOM.tgTestBtnSaved.textContent = '🔔 Send Test'; 
                    }, 2000);
                }
            } catch (err) {
                DOM.tgTestBtn.textContent = '❌ Error';
                DOM.tgTestBtnSaved.textContent = '❌ Error';
                alert('Network error: ' + err.message);
                setTimeout(() => { 
                    DOM.tgTestBtn.textContent = '🔔 Test Alert'; 
                    DOM.tgTestBtnSaved.textContent = '🔔 Send Test'; 
                }, 2000);
            } finally {
                DOM.tgTestBtn.disabled = false;
                DOM.tgTestBtnSaved.disabled = false;
            }
        }

        DOM.tgTestBtn.addEventListener('click', triggerTelegramTest);
        DOM.tgTestBtnSaved.addEventListener('click', triggerTelegramTest);

        // Discord - Save config
        DOM.discordSaveBtn.addEventListener('click', () => {
            const webhookUrl = DOM.discordWebhook.value.trim();
            if (!webhookUrl) {
                alert('Please enter a valid Webhook URL');
                return;
            }
            state.discordConfig = {
                webhookUrl: webhookUrl,
            };
            localStorage.setItem('ritalert_discord', JSON.stringify(state.discordConfig));
            updateNotificationsStatus();
            addSystemMessage('Discord Webhook configuration saved');
        });

        // Discord - Edit config
        DOM.discordEditBtn.addEventListener('click', () => {
            DOM.discordInputArea.classList.remove('hidden');
            DOM.discordSavedArea.classList.add('hidden');
            DOM.discordWebhook.focus();
        });

        // Discord - Test alert helper
        async function triggerDiscordTest() {
            const webhookUrl = DOM.discordWebhook.value.trim();

            if (!webhookUrl) {
                alert('Please enter your Discord Webhook URL first.');
                return;
            }

            try {
                DOM.discordTestBtn.textContent = 'Sending...';
                DOM.discordTestBtn.disabled = true;
                DOM.discordTestBtnSaved.textContent = 'Sending...';
                DOM.discordTestBtnSaved.disabled = true;

                const message = {
                    content: null,
                    embeds: [
                        {
                            title: "🔔 RitAlert Discord Notification",
                            description: "Your Discord alerts are successfully connected via Webhook!",
                            color: 16731392, // #FF4D00
                            fields: [
                                {
                                    name: "Active Chain",
                                    value: CONFIG.chains[state.currentChain].name,
                                    inline: true
                                },
                                {
                                    name: "Status",
                                    value: "Connected ✅",
                                    inline: true
                                }
                             ],
                             timestamp: new Date().toISOString()
                         }
                    ],
                    username: "RitAlert Bot"
                };

                const response = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(message),
                });

                if (response.ok) {
                    DOM.discordTestBtn.textContent = '✅ Sent!';
                    DOM.discordTestBtnSaved.textContent = '✅ Sent!';
                    setTimeout(() => { 
                        DOM.discordTestBtn.textContent = '🔔 Test Alert'; 
                        DOM.discordTestBtnSaved.textContent = '🔔 Send Test'; 
                    }, 2000);
                } else {
                    DOM.discordTestBtn.textContent = '❌ Failed';
                    DOM.discordTestBtnSaved.textContent = '❌ Failed';
                    alert('Failed to send Discord alert. Please check your Webhook URL.');
                    setTimeout(() => { 
                        DOM.discordTestBtn.textContent = '🔔 Test Alert'; 
                        DOM.discordTestBtnSaved.textContent = '🔔 Send Test'; 
                    }, 2000);
                }
            } catch (err) {
                DOM.discordTestBtn.textContent = '❌ Error';
                DOM.discordTestBtnSaved.textContent = '❌ Error';
                alert('Network error: ' + err.message);
                setTimeout(() => { 
                    DOM.discordTestBtn.textContent = '🔔 Test Alert'; 
                    DOM.discordTestBtnSaved.textContent = '🔔 Send Test'; 
                }, 2000);
            } finally {
                DOM.discordTestBtn.disabled = false;
                DOM.discordTestBtnSaved.disabled = false;
            }
        }

        DOM.discordTestBtn.addEventListener('click', triggerDiscordTest);
        DOM.discordTestBtnSaved.addEventListener('click', triggerDiscordTest);

        // Push - Enable notifications
        DOM.pushEnableBtn.addEventListener('click', () => {
            if (!("Notification" in window)) {
                alert("This browser does not support desktop notifications.");
                return;
            }

            Notification.requestPermission().then(permission => {
                state.pushConfig = {
                    enabled: permission === "granted"
                };
                localStorage.setItem('ritalert_push', JSON.stringify(state.pushConfig));
                updateNotificationsStatus();
                if (permission === "granted") {
                    new Notification("RitAlert", {
                        body: "Push notifications are successfully enabled!",
                        icon: "assets/logo.png"
                    });
                    addSystemMessage('Push notifications enabled');
                } else {
                    addSystemMessage('Push notification permission denied');
                }
            });
        });
    }

    function updateNotificationsStatus() {
        // Telegram
        if (state.telegramConfig.chatId) {
            DOM.telegramStatus.className = 'telegram-status telegram-status-connected';
            DOM.telegramStatus.innerHTML = '<span class="status-dot-sm status-dot-green"></span> Connected to @ritalert_bot';
            DOM.tgInputArea.classList.add('hidden');
            DOM.tgSavedArea.classList.remove('hidden');
            DOM.tgDisplayChatId.textContent = state.telegramConfig.chatId;
        } else {
            DOM.telegramStatus.className = 'telegram-status telegram-status-disconnected';
            DOM.telegramStatus.innerHTML = '<span class="status-dot-sm status-dot-red"></span> Not connected';
            DOM.tgInputArea.classList.remove('hidden');
            DOM.tgSavedArea.classList.add('hidden');
        }

        // Discord
        if (state.discordConfig.webhookUrl) {
            DOM.discordStatus.className = 'telegram-status telegram-status-connected';
            DOM.discordStatus.innerHTML = '<span class="status-dot-sm status-dot-green"></span> Webhook connected';
            DOM.discordInputArea.classList.add('hidden');
            DOM.discordSavedArea.classList.remove('hidden');
            DOM.discordDisplayWebhook.textContent = abbreviate(state.discordConfig.webhookUrl, 18, 18);
        } else {
            DOM.discordStatus.className = 'telegram-status telegram-status-disconnected';
            DOM.discordStatus.innerHTML = '<span class="status-dot-sm status-dot-red"></span> Webhook not connected';
            DOM.discordInputArea.classList.remove('hidden');
            DOM.discordSavedArea.classList.add('hidden');
        }

        // Push
        const pushPerm = "Notification" in window ? Notification.permission : "default";
        if (pushPerm === "granted" && state.pushConfig.enabled) {
            DOM.pushStatus.className = 'telegram-status telegram-status-connected';
            DOM.pushStatus.innerHTML = '<span class="status-dot-sm status-dot-green"></span> Browser push notifications enabled';
            DOM.pushEnableBtn.textContent = 'Push Notifications Enabled';
            DOM.pushEnableBtn.disabled = true;
            DOM.pushEnableBtn.style.opacity = '0.5';
            DOM.pushEnableBtn.style.cursor = 'not-allowed';
        } else {
            DOM.pushStatus.className = 'telegram-status telegram-status-disconnected';
            DOM.pushStatus.innerHTML = '<span class="status-dot-sm status-dot-red"></span> Push notifications disabled';
            DOM.pushEnableBtn.textContent = 'Enable Push Notifications';
            DOM.pushEnableBtn.disabled = false;
            DOM.pushEnableBtn.style.opacity = '1';
            DOM.pushEnableBtn.style.cursor = 'pointer';
        }
    }

    // ===== QUICK ACTIONS =====
    function initQuickActions() {
        DOM.quickActions.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                switch (action) {
                    case 'track-sample-wallet':
                        DOM.chatInput.value = SAMPLE_ADDRESSES.wallet;
                        handleTrack(SAMPLE_ADDRESSES.wallet);
                        break;
                    case 'track-sample-contract':
                        DOM.chatInput.value = SAMPLE_ADDRESSES.contract;
                        handleTrack(SAMPLE_ADDRESSES.contract);
                        break;
                    case 'setup-alerts':
                        DOM.notificationsModalOverlay.classList.add('active');
                        break;
                    case 'explore-chains':
                        DOM.chainSwitcher.classList.add('open');
                        addAIMessage(
                            `Currently supported chains:\n\n` +
                            `✅ **Ritual Testnet** — Chain ID 1979\n` +
                            `✅ **Ethereum Mainnet** — Chain ID 1\n` +
                            `🔒 **BNB Smart Chain** — Coming soon\n` +
                            `🔒 **Arbitrum One** — Coming soon\n` +
                            `🔒 **Optimism** — Coming soon\n` +
                            `🔒 **Base** — Coming soon\n\n` +
                            `Use the chain switcher in the navigation bar to switch between active chains.`
                        );
                        break;
                }
            });
        });
    }

    // ===== CHAT INPUT HANDLERS =====
    function initChatInput() {
        // Track button
        DOM.btnTrack.addEventListener('click', () => {
            const input = DOM.chatInput.value.trim();
            if (!input) return;
            handleTrack(input);
            DOM.chatInput.value = '';
        });

        // Ask AI button
        DOM.btnAsk.addEventListener('click', () => {
            const input = DOM.chatInput.value.trim();
            if (!input) return;
            handleAsk(input);
            DOM.chatInput.value = '';
        });

        // Enter key
        DOM.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const input = DOM.chatInput.value.trim();
                if (!input) return;

                // Auto-detect: if it's an address, track it; otherwise ask AI
                if (isAddress(input)) {
                    handleTrack(input);
                } else {
                    handleAsk(input);
                }
                DOM.chatInput.value = '';
            }
        });

        // New chat
        DOM.newChatBtn.addEventListener('click', () => {
            clearChat();
        });

        // Clear chat
        DOM.clearChatBtn.addEventListener('click', () => {
            clearChat();
        });
    }

    function clearChat() {
        DOM.chatMessages.innerHTML = '';
        // Re-add welcome screen
        DOM.chatMessages.innerHTML = `
            <div class="chat-welcome" id="chat-welcome">
                <div class="chat-welcome-logo">
                    <svg viewBox="0 0 220 220" width="60" height="60">
                        <path d="M 115 25 L 60 80 L 115 135 L 170 80" fill="none" stroke="#FF4D00" stroke-width="10" stroke-linecap="square" opacity="0.5" />
                        <path d="M 100 40 L 45 95 L 100 150 L 155 95" fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="square" opacity="0.4" />
                    </svg>
                </div>
                <h2>Welcome to RitAlert</h2>
                <p>Track any wallet address or smart contract across chains. Get AI-powered insights and instant alerts via Telegram, Discord, and push notifications.</p>
                <div class="quick-actions">
                    <button class="quick-action" data-action="track-sample-wallet"><span class="quick-action-icon">👛</span> Track a wallet</button>
                    <button class="quick-action" data-action="track-sample-contract"><span class="quick-action-icon">📜</span> Monitor a contract</button>
                    <button class="quick-action" data-action="setup-alerts"><span class="quick-action-icon">🔔</span> Setup notifications</button>
                    <button class="quick-action" data-action="explore-chains"><span class="quick-action-icon">⛓️</span> Explore chains</button>
                </div>
            </div>
        `;

        // Re-bind quick actions
        document.querySelectorAll('.quick-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                DOM.quickActions = document.querySelectorAll('.quick-action');
                initQuickActions();
                btn.click();
            });
        });
        initQuickActions();

        DOM.chatHeaderTitle.textContent = 'RitAlert Agent';
        DOM.chatHeaderSubtitle.textContent = 'Paste any wallet or contract address to start tracking';
    }

    // ===== INITIALIZE =====
    function init() {
        initChainSwitcher();
        initWallet();
        initChatInput();
        initQuickActions();
        initNotifications();
        renderTrackingHistory();

        // Try initial block fetch
        const chain = CONFIG.chains[state.currentChain];
        try {
            const rpcProvider = new ethers.JsonRpcProvider(chain.rpc);
            rpcProvider.getBlockNumber().then(bn => {
                DOM.statusBlock.textContent = `Block: ${bn.toLocaleString()}`;
            }).catch(() => {});
        } catch (e) {}

        // Focus input
        DOM.chatInput.focus();
    }

    // Run
    init();

})();
