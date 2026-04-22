'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { searchProducts } = require('./cyberbiz');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `你是一位專業的電商客服 AI 助理，服務品牌為達摩本草。
請用親切、簡潔的繁體中文回答顧客問題。

當顧客詢問任何商品相關問題（名稱、價格、庫存、規格、推薦等），
請使用 search_products 工具查詢後再回答，不要憑空捏造商品資訊。

以下情況請回覆 [TRANSFER_TO_HUMAN]（這個標記會自動觸發轉接，不要加其他說明）：
- 顧客明確要求轉接真人
- 需要實際操作訂單（取消、修改收件人等）
- 顧客情緒激動或強烈不滿
- 問題超出你的知識範圍`;

const tools = [
  {
    functionDeclarations: [
      {
        name: 'search_products',
        description: '搜尋 PowerHero 商品目錄，回傳商品名稱、價格、庫存、網址等資訊',
        parameters: {
          type: 'OBJECT',
          properties: {
            keyword: {
              type: 'STRING',
              description: '搜尋關鍵字，如商品名稱、功效、分類等',
            },
          },
          required: ['keyword'],
        },
      },
    ],
  },
];

// Conversation history per room: Map<roomId, Message[]>
const histories = new Map();

/**
 * Process a customer message and return { reply, shouldTransfer }.
 */
async function getAIReply({ roomId, userText }) {
  if (!histories.has(roomId)) {
    histories.set(roomId, []);
  }
  const history = histories.get(roomId);

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: SYSTEM_PROMPT,
    tools,
  });

  const chat = model.startChat({ history });

  // First turn: send user message
  let result = await chat.sendMessage(userText);
  let response = result.response;

  // Handle function calls in a loop (Gemini may chain multiple calls)
  while (response.functionCalls()?.length > 0) {
    const calls = response.functionCalls();
    const functionResults = [];

    for (const call of calls) {
      if (call.name === 'search_products') {
        console.log(`[agent] Searching Cyberbiz: "${call.args.keyword}"`);
        const products = await searchProducts(call.args.keyword);
        functionResults.push({
          functionResponse: {
            name: call.name,
            response: { products },
          },
        });
      }
    }

    result = await chat.sendMessage(functionResults);
    response = result.response;
  }

  const reply = response.text();

  // Save updated history
  histories.set(roomId, await chat.getHistory());

  const shouldTransfer = reply.includes('[TRANSFER_TO_HUMAN]');
  return { reply: shouldTransfer ? null : reply, shouldTransfer };
}

/**
 * Clear conversation history for a room (call on ai-session:close).
 */
function clearHistory(roomId) {
  histories.delete(roomId);
}

module.exports = { getAIReply, clearHistory };
