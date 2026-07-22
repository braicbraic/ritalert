# RitAlert Project Architecture & Security Guidelines

## 1. Web3 Wallet Connection Rules (Reown AppKit / WalletConnect)
* **Library**: `@reown/appkit` (formerly WalletConnect AppKit / Web3Modal) with `@reown/appkit-adapter-ethers`.
* **Cloud Project ID**: `8422e6900f40d4653634e7a2b979401d` configured for domain `ritalert.netlify.app`.
* **Multi-Wallet Support**: QR code scanning across 300+ mobile wallets (Trust Wallet, Rainbow, Metamask Mobile, Zerion, etc.), injected browser extensions (MetaMask, Rabby, Coinbase Wallet), and social/email logins.
* **LocalStorage Keys**: Store `ritalert_connected_wallet` and `ritalert_wallet_signature` upon successful wallet authentication.
* **Auto-Reconnect**: On `DOMContentLoaded`, invoke `checkAutoConnectWallet()` using `state.provider.send('eth_accounts', [])` or Reown session provider. If the connected account matches the saved address, restore session state and load DB tracking items immediately without prompting the user to re-sign.

## 2. Twitter (X) OAuth 2.0 PKCE Integration Rules
* **Authorization Endpoint**: Always request `https://twitter.com/i/oauth2/authorize` (do NOT use `x.com/i/oauth2/authorize` as Twitter's backend OAuth router rejects direct x.com domain requests).
* **Challenge Method**: Must be uppercase `code_challenge_method=S256`.
* **Scopes**: For user read authentication, pass `scope=users.read%20tweet.read`. Do NOT include `offline.access` if the app permission is set to Read-only in X Developer Portal.
* **Callback URIs**: Register BOTH frontend and backend deployment URLs in X Developer Console under **Callback URI / Redirect URL**:
  1. `https://ritalert.netlify.app/api/auth/twitter/callback`
  2. `https://ritalert.onrender.com/api/auth/twitter/callback`
* **App Settings**: Ensure **Type of App** is set to `Web App, Automated App or Bot (Confidential client)` and click **Save Changes** at the bottom of the portal page.

## 3. Telegram OAuth Widget Authentication Rules
* **Bot Username & Token**: Reuses core alert bot `@ritalert_bot` (`8903424188`).
* **Domain Authorization**: Set `/setdomain` in `@BotFather` to `ritalert.netlify.app`.
* **Widget Invocation**: Call `Telegram.Login.auth({ bot_id: '8903424188', request_access: 'write' }, window.onTelegramAuth)`.
* **HMAC Signature Verification**: Backend route `/api/auth/telegram/callback` MUST verify the cryptographic HMAC-SHA256 signature using `TELEGRAM_BOT_TOKEN` as key before saving handle `@username` to Supabase DB.

## 4. Discord OAuth 2.0 Direct Authentication Rules
* **App Credentials**: Application ID `1529416793695981638` (`ritalerts`).
* **Endpoints**: `/api/auth/discord/login` redirects to `https://discord.com/oauth2/authorize?client_id=...&response_type=code&redirect_uri=...&scope=identify`.
* **Callback Route**: `/api/auth/discord/callback` exchanges code for access token via `POST https://discord.com/api/oauth2/token` and fetches user profile via `GET https://discord.com/api/users/@me`.
* **Environment Variables**: `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` configured on Render environment.

