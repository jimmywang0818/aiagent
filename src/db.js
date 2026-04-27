'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new Database(path.join(dataDir, 'agent.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS brands (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    category     TEXT NOT NULL,
    has_omnichat INTEGER NOT NULL DEFAULT 0,
    has_shopee   INTEGER NOT NULL DEFAULT 0,
    enabled      INTEGER NOT NULL DEFAULT 1
  );

  -- Scope: brand_id=NULL & category=NULL → global
  --        brand_id=NULL & category='保健品' → category-level
  --        brand_id=X → brand-specific
  CREATE TABLE IF NOT EXISTS rules (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id   INTEGER REFERENCES brands(id),
    category   TEXT,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL,
    enabled    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS faqs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id   INTEGER REFERENCES brands(id),
    category   TEXT,
    question   TEXT NOT NULL,
    answer     TEXT NOT NULL,
    enabled    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS conversation_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id    INTEGER REFERENCES brands(id),
    room_id     TEXT NOT NULL,
    platform    TEXT,
    role        TEXT NOT NULL,
    message     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// ── Seed on first run ─────────────────────────────
const brandCount = db.prepare('SELECT COUNT(*) as c FROM brands').get().c;
if (brandCount === 0) {
  const ins = db.prepare('INSERT INTO brands (name,category,has_omnichat,has_shopee) VALUES (?,?,?,?)');
  [
    ['奧沛',   '寵物品牌',     0, 1],
    ['XXS',    '保養品',       0, 1],
    ['大島',   '保健品',       0, 1],
    ['芙木',   '保養品',       0, 1],
    ['御熹堂', '保健品',       0, 1],
    ['PH',     '個人清潔用品', 0, 1],
    ['達摩',   '保健品',       1, 1],
    ['Tryme',  '保養品',       0, 1],
    ['毛孩',   '寵物品牌',     1, 1],
    ['優固倍', '寵物品牌',     0, 1],
    ['愛旺斯', '寵物品牌',     0, 1],
  ].forEach(row => ins.run(...row));

  const damoId = db.prepare("SELECT id FROM brands WHERE name='達摩'").get().id;
  const maoId  = db.prepare("SELECT id FROM brands WHERE name='毛孩'").get().id;

  // Global rules
  const insRule = db.prepare('INSERT INTO rules (brand_id,title,content) VALUES (?,?,?)');
  insRule.run(null, '基本回覆語氣',   '回覆時語氣親切有禮，稱呼顧客為「您」，避免使用冷漠或生硬的措辭。');
  insRule.run(null, '隱私保護',       '不向顧客透露任何內部系統資訊、API、後台操作流程或其他品牌資訊。');
  insRule.run(null, '醫療免責說明',   '商品為健康食品或保養品，不具醫療效果，不可宣稱治療或治癒任何疾病，如顧客有醫療需求請建議就醫。');

  // Global FAQs
  const insFaq = db.prepare('INSERT INTO faqs (brand_id,question,answer) VALUES (?,?,?)');
  insFaq.run(null, '如何聯繫真人客服？', '您可以直接在此訊息告知需要真人協助，我們的客服人員會盡快為您接手服務。');
  insFaq.run(null, '客服服務時間是？',   '客服服務時間為週一至週五 09:00–18:00，假日及例假日不在線，緊急問題請留言，我們將於下一個工作日優先處理。');

  // 達摩 rules
  insRule.run(damoId, '退換貨政策',   '退換貨須於收到商品 7 天內提出申請，商品須保持完整未拆封，請顧客提供訂單號碼聯繫客服。');
  insRule.run(damoId, '促銷活動說明', '若有進行中的促銷活動，主動告知顧客活動內容與截止日期。');

  // 達摩 FAQs
  insFaq.run(damoId, '請問有哪些付款方式？',  '我們提供信用卡、ATM 轉帳、LINE Pay、貨到付款（需另加 $30 手續費）等多種付款方式。');
  insFaq.run(damoId, '請問幾天會到貨？',      '一般訂單於付款成功後 1–3 個工作天出貨，離島地區約 3–5 個工作天，遇例假日順延。');
  insFaq.run(damoId, '可以超商取貨嗎？',      '可以！支援 7-11 及全家超商取貨付款，訂單滿 $1,000 免運費。');
  insFaq.run(damoId, '商品可以退貨嗎？',      '收到商品 7 天內可申請退換貨，商品須完整未拆封，請先聯繫客服提供訂單編號。');
  insFaq.run(damoId, '產品有通過什麼認證嗎？', '達摩本草部分商品已通過衛福部健康食品認證（小綠人標章），詳細請參考各商品頁面。');

  // 毛孩 rules
  insRule.run(maoId, '回覆語氣', '回覆時語氣溫暖活潑，可稱呼寵物為「毛寶貝」，讓飼主感受到品牌用心。');

  // 毛孩 FAQs
  insFaq.run(maoId, '請問幾天會到貨？',    '一般訂單付款後 1–3 個工作天出貨，寵物食品會特別注意包裝安全。');
  insFaq.run(maoId, '產品適合幾歲的寵物？', '各商品適用年齡請參考商品頁面，如有特殊需求歡迎告知毛寶貝狀況，我們為您推薦合適產品。');
}

// ── Brands ────────────────────────────────────────
function getBrands()       { return db.prepare('SELECT * FROM brands ORDER BY category,name').all(); }
function getBrandById(id)  { return db.prepare('SELECT * FROM brands WHERE id=?').get(id); }
function updateBrand(id, d) {
  return db.prepare('UPDATE brands SET has_omnichat=?,has_shopee=?,enabled=? WHERE id=?')
    .run(d.has_omnichat, d.has_shopee, d.enabled, id);
}

// ── Rules ─────────────────────────────────────────
function getRules(brandId)           { return db.prepare('SELECT * FROM rules WHERE brand_id=? AND category IS NULL ORDER BY id').all(brandId); }
function getGlobalRules()            { return db.prepare('SELECT * FROM rules WHERE brand_id IS NULL AND category IS NULL ORDER BY id').all(); }
function getCategoryRules(category)  { return db.prepare('SELECT * FROM rules WHERE brand_id IS NULL AND category=? ORDER BY id').all(category); }
function getEnabledRules(brandId)  {
  const brand   = db.prepare('SELECT * FROM brands WHERE id=?').get(brandId);
  const global  = db.prepare('SELECT content FROM rules WHERE brand_id IS NULL AND category IS NULL AND enabled=1').all();
  const catRule = brand ? db.prepare('SELECT content FROM rules WHERE brand_id IS NULL AND category=? AND enabled=1').all(brand.category) : [];
  const brandR  = db.prepare('SELECT content FROM rules WHERE brand_id=? AND enabled=1').all(brandId);
  return [...global, ...catRule, ...brandR];
}
function addRule(brandId, title, content, category) {
  return db.prepare('INSERT INTO rules (brand_id,category,title,content) VALUES (?,?,?,?)').run(brandId ?? null, category ?? null, title, content);
}
function upsertRule(brandId, category, title, content) {
  const existing = db.prepare('SELECT id FROM rules WHERE brand_id IS ? AND category IS ? AND title=?').get(brandId ?? null, category ?? null, title);
  if (existing) {
    db.prepare('UPDATE rules SET content=?,enabled=1 WHERE id=?').run(content, existing.id);
    return { action: 'updated', id: existing.id };
  }
  const r = db.prepare('INSERT INTO rules (brand_id,category,title,content) VALUES (?,?,?,?)').run(brandId ?? null, category ?? null, title, content);
  return { action: 'inserted', id: r.lastInsertRowid };
}
function updateRule(id, title, content, enabled) {
  return db.prepare('UPDATE rules SET title=?,content=?,enabled=? WHERE id=?').run(title, content, enabled, id);
}
function deleteRule(id) { return db.prepare('DELETE FROM rules WHERE id=?').run(id); }

// ── FAQs ──────────────────────────────────────────
function getFaqs(brandId)           { return db.prepare('SELECT * FROM faqs WHERE brand_id=? AND category IS NULL ORDER BY id').all(brandId); }
function getGlobalFaqs()            { return db.prepare('SELECT * FROM faqs WHERE brand_id IS NULL AND category IS NULL ORDER BY id').all(); }
function getCategoryFaqs(category)  { return db.prepare('SELECT * FROM faqs WHERE brand_id IS NULL AND category=? ORDER BY id').all(category); }
function getEnabledFaqs(brandId)  {
  const brand   = db.prepare('SELECT * FROM brands WHERE id=?').get(brandId);
  const global  = db.prepare('SELECT question,answer FROM faqs WHERE brand_id IS NULL AND category IS NULL AND enabled=1').all();
  const catFaq  = brand ? db.prepare('SELECT question,answer FROM faqs WHERE brand_id IS NULL AND category=? AND enabled=1').all(brand.category) : [];
  const brandF  = db.prepare('SELECT question,answer FROM faqs WHERE brand_id=? AND enabled=1').all(brandId);
  return [...global, ...catFaq, ...brandF];
}
function addFaq(brandId, question, answer, category) {
  return db.prepare('INSERT INTO faqs (brand_id,category,question,answer) VALUES (?,?,?,?)').run(brandId ?? null, category ?? null, question, answer);
}
function upsertFaq(brandId, category, question, answer) {
  const existing = db.prepare('SELECT id FROM faqs WHERE brand_id IS ? AND category IS ? AND question=?').get(brandId ?? null, category ?? null, question);
  if (existing) {
    db.prepare('UPDATE faqs SET answer=?,enabled=1 WHERE id=?').run(answer, existing.id);
    return { action: 'updated', id: existing.id };
  }
  const r = db.prepare('INSERT INTO faqs (brand_id,category,question,answer) VALUES (?,?,?,?)').run(brandId ?? null, category ?? null, question, answer);
  return { action: 'inserted', id: r.lastInsertRowid };
}
function updateFaq(id, question, answer, enabled) {
  return db.prepare('UPDATE faqs SET question=?,answer=?,enabled=? WHERE id=?').run(question, answer, enabled, id);
}
function deleteFaq(id) { return db.prepare('DELETE FROM faqs WHERE id=?').run(id); }

// ── Conversation Logs ─────────────────────────────
function logMessage({ brandId, roomId, platform, role, message }) {
  return db.prepare('INSERT INTO conversation_logs (brand_id,room_id,platform,role,message) VALUES (?,?,?,?,?)')
    .run(brandId ?? null, roomId, platform, role, message);
}
function getLogs({ brandId, limit = 100, offset = 0 } = {}) {
  if (brandId) {
    return db.prepare('SELECT l.*,b.name as brand_name FROM conversation_logs l LEFT JOIN brands b ON l.brand_id=b.id WHERE l.brand_id=? ORDER BY l.id DESC LIMIT ? OFFSET ?').all(brandId, limit, offset);
  }
  return db.prepare('SELECT l.*,b.name as brand_name FROM conversation_logs l LEFT JOIN brands b ON l.brand_id=b.id ORDER BY l.id DESC LIMIT ? OFFSET ?').all(limit, offset);
}
function getLogRooms(brandId) {
  if (brandId) {
    return db.prepare('SELECT room_id, platform, MIN(created_at) as started, MAX(created_at) as last_msg, COUNT(*) as msg_count FROM conversation_logs WHERE brand_id=? GROUP BY room_id ORDER BY last_msg DESC LIMIT 50').all(brandId);
  }
  return db.prepare('SELECT room_id, platform, brand_id, MIN(created_at) as started, MAX(created_at) as last_msg, COUNT(*) as msg_count FROM conversation_logs GROUP BY room_id ORDER BY last_msg DESC LIMIT 50').all();
}
function getRoomMessages(roomId) {
  return db.prepare('SELECT * FROM conversation_logs WHERE room_id=? ORDER BY id').all(roomId);
}

module.exports = {
  getBrands, getBrandById, updateBrand,
  getRules, getGlobalRules, getCategoryRules, getEnabledRules, addRule, upsertRule, updateRule, deleteRule,
  getFaqs, getGlobalFaqs, getCategoryFaqs, getEnabledFaqs, addFaq, upsertFaq, updateFaq, deleteFaq,
  logMessage, getLogs, getLogRooms, getRoomMessages,
};
