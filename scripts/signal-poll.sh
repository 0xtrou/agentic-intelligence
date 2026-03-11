#!/bin/sh
# signal-poll.sh — Poll backend every 5 mins, post status to Discord
# Usage: nohup sh /root/.openclaw/workspace/signal-poll.sh > /tmp/signal-poll.log 2>&1 &

WEBHOOK_URL=$(grep DISCORD_WEBHOOK_URL /root/.openclaw/workspace/agentic-intelligence/.env | cut -d= -f2-)
INTERVAL=300

while true; do
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  # Get BTC price from Bybit
  BTC_DATA=$(curl -s "https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT" 2>/dev/null)
  
  # Poll backend sensors
  HEALTH=$(curl -s http://localhost:3000/signals/health 2>/dev/null)
  SIGNALS=$(curl -s "http://localhost:3000/signals?symbol=BTCUSDT&timeframe=4h" 2>/dev/null)
  
  # Build the full embed with directional bias
  PAYLOAD=$(python3 -c "
import json, sys

try:
    btc = json.loads('''$BTC_DATA''')
    price = float(btc['result']['list'][0]['lastPrice'])
    change = float(btc['result']['list'][0]['price24hPcnt']) * 100
except:
    price = 0
    change = 0

try:
    health = json.loads('''$HEALTH''')
except:
    health = {}

try:
    sig_data = json.loads('''$SIGNALS''')
    votes = sig_data.get('sensorVotes', [])
    signals = sig_data.get('signals', [])
except:
    votes = []
    signals = []

# Calculate directional bias from all sensors
long_score = 0
short_score = 0
total_weight = 0

for v in votes:
    sid = v.get('sensorId', '')
    data = v.get('data', {})
    fired = v.get('fire', False)
    
    if 'ema_fast' in data:
        fast = data['ema_fast']
        slow = data['ema_slow']
        if fast > 0 and slow > 0:
            spread_pct = (fast - slow) / slow * 100
            # Only count if spread > 0.2% (dead zone)
            if abs(spread_pct) > 0.2:
                strength = min((abs(spread_pct) - 0.2) / 1.0, 1.0)
                if spread_pct > 0:
                    long_score += 0.4 * strength
                else:
                    short_score += 0.4 * strength
            if fired:
                bonus = 0.4
                if v.get('direction') == 'LONG': long_score += bonus
                else: short_score += bonus
            total_weight += 0.4
    
    elif 'rsi' in data:
        rsi = data['rsi']
        # Dead zone 45-55 = neutral
        if rsi > 55:
            strength = min((rsi - 55) / 20, 1.0)  # full at 75
            if rsi > 70:
                short_score += 0.35 * strength  # overbought = contrarian short
            else:
                long_score += 0.35 * strength * 0.5  # mild bullish
        elif rsi < 45:
            strength = min((45 - rsi) / 20, 1.0)  # full at 25
            if rsi < 30:
                long_score += 0.35 * strength  # oversold = contrarian long
            else:
                short_score += 0.35 * strength * 0.5  # mild bearish
        # 45-55 = no contribution
        total_weight += 0.35
        if fired:
            bonus = 0.4
            if v.get('direction') == 'LONG': long_score += bonus
            else: short_score += bonus
    
    elif 'funding_rate' in data:
        rate = data.get('funding_rate', 0)
        # Dead zone: abs(rate) < 0.0001 = neutral
        if abs(rate) > 0.0001:
            strength = min((abs(rate) - 0.0001) / 0.0004, 1.0)
            if rate > 0:
                short_score += 0.25 * strength
            else:
                long_score += 0.25 * strength
        total_weight += 0.25

# Score = net directional strength as % of max possible weight (1.0)
# Positive = long, negative = short
net_score = long_score - short_score
max_possible = total_weight if total_weight > 0 else 1.0
# Map to 50 +/- range: net_score/max_possible gives -1 to +1, map to 0-100
bias_raw = (net_score / max_possible) * 50  # -50 to +50
long_pct = 50 + bias_raw
short_pct = 100 - long_pct
long_pct = max(0, min(100, long_pct))
short_pct = max(0, min(100, short_pct))

# Determine bias
confidence = abs(long_pct - 50) * 2  # 0-100 scale
if long_pct > short_pct:
    direction = 'LONG'
    dir_emoji = '🟢'
    bias_pct = long_pct
else:
    direction = 'SHORT'
    dir_emoji = '🔴'
    bias_pct = short_pct

if confidence < 15:
    conviction = 'Neutral'
    dir_emoji = '⚪'
elif confidence < 40:
    conviction = 'Lean'
elif confidence < 65:
    conviction = 'Moderate'
else:
    conviction = 'Strong'

# Build sensor lines
sensor_lines = []
for v in votes:
    data = v.get('data', {})
    fired = '🔴 FIRED' if v.get('fire') else '⚪'
    if 'ema_fast' in data:
        spread = (data['ema_fast'] - data['ema_slow'])
        arrow = '↑' if spread > 0 else '↓'
        sensor_lines.append(f'EMA 9/21: {fired} fast={data[\"ema_fast\"]:.0f} slow={data[\"ema_slow\"]:.0f} ({arrow}{abs(spread):.0f})')
    elif 'rsi' in data:
        rsi = data['rsi']
        zone = '🔥OB' if rsi > 70 else ('❄️OS' if rsi < 30 else '➖')
        sensor_lines.append(f'RSI(14): {fired} {rsi:.1f} {zone}')
    elif 'funding_rate' in data:
        rate = data.get('funding_rate', 0)
        sensor_lines.append(f'Funding: {fired} {rate:.6f}')

sensor_text = chr(10).join(sensor_lines) if sensor_lines else 'No sensor data'

# Color
has_signal = len(signals) > 0
if has_signal:
    color = 3066993  # green
    title = '🔔 Signal Alert'
elif confidence >= 40:
    color = 15844367 if direction == 'SHORT' else 3066993  # red or green
    title = f'{dir_emoji} {conviction} {direction}'
else:
    color = 9807270  # grey
    title = f'📡 Market Pulse — {dir_emoji} {conviction}'

# Bias bar
bar_len = 20
long_bars = round(long_pct / 100 * bar_len)
short_bars = bar_len - long_bars
bias_bar = '🟢' * long_bars + '🔴' * short_bars

change_str = f'{change:+.2f}%'
positions = health.get('openPositions', 0)
balance = health.get('paperTradingBalance', 50)

embed = {
    'title': title,
    'color': color,
    'fields': [
        {'name': '💰 BTC/USDT', 'value': f'\${price:,.2f} ({change_str} 24h)', 'inline': True},
        {'name': f'{dir_emoji} Bias', 'value': f'**{direction}** {bias_pct:.0f}% ({conviction})', 'inline': True},
        {'name': '📊 Paper', 'value': f'{positions} open | \${balance} bal', 'inline': True},
        {'name': '🧠 Sensors', 'value': sensor_text, 'inline': False},
        {'name': '⚖️ Long / Short', 'value': f'{bias_bar}\n{long_pct:.0f}% L / {short_pct:.0f}% S', 'inline': False},
    ],
    'footer': {'text': 'Agentic Intelligence — 5min poll'},
    'timestamp': '$TIMESTAMP'
}

print(json.dumps({'embeds': [embed]}))
" 2>/dev/null)

  if [ -z "$PAYLOAD" ]; then
    echo "[$TIMESTAMP] ERROR: Failed to build payload"
    sleep $INTERVAL
    continue
  fi

  RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")
  
  echo "[$TIMESTAMP] BTC=$(echo "$BTC_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['list'][0]['lastPrice'])" 2>/dev/null) | Webhook=$RESULT"
  
  sleep $INTERVAL
done
