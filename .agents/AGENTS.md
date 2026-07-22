# RitAlert Project Architecture & Security Guidelines

## 1. Twitter (X) OAuth 2.0 PKCE Integration Rules
* **Authorization Endpoint**: Always request `https://twitter.com/i/oauth2/authorize` (do NOT use `x.com/i/oauth2/authorize` as Twitter's backend OAuth router rejects direct x.com domain requests).
* **Challenge Method**: Must be uppercase `code_challenge_method=S256`.
* **Scopes**: For user read authentication, pass `scope=users.read%20tweet.read`. Do NOT include `offline.access` if the app permission is set to Read-only in X Developer Portal.
* **Callback URIs**: Register BOTH frontend and backend deployment URLs in X Developer Console under **Callback URI / Redirect URL**:
  1. `https://ritalert.netlify.app/api/auth/twitter/callback`
  2. `https://ritalert.onrender.com/api/auth/twitter/callback`
* **App Settings**: Ensure **Type of App** is set to `Web App, Automated App or Bot (Confidential client)` and click **Save Changes** at the bottom of the portal page.

## 2. Web3 Session & Wallet Connection Persistence
* **LocalStorage Keys**: Store `ritalert_connected_wallet` and `ritalert_wallet_signature` upon successful wallet authentication.
* **Auto-Reconnect**: On DOMContentLoaded, invoke `checkAutoConnectWallet()` using `window.ethereum.request({ method: 'eth_accounts' })`. If the connected account matches the saved address, restore session state and load DB tracking items immediately without prompting the user to re-sign.
