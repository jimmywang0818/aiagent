'use strict';

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

// Ensure data directory exists for SQLite
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
const { sendMessage, transferToHuman } = require('./omnichat');
const { getAIReply, clearHistory } = require('./agent');
const { getReviewReply } = require('./review');
const { loadAllProducts } = require('./cyberbiz');
const adminRouter = require('./admin');
const db = require('./db');

const BRAND_ID = parseInt(process.env.BRAND_ID || '7');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }, // 8 hours
}));
app.use('/tsa-ai-agent-manage', adminRouter);

const PORT = process.env.PORT || 3000;
const WEBHOOK_PATH = process.env.WEBHOOK_PATH || '/omnichat-webhook';

app.post(WEBHOOK_PATH, async (req, res) => {
  // Always return 200 immediately to avoid Omnichat timeout
  res.sendStatus(200);

  const { team, events } = req.body;
  if (!team || !events) return;

  const teamId = team.id;

  for (const event of events) {
    const { type, payload } = event;

    if (type === 'ai-session:close') {
      clearHistory(payload.room.id);
      continue;
    }

    if (type !== 'message:new') continue;

    const { room, message, channel } = payload;
    const roomId = room.id;
    const platform = channel.platform;
    const replyToken = message.replyToken;
    const sender = message.sender;
    const content = message.content;

    if (sender.type !== 'customer') continue;
    if (content.type !== 'text') continue;

    const userText = content.text.trim();

    // Ignore LINE rich menu / postback trigger messages (e.g. "Menu-5", "menu_1")
    if (/^menu[-_]?\d*$/i.test(userText)) {
      console.log(`[webhook] Ignored menu trigger: "${userText}"`);
      continue;
    }

    // Ignore empty messages
    if (!userText) continue;

    // Auto-reply for messages that are only a URL
    if (/^https?:\/\/\S+$/i.test(userText)) {
      await sendMessage({
        teamId, roomId, replyToken, platform,
        text: '感謝您的訊息！由於 LINE 聊天室內無法直接開啟連結，建議您複製網址後在瀏覽器開啟，或直接告訴我您的問題，我很樂意為您協助 😊',
      });
      console.log(`[webhook] Auto-replied to URL message: "${userText.slice(0, 50)}"`);
      continue;
    }

    console.log(`[webhook] [${platform}] room=${roomId} user="${userText}"`);
    db.logMessage({ brandId: BRAND_ID, roomId, platform, role: 'user', message: userText });

    try {
      const { reply, shouldTransfer } = await getAIReply({ roomId, userText });

      console.log(`[webhook] AI reply: "${(reply||'[TRANSFER]').slice(0,80)}"`);
      if (shouldTransfer) {
        const transferMsg = '感謝您的耐心等候，我將為您轉接真人客服，請稍候...';
        await sendMessage({ teamId, roomId, replyToken, platform, text: transferMsg });
        db.logMessage({ brandId: BRAND_ID, roomId, platform, role: 'agent', message: transferMsg });
        await transferToHuman({ teamId, roomId });
      } else {
        await sendMessage({ teamId, roomId, replyToken, platform, text: reply });
        db.logMessage({ brandId: BRAND_ID, roomId, platform, role: 'agent', message: reply });
      }
    } catch (err) {
      console.error(`[webhook] Error handling message for room ${roomId}:`, err.message);
    }
  }
});

// ── Shopee Review Reply API ────────────────────────
// POST /api/shopee-review
// Body: { reviewText, brandId, apiKey }
// Returns: { reply, templateId, source, needsHuman, reason }
app.post('/api/shopee-review', async (req, res) => {
  const { reviewText, brandId, apiKey } = req.body;

  if (!process.env.SHOPEE_API_KEY || apiKey !== process.env.SHOPEE_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!reviewText || !reviewText.trim()) {
    return res.status(400).json({ error: 'reviewText is required' });
  }

  console.log(`[shopee-api] brand=${brandId||'?'} review="${reviewText.slice(0,60)}"`);
  try {
    const result = await getReviewReply({
      reviewText: reviewText.trim(),
      brandId:    brandId ? parseInt(brandId) : null,
    });
    res.json(result);
  } catch (err) {
    console.error('[shopee-api] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, async () => {
  console.log(`[server] Omnichat AI Agent running on port ${PORT}`);
  console.log(`[server] Webhook endpoint: ${WEBHOOK_PATH}`);
  await loadAllProducts();
});
