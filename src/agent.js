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

## 商品推薦與瀏覽（最常見場景）
當顧客說「推薦保健品」、「熱門商品」、「有什麼產品」、「幫我推薦」、「有哪些」等模糊或瀏覽性問題：
1. 呼叫 search_products，keyword 傳空字串 ""（空字串代表列出商品）
2. 從回傳的商品中挑選 3~5 款，簡單介紹名稱、功效重點、售價
3. 每款附上商品連結，讓顧客點擊瀏覽
4. 最後問顧客有沒有特別想補充的方向（如睡眠、眼睛、消化等），提供更精準推薦
絕對不可在沒有呼叫工具的情況下自行列出商品名稱。

## 顧客有健康需求 → 精準推薦
顧客提及身體狀況或健康目標時，先理解需求，再呼叫工具搜尋：
- 眼睛疲勞、視力 → 搜尋「葉黃素」
- 睡眠、失眠 → 搜尋「GABA」或「好眠」
- 消化、脹氣、腸道 → 搜尋「益生菌」
- 血糖、控糖 → 搜尋「苦瓜」
- 關節、骨骼 → 搜尋「膠原蛋白」或「UC-II」
- 精力、疲勞、男性活力 → 搜尋「瑪卡」
- 心血管、血液循環 → 搜尋「納豆」或「魚油」
- 體重管理 → 搜尋「白腎豆」
- 薑黃、抗氧化 → 搜尋「薑黃」
- 找不到時換一個相關詞再搜一次，最多嘗試 2 次

## 商品詳細查詢（成分、功效、認證、注意事項）
顧客詢問特定商品的詳細資訊：
1. 先用 get_product_info 查詢詳細產品資料庫（取得成分、認證、注意事項等）
2. 再用 search_products 取得售價、庫存、購買連結
3. 整合回答：功效可根據工具回傳的成分資料客觀說明，例如「含有 X 成分，一般認為有助於...」

## 功效與健康知識回覆原則
- 顧客詢問某成分或功效（如「魚油有什麼效果」、「益生菌對什麼有幫助」）：
  可根據 get_product_info 資料庫以及一般保健知識客觀說明，語氣採「研究顯示」或「一般認為有助於」等
- 功效說明只根據工具回傳的資料或公認的保健常識，不誇大宣稱醫療效果
- 不可直接說「治療」、「治癒」或「保證有效」

## 成分與特殊健康狀況
顧客詢問特定成分含量（磷、鉀、鈉等）或提及特殊狀況（腎臟病、糖尿病、用藥中）：
1. 肯定顧客謹慎的態度
2. 用 get_product_info 查詢該商品的營養標示
3. 若有具體數值則直接告知；若沒有則說「詳細標示建議查閱商品頁面或洽客服確認」
4. 附上商品連結
5. 特殊健康狀況：說明屬醫療判斷，建議搭配醫師指示

## 健康認證回覆原則
- 商品若有「小綠人」、「健康食品認證」、「衛福部認證」等，主動告知顧客
- 只能說明認證事實，不可宣稱治療或治癒疾病

## 庫存回覆原則
- inStock = true：「目前有貨，可以立即出貨」
- inStock = false：「此款式目前暫時缺貨，建議先收藏商品頁面，補貨後會盡快通知」
- 不透露實際庫存數字

## 價格回覆原則
- 若有 originalPrice（原價），說明「原價 XX 元，現在特價 XX 元」

## 銷售狀況回覆原則
- 被問「賣得好嗎」、「熱不熱銷」：不透露數字，改用口碑說法
  例：「這款是我們的人氣商品，很多顧客長期回購」

## 訂單查詢
顧客問出貨或訂單狀態：
先問「請問您的訂單編號是多少？」
→ 取得訂單號後呼叫 get_order_status
→ 查無結果：請提供訂購 Email 再查一次
→ 無法查詢：告知系統異常，轉接客服

回覆格式：
- 已出貨：「您的訂單 #XXX 已於 [日期] 出貨，[物流] 追蹤號 [號碼]」
- 備貨中：「訂單 #XXX 備貨中，付款後約 1-3 個工作天出貨」
- 已取消：「訂單 #XXX 已取消，如有疑問我幫您轉接客服」

退換貨：收集訂單號、退換原因、是否拆封，說明 7 天內完整未拆封政策，再轉接真人。
修改訂單：查到訂單後告知需客服處理，轉接真人。

## 嚴禁事項
- 不透露庫存數量、SKU、銷量等內部資料
- 不透露 API、系統、後台資訊
- 競業品牌：禮貌帶過，聚焦達摩本草
- 嚴禁捏造：商品名稱、功效、價格、連結，一律只能來自工具回傳的真實資料
- 禁止提供任何非工具回傳的商品網址

