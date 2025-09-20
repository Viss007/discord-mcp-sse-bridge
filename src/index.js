import 'dotenv/config'
import { Client, GatewayIntentBits, Partials } from 'discord.js'
import EventSource from 'eventsource'
import http from 'http'

const {
  DISCORD_TOKEN,
  DISCORD_CHANNEL_ID,            // preferred if present
  DISCORD_SERVER_NAME,           // optional fallback
  DISCORD_CHANNEL_NAME,          // optional fallback
  SSE_URL,
  MCP_HTTP_URL,
  MCP_API_KEY,
  NOTIFY_ON_START,               // 'true' to send a boot message
  NOTIFY_MESSAGE                 // optional message on boot
} = process.env

if (!DISCORD_TOKEN || !SSE_URL) {
  console.error('Missing env vars: DISCORD_TOKEN, SSE_URL')
  process.exit(1)
}

// Health server so Railway can keep this running as Web if desired
const PORT = process.env.PORT || 8080
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('ok')
}).listen(PORT, () => console.log('health server listening on', PORT))

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
})

async function resolveTextChannel() {
  // 1) Try by channel ID
  if (DISCORD_CHANNEL_ID) {
    const byId = await client.channels.fetch(DISCORD_CHANNEL_ID).catch(() => null)
    if (byId?.isTextBased()) return byId
  }
  // 2) Fallback by server + channel name
  if (DISCORD_SERVER_NAME && DISCORD_CHANNEL_NAME) {
    const guilds = await client.guilds.fetch()
    const g = guilds.find(g => g.name === DISCORD_SERVER_NAME)
    if (g) {
      const guild = await g.fetch()
      const chans = await guild.channels.fetch()
      const byName = chans.find(c => c?.name === DISCORD_CHANNEL_NAME && c?.isTextBased())
      if (byName) return byName
    }
  }
  return null
}

function startSSE() {
  const es = new EventSource(SSE_URL, { headers: { Accept: 'text/event-stream', 'Cache-Control': 'no-cache' } })
  es.onmessage = async (evt) => {
    const ch = await resolveTextChannel()
    if (!ch) return
    const msg = (evt?.data ?? '').toString()
    if (!msg) return
    await ch.send(msg.slice(0, 1800))
  }
  es.onerror = (e) => {
    console.warn('SSE error; attempting to continue:', e?.status || e)
  }
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return
  const content = message.content?.trim() || ''
  if (!content.startsWith('!ask ')) return
  if (!MCP_HTTP_URL) {
    await message.reply('MCP_HTTP_URL not set on the bot.')
    return
  }
  const prompt = content.slice(5).trim()
  try {
    const res = await fetch(MCP_HTTP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(MCP_API_KEY ? { 'x-api-key': MCP_API_KEY } : {})
      },
      body: JSON.stringify({ prompt })
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json().catch(() => ({}))
    const text = typeof data === 'string' ? data : (data?.result || JSON.stringify(data).slice(0, 1800))
    await message.reply(text || '(no response)')
  } catch (e) {
    await message.reply('Request to MCP bridge failed.')
    console.error('!ask error:', e)
  }
})

client.once('ready', async () => {
  console.log('Bot ready as', client.user.tag)
  // Optional boot notification
  if ((NOTIFY_ON_START || '').toLowerCase() === 'true') {
    const ch = await resolveTextChannel()
    if (ch) await ch.send(NOTIFY_MESSAGE || 'Bridge deployed')
  }
  startSSE()
})

client.login(DISCORD_TOKEN)
