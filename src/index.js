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
const { getAIReply, clearHistory, askAI, triageImage } = require('./agent');
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

    // ── Resolve userText from message content ─────
    let userText = null;

    if (content.type === 'file' || content.type === 'video' || content.type === 'audio') {
      // Block file/video/audio attachments for security
      await sendMessage({
        teamId, roomId, replyToken, platform,
        text: '您好！很抱歉，為了保護帳號安全，我們的客服系統無法開啟外部檔案 🙏\n\n如有商品或訂單問題，歡迎直接用文字告訴我，我很樂意協助您！',
      });
      console.log(`[webhook] Blocked ${content.type} attachment in room=${roomId}`);
      continue;

    } else if (content.type === 'image') {
      // Images: silently ignore (no OCR, no AI tokens)
      console.log(`[webhook] Image ignored room=${roomId}`);
      continue;

    } else if (content.type === 'text') {
      const raw = (content.text || '').trim();

      // Ignore LINE rich menu / postback trigger messages (e.g. "Menu-5", "menu_1")
      if (/^menu[-_]?\d*$/i.test(raw)) {
        console.log(`[webhook] Ignored menu trigger: "${raw}"`);
        continue;
      }
      if (!raw) continue;

      // Block messages containing any http/https URL
      if (/https?:\/\/\S+/i.test(raw)) {
        await sendMessage({
          teamId, roomId, replyToken, platform,
          text: '您好！感謝您的訊息 😊 很抱歉，為了保護雙方的安全，我們的客服系統無法開啟外部連結。\n\n如果您有任何商品或訂單上的問題，歡迎直接用文字告訴我，我會很樂意為您服務！',
        });
        console.log(`[webhook] Blocked URL in message: "${raw.slice(0, 50)}"`);
        continue;
      }
      userText = raw;

    } else {
      // Sticker, location, etc. — silently ignore
      continue;
    }

    if (!userText) continue;

    // ── Pass to AI ────────────────────────────────
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
  const { reviewText, brandId, rating, hasImage, apiKey } = req.body;

  if (!process.env.SHOPEE_API_KEY || apiKey !== process.env.SHOPEE_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 相容 JSON body（型別正確）和 form-encoded body（全部為字串）兩種格式
  const brandIdParsed = (brandId != null && brandId !== '' && brandId !== 'null')
    ? parseInt(brandId) : null;
  const ratingParsed  = (rating  != null && rating  !== '' && rating  !== 'null')
    ? parseInt(rating)  : null;
  const hasImageParsed = hasImage === true || hasImage === 'true';

  // reviewText 可為空（純星等評論）；但至少要有 reviewText 或 rating 其中一個
  if (!reviewText?.trim() && ratingParsed == null) {
    return res.status(400).json({ error: 'reviewText or rating is required' });
  }

  console.log(`[shopee-api] brand=${brandIdParsed??'null'} rating=${ratingParsed??'?'} hasImage=${hasImageParsed} review="${(reviewText||'').slice(0,60)}"`);
  try {
    const result = await getReviewReply({
      reviewText: reviewText?.trim() || '',
      brandId:    brandIdParsed,
      rating:     ratingParsed,
      hasImage:   hasImageParsed,
    });
    res.json(result);
  } catch (err) {
    console.error('[shopee-api] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Internal Ask API ──────────────────────────────
// POST /api/ask
// Body: { prompt, systemPrompt?, apiKey }
// Returns: { reply }
app.post('/api/ask', async (req, res) => {
  const { prompt, systemPrompt, model, enableSearch, apiKey } = req.body;

  if (!process.env.INTERNAL_API_KEY || apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  try {
    const reply = await askAI({ prompt: prompt.trim(), systemPrompt, model, enableSearch: !!enableSearch, silent: true });
    res.json({ reply });
  } catch (err) {
    console.error('[ask-api] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, async () => {
  console.log(`[server] Omnichat AI Agent running on port ${PORT}`);
  console.log(`[server] Webhook endpoint: ${WEBHOOK_PATH}`);
  await loadAllProducts();
});