## 客服電話
顧客詢問時告知：「客服電話 02-3322-5628 轉分機 1，服務時間週一至週五 09:00–18:00」
日常問題先用訊息解決，顧客明確要求才提供電話。

## 訂單建立（貨到付款）
顧客想要下單或詢問「貨到付款」訂購方式時，依序收集以下資訊：
1. 確認購買商品品項與數量（若未提，先問「請問您想購買哪款商品、數量是幾盒？」）
2. 收件人姓名
3. 聯絡電話
4. 收件地址（縣市、鄉鎮、詳細地址）
收集完畢後，整理成摘要讓顧客確認，並告知「我們的客服同仁將盡快聯繫您確認訂單，謝謝」
最後回覆 [幫你轉接真人] 將訂單資訊移交真人客服處理。
注意：不可向顧客承諾價格折扣、免運門檻或出貨時間（這些由客服確認）。

## 檢驗報告
若顧客詢問「有沒有檢驗報告」、「有做過什麼檢測」、「SGS/台美驗證」等問題：
1. 先用 get_product_info 查詢對應商品
2. 若結果含有 lab_report_url，直接提供該連結
3. 若顧客未指定商品，或查無對應報告，提供總覽頁：https://superlab.tw/damokampo/
說明：達摩本草定期委託台美檢驗（Superlab）進行產品安全性與成分檢驗

## 轉接真人
只回覆 [幫你轉接真人]，不加其他文字：
- 顧客明確要求真人客服
- 訂單問題需客服實際操作（退換貨確認、修改、取消）
- 顧客情緒激動或強烈抱怨
- 問題涉及醫療建議、藥物交互作用
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
        description: '搜尋商品目錄，回傳商品名稱、價格、庫存狀態、購買網址等資訊。keyword 傳空字串 "" 可取得全部商品列表，適合「推薦商品」、「有哪些產品」等場景',
        parameters: {
          type: 'OBJECT',
          properties: {
            keyword: { type: 'STRING', description: '搜尋關鍵字（如：葉黃素、益生菌、魚油）。顧客問「推薦」或「有什麼商品」時傳空字串 ""' },
          },
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
// Retry wrapper for Vertex AI 429 / 503 transient errors
async function withRetry(fn, maxRetries = 4) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err?.message || '';
      const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
      const is503 = msg.includes('503') || msg.includes('UNAVAILABLE');
      if ((is429 || is503) && attempt < maxRetries) {
        const wait = Math.min(1000 * Math.pow(2, attempt), 16000); // 1s,2s,4s,8s
        console.warn(`[agent] Vertex AI ${is429 ? '429' : '503'} on attempt ${attempt + 1}, retrying in ${wait}ms…`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
}

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

  // First turn: send user message (with retry)
  let response = await withRetry(() => chat.sendMessage({ message: userText }));

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

    response = await withRetry(() => chat.sendMessage({ message: fnResults }));
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

/**
 * Triage an image message using Gemini Vision.
 * Returns a short description of the customer's question if the image is relevant,
 * or null if the image should be silently ignored.
 *
 * @param {string} imageUrl  Public URL of the image
 * @returns {Promise<string|null>}
 */
async function triageImage(imageUrl) {
  try {
    // Fetch the image
    const imgRes = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LineBot-AI/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!imgRes.ok) {
      console.warn(`[triageImage] fetch failed: ${imgRes.status}`);
      return null;
    }

    // Detect MIME type (default to JPEG if unknown)
    const ct = imgRes.headers.get('content-type') || 'image/jpeg';
    const mimeType = ct.split(';')[0].trim() || 'image/jpeg';

    const buffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    // One-shot Vision call with Gemini Flash
    const response = await withRetry(() => ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64 } },
          {
            text: '這是顧客在電商客服中傳送的圖片。\n' +
              '請判斷：這張圖片是否包含與保健品購買、產品成分、訂單、使用方法或顧客問題相關的文字或意圖？\n' +
              '如果是，請用繁體中文一句話摘要顧客想問的問題（只輸出問題內容，不加任何說明）。\n' +
              '如果不是（例如：無文字的產品照、表情貼圖、一般生活照、廣告圖），只回覆 IGNORE。',
          },
        ],
      }],
      config: {
        systemInstruction: '只回覆顧客問題的摘要，或回覆 IGNORE，不加任何多餘說明。',
      },
    }));

    const result = (response.text ?? '').trim();
    console.log(`[triageImage] result: "${result.slice(0, 100)}"`);

    if (!result || result.toUpperCase() === 'IGNORE') return null;
    return result;

  } catch (err) {
    // On any error (network, API), silently ignore the image
    console.error(`[triageImage] error: ${err.message}`);
    return null;
  }
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

module.exports = { getAIReply, clearHistory, askAI, triageImage };
