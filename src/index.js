'use strict';

require('dotenv').config();

const express = require('express');
const { sendMessage, transferToHuman } = require('./omnichat');
const { getAIReply, clearHistory } = require('./agent');
const { loadAllProducts } = require('./cyberbiz');

const app = express();
app.use(express.json());

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

    const userText = content.text;
    console.log(`[webhook] [${platform}] room=${roomId} user="${userText}"`);

    try {
      const { reply, shouldTransfer } = await getAIReply({ roomId, userText });

      if (shouldTransfer) {
        await sendMessage({
          teamId, roomId, replyToken, platform,
          text: '感謝您的耐心等候，我將為您轉接真人客服，請稍候...',
        });
        await transferToHuman({ teamId, roomId });
      } else {
        await sendMessage({ teamId, roomId, replyToken, platform, text: reply });
      }
    } catch (err) {
      console.error(`[webhook] Error handling message for room ${roomId}:`, err.message);
    }
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, async () => {
  console.log(`[server] Omnichat AI Agent running on port ${PORT}`);
  console.log(`[server] Webhook endpoint: ${WEBHOOK_PATH}`);
  await loadAllProducts();
});
