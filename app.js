/* 
   Ritual Sovereign Agent Application Logic
   Web3 Client Integration (ethers.js v6) & TEE Logs Simulation
*/

// Contract Addresses (Ritual Testnet - Chain ID 1979)
const FACTORY_ADDRESS = "0x9dC4C054e53bCc4Ce0A0Ff09E890A7a8e817f304";
const RITUAL_WALLET_ADDRESS = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948";

// Contract ABIs
const FACTORY_ABI = [
    "function predictHarness(address owner, bytes32 salt) public view returns (address predicted, bytes32 finalSalt)"
];

const RITUAL_WALLET_ABI = [
    "function balanceOf(address account) public view returns (uint256)",
    "function depositFor(address account, uint256 lockBlocks) public payable"
];

const HARNESS_ABI = [
    "function configured() public view returns (bool)",
    "function wakeMode() public view returns (uint8)"
];

// App State
let provider = null;
let signer = null;
let userAddress = null;
let activeNetwork = null;
let predictedHarnessAddress = null;
let isPollerRunning = false;
let pollerInterval = null;

// UI Elements
const navHome = document.getElementById("nav-home");
const navDashboard = document.getElementById("nav-dashboard");
const navLogoBtn = document.getElementById("nav-logo-btn");
const landingView = document.getElementById("landing-view");
const dashboardView = document.getElementById("dashboard-view");
const heroLaunchBtn = document.getElementById("hero-launch-btn");

const connectWalletBtn = document.getElementById("connect-wallet-btn");
const walletBtnText = document.getElementById("wallet-btn-text");
const dashboardConnectBtn = document.getElementById("dashboard-connect-btn");

const unconnectedContainer = document.getElementById("dashboard-unconnected-container");
const connectedContainer = document.getElementById("dashboard-connected-container");

const statusDot = document.getElementById("dashboard-status-dot");
const statusText = document.getElementById("dashboard-status-text");
const networkNameDisp = document.getElementById("dashboard-network-name");
const blockHeightDisp = document.getElementById("dashboard-block-height");

const agentSaltInput = document.getElementById("agent-salt-input");
const harnessAddrDisp = document.getElementById("harness-address");
const agentConfiguredDisp = document.getElementById("agent-configured");
const agentWakeStatusDisp = document.getElementById("agent-wake-status");
const ownerWalletDisp = document.getElementById("owner-wallet");
const agentBalanceDisp = document.getElementById("agent-balance");
const refreshAgentBtn = document.getElementById("refresh-agent-btn");

const depositAmountInput = document.getElementById("deposit-amount-input");
const depositBtn = document.getElementById("deposit-btn");
const terminalLogs = document.getElementById("terminal-logs");
const toastContainer = document.getElementById("toast-container");

// Initialize Navigation Tabs
function switchView(viewName) {
    if (viewName === "dashboard") {
        navHome.classList.remove("active");
        navDashboard.classList.add("active");
        landingView.classList.remove("active");
        dashboardView.classList.add("active");
        // Trigger auto-connect check or state refresh
        initWeb3(false);
    } else {
        navDashboard.classList.remove("active");
        navHome.classList.add("active");
        dashboardView.classList.remove("active");
        landingView.classList.add("active");
    }
}

navHome.addEventListener("click", (e) => { e.preventDefault(); switchView("home"); });
navDashboard.addEventListener("click", (e) => { e.preventDefault(); switchView("dashboard"); });
navLogoBtn.addEventListener("click", (e) => { e.preventDefault(); switchView("home"); });
heroLaunchBtn.addEventListener("click", () => switchView("dashboard"));

