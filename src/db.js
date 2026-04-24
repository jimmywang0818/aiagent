'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new Database(path.join(dataDir, 'agent.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS brands (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    has_omnichat INTEGER NOT NULL DEFAULT 0,
    has_shopee   INTEGER NOT NULL DEFAULT 0,
    enabled      INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS rules (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id INTEGER NOT NULL REFERENCES brands(id),
    title    TEXT NOT NULL,
    content  TEXT NOT NULL,
    enabled  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS faqs (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id INTEGER NOT NULL REFERENCES brands(id),
    question TEXT NOT NULL,
    answer   TEXT NOT NULL,
    enabled  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// Seed brands on first run
const brandCount = db.prepare('SELECT COUNT(*) as c FROM brands').get().c;
if (brandCount === 0) {
  const ins = db.prepare('INSERT INTO brands (name, category, has_omnichat, has_shopee) VALUES (?, ?, ?, ?)');
  [
    ['奧沛',   '寵物品牌',     0, 1],
    ['XXS',    '保養品',       0, 1],
    ['大島',   '保健品',       0, 1],
    ['芙木',   '保養品',       0, 1],
    ['御熹堂', '保健品',       0, 1],
    ['PH',     '個人清潔用品', 0, 1],
    ['達摩',   '保健品',       1, 1],
    ['Tryme',  '其他',         0, 1],
    ['毛孩',   '寵物品牌',     1, 1],
    ['優固倍', '寵物品牌',     0, 1],
    ['愛旺斯', '寵物品牌',     0, 1],
  ].forEach(row => ins.run(...row));

  const damoId  = db.prepare("SELECT id FROM brands WHERE name='達摩'").get().id;
  const maoId   = db.prepare("SELECT id FROM brands WHERE name='毛孩'").get().id;

  // 達摩 Rules
  [
    ['回覆語氣',     '回覆時語氣親切有溫度，稱呼顧客為「您」，結尾可加上感謝語。'],
    ['退換貨政策',   '退換貨須於收到商品 7 天內提出申請，商品須保持完整未拆封，請顧客提供訂單號碼聯繫客服處理。'],
    ['促銷活動說明', '若有進行中的促銷活動，主動告知顧客活動內容與截止日期，吸引顧客下單。'],
  ].forEach(([t, c]) => db.prepare('INSERT INTO rules (brand_id,title,content) VALUES (?,?,?)').run(damoId, t, c));

  // 達摩 FAQs
  [
    ['請問有哪些付款方式？',     '我們提供信用卡、ATM 轉帳、LINE Pay、貨到付款（需另加 $30 手續費）等多種付款方式，方便您選擇！'],
    ['請問幾天會到貨？',         '一般訂單於付款成功後 1–3 個工作天出貨，離島地區約 3–5 個工作天，遇例假日順延。'],
    ['可以超商取貨嗎？',         '可以！支援 7-11 及全家超商取貨付款，訂單滿 $1,000 免運費。'],
    ['商品可以退貨嗎？',         '收到商品 7 天內可申請退換貨，商品須完整未拆封。請先聯繫客服並提供訂單編號，我們會協助您處理。'],
    ['產品有通過什麼認證嗎？',   '達摩本草部分商品已通過衛福部健康食品認證（小綠人標章），詳細資訊請參考各商品頁面說明。'],
  ].forEach(([q, a]) => db.prepare('INSERT INTO faqs (brand_id,question,answer) VALUES (?,?,?)').run(damoId, q, a));

  // 毛孩 Rules
  db.prepare('INSERT INTO rules (brand_id,title,content) VALUES (?,?,?)').run(
    maoId, '回覆語氣', '回覆時語氣溫暖活潑，可適時稱呼毛小孩為「毛寶貝」，讓飼主感受到品牌的用心。'
  );

  // 毛孩 FAQs
  [
    ['請問幾天會到貨？',   '一般訂單付款後 1–3 個工作天出貨，寵物食品會特別注意包裝安全，確保產品完好送達。'],
    ['產品適合幾歲的寵物？', '各商品適用年齡請參考商品頁面說明，若有特殊需求或疑問，歡迎告知您家毛寶貝的年齡與狀況，我們會為您推薦合適的產品。'],
  ].forEach(([q, a]) => db.prepare('INSERT INTO faqs (brand_id,question,answer) VALUES (?,?,?)').run(maoId, q, a));
}

// ── Brands ────────────────────────────────────────
function getBrands()            { return db.prepare('SELECT * FROM brands ORDER BY category, name').all(); }
function getBrandById(id)       { return db.prepare('SELECT * FROM brands WHERE id=?').get(id); }
function updateBrand(id, data)  {
  return db.prepare('UPDATE brands SET has_omnichat=?,has_shopee=?,enabled=? WHERE id=?')
    .run(data.has_omnichat, data.has_shopee, data.enabled, id);
}

// ── Rules ─────────────────────────────────────────
function getRules(brandId)        { return db.prepare('SELECT * FROM rules WHERE brand_id=? ORDER BY id').all(brandId); }
function getEnabledRules(brandId) { return db.prepare('SELECT content FROM rules WHERE brand_id=? AND enabled=1 ORDER BY id').all(brandId); }
function addRule(brandId, title, content) {
  return db.prepare('INSERT INTO rules (brand_id,title,content) VALUES (?,?,?)').run(brandId, title, content);
}
function updateRule(id, title, content, enabled) {
  return db.prepare('UPDATE rules SET title=?,content=?,enabled=? WHERE id=?').run(title, content, enabled, id);
}
function deleteRule(id) { return db.prepare('DELETE FROM rules WHERE id=?').run(id); }

// ── FAQs ──────────────────────────────────────────
function getFaqs(brandId)        { return db.prepare('SELECT * FROM faqs WHERE brand_id=? ORDER BY id').all(brandId); }
function getEnabledFaqs(brandId) { return db.prepare('SELECT question,answer FROM faqs WHERE brand_id=? AND enabled=1 ORDER BY id').all(brandId); }
function addFaq(brandId, question, answer) {
  return db.prepare('INSERT INTO faqs (brand_id,question,answer) VALUES (?,?,?)').run(brandId, question, answer);
}
function updateFaq(id, question, answer, enabled) {
  return db.prepare('UPDATE faqs SET question=?,answer=?,enabled=? WHERE id=?').run(question, answer, enabled, id);
}
function deleteFaq(id) { return db.prepare('DELETE FROM faqs WHERE id=?').run(id); }

module.exports = {
  getBrands, getBrandById, updateBrand,
  getRules, getEnabledRules, addRule, updateRule, deleteRule,
  getFaqs, getEnabledFaqs, addFaq, updateFaq, deleteFaq,
};
