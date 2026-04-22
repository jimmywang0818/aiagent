'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

// Conversation history per room: Map<roomId, Message[]>
const conversations = new Map();

const SYSTEM_PROMPT = `你是一位專業的電商客服 AI 助理。
請用親切、簡潔的繁體中文回答顧客問題。

你可以處理：
- 訂單查詢、出貨狀態
- 退換貨流程說明
- 商品規格、庫存詢問
- 優惠活動說明
- 一般使用問題

以下情況請回覆 [TRANSFER_TO_HUMAN]（這個標記會自動觸發轉接，不要加其他說明）：
- 顧客明確要求轉接真人
- 需要實際操作訂單（取消、修改收件人等）
- 顧客情緒激動或強烈不滿
- 問題超出你的知識範圍`;

/**
 * Process a customer message and return { reply, shouldTransfer }.
 */
async function getAIReply({ roomId, userText }) {
  if (!conversations.has(roomId)) {
    conversations.set(roomId, []);
  }
  const history = conversations.get(roomId);

  history.push({ role: 'user', content: userText });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: history,
  });

  const reply = response.content[0].text;
  history.push({ role: 'assistant', content: reply });

  const shouldTransfer = reply.includes('[TRANSFER_TO_HUMAN]');
  return { reply: shouldTransfer ? null : reply, shouldTransfer };
}

/**
 * Clear conversation history for a room (call on ai-session:close).
 */
function clearHistory(roomId) {
  conversations.delete(roomId);
}

module.exports = { getAIReply, clearHistory };
