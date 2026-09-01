import React from 'react';
import ReactDOM from 'react-dom/client';
import { createConfig, http, WagmiProvider, useAccount } from 'wagmi';
import { mainnet, arbitrum, polygon, optimism, base } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, getDefaultWallets, useConnectModal, useAccountModal, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

const { connectors } = getDefaultWallets({
  appName: 'RitAlert',
  projectId: '8422e6900f40d4653634e7a2b979401d',
});

const config = createConfig({
  chains: [mainnet, arbitrum, polygon, optimism, base],
  connectors,
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [polygon.id]: http(),
    [optimism.id]: http(),
    [base.id]: http(),
  },
});

const queryClient = new QueryClient();

function RainbowKitBridge() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();

  React.useEffect(() => {
    window.openRainbowKitModal = openConnectModal;
    window.openRainbowKitAccountModal = openAccountModal;
  }, [openConnectModal, openAccountModal]);

  React.useEffect(() => {
    if (isConnected && address) {
      if (window.handleAccountConnected) {
        window.handleAccountConnected(address);
      }
    } else if (!isConnected) {
      if (window.handleAccountDisconnected) {
        window.handleAccountDisconnected();
      }
    }
  }, [isConnected, address]);

  return null;
}

function initRitAlertRainbowKit() {
  let rootContainer = document.getElementById('rainbowkit-app-root');
  if (!rootContainer) {
    rootContainer = document.createElement('div');
    rootContainer.id = 'rainbowkit-app-root';
    document.body.appendChild(rootContainer);
  }

  ReactDOM.createRoot(rootContainer).render(
    <React.StrictMode>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider theme={darkTheme()}>
            <RainbowKitBridge />
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </React.StrictMode>
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRitAlertRainbowKit);
} else {
  initRitAlertRainbowKit();
}
