'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

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

// Conversation history per room: Map<roomId, ChatSession>
const chatSessions = new Map();

/**
 * Process a customer message and return { reply, shouldTransfer }.
 */
async function getAIReply({ roomId, userText }) {
  if (!chatSessions.has(roomId)) {
    const chat = model.startChat({
      history: [],
      systemInstruction: SYSTEM_PROMPT,
    });
    chatSessions.set(roomId, chat);
  }

  const chat = chatSessions.get(roomId);
  const result = await chat.sendMessage(userText);
  const reply = result.response.text();

  const shouldTransfer = reply.includes('[TRANSFER_TO_HUMAN]');
  return { reply: shouldTransfer ? null : reply, shouldTransfer };
}

/**
 * Clear conversation history for a room (call on ai-session:close).
 */
function clearHistory(roomId) {
  chatSessions.delete(roomId);
}

module.exports = { getAIReply, clearHistory };
