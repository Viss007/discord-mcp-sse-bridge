import 'dotenv/config'
import {Client,GatewayIntentBits} from 'discord.js'
import EventSource from 'eventsource'
const{DISCORD_TOKEN,DISCORD_CHANNEL_ID,SSE_URL,MCP_HTTP_URL,MCP_API_KEY}=process.env
if(!DISCORD_TOKEN||!DISCORD_CHANNEL_ID||!SSE_URL){console.error('Missing env');process.exit(1)}
const c=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]})
const getCh=async()=>{try{const ch=await c.channels.fetch(DISCORD_CHANNEL_ID);return ch?.isTextBased()?ch:null}catch(e){console.error('ch?',e);return null}}
const startSSE=()=>{const es=new EventSource(SSE_URL,{headers:{Accept:'text/event-stream','Cache-Control':'no-cache'}});es.onmessage=async e=>{const ch=await getCh();if(!ch)return;const m=(e?.data||'').toString();if(m)await ch.send(m.slice(0,1800))};es.onerror=e=>console.warn('sse',e?.status||e)}
c.on('messageCreate',async m=>{if(m.author.bot)return;const t=m.content?.trim()||'';if(!t.startsWith('!ask '))return;if(!MCP_HTTP_URL){await m.reply('MCP_HTTP_URL not set');return}const prompt=t.slice(5).trim();try{const r=await fetch(MCP_HTTP_URL,{method:'POST',headers:{'Content-Type':'application/json',...(MCP_API_KEY?{'x-api-key':MCP_API_KEY}:{})},body:JSON.stringify({prompt})});const d=await r.json().catch(()=>({}));const txt=typeof d==='string'?d:(d?.result||JSON.stringify(d).slice(0,1800));await m.reply(txt||'(no response)')}catch(e){await m.reply('MCP request failed');console.error('!ask',e)}})
c.once('ready',()=>{console.log('bot',c.user.tag);startSSE()})
c.login(DISCORD_TOKEN)
