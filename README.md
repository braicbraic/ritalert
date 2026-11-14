RitAlert
A Telegram bot that watches wallet addresses and smart contracts across several EVM chains and messages you the moment something happens.
Status: in development. The bot is not deployed right now, so you need to run it yourself using the setup steps below.
What it does
Monitors wallet addresses and smart contracts you choose to track
Covers Ethereum, BNB Smart Chain, Base, Arbitrum, Optimism and Ritual
Sends alerts to Telegram in near real time, using WebSocket (WSS) subscriptions instead of polling
Lets you manage your watchlist from chat with inline keyboard menus (for example /list)
Stores watchlists and bot state in Supabase
How it works
File
Role
telegram-bot.js
Bot entry point: commands, menus and button callbacks
telegram-notifier.js
Formats and sends alert messages
rpc-poller.js
Connects to the chains and listens for new activity
tx-filter.js
Decides which transactions are worth an alert
bot-state.js
Keeps track of what each user is watching
bot-logger.js
Logging
db.js, supabase-schema.sql
Database access and table definitions
Setup
You need:
Node.js 18 or newer
A Telegram bot token from @BotFather
RPC and WebSocket endpoints for the chains you want (for example from Infura)
A free Supabase project
git clone https://github.com/braicbraic/ritalert.git
cd ritalert
npm install
cp .env.example .env
Open .env and fill in your values. Every variable is listed in .env.example.
Create the database tables by running supabase-schema.sql in the Supabase SQL editor, then start the bot:
node telegram-bot.js
Security
Secrets such as the bot token and API keys live in .env only. .env is in .gitignore, so it is never committed.
If you ever expose a token, revoke it in @BotFather and generate a new one.
Roadmap
Fix inline keyboard callbacks after the /list redesign
Add more chains
Free 24/7 hosting on Render with an uptime monitor
License
Released under the MIT License.
