/**
 * @module signal-bot
 * @description Discord bot for on-demand signal queries
 * 
 * Usage: !signal <SYMBOL>
 * Example: !signal TAO
 * 
 * Queries the backend /signals endpoint and returns formatted signal data.
 * No AI, pure code.
 */

import { Client, GatewayIntentBits, EmbedBuilder, Message } from 'discord.js';

const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const COMMAND_PREFIX = '!signal';

if (!DISCORD_TOKEN) {
  console.error('❌ DISCORD_BOT_TOKEN environment variable is required');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

interface SignalResponse {
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT' | null;
  confidence: number;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  regime: string;
  sensors: Array<{
    id: string;
    vote: 'LONG' | 'SHORT' | 'NEUTRAL';
    confidence: number;
    fired: boolean;
    data?: any;
  }>;
  timestamp: string;
  version?: string;
}

async function querySignal(symbol: string, timeframe: string = '4h'): Promise<SignalResponse | null> {
  try {
    const url = `${BACKEND_URL}/signals/query?symbol=${symbol}&timeframe=${timeframe}`;
    console.log(`[Signal Bot] Querying ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`[Signal Bot] Backend error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json() as SignalResponse;
    return data; // /signals/query returns the signal object directly (not wrapped in array)
  } catch (error) {
    console.error(`[Signal Bot] Query failed:`, error);
    return null;
  }
}

function formatSignalEmbed(signal: SignalResponse): EmbedBuilder {
  const { symbol, direction, confidence, entry, stopLoss, takeProfit1, takeProfit2, takeProfit3, regime, sensors } = signal;

  // R:R info shown in field labels

  // Confidence bar
  const longConf = direction === 'LONG' ? confidence : 100 - confidence;
  const shortConf = 100 - longConf;
  const biasEmoji = longConf > 60 ? '🟢' : shortConf > 60 ? '🔴' : '🟡';
  const biasLabel = longConf > 60 ? 'Lean LONG' : shortConf > 60 ? 'Lean SHORT' : 'Neutral';

  const embed = new EmbedBuilder()
    .setColor(direction === 'LONG' ? 0x00ff00 : direction === 'SHORT' ? 0xff0000 : 0xffff00)
    .setTitle(`📊 Signal: ${symbol}`)
    .setDescription(`**${biasEmoji} ${biasLabel}** — ${longConf.toFixed(0)}% Long / ${shortConf.toFixed(0)}% Short`)
    .addFields(
      { name: 'Entry', value: `$${entry.toLocaleString()}`, inline: true },
      { name: 'Stop Loss', value: `$${stopLoss.toLocaleString()} (${((stopLoss - entry) / entry * 100).toFixed(2)}%)`, inline: true },
      { name: 'Regime', value: regime || 'Unknown', inline: true },
      { name: 'TP1 (1:1)', value: `$${takeProfit1.toLocaleString()}`, inline: true },
      { name: 'TP2 (1:2)', value: `$${takeProfit2.toLocaleString()}`, inline: true },
      { name: 'TP3 (1:3)', value: `$${takeProfit3.toLocaleString()}`, inline: true }
    )
    .setTimestamp(new Date(signal.timestamp))
    .setFooter({ text: `${signal.version || 'dev'} • ${signal.timeframe} timeframe` });

  // Add sensor votes (only show fired sensors or those with meaningful data)
  if (sensors && sensors.length > 0) {
    const activeSensors = sensors.filter(s => s.fired || s.vote !== 'NEUTRAL');
    if (activeSensors.length > 0) {
      const sensorText = activeSensors
        .map(s => {
          const fireEmoji = s.fired ? '🔥' : '⚪';
          const conf = s.confidence > 0 ? ` (${(s.confidence * 100).toFixed(0)}%)` : '';
          return `${fireEmoji} ${s.id}: ${s.vote}${conf}`;
        })
        .join('\n');
      embed.addFields({ name: 'Sensor Status', value: sensorText, inline: false });
    } else {
      embed.addFields({ name: 'Sensor Status', value: 'No sensors fired — neutral market', inline: false });
    }
  }

  return embed;
}

client.on('ready', () => {
  console.log(`✅ Signal Bot logged in as ${client.user?.tag}`);
  console.log(`📡 Backend: ${BACKEND_URL}`);
  console.log(`💬 Command: ${COMMAND_PREFIX} <SYMBOL>`);
});

client.on('messageCreate', async (message: Message) => {
  // Ignore bots
  if (message.author.bot) return;

  // Check for command
  if (!message.content.startsWith(COMMAND_PREFIX)) return;

  const args = message.content.slice(COMMAND_PREFIX.length).trim().split(/\s+/);
  const symbol = args[0]?.toUpperCase();

  if (!symbol) {
    await message.reply('❌ Usage: `!signal <SYMBOL>` (e.g., `!signal TAO`)');
    return;
  }

  // Normalize symbol (add USDT if not present)
  const normalizedSymbol = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;

  try {
    if ('sendTyping' in message.channel) await message.channel.sendTyping();

    const signal = await querySignal(normalizedSymbol, '4h');

    if (!signal) {
      await message.reply(`❌ Could not fetch signal for ${normalizedSymbol}. Backend may be down or symbol not supported.`);
      return;
    }

    const embed = formatSignalEmbed(signal);
    await message.reply({ embeds: [embed] });

    console.log(`[Signal Bot] Sent signal for ${normalizedSymbol} to ${message.author.tag}`);
  } catch (error) {
    console.error(`[Signal Bot] Error handling command:`, error);
    await message.reply('❌ An error occurred while fetching the signal. Please try again.');
  }
});

client.login(DISCORD_TOKEN);