// Toast Notifications
function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    let iconClass = "fa-info-circle";
    if (type === "success") iconClass = "fa-check-circle";
    if (type === "error") iconClass = "fa-exclamation-triangle";
    
    toast.innerHTML = `<i class="fa-solid ${iconClass}"></i><span>${message}</span>`;
    toastContainer.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add("show"), 10);
    
    // Remove after 4s
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Web3 Setup
async function initWeb3(explicitTrigger = false) {
    if (typeof window.ethereum === "undefined") {
        if (explicitTrigger) {
            showToast("No Web3 wallet detected. Please install MetaMask or Rabby.", "error");
        }
        return;
    }

    try {
        provider = new ethers.BrowserProvider(window.ethereum);
        
        // Check if accounts are already authorized (non-blocking)
        const accounts = await provider.listAccounts();
        if (accounts.length > 0 || explicitTrigger) {
            signer = await provider.getSigner();
            userAddress = await signer.getAddress();
            
            // Validate network
            const network = await provider.getNetwork();
            activeNetwork = network;
            
            if (Number(network.chainId) !== 1979) {
                // Try switching to Ritual Testnet
                try {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0x7BB' }] // 1979 in hex is 0x7BB
                    });
                    // Reinitialize after switch
                    return initWeb3(explicitTrigger);
                } catch (switchError) {
                    // Chain not added, try adding it
                    if (switchError.code === 4902) {
                        try {
                            await window.ethereum.request({
                                method: 'wallet_addEthereumChain',
                                params: [{
                                    chainId: '0x7BB',
                                    chainName: 'Ritual Testnet',
                                    nativeCurrency: { name: 'RITUAL', symbol: 'RITUAL', decimals: 18 },
                                    rpcUrls: ['https://rpc.ritualfoundation.org'],
                                    blockExplorerUrls: ['https://explorer.ritualfoundation.org']
                                }]
                            });
                            return initWeb3(explicitTrigger);
                        } catch (addError) {
                            showToast("Failed to add Ritual network to wallet.", "error");
                        }
                    } else {
                        showToast("Please switch your Web3 wallet to the Ritual Testnet (Chain 1979)", "error");
                    }
                }
            }

            // Successfully connected to Ritual Testnet
            updateConnectedUI();
            startOnChainPoller();
            if (explicitTrigger) {
                showToast("Wallet connected successfully!", "success");
            }
        }
    } catch (err) {
        console.error(err);
        if (explicitTrigger) {
            showToast("Failed to connect wallet: " + err.message, "error");
        }
    }
}

connectWalletBtn.addEventListener("click", () => initWeb3(true));
dashboardConnectBtn.addEventListener("click", () => initWeb3(true));

function updateConnectedUI() {
    const formattedAddress = userAddress.substring(0, 6) + "..." + userAddress.substring(userAddress.length - 4);
    walletBtnText.textContent = formattedAddress;
    connectWalletBtn.classList.remove("btn-secondary");
    connectWalletBtn.classList.add("btn-primary");
    
    unconnectedContainer.style.display = "none";
    connectedContainer.style.display = "grid";
    
    statusDot.classList.add("active");
    statusText.textContent = "Connected";
    networkNameDisp.textContent = "Ritual Testnet (Chain: 1979)";
    ownerWalletDisp.textContent = userAddress;
}

// On-Chain Polling and Calculations
async function queryAgentStatus() {
    if (!provider || !userAddress) return;

    try {
        // 1. Update Block height
        const blockNumber = await provider.getBlockNumber();
        blockHeightDisp.textContent = "Block: " + blockNumber;

        // 2. Predict Harness Address using Salt
        const saltStr = agentSaltInput.value.trim() || "ritual-agent-1";
        // bytes32Salt is keccak256 of the string salt
        const bytes32Salt = ethers.id(saltStr);
        
        const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
        const [predicted] = await factory.predictHarness(userAddress, bytes32Salt);
        predictedHarnessAddress = predicted;
        harnessAddrDisp.textContent = predicted;
        harnessAddrDisp.className = "detail-value harness-address-badge";

        // 3. Query Harness Contract Deployment & State
        const code = await provider.getCode(predicted);
        
        if (code === "0x" || code === "0x0") {
            // Not deployed yet
            agentConfiguredDisp.textContent = "Not Deployed";
            agentConfiguredDisp.style.color = "var(--text-muted)";
            agentWakeStatusDisp.textContent = "Inactive";
            agentWakeStatusDisp.style.color = "var(--status-dead)";
            agentBalanceDisp.innerHTML = `0.000000 <span style="font-size: 1.5rem; color: var(--text-secondary)">RITUAL</span>`;
            return;
        }

        // Deployed! Check configured & wakeMode
        const harness = new ethers.Contract(predicted, HARNESS_ABI, provider);
        const isConfigured = await harness.configured();
        agentConfiguredDisp.textContent = isConfigured ? "Yes" : "No";
        agentConfiguredDisp.style.color = isConfigured ? "var(--status-live)" : "var(--text-muted)";

        const wakeMode = await harness.wakeMode();
        if (Number(wakeMode) === 1) {
            agentWakeStatusDisp.textContent = "Armed (Live)";
            agentWakeStatusDisp.style.color = "var(--status-live)";
        } else {
            agentWakeStatusDisp.textContent = "Disarmed (Sleeping)";
            agentWakeStatusDisp.style.color = "var(--text-secondary)";
        }

        // 4. Query Ritual Wallet Balance
        const rWallet = new ethers.Contract(RITUAL_WALLET_ADDRESS, RITUAL_WALLET_ABI, provider);
        const balanceWei = await rWallet.balanceOf(predicted);
        const balanceRitual = ethers.formatEther(balanceWei);
        
        // Truncate decimals for clean look
        const floatBal = parseFloat(balanceRitual);
        agentBalanceDisp.innerHTML = `${floatBal.toFixed(6)} <span style="font-size: 1.5rem; color: var(--text-secondary)">RITUAL</span>`;

    } catch (err) {
        console.error("Error querying on-chain status:", err);
    }
}

