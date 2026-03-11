# Signal Bot

Discord bot for on-demand signal queries. No AI, pure code.

## Usage

In Discord:
```
!signal TAO
!signal BTC
!signal ETHUSDT
```

Bot queries the backend `/signals` endpoint and returns formatted signal with entry/SL/TP levels.

## Setup

1. Create a Discord bot at https://discord.com/developers/applications
   - Enable "Message Content Intent" under Bot → Privileged Gateway Intents
   - Copy bot token

2. Invite bot to server:
   ```
   https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2048&scope=bot
   ```
   (Permissions: Send Messages)

3. Set environment variables:
   ```bash
   export DISCORD_BOT_TOKEN="your_bot_token_here"
   export BACKEND_URL="http://localhost:3000"  # Optional, defaults to localhost:3000
   ```

4. Install and run:
   ```bash
   pnpm install
   pnpm build
   pnpm start
   ```

   Or dev mode:
   ```bash
   pnpm dev
   ```

## Environment Variables

- `DISCORD_BOT_TOKEN` (required) — Discord bot token
- `BACKEND_URL` (optional) — Backend API URL, defaults to `http://localhost:3000`

## Command Format

```
!signal <SYMBOL>
```

- `<SYMBOL>` — Asset symbol (e.g., `TAO`, `BTC`, `ETH`)
- Automatically appends `USDT` if not present
- Queries 4h timeframe by default

## Response Format

Embed with:
- Direction bias (Long/Short/Neutral) with confidence bar
- Entry price
- Stop loss (% from entry)
- TP1/TP2/TP3 (1:1, 1:2, 1:3 R:R)
- Regime (TRENDING/RANGING/VOLATILE/QUIET)
- Sensor votes (EMA, Funding, etc.)
- Timestamp and version

## Architecture

1. Bot listens for `!signal` commands
2. Queries backend `/signals?symbol=<SYMBOL>USDT&timeframe=4h`
3. Formats response as Discord embed
4. No AI inference, no token cost — pure code

## Deployment

See `scripts/deploy.sh` for deployment workflow (same as backend).

Run alongside backend:
```bash
# Terminal 1: Backend
cd packages/api && pnpm start

# Terminal 2: Signal Bot
cd packages/signal-bot && pnpm start
```

Or use PM2:
```bash
pm2 start packages/signal-bot/dist/index.js --name signal-bot
```
