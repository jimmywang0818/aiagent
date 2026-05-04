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

## 格式規定
- 只用純文字，禁止任何 Markdown（**粗體**、*斜體*、# 標題、> 引用、--- 分隔線等）
- 商品列表用換行分隔，每款用「・」或數字開頭
- 可使用 emoji

## 商品推薦（最常見場景）
顧客說「推薦」、「有什麼產品」、「有哪些」等模糊問題：
1. 呼叫 search_products，keyword 傳空字串 ""
2. 挑 3–5 款，簡介名稱、功效重點、售價與購買連結
3. 詢問顧客更具體的需求方向（睡眠、眼睛、消化等）提供精準推薦
禁止未呼叫工具就自行列出商品名稱或網址。

## 商品詳細查詢
顧客詢問特定商品成分、功效、認證、注意事項：
1. 先呼叫 get_product_info 取得完整產品資料
2. 再呼叫 search_products 取得售價、庫存與購買連結


## 嚴禁事項
- 不透露庫存數量、SKU、銷量等內部資料
- 不透露 API、系統、後台、資料庫、工具名稱
- 嚴禁出現「從資料庫」、「根據QA」、「我找到以下資訊」、「系統顯示」、「工具回傳」等內部用語
- 回答時直接提供資訊，不說明來源或查詢過程
- 競業品牌：禮貌帶過，聚焦達摩本草
- 嚴禁捏造商品名稱、功效、價格、連結，一律只能來自工具回傳的真實資料

## 轉接真人
只回覆 [幫你轉接真人]，不加其他文字，當：
- 顧客明確要求真人客服
- 訂單需客服實際操作（退換貨確認、修改、取消）
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
            email:        { type: 'STRING', description: '顧客訂購時使用的 Email' },
            phone:        { type: 'STRING', description: '顧客訂購時使用的電話號碼' },
            name:         { type: 'STRING', description: '訂購人姓名（僅供參考，無法單獨查詢）' },
          },
        },
      },
    ],
  },
];

// Conversation history per room: Map<roomId, Content[]>
const histories = new Map();

// Session history for askAI (e.g. LINE bot via /api/ask)
// Map<sessionId, { history: Content[], lastUsed: number }>
const askSessions = new Map();
const ASK_SESSION_TTL = 30 * 60 * 1000; // 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of askSessions) {
    if (now - s.lastUsed > ASK_SESSION_TTL) askSessions.delete(id);
  }
}, 5 * 60 * 1000);

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
        const { order_number, email, phone, name } = call.args;
        console.log(`[agent] get_order_status: order=${order_number} email=${email} phone=${phone} name=${name}`);
        const orders = await getOrderStatus({ orderNumber: order_number, email, phone, name });
        fnResults.push({ functionResponse: { name: call.name, response: { orders } } });
      }
    }

    response = await withRetry(() => chat.sendMessage({ message: fnResults }));
  }

  const reply = response.text ?? '';

  // Save updated history
  histories.set(roomId, chat.getHistory());

  const shouldTransfer = reply.includes('[幫你轉接真人]') || reply.includes('[TRANSFER_TO_HUMAN]');
  return { reply: shouldTransfer ? null : reply, shouldTransfer };
}

/**
 * Clear conversation history for a room (call on ai-session:close).
 */
function clearHistory(roomId) {
  histories.delete(roomId);
}

/**
 * Triage an image message.
 *
 * Strategy (controlled by USE_PYTHON_OCR env var):
 *   USE_PYTHON_OCR=true  → Python OCR (EasyOCR/pytesseract) + keyword filter, 0 AI tokens
 *   default              → Gemini Flash Vision one-shot, ~100 tokens
 *
 * Returns extracted text if relevant, or null to silently ignore the image.
 *
 * @param {string} imageUrl  Public URL of the image
 * @returns {Promise<string|null>}
 */
async function triageImage(imageUrl) {
  if (process.env.USE_PYTHON_OCR === 'true') {
    return triageImagePython(imageUrl);
  }
  return triageImageGemini(imageUrl);
}

