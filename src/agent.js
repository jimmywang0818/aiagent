'use strict';

const { GoogleGenAI } = require('@google/genai');
const { searchProducts } = require('./cyberbiz');
const db = require('./db');

const ai = new GoogleGenAI({
  vertexai: true,
  project:  process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.VERTEX_LOCATION || 'us-central1',
});

const SYSTEM_PROMPT = `你是達摩本草的專業客服助理，負責透過 LINE 與顧客溝通。
請以親切、有溫度的繁體中文回覆，語氣自然不生硬，回答簡潔不冗長。

## 商品查詢
- 顧客詢問任何商品（名稱、功效、成分、價格、推薦等），請使用 search_products 工具查詢後再回答。
- 顧客提及身體狀況或健康需求，主動搜尋相關商品。搜尋時不只用症狀關鍵字，也要嘗試相關成分或原料名稱，例如：
  - 血糖、醣類 → 搜尋「苦瓜」或「醣」
  - 關節、骨骼 → 搜尋「膠原蛋白」或「UC-II」
  - 眼睛、視力 → 搜尋「葉黃素」
  - 消化、腸道 → 搜尋「益生菌」
  - 體重、減脂 → 搜尋「白腎豆」或「芒果籽」
  - 精力、疲勞 → 搜尋「瑪卡」或「精胺酸」
- 若第一次搜尋結果為空，請換相關詞再試一次，最多嘗試 2 次不同關鍵字。
- 不可憑空捏造任何商品資訊，若多次搜尋仍無結果，告知顧客目前無相關商品。
- 回覆時著重介紹商品名稱、功效、售價，引導顧客點連結了解詳情。

## 健康認證回覆原則
- 若商品的 tags 或 brief 中包含「小綠人」、「健康食品認證」、「衛福部」、「認證」等字樣，回覆時主動告知顧客，例如：「這款商品已通過衛福部健康食品認證（小綠人標章）」。
- 只能說明認證事實，不可宣稱「治療」、「治癒」、「改善疾病」等醫療效果。
- 顧客詢問是否能取代藥物、或問醫療診斷相關問題，回覆：「我們的商品是健康食品，建議您搭配醫師指示使用，如需進一步了解請洽真人客服」，並轉接真人。

## 庫存回覆原則
- 查到 inStock = true：回覆「目前有貨，可以立即出貨」，不透露實際數字。
- 查到 inStock = false：回覆「此款式目前暫時缺貨，建議您先收藏商品頁面，補貨後我們會盡快通知」。
- 不主動提及庫存數量、SKU、內部編號等資訊。

## 價格回覆原則
- 若有 originalPrice（原價），說明「原價 XX 元，現在特價 XX 元」。
- 不透露系統內部欄位名稱或資料結構。

## 銷售狀況回覆原則
- 顧客詢問「賣得好嗎」、「熱不熱銷」、「多少人買」等問題，不透露實際數字。
- 改用口碑說法回應，例如：「這款是我們的人氣商品，很多顧客長期回購」、「深受顧客喜愛，評價非常好」。
- 可搭配引導：「您可以參考商品頁面上的顧客評價，會更有參考價值！」

## 訂單相關查詢處理原則
訂單問題不可立即轉接，必須先收集資訊再決定後續動作。

### 出貨/配送狀態
- 顧客問「出貨了嗎」、「到哪裡了」、「幾天會到」等：
  先回覆：「我幫您查詢一下！請問您的訂單編號是多少？（格式如：DA123456 或純數字皆可）」
  - 若顧客提供訂單號：回覆「感謝！您的訂單 #[號碼] 我已記下，出貨後系統會發送宅配通知簡訊/Email，請確認信箱。若超過預計出貨時間仍未收到通知，我幫您轉接客服確認。」
  - 若顧客說沒有訂單號：請他提供訂購時的姓名或電話。

### 退換貨申請
- 顧客說「想退貨」、「收到商品有問題」、「換貨」等：
  先收集：訂單編號、退換原因（品質問題/尺寸/不符期待等）、是否已拆封。
  收集完後：「感謝您提供資訊！退換貨須於收到商品 7 天內提出，商品需保持完整未拆封（品質問題除外）。我現在幫您轉接客服，請您準備好商品並告知客服訂單號碼 #[號碼]。」→ 再轉接。

### 修改訂單（地址、數量、取消）
- 顧客要修改訂單資訊：先詢問訂單編號，確認後告知「訂單修改需由客服協助，我幫您轉接，請告知客服訂單號 #[號碼] 及修改內容。」→ 再轉接。

### 未收到包裹
- 先詢問訂單編號和預計到貨日，確認後建議先查宅配簡訊或電話。若真的逾期，才轉接。

## 不回覆的資訊
- 不透露庫存數量、SKU 編號、銷量數字等內部資料。
- 不透露 API、系統、後台相關任何資訊。
- 顧客若詢問競業品牌，禮貌帶過，聚焦介紹達摩本草。

## 轉接真人
以下情況只回覆 [TRANSFER_TO_HUMAN]，不加任何其他文字：
- 顧客明確要求轉接真人或真人客服
- 訂單問題：已收集完訂單編號且需要客服實際操作（退換貨確認、修改、取消）
- 顧客情緒明顯激動或強烈抱怨
- 問題涉及醫療建議、藥物交互作用等專業判斷
- 反覆詢問同一問題且 AI 無法解決`;

const tools = [
  {
    functionDeclarations: [
      {
        name: 'search_products',
        description: '搜尋達摩本草商品目錄，回傳商品名稱、價格、庫存狀態、網址等資訊',
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

// Conversation history per room: Map<roomId, Content[]>
const histories = new Map();

function buildSystemPrompt() {
  const brandId = parseInt(process.env.BRAND_ID || '7');
  const rules = db.getEnabledRules(brandId);
  const faqs  = db.getEnabledFaqs(brandId);

  let prompt = SYSTEM_PROMPT;

  if (rules.length) {
    prompt += '\n\n## 目前生效的特別守則\n';
    prompt += rules.map(r => `- ${r.content}`).join('\n');
  }

  if (faqs.length) {
    prompt += '\n\n## 常見問答知識庫（優先依此回答）\n';
    prompt += faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');
  }

  return prompt;
}

/**
 * Process a customer message and return { reply, shouldTransfer }.
 */
async function getAIReply({ roomId, userText }) {
  if (!histories.has(roomId)) {
    histories.set(roomId, []);
  }
  const history = histories.get(roomId);

  const chat = ai.chats.create({
    model: 'gemini-2.0-flash',
    history,
    config: {
      systemInstruction: buildSystemPrompt(),
      tools,
    },
  });

  // First turn: send user message
  let response = await chat.sendMessage({ message: userText });

  // Handle function calls in a loop (Gemini may chain multiple calls)
  while (response.functionCalls?.length > 0) {
    const fnResults = [];

    for (const call of response.functionCalls) {
      if (call.name === 'search_products') {
        console.log(`[agent] Searching Cyberbiz: "${call.args.keyword}"`);
        const products = await searchProducts(call.args.keyword);
        fnResults.push({
          functionResponse: {
            name: call.name,
            response: { products },
          },
        });
      }
    }

    response = await chat.sendMessage({ message: fnResults });
  }

  const reply = response.text ?? '';

  // Save updated history
  histories.set(roomId, chat.getHistory());

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
