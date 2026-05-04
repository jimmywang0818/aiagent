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
  const webhook = process.env.GOOGLE_CHAT_WEBHOOK;
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
  if (rating === 5)      keywords = ['5星無評論', '0、5星'];
  else if (rating === 4) keywords = ['4星無評論'];
  else                   keywords = ['3星無評論'];  // rating === 3

  const preferred = templates.filter(t =>
    keywords.some(kw => t.sub_category.includes(kw))
  );
  // Fallback: use any 5星無評論 通用 template
  const fallback = templates.filter(t =>
    t.category === '通用' && (t.sub_category.includes('5星無評論') || t.sub_category.includes('0、5星'))
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

  // Short-circuit: no-text / no-image reviews — skip AI
  if (!reviewText?.trim() && !hasImage) {
    // 1–2 star no text → needs human immediately
    if (rating >= 1 && rating <= 2) {
      const reason = `${rating}星無評論，需人工確認`;
      console.log(`[review] ${rating}-star blank → needs_human`);
      await notifyGoogleChat({ brand, reviewText: `(${rating}星，無文字)`, reason });
      return { reply: null, source: 'needs_human', needsHuman: true, reason };
    }
    // 3–5 star no text → use template
    if (rating >= 3 && rating <= 5) {
      const result = getNoTextTemplate(rating, templateCategory);
      if (result) {
        console.log(`[review] ${rating}-star blank → template ${result.templateId} (no AI)`);
        return result;
      }
    }
  }

  // Get relevant templates: 通用 + category-specific
  const templates = db.getReviewTemplates(templateCategory);

  // Build template reference list for AI (ID + category + sub_category only)
  const templateList = templates
    .map(t => `${t.template_id} | ${t.category} | ${t.sub_category}`)
    .join('\n');

  const systemInstruction = `你是蝦皮評論回覆分類助理。根據顧客評論，從模板清單中選出最適合的一個，或決定後續動作。

回覆規則（只回傳 JSON，不加任何其他文字）：
1. 找到符合情境的模板 → {"action":"template","templateId":"T001"}
2. 正面評論但沒有對應模板 → {"action":"custom","reply":"用繁體中文撰寫的友善回覆，可加 emoji，約 50-100 字"}
3. 含客訴、退換貨要求、物流糾紛、負評、要求退款 → {"action":"needs_human","reason":"簡短說明原因"}`;

  const userContent = `品牌：${brand?.name || '未知品牌'}
品牌類別：${brandCategory || '未知'}

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
  if (parsed.action === 'needs_human') {
    console.log(`[review] Needs human: ${parsed.reason}`);
    await notifyGoogleChat({ brand, reviewText, reason: parsed.reason });
    return {
      reply:      null,
      source:     'needs_human',
      needsHuman: true,
      reason:     parsed.reason,
    };
  }

  // ── Custom reply ──
  const reply = parsed.reply || '感謝您的評論與支持！💖';
  console.log(`[review] Custom reply generated`);
  return { reply, source: 'custom', needsHuman: false };
}

module.exports = { getReviewReply };
