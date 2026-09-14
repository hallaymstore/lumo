require('dotenv').config();
const crypto = require('crypto');
const http = require('http');
const mongoose = require('mongoose');

const PORT = Number(process.env.PORT || 10000);
const MONGODB_URI = process.env.MONGODB_URI;
const BOT_TOKEN = process.env.BOT_TOKEN;
const LUMO_BASE_URL = (process.env.LUMO_BASE_URL || 'https://lumo-messenger.onrender.com').replace(/\/$/, '');
const POLL_MS = Math.max(1000, Number(process.env.POLL_MS || 2000));

if (!MONGODB_URI || !BOT_TOKEN) {
  console.error('MONGODB_URI and BOT_TOKEN are required');
  process.exit(1);
}

const tokenPrefix = BOT_TOKEN.split(':')[0] || '';
const tokenHash = crypto.createHash('sha256').update(BOT_TOKEN).digest('hex');
let bot = null;
let owner = null;
let cursor = new Date();
let busy = false;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function callBot(method, body = {}) {
  const url = `${LUMO_BASE_URL}/bot/${encodeURIComponent(BOT_TOKEN)}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} failed: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

function buildReply(text, msg, chat) {
  const t = String(text || '').trim();
  const low = t.toLowerCase();
  const mention = bot?.username ? `@${String(bot.username).toLowerCase()}` : '';

  if (low === '/start' || low.startsWith('/start ')) {
    return `👋 Salom! Men ${bot.name || 'Lumo Bot'}man.\n\nBuyruqlar:\n/start — ishga tushirish\n/help — yordam\n/ping — tekshiruv\n/id — ID ma’lumotlari\n/echo matn — matnni qaytarish`;
  }
  if (low === '/help' || low.startsWith('/help ')) {
    return `🤖 ${bot.name || 'Lumo Bot'} yordam\n\n/start\n/help\n/ping\n/id\n/echo Salom`;
  }
  if (low === '/ping') return '🏓 Pong! Lumo bot ishlayapti.';
  if (low === '/id') return `🆔 Chat ID: ${String(chat._id)}\n👤 User ID: ${String(msg.sender)}`;
  if (low.startsWith('/echo ')) return t.slice(6).trim() || 'Matn yozing.';
  if (mention && low.includes(mention)) return `👋 Men shu yerdaman. /help yozib buyruqlarni ko‘ring.`;
  if (/^(salom|assalomu alaykum|hello|hi)[!. ]*$/i.test(t)) return '👋 Salom! /help yozsangiz, imkoniyatlarimni ko‘rsataman.';
  return null;
}

async function poll() {
  if (busy || !bot || !owner) return;
  busy = true;
  try {
    const db = mongoose.connection.db;
    const chats = await db.collection('chats').find({'members.user': owner._id}, {_id: 1}).toArray();
    const chatIds = chats.map(c => c._id);
    if (!chatIds.length) return;

    const msgs = await db.collection('msgs').find({
      chat: {$in: chatIds},
      createdAt: {$gt: cursor},
      sender: {$ne: owner._id}
    }).sort({createdAt: 1}).limit(100).toArray();

    for (const msg of msgs) {
      if (msg.createdAt > cursor) cursor = msg.createdAt;
      const chat = chats.find(c => String(c._id) === String(msg.chat));
      if (!chat) continue;
      const reply = buildReply(msg.text, msg, chat);
      if (!reply) continue;
      try {
        await callBot('sendMessage', {chat_id: String(chat._id), text: reply});
      } catch (e) {
        console.error('sendMessage error:', e.message);
      }
    }

    if (bot?._id) {
      await db.collection('bots').updateOne({_id: bot._id}, {$set: {workerCursor: cursor, workerActive: true, workerUpdatedAt: new Date()}});
    }
  } catch (e) {
    console.error('poll error:', e.message);
  } finally {
    busy = false;
  }
}

async function boot() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  bot = await db.collection('bots').findOne({tokenPrefix, tokenHash, enabled: {$ne: false}});
  if (!bot) throw new Error('Bot token Lumo bazasida topilmadi');
  owner = await db.collection('users').findOne({_id: bot.owner});
  if (!owner) throw new Error('Bot egasi topilmadi');
  cursor = bot.workerCursor instanceof Date ? bot.workerCursor : new Date();
  await db.collection('bots').updateOne({_id: bot._id}, {$set: {webhook: 'lumo://native-worker', workerActive: true, workerUpdatedAt: new Date()}});
  console.log(`Native bot worker ready: @${bot.username || ''}`);
  setInterval(poll, POLL_MS);
}

http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {'content-type': 'application/json'});
    return res.end(JSON.stringify({ok: true, bot: bot ? {name: bot.name, username: bot.username} : null, mongo: mongoose.connection.readyState === 1}));
  }
  res.writeHead(200, {'content-type': 'text/plain; charset=utf-8'});
  res.end('Lumo Bot Worker');
}).listen(PORT, '0.0.0.0', () => console.log(`Worker HTTP :${PORT}`));

boot().catch(async e => {
  console.error(e);
  await sleep(1000);
  process.exit(1);
});