function startOnChainPoller() {
    if (isPollerRunning) return;
    isPollerRunning = true;
    
    // Initial fetch
    queryAgentStatus();
    
    // Poll every 10 seconds
    pollerInterval = setInterval(queryAgentStatus, 10000);
}

// User Actions
refreshAgentBtn.addEventListener("click", () => {
    queryAgentStatus();
    showToast("Refreshing agent details...", "info");
});

agentSaltInput.addEventListener("input", () => {
    queryAgentStatus();
});

// Top Up Deposit Trigger
depositBtn.addEventListener("click", async () => {
    if (!signer || !predictedHarnessAddress) {
        showToast("Please connect your wallet first.", "error");
        return;
    }

    const amountStr = depositAmountInput.value;
    if (!amountStr || parseFloat(amountStr) <= 0) {
        showToast("Please enter a valid deposit amount.", "error");
        return;
    }

    try {
        const amountWei = ethers.parseEther(amountStr);
        const wallet = new ethers.Contract(RITUAL_WALLET_ADDRESS, RITUAL_WALLET_ABI, signer);
        
        // Verify agent is deployed
        const code = await provider.getCode(predictedHarnessAddress);
        if (code === "0x" || code === "0x0") {
            showToast("Cannot deposit: Harness contract is not deployed yet. Run deploy from CLI first.", "error");
            return;
        }

        showToast(`Requesting deposit of ${amountStr} RITUAL...`, "info");
        
        // lockBlocks defaults to 100000 in .env
        const tx = await wallet.depositFor(predictedHarnessAddress, 100000, {
            value: amountWei
        });
        
        showToast("Transaction submitted! Waiting for confirmation...", "info");
        appendTerminalLog("TRANSACTION", `Submitted depositFor tx: ${tx.hash.substring(0, 16)}...`, "blockchain");
        
        await tx.wait();
        showToast("Deposit transaction confirmed!", "success");
        appendTerminalLog("TRANSACTION", `Deposit confirmed. Wallet topped up by ${amountStr} RITUAL.`, "success");
        
        // Refresh balance
        queryAgentStatus();

    } catch (err) {
        console.error(err);
        showToast("Transaction failed: " + err.message, "error");
    }
});

// Terminal Enclave Log Simulation
// Matches the user's specific prompt configurations from their .env file
const SIMULATED_PROMPTS = [
    "Checking price thresholds: BTC (-1.2% in last hr), ETH (+0.4% in last hr). No alerts triggered.",
    "Checking price thresholds: BTC (+0.8% in last hr), ETH (-0.2% in last hr). No alerts triggered.",
    "Checking liquidation events: Scanned lending protocols (Aave, Compound). No large liquidations.",
    "Checking liquidation events: Scanned lending protocols. Liquidation detected: 140 ETH on Aave. Below warning threshold."
];

