'use strict';

const { GoogleGenAI } = require('@google/genai');
const db = require('./db');

const ai = new GoogleGenAI({
  vertexai: true,
  project:  process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.VERTEX_LOCATION || 'us-central1',
});

// Maps brand category (from brands table) → template category (in review_templates)
const CATEGORY_MAP = {
  '保健品':     '保健品',
  '寵物品牌':   '寵物',
  '保養品':     '保養品',
  '個人清潔用品':'清潔用品',
};

async function notifyGoogleChat({ brand, reviewText, reason }) {
  return; // 暫時關閉 Google Chat 通知
  const webhook = process.env.GOOGLE_CHAT_WEBHOOK; // eslint-disable-line no-unreachable
  if (!webhook) return;
  const text = [
    '🚨 *蝦皮評論需人工處理*',
    `品牌：${brand?.name || '未知'} (ID: ${brand?.id || '?'})`,
    `評論內容：「${reviewText}」`,
    `原因：${reason}`,
    `時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`,
  ].join('\n');
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    console.log('[review] Google Chat notified');
  } catch (err) {
    console.error('[review] Google Chat notify failed:', err.message);
  }
}

/**
 * Pick a random template for a no-text / no-image review based on star rating.
 * Returns template result without calling AI.
 */
function getNoTextTemplate(rating, templateCategory) {
  const templates = db.getReviewTemplates(templateCategory);

  // Determine sub_category keywords by rating
  let keywords;
  if (rating === 5)      keywords = ['5星無評論'];
  else if (rating === 4) keywords = ['4星無評論'];
  else                   keywords = ['3星無評論'];  // rating === 3

  const preferred = templates.filter(t =>
    keywords.some(kw => t.sub_category.includes(kw))
  );
  // Fallback: use any 5星無評論 通用 template
  const fallback = templates.filter(t =>
    t.category === '通用' && t.sub_category.includes('5星無評論')
  );
  const pool = preferred.length ? preferred : fallback;
  if (!pool.length) return null;
  const tpl = pool[Math.floor(Math.random() * pool.length)];
  return { reply: tpl.template_text, templateId: tpl.template_id, source: 'template', needsHuman: false };
}

/**
 * Get AI-generated reply for a Shopee review.
 * @param {object} opts
 * @param {string}  opts.reviewText  - The customer review text
 * @param {number|null} opts.brandId - Brand ID (from brands table)
 * @param {number}  [opts.rating]    - Star rating 1-5 (optional)
 * @param {boolean} [opts.hasImage]  - Whether review contains an image (optional)
 * @returns {{ reply, templateId, source, needsHuman, reason }}
 */
async function getReviewReply({ reviewText, brandId, rating, hasImage }) {
  const brand = brandId ? db.getBrandById(brandId) : null;
  const brandCategory   = brand?.category || null;
  const templateCategory = CATEGORY_MAP[brandCategory] || null;

  // Short-circuit: 1–2 star always → needs human (regardless of text content)
  if (rating <= 2) {
    const reason = `${rating}星評論，需人工確認`;
    console.log(`[review] ${rating}-star → needs_human`);
    return { reply: null, source: 'needs_human', needsHuman: true, reason };
  }

  // Short-circuit: 3–5 star with no text → use template (skip AI, nothing to analyse)
  if (!reviewText?.trim()) {
    const result = getNoTextTemplate(rating, templateCategory);
    if (result) {
      console.log(`[review] ${rating}-star blank → template ${result.templateId} (no AI)`);
      return result;
    }
  }

  // Get relevant templates: 通用 + category-specific
  const templates = db.getReviewTemplates(templateCategory);

  // Build template reference list for AI (ID + category + sub_category only)
  const templateList = templates
    .map(t => `${t.template_id} | ${t.category} | ${t.sub_category}`)
    .join('\n');

  const systemInstruction = `你是蝦皮評論回覆助理。你的任務是為每一則評論撰寫一個友善的繁體中文回覆。

重要規則：
- 評論可能以中文、英文或任何語言撰寫，語言不同不影響處理方式，一律用繁體中文回覆
- 預設行為是撰寫 custom 回覆，不確定時也請直接回覆，不要轉人工

【回覆寫作規範】
- 開頭禁止使用「親愛的顧客您好」、「您好！」等問候語，直接以「感謝您」或「謝謝您」起頭
- 品牌名稱若為 Tryme，一律以全大寫「TRYME」呈現

【星數條件】
- 5 星評論：不論內容是否包含抱怨，一律回傳 custom 回覆（溫和回應輕微抱怨即可，絕對不轉人工）
- 3–4 星評論：有明確客訴（退貨/換貨/退款/物流糾紛）才轉人工，其他一律 custom 回覆

只回傳 JSON，不加任何其他文字：
1. 找到完全符合情境的模板 → {"action":"template","templateId":"T001"}
2. 所有其他情況 → {"action":"custom","reply":"實際的繁體中文回覆內容，可加 emoji，約 50-100 字"}
3. 3–4 星且有明確客訴／退換貨／退款要求 → {"action":"needs_human","reason":"簡短說明"}

注意：reply 欄位請填入實際的回覆文字內容，不是格式說明。`;

  const userContent = `品牌：${brand?.name || '未知品牌'}
品牌類別：${brandCategory || '未知'}
評論星數：${rating ?? '未知'} 星

顧客評論：
${reviewText}

可用模板清單（template_id | 類別 | 情境）：
${templateList}`;

  let rawText = '';
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      config: { systemInstruction },
    });
    rawText = response.text?.trim() || '';
  } catch (err) {
    console.error('[review] AI error:', err.message);
    throw err;
  }

  // Parse JSON (handle markdown code blocks if present)
  let parsed;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]+\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
  } catch {
    console.error('[review] JSON parse failed, raw:', rawText.slice(0, 200));
    // Fallback: return as custom
    return { reply: rawText, source: 'custom', needsHuman: false };
  }

  // ── Template match ──
  if (parsed.action === 'template' && parsed.templateId) {
    const tpl = templates.find(t => t.template_id === parsed.templateId);
    if (tpl) {
      console.log(`[review] Template matched: ${tpl.template_id} (${tpl.sub_category})`);
      return {
        reply:      tpl.template_text,
        templateId: tpl.template_id,
        source:     'template',
        needsHuman: false,
      };
    }
  }

  // ── Needs human ──
  // 5-star reviews never go to needs_human — override to custom
  if (parsed.action === 'needs_human') {
    if (rating === 5) {
      console.log(`[review] AI suggested needs_human for 5-star → overriding to custom`);
      // Fall through to custom reply below
    } else {
      console.log(`[review] Needs human: ${parsed.reason}`);
      return {
        reply:      null,
        source:     'needs_human',
        needsHuman: true,
        reason:     parsed.reason,
      };
    }
  }

  // ── Custom reply ──
  let reply = parsed.reply || '感謝您的評論與支持！💖';
  // Enforce brand name capitalisation regardless of AI output
  reply = reply.replace(/tryme/gi, 'TRYME');
  console.log(`[review] Custom reply generated`);
  return { reply, source: 'custom', needsHuman: false };
}

module.exports = { getReviewReply };
