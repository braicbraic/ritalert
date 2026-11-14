# Reown AppKit (WalletConnect) Integration Documentation — RitAlert

This document details the battle-tested **Reown AppKit (formerly WalletConnect / Web3Modal)** integration for RitAlert's Vanilla JavaScript Web3 application architecture.

---

## 1. Overview & Cloud Configuration

* **SDK Version**: `@reown/appkit` (`^1.8.23`) with `@reown/appkit-adapter-ethers` (`^1.8.23`) & `ethers` v6.
* **Reown Cloud Project ID**: `8422e6900f40d4653634e7a2b979401d`
* **Supported Wallets**:
  * 📱 **Mobile QR Code Scanning**: Trust Wallet, Rainbow, MetaMask Mobile, Zerion, Ledger (300+ mobile wallets via WalletConnect v2 protocol).
  * 🌐 **Desktop Extension Providers**: MetaMask, Rabby, Coinbase Wallet, OKX Wallet, SubWallet, Keplr, etc. (EIP-6963 & Injected EIP-1193).
* **Target Domain**: `ritalert.netlify.app` / `localhost:8000`

---

## 2. Bundling & Script Loading Architecture

To prevent browser extension interception (e.g. Rabby notification popups) and race conditions from asynchronous CDN loading, Reown AppKit is pre-bundled into a standalone synchronous script:

### A. Initialization Entry (`reown-init.js`)
```javascript
import { createAppKit } from '@reown/appkit';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { mainnet, arbitrum, polygon, optimism, base } from '@reown/appkit/networks';

const projectId = '8422e6900f40d4653634e7a2b979401d';

const metadata = {
    name: 'RitAlert',
    description: 'AI-Powered Sovereign Web3 Transaction Tracker & Security Alerting',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://ritalert.netlify.app',
    icons: [typeof window !== 'undefined' ? `${window.location.origin}/favicon.ico` : 'https://ritalert.netlify.app/favicon.ico']
};

try {
    const modal = createAppKit({
        adapters: [new EthersAdapter()],
        networks: [mainnet, arbitrum, polygon, optimism, base],
        metadata,
        projectId,
        enableInjected: true,
        enableEIP6963: true,
        enableCoinbase: true,
        allWallets: 'SHOW',
        features: {
            analytics: true,
            email: false,
            socials: []
        }
    });
    window.reownAppKitModal = modal;
    console.log("⚡ Reown AppKit (WalletConnect) initialized successfully via bundle!");
} catch (err) {
    console.warn("Reown AppKit bundle initialization notice:", err);
}
```

### B. Build Command
```bash
npx esbuild reown-init.js --bundle --minify --format=iife --outfile=reown-bundle.js
```

### C. HTML Load Order (`app.html`)
`reown-bundle.js` is loaded **synchronously before `app-main.js`** so `window.reownAppKitModal` is ready immediately on page load:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.umd.min.js"></script>
<script src="reown-bundle.js"></script>
<script src="app-main.js"></script>
```

---

## 3. Reactive Unified Wallet State Machine (`app-main.js`)

To prevent duplicate 3–5 signature popups when multiple wallet events fire simultaneously, `handleAccountConnected()` uses an **asynchronous concurrency lock (`isAuthenticatingSession` mutex)**:

```javascript
let isAuthenticatingSession = false;

async function handleAccountConnected(rawAddress, customProvider) {
    if (!rawAddress) return;
    const address = rawAddress.toLowerCase();

    // Concurrency Guard & Duplicate Prevention
    if ((state.walletAddress && state.walletAddress.toLowerCase() === address && DOM.walletBtn.getAttribute('data-full-address')) || isAuthenticatingSession) {
        return;
    }

    isAuthenticatingSession = true;

    try {
        const rawProv = customProvider || (typeof window.ethereum !== 'undefined' ? window.ethereum : null);
        if (rawProv) {
            state.provider = new ethers.BrowserProvider(rawProv);
            state.signer = await state.provider.getSigner();
        }

        state.walletAddress = rawAddress;

        // Session Signature Verification (1 prompt max)
        let savedSig = localStorage.getItem('ritalert_wallet_signature');
        let savedWallet = localStorage.getItem('ritalert_connected_wallet');

        if (!savedSig || !savedWallet || savedWallet.toLowerCase() !== address) {
            if (state.signer) {
                addSystemMessage("Please sign the session authentication request in your wallet...");
                state.walletSignature = await state.signer.signMessage("Authenticate RitAlert Session");
                localStorage.setItem('ritalert_wallet_signature', state.walletSignature);
            }
        } else {
            state.walletSignature = savedSig;
        }

        localStorage.setItem('ritalert_connected_wallet', rawAddress);

        // Update DOM attributes (Triggers paywall unlock watcher in app.html)
        DOM.walletBtn.classList.add('connected');
        DOM.walletBtn.setAttribute('data-full-address', rawAddress);
        DOM.walletBtn.setAttribute('data-signature', state.walletSignature || '');
        DOM.walletBtnText.innerHTML = `<span class="wallet-dot"></span> ${abbreviate(rawAddress)}`;
        DOM.statusWallet.textContent = `Wallet: ${abbreviate(rawAddress)}`;

        addSystemMessage(`Wallet connected & authenticated: ${abbreviate(rawAddress)}`);

        pollBlockNumber();
        loadDBTrackedHistory(rawAddress);
        if (window.loadDBSocials) window.loadDBSocials(rawAddress);
    } catch (err) {
        console.error("Failed to authenticate connected wallet:", err);
        addAIMessage(`Wallet authentication failed: ${err.message}`);
    } finally {
        isAuthenticatingSession = false;
    }
}
```

---

## 4. Subscriptions & Event Listeners

### A. Reown Account State Subscription
```javascript
function initReownAppKitSubscriber() {
    if (!window.reownAppKitModal) return;
    try {
        if (window.reownAppKitModal.subscribeAccount) {
            window.reownAppKitModal.subscribeAccount((account) => {
                if (account && account.isConnected && account.address) {
                    const prov = window.reownAppKitModal.getWalletProvider ? window.reownAppKitModal.getWalletProvider() : null;
                    handleAccountConnected(account.address, prov);
                } else if (account && !account.isConnected && state.walletAddress) {
                    handleAccountDisconnected();
                }
            });
        }
    } catch (e) {
        console.warn("Reown subscriber notice:", e);
    }
}
```

### B. Injected Wallet Listener (`window.ethereum`)
```javascript
if (typeof window.ethereum !== 'undefined') {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            handleAccountDisconnected();
        } else {
            handleAccountConnected(accounts[0], window.ethereum);
        }
    });
    window.ethereum.on('chainChanged', () => {
        window.location.reload();
    });
}
```

---

## 5. Paywall Integration (`app.html`)

The paywall watcher in `app.html` polls `walletBtn.getAttribute('data-full-address')`. As soon as `handleAccountConnected()` updates `data-full-address`:
1. `app.html` queries `/api/db/subscription?walletAddress=0x...`.
2. Hides `paywallOverlay` (`display: none`).
3. Unlocks the AI tracking chat & dashboard.

---

## 6. Maintenance & Re-building Guidelines

If dependencies in `package.json` are updated or new chains are added to `reown-init.js`:
1. Re-run:
   ```bash
   cmd /c "npx esbuild reown-init.js --bundle --minify --format=iife --outfile=reown-bundle.js"
   ```
2. Verify local dev server:
   ```bash
   node server.js
   ```
3. Test locally at `http://localhost:8000/app.html`.
