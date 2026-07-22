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
