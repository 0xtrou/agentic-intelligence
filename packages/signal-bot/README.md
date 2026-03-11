# Signal Bot

Discord bot for on-demand signal queries. Pure code, no AI tokens.

## Usage

In any Discord channel where the bot is present:

```
!signal TAO
!signal BTC
!signal ETHUSDT
```

Bot will query the backend `/signals` endpoint and return formatted signal data with entry/SL/TP levels.

## Setup

### 1. Create Discord Bot

1. Go to https://discord.com/developers/applications
2. Create a new application (or use existing)
3. Go to "Bot" section
4. Enable "Message Content Intent" (required to read `!signal` commands)
5. Copy the bot token

### 2. Invite Bot to Server

Use this URL (replace `YOUR_CLIENT_ID`):

```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2048&scope=bot
```

Required permissions:
- Send Messages
- Embed Links

### 3. Environment Variables

Create a `.env` file:

```bash
DISCORD_BOT_TOKEN=your_bot_token_here
BACKEND_URL=http://localhost:3000
```

### 4. Install Dependencies

```bash
cd packages/signal-bot
pnpm install
```

### 5. Run

**Development:**
```bash
pnpm dev
```

**Production:**
```bash
pnpm build
pnpm start
```

**Docker/PM2:**
```bash
# Run with env vars
DISCORD_BOT_TOKEN=xxx BACKEND_URL=http://localhost:3000 node dist/index.js
```

## Architecture

- **Lightweight:** No AI, no OpenClaw, just Discord.js + fetch
- **Stateless:** No database, no state, just query backend on demand
- **Independent:** Runs as separate process from backend
- **Fast:** Direct backend query, no middleware

## Signal Format

Returns embed with:
- Entry price
- Stop-loss (based on ATR)
- TP1/TP2/TP3 (1:1, 1:2, 1:3 R:R)
- Confidence bias (Long/Short %)
- Sensor votes
- Regime
- Timestamp + version footer

## Deployment Notes

- Run as separate service (PM2, systemd, Docker)
- Shares no state with backend
- Can scale horizontally (multiple instances with same token)
- Bot token is separate from webhook token
- Minimal resource usage (~50MB RAM)
