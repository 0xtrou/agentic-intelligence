#!/bin/sh
# signal-poll.sh — Poll backend every 5 mins, post highest-confidence signal to Discord
# Usage: nohup sh /root/.openclaw/workspace/signal-poll.sh > /tmp/signal-poll.log 2>&1 &

WEBHOOK_URL=$(grep DISCORD_WEBHOOK_URL /root/.openclaw/workspace/agentic-intelligence/.env | cut -d= -f2-)
INTERVAL=300

while true; do
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  BTC_DATA=$(curl -s "https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT" 2>/dev/null)
  HEALTH=$(curl -s http://localhost:3000/signals/health 2>/dev/null)
  SIGNALS=$(curl -s "http://localhost:3000/signals?symbol=BTCUSDT&timeframe=4h" 2>/dev/null)
  
  export BTC_JSON="$BTC_DATA"
  export HEALTH_JSON="$HEALTH"
  export SIGNALS_JSON="$SIGNALS"
  export TS="$TIMESTAMP"
  
  PAYLOAD=$(python3 << 'PYEOF'
import json, sys, os

btc_raw = os.environ.get('BTC_JSON', '{}')
health_raw = os.environ.get('HEALTH_JSON', '{}')
sig_raw = os.environ.get('SIGNALS_JSON', '{}')
ts = os.environ.get('TS', '')

try:
    btc = json.loads(btc_raw)
    ticker = btc['result']['list'][0]
    price = float(ticker['lastPrice'])
    high24 = float(ticker['highPrice24h'])
    low24 = float(ticker['lowPrice24h'])
    change = float(ticker['price24hPcnt']) * 100
except:
    price, high24, low24, change = 0, 0, 0, 0

try:
    health = json.loads(health_raw)
except:
    health = {}

try:
    sig_data = json.loads(sig_raw)
    votes = sig_data.get('sensorVotes', [])
    signals = sig_data.get('signals', [])
    version = sig_data.get('version', '?')
except:
    votes, signals, version = [], [], '?'

# Calculate directional bias
long_score = 0
short_score = 0
total_weight = 0
sensor_lines = []

for v in votes:
    data = v.get('data', {})
    fired = v.get('fire', False)
    
    if 'ema_fast' in data:
        fast, slow = data['ema_fast'], data['ema_slow']
        if fast > 0 and slow > 0:
            spread_pct = (fast - slow) / slow * 100
            if abs(spread_pct) > 0.2:
                strength = min((abs(spread_pct) - 0.2) / 1.0, 1.0)
                if spread_pct > 0: long_score += 0.4 * strength
                else: short_score += 0.4 * strength
            if fired:
                if v.get('direction') == 'LONG': long_score += 0.4
                else: short_score += 0.4
            total_weight += 0.4
            spread = fast - slow
            arrow = '↑' if spread > 0 else '↓'
            status = '🔴 FIRED' if fired else '⚪'
            sensor_lines.append(f'EMA 9/21: {status} ({arrow}{abs(spread):.0f})')
    
    elif 'rsi' in data:
        rsi = data['rsi']
        if rsi > 55:
            s = min((rsi - 55) / 20, 1.0)
            if rsi > 70: short_score += 0.35 * s
            else: long_score += 0.35 * s * 0.5
        elif rsi < 45:
            s = min((45 - rsi) / 20, 1.0)
            if rsi < 30: long_score += 0.35 * s
            else: short_score += 0.35 * s * 0.5
        total_weight += 0.35
        if fired:
            if v.get('direction') == 'LONG': long_score += 0.4
            else: short_score += 0.4
        zone = '🔥OB' if rsi > 70 else ('❄OS' if rsi < 30 else '')
        status = '🔴 FIRED' if fired else '⚪'
        sensor_lines.append(f'RSI(14): {status} {rsi:.1f} {zone}')
    
    elif 'funding_rate' in data:
        rate = data.get('funding_rate', 0)
        if abs(rate) > 0.0001:
            s = min((abs(rate) - 0.0001) / 0.0004, 1.0)
            if rate > 0: short_score += 0.25 * s
            else: long_score += 0.25 * s
        total_weight += 0.25
        status = '🔴 FIRED' if fired else '⚪'
        sensor_lines.append(f'Funding: {status} {rate:.6f}')

# Net bias
net = long_score - short_score
mx = total_weight if total_weight > 0 else 1.0
bias_raw = (net / mx) * 50
long_pct = max(0, min(100, 50 + bias_raw))
short_pct = 100 - long_pct
confidence = abs(long_pct - 50) * 2

if long_pct >= short_pct:
    direction = 'LONG'
    dir_emoji = '🟢'
    bias_pct = long_pct
else:
    direction = 'SHORT'
    dir_emoji = '🔴'
    bias_pct = short_pct

if confidence < 15: conviction = 'Neutral'; dir_emoji = '⚪'
elif confidence < 40: conviction = 'Lean'
elif confidence < 65: conviction = 'Moderate'
else: conviction = 'Strong'

# Calculate trade levels based on direction and ATR-like range
range24 = high24 - low24 if high24 > low24 else price * 0.02
atr_est = range24  # use 24h range as ATR proxy

if direction == 'LONG':
    entry = price
    sl = price - atr_est * 0.5
    tp1 = price + atr_est * 0.5
    tp2 = price + atr_est * 1.0
    tp3 = price + atr_est * 1.5
    rr1 = 1.0
    rr2 = 2.0
    rr3 = 3.0
else:
    entry = price
    sl = price + atr_est * 0.5
    tp1 = price - atr_est * 0.5
    tp2 = price - atr_est * 1.0
    tp3 = price - atr_est * 1.5
    rr1 = 1.0
    rr2 = 2.0
    rr3 = 3.0

# Build fields
change_str = f'{change:+.2f}%'
positions = health.get('openPositions', 0)
balance = health.get('paperTradingBalance', 50)
sensor_text = '\n'.join(sensor_lines) if sensor_lines else 'No data'

# Bias bar
bl = round(long_pct / 100 * 20)
bias_bar = '🟢' * bl + '🔴' * (20 - bl)

# Trade levels text
if direction == 'LONG':
    levels = (
        f'```\n'
        f'Entry:  ${entry:,.2f}\n'
        f'SL:     ${sl:,.2f} (-{abs(entry-sl)/entry*100:.2f}%)\n'
        f'TP1:    ${tp1:,.2f} (+{abs(tp1-entry)/entry*100:.2f}%) R:R 1:{rr1:.0f}\n'
        f'TP2:    ${tp2:,.2f} (+{abs(tp2-entry)/entry*100:.2f}%) R:R 1:{rr2:.0f}\n'
        f'TP3:    ${tp3:,.2f} (+{abs(tp3-entry)/entry*100:.2f}%) R:R 1:{rr3:.0f}\n'
        f'```'
    )
else:
    levels = (
        f'```\n'
        f'Entry:  ${entry:,.2f}\n'
        f'SL:     ${sl:,.2f} (-{abs(sl-entry)/entry*100:.2f}%)\n'
        f'TP1:    ${tp1:,.2f} (+{abs(entry-tp1)/entry*100:.2f}%) R:R 1:{rr1:.0f}\n'
        f'TP2:    ${tp2:,.2f} (+{abs(entry-tp2)/entry*100:.2f}%) R:R 1:{rr2:.0f}\n'
        f'TP3:    ${tp3:,.2f} (+{abs(entry-tp3)/entry*100:.2f}%) R:R 1:{rr3:.0f}\n'
        f'```'
    )

# Color and title
has_signal = len(signals) > 0
if has_signal or confidence >= 40:
    color = 15158332 if direction == 'SHORT' else 3066993
    title = f'{dir_emoji} {direction} — {conviction} ({bias_pct:.0f}%)'
else:
    color = 9807270
    title = f'📡 Market Pulse — {dir_emoji} {conviction}'

fields = [
    {'name': f'💰 BTC/USDT', 'value': f'**${price:,.2f}** ({change_str} 24h)\nH: ${high24:,.2f} | L: ${low24:,.2f}', 'inline': False},
    {'name': f'{dir_emoji} Highest Confidence: **{direction}**', 'value': f'{bias_bar}\n{long_pct:.0f}% L / {short_pct:.0f}% S — **{conviction}**', 'inline': False},
    {'name': '📐 Trade Levels', 'value': levels, 'inline': False},
    {'name': '🧠 Sensors', 'value': sensor_text, 'inline': True},
    {'name': '📊 Paper', 'value': f'{positions} open | ${balance} bal', 'inline': True},
]

embed = {
    'title': title,
    'color': color,
    'fields': fields,
    'footer': {'text': f'Agentic Intelligence {version} — 4h — 5min poll'},
    'timestamp': ts,
}

print(json.dumps({'embeds': [embed]}))
PYEOF
)

  if [ -z "$PAYLOAD" ]; then
    echo "[$TIMESTAMP] ERROR: Failed to build payload"
    sleep $INTERVAL
    continue
  fi

  RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")
  
  echo "[$TIMESTAMP] Webhook=$RESULT"
  
  sleep $INTERVAL
done