// ── Python OCR triage (0 AI tokens) ───────────────
async function triageImagePython(imageUrl) {
  const { execFile } = require('child_process');
  const path = require('path');
  const scriptPath = path.join(__dirname, '../scripts/ocr_triage.py');

  return new Promise((resolve) => {
    const python = process.env.PYTHON_BIN || 'python3';
    const proc = execFile(python, [scriptPath, imageUrl], { timeout: 30000 }, (err, stdout, stderr) => {
      if (stderr) console.log(`[triageImage/ocr] ${stderr.trim().slice(0, 200)}`);
      if (err) {
        console.error(`[triageImage/ocr] process error: ${err.message}`);
        resolve(null);
        return;
      }
      const result = stdout.trim();
      if (!result || result === 'IGNORE') {
        console.log('[triageImage/ocr] IGNORE');
        resolve(null);
      } else {
        console.log(`[triageImage/ocr] useful: "${result.slice(0, 80)}"`);
        resolve(result);
      }
    });
  });
}

// ── Gemini Vision triage (~100 tokens) ────────────
async function triageImageGemini(imageUrl) {
  try {
    const imgRes = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LineBot-AI/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!imgRes.ok) {
      console.warn(`[triageImage/gemini] fetch failed: ${imgRes.status}`);
      return null;
    }

    const ct = imgRes.headers.get('content-type') || 'image/jpeg';
    const mimeType = ct.split(';')[0].trim() || 'image/jpeg';
    const buffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

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
    console.log(`[triageImage/gemini] result: "${result.slice(0, 100)}"`);
    if (!result || result.toUpperCase() === 'IGNORE') return null;
    return result;

  } catch (err) {
    console.error(`[triageImage/gemini] error: ${err.message}`);
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

async function fetchPageContent(url, maxChars = 5000, silent = false) {
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
    if (!silent) console.log(`[ask-api] fetch_page: "${url}" chars=${Math.min(text.length, maxChars)}`);
    return text.slice(0, maxChars);
  } catch (err) {
    if (!silent) console.error('[fetch-page] error:', err.message);
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
 * One-shot or session-aware AI call for external use (e.g. n8n).
 * @param {object} opts
 * @param {string} opts.prompt            The user message / question
 * @param {string} [opts.systemPrompt]    Optional system instruction
 * @param {string} [opts.model]           Gemini model name (default: gemini-2.0-flash)
 * @param {boolean} [opts.enableSearch]   If true, AI can call web_search / fetch_page tools
 * @param {string}  [opts.sessionId]      If provided, conversation history is maintained across calls
 * @param {boolean} [opts.silent]         Suppress verbose logs
 * @returns {Promise<string>}             The AI reply text
 */
async function askAI({ prompt, systemPrompt, model = 'gemini-2.0-flash', enableSearch = false, sessionId = null, silent = false }) {
  const config = {};
  if (systemPrompt) config.systemInstruction = systemPrompt;
  if (enableSearch) config.tools = [searchTool];

  // Load existing history for this session (if any)
  const history = sessionId && askSessions.has(sessionId)
    ? askSessions.get(sessionId).history
    : [];

  const chat = ai.chats.create({ model, config, history });
  let response = await chat.sendMessage({ message: prompt });

  while (enableSearch && response.functionCalls?.length > 0) {
    const fnResults = [];
    for (const call of response.functionCalls) {
      if (call.name === 'web_search') {
        const maxResults = call.args.max_results ? Math.min(Number(call.args.max_results), 10) : 5;
        if (!silent) console.log(`[ask-api] web_search: "${call.args.query}" max=${maxResults}`);
        const results = await runWebSearch(call.args.query, maxResults);
        fnResults.push({ functionResponse: { name: 'web_search', response: { results } } });
      } else if (call.name === 'fetch_page') {
        const content = await fetchPageContent(call.args.url, 5000, silent);
        fnResults.push({ functionResponse: { name: 'fetch_page', response: { content } } });
      }
    }
    response = await chat.sendMessage({ message: fnResults });
  }

  // Save updated history back to session store
  if (sessionId) {
    askSessions.set(sessionId, { history: chat.getHistory(), lastUsed: Date.now() });
  }

  return response.text ?? '';
}

module.exports = { getAIReply, clearHistory, askAI, triageImage };
