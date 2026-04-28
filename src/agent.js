'use strict';

const { GoogleGenAI } = require('@google/genai');
const { searchProducts, getOrderStatus } = require('./cyberbiz');
const { searchProductInfo } = require('./db');
const db = require('./db');

const ai = new GoogleGenAI({
  vertexai: true,
  project:  process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.VERTEX_LOCATION || 'us-central1',
});

const SYSTEM_PROMPT = `你是達摩本草的專業客服助理，負責透過 LINE 與顧客溝通。
請以親切、有溫度的繁體中文回覆，語氣自然不生硬，回答簡潔不冗長。

## 格式規定（重要）
- 只用純文字回覆，絕對不可使用任何 Markdown 語法
- 禁止使用：**粗體**、*斜體*、# 標題、- 清單、> 引用、--- 分隔線等符號
- 商品列表用換行分隔，每款商品用「・」或數字開頭即可
- 可以使用 emoji，但不可用 Markdown

## 成分、醫療、安全性詢問原則
- 顧客詢問特定成分含量（如磷、鉀、鈉、糖分等）或提及特殊健康狀況（如慢性腎臟病、糖尿病、高血壓、用藥中等）：
  1. 先表示理解顧客的顧慮，肯定他們謹慎的態度
  2. 先用 get_product_info 查詢詳細產品資料庫（含成分、營養標示）
  3. 再用 search_products 取得商品售價與連結
  4. 若 get_product_info 有該成分數值（如磷含量、鉀含量）則直接告知
  5. 若資料中沒有具體數值，誠實說明「詳細成分標示建議查閱商品頁面，或轉接真人客服確認」
  6. 附上商品連結讓顧客查閱完整標示
- 有特殊健康狀況的顧客詢問是否適合使用：說明這屬於醫療判斷，建議搭配醫師指示，不可直接說「可以吃」或「安全」

## 商品查詢
- 顧客詢問任何商品（名稱、功效、成分、價格、推薦等）：
  1. 先用 get_product_info 查詢詳細產品資料庫（取得成分、認證、注意事項等）
  2. 再用 search_products 取得售價、庫存、購買連結
  3. 整合兩個工具的結果一起回答顧客
- 顧客提及身體狀況或健康需求，主動搜尋相關商品。搜尋時不只用症狀關鍵字，也要嘗試相關成分或原料名稱，例如：
  - 血糖、醣類 → 搜尋「苦瓜」或「醣」
  - 關節、骨骼 → 搜尋「膠原蛋白」或「UC-II」
  - 眼睛、視力 → 搜尋「葉黃素」
  - 消化、腸道 → 搜尋「益生菌」
  - 體重、減脂 → 搜尋「白腎豆」或「芒果籽」
  - 精力、疲勞 → 搜尋「瑪卡」或「精胺酸」
  - 納豆、紅麴 → 搜尋「納豆」或「紅麴」
- 若第一次搜尋結果為空，請換相關詞再試一次，最多嘗試 2 次不同關鍵字。
- 若多次搜尋仍無結果，只能回覆「目前查無相關商品，如有需要歡迎洽詢真人客服」，**絕對不可以**：
  - 捏造任何商品名稱、功效、價格、連結
  - 推薦任何未出現在 search_products 工具結果中的商品
  - 提供任何非 search_products 回傳的商品連結（包含 example.com 或任何假網址）
- 只能介紹 search_products 工具實際回傳的商品。回覆時著重商品名稱、功效、售價，並附上工具回傳的真實商品網址。格式範例：「🔗 商品連結：https://...」

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

## 訂單查詢處理原則
- 顧客問訂單狀態（出貨了嗎、到哪裡了、幾天會到、有沒有出貨）：
  先問「請問您的訂單編號是多少？」
  → 顧客提供訂單號後，立即呼叫 get_order_status 查詢
  → 查到結果：直接告知出貨狀態、物流資訊
  → 查無此訂單：請顧客提供訂購時的 Email 再查一次（系統不支援姓名搜尋）
  → API 無法查詢：告知「系統目前無法查詢，我幫您轉接客服確認」再轉接

- 查到訂單後如何回覆：
  - 已出貨且有追蹤號：「您的訂單 #XXX 已於 [日期] 出貨，[物流公司] 追蹤號碼為 [號碼]，您可以至官網查詢目前配送進度。」
  - 備貨中（尚未出貨）：「您的訂單 #XXX 目前狀態為備貨中，尚未出貨，一般付款後 1-3 個工作天出貨，若超過時間請再告知我。」
  - 已取消：「您的訂單 #XXX 顯示為已取消，若有疑問我幫您轉接客服確認。」
  - 查到多筆：列出訂單清單讓顧客確認是哪一筆

### 退換貨申請
- 顧客說「想退貨」、「收到商品有問題」、「換貨」等：
  先呼叫 get_order_status 查詢訂單，收集：訂單編號、退換原因、是否拆封。
  收集完後說明退換貨政策（7天內、完整未拆封）再轉接真人。

### 修改訂單（地址、數量、取消）
- 先查到訂單確認存在，再告知需由客服處理並轉接。

## 不回覆的資訊
- 不透露庫存數量、SKU 編號、銷量數字等內部資料。
- 不透露 API、系統、後台相關任何資訊。
- 顧客若詢問競業品牌，禮貌帶過，聚焦介紹達摩本草。
- **嚴禁捏造商品**：絕對不可提及任何未經 search_products 查詢到的商品名稱、功效、價格或連結。違反此規則會嚴重誤導顧客。

## 客服電話
- 顧客詢問客服電話時，告知：「您好，客服電話為 **02-3322-5628 轉分機 1**，服務時間週一至週五 09:00–18:00，歡迎來電！」
- 顧客要求真人才主動提供電話，日常問題先以訊息解決。

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
        name: 'get_product_info',
        description: '查詢詳細產品資料庫，回傳成分、營養標示、認證、注意事項等完整資訊。商品相關問題優先呼叫此工具',
        parameters: {
          type: 'OBJECT',
          properties: {
            keyword: { type: 'STRING', description: '商品名稱或關鍵字' },
          },
          required: ['keyword'],
        },
      },
      {
        name: 'search_products',
        description: '搜尋商品目錄，回傳商品名稱、價格、庫存狀態、購買網址等資訊',
        parameters: {
          type: 'OBJECT',
          properties: {
            keyword: { type: 'STRING', description: '搜尋關鍵字，如商品名稱、功效、分類等' },
          },
          required: ['keyword'],
        },
      },
      {
        name: 'get_order_status',
        description: '查詢顧客訂單狀態，包含是否出貨、物流追蹤號碼、付款狀態等資訊',
        parameters: {
          type: 'OBJECT',
          properties: {
            order_number: { type: 'STRING', description: '訂單編號，如 DA123456 或純數字' },
            email:        { type: 'STRING', description: '顧客 Email（訂單號查無結果時使用）' },
            name:         { type: 'STRING', description: '訂購人姓名（訂單號查無結果時使用）' },
          },
        },
      },
    ],
  },
];

// Conversation history per room: Map<roomId, Content[]>
const histories = new Map();

function buildSystemPrompt(brandId) {
  const id = brandId || parseInt(process.env.BRAND_ID || '7');
  const rules = db.getEnabledRules(id);
  const faqs  = db.getEnabledFaqs(id);

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
 * @param {object} opts
 * @param {string} opts.roomId
 * @param {string} opts.userText
 * @param {number} [opts.brandId]  Optional override; defaults to BRAND_ID env var
 */
async function getAIReply({ roomId, userText, brandId }) {
  if (!histories.has(roomId)) {
    histories.set(roomId, []);
  }
  const history = histories.get(roomId);

  const chat = ai.chats.create({
    model: 'gemini-2.0-flash',
    history,
    config: {
      systemInstruction: buildSystemPrompt(brandId),
      tools,
    },
  });

  // First turn: send user message
  let response = await chat.sendMessage({ message: userText });

  // Handle function calls in a loop (Gemini may chain multiple calls)
  while (response.functionCalls?.length > 0) {
    const fnResults = [];

    for (const call of response.functionCalls) {
      if (call.name === 'get_product_info') {
        console.log(`[agent] get_product_info: "${call.args.keyword}"`);
        const productInfo = searchProductInfo(call.args.keyword);
        fnResults.push({ functionResponse: { name: call.name, response: { productInfo } } });
      } else if (call.name === 'search_products') {
        console.log(`[agent] search_products: "${call.args.keyword}"`);
        const products = await searchProducts(call.args.keyword);
        fnResults.push({ functionResponse: { name: call.name, response: { products } } });
      } else if (call.name === 'get_order_status') {
        const { order_number, email, name } = call.args;
        console.log(`[agent] get_order_status: order=${order_number} email=${email} name=${name}`);
        const orders = await getOrderStatus({ orderNumber: order_number, email, name });
        fnResults.push({ functionResponse: { name: call.name, response: { orders } } });
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

const searchTool = {
  functionDeclarations: [
    {
      name: 'web_search',
      description: '搜尋網路取得相關網址和摘要。若需要完整內容（如商品列表、價格、詳細資料），搜尋後再用 fetch_page 讀取頁面',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: '搜尋關鍵字' },
          max_results: { type: 'NUMBER', description: '回傳筆數，預設 5，最多 10' },
        },
        required: ['query'],
      },
    },
    {
      name: 'fetch_page',
      description: '讀取指定網址的頁面文字內容。適合在 web_search 後，針對需要詳細資料的頁面（商品特價、完整列表、詳細評測等）進一步取得實際內容',
      parameters: {
        type: 'OBJECT',
        properties: {
          url: { type: 'STRING', description: '要讀取的完整網址' },
        },
        required: ['url'],
      },
    },
  ],
};

async function fetchPageContent(url, maxChars = 5000) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LineBot-AI/1.0)' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return `無法取得頁面（HTTP ${res.status}）`;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
    console.log(`[ask-api] fetch_page: "${url}" chars=${Math.min(text.length, maxChars)}`);
    return text.slice(0, maxChars);
  } catch (err) {
    console.error('[fetch-page] error:', err.message);
    return `無法取得頁面內容：${err.message}`;
  }
}

async function runWebSearch(query, maxResults = 5) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    console.error('[serper] SERPER_API_KEY not set');
    return [];
  }
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: maxResults, gl: 'tw', hl: 'zh-tw' }),
    });
    const data = await res.json();
    return (data.organic || []).slice(0, maxResults).map(r => ({
      title: r.title,
      url: r.link,
      description: r.snippet,
    }));
  } catch (err) {
    console.error('[serper] search error:', err.message);
    return [];
  }
}

/**
 * One-shot AI call for external use (e.g. n8n).
 * @param {object} opts
 * @param {string} opts.prompt            The user message / question
 * @param {string} [opts.systemPrompt]    Optional system instruction
 * @param {string} [opts.model]           Gemini model name (default: gemini-2.0-flash)
 * @param {boolean} [opts.enableSearch]   If true, AI can call DuckDuckGo web_search
 * @returns {Promise<string>}             The AI reply text
 */
async function askAI({ prompt, systemPrompt, model = 'gemini-2.0-flash', enableSearch = false }) {
  const config = {};
  if (systemPrompt) config.systemInstruction = systemPrompt;
  if (enableSearch) config.tools = [searchTool];

  const chat = ai.chats.create({ model, config });
  let response = await chat.sendMessage({ message: prompt });

  while (enableSearch && response.functionCalls?.length > 0) {
    const fnResults = [];
    for (const call of response.functionCalls) {
      if (call.name === 'web_search') {
        const maxResults = call.args.max_results ? Math.min(Number(call.args.max_results), 10) : 5;
        console.log(`[ask-api] web_search: "${call.args.query}" max=${maxResults}`);
        const results = await runWebSearch(call.args.query, maxResults);
        fnResults.push({ functionResponse: { name: 'web_search', response: { results } } });
      } else if (call.name === 'fetch_page') {
        const content = await fetchPageContent(call.args.url);
        fnResults.push({ functionResponse: { name: 'fetch_page', response: { content } } });
      }
    }
    response = await chat.sendMessage({ message: fnResults });
  }

  return response.text ?? '';
}

module.exports = { getAIReply, clearHistory, askAI };