const ALERT_SIMULATIONS = [
    {
        type: "PRICE",
        log: "Alert Triggered! ETH has dropped by 5.4% within an hour (Current: $3,271.20).",
        telegram: "Sending Telegram alert via Bot 8903424188 to Chat 1085633281..."
    },
    {
        type: "PRICE",
        log: "Alert Triggered! BTC has jumped by 6.1% within an hour (Current: $102,400.00).",
        telegram: "Sending Telegram alert via Bot 8903424188 to Chat 1085633281..."
    },
    {
        type: "LIQUIDATION",
        log: "Alert Triggered! Large liquidation event: 1,200,000 USDC on Aave.",
        telegram: "Sending Telegram alert via Bot 8903424188 to Chat 1085633281..."
    }
];

function appendTerminalLog(tag, content, type = "normal") {
    const timestamp = new Date().toLocaleTimeString();
    const line = document.createElement("div");
    line.className = "terminal-line";
    
    let tagSpan = "";
    if (tag) {
        tagSpan = `<span class="log-tag-${type}">[${tag}]</span> `;
    }
    
    line.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> ${tagSpan}${content}`;
    terminalLogs.appendChild(line);
    
    // Auto scroll to bottom
    terminalLogs.scrollTop = terminalLogs.scrollHeight;
    
    // Limit lines to 50
    while (terminalLogs.childElementCount > 50) {
        terminalLogs.removeChild(terminalLogs.firstChild);
    }
}

// Simulated Loop
function runEnclaveLoop() {
    // Initial logs on startup
    appendTerminalLog("SYSTEM", "Secure Enclave (TEE) successfully initialized.", "system");
    appendTerminalLog("SYSTEM", "Connected to Ritual Gateway. Model: GLM-4.7-FP8", "system");
    appendTerminalLog("SYSTEM", "Listening to scheduled wakes (Frequency: 2000 blocks).", "system");

    setInterval(() => {
        if (!userAddress || !predictedHarnessAddress) return;
        
        // Randomly select check cycle or alert event (15% chance of alert)
        const isAlert = Math.random() < 0.15;
        
        appendTerminalLog("AGENT", "Agent wake cycle triggered.", "agent");
        appendTerminalLog("BLOCKCHAIN", `Querying oracle state for predicted harness ${predictedHarnessAddress.substring(0, 10)}...`, "blockchain");
        
        setTimeout(() => {
            if (isAlert) {
                const alert = ALERT_SIMULATIONS[Math.floor(Math.random() * ALERT_SIMULATIONS.length)];
                appendTerminalLog("AGENT", alert.log, "alert");
                
                setTimeout(() => {
                    appendTerminalLog("SYSTEM", alert.telegram, "system");
                    setTimeout(() => {
                        appendTerminalLog("SYSTEM", "Telegram API response: 200 OK. Broadcast successful.", "success");
                        appendTerminalLog("AGENT", "Cycle complete. Deducting 0.65 RITUAL run fee. Sleeping...", "agent");
                    }, 1200);
                }, 1000);
            } else {
                const prompt = SIMULATED_PROMPTS[Math.floor(Math.random() * SIMULATED_PROMPTS.length)];
                appendTerminalLog("AGENT", prompt, "normal");
                setTimeout(() => {
                    appendTerminalLog("AGENT", "Cycle complete. Deducting 0.58 RITUAL run fee. Sleeping...", "agent");
                }, 1000);
            }
        }, 1500);
        
    }, 12000); // Trigger a cycle log every 12 seconds
}

// Start Enclave logs simulation immediately
runEnclaveLoop();

// Listen for network switch/disconnection events
if (typeof window.ethereum !== "undefined") {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            // Disconnected
            userAddress = null;
            signer = null;
            unconnectedContainer.style.display = "block";
            connectedContainer.style.display = "none";
            walletBtnText.textContent = "Connect Wallet";
            connectWalletBtn.classList.remove("btn-primary");
            connectWalletBtn.classList.add("btn-secondary");
            statusDot.classList.remove("active");
            statusText.textContent = "Wallet Disconnected";
            if (pollerInterval) clearInterval(pollerInterval);
            isPollerRunning = false;
        } else {
            initWeb3(false);
        }
    });

    window.ethereum.on('chainChanged', () => {
        initWeb3(false);
    });
}
