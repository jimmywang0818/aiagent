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

// ── Review Templates ──────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS review_templates (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id   TEXT NOT NULL UNIQUE,
    shop          TEXT NOT NULL DEFAULT 'ALL',
    category      TEXT NOT NULL,
    sub_category  TEXT NOT NULL,
    template_text TEXT NOT NULL,
    active        INTEGER NOT NULL DEFAULT 1
  );
`);

const reviewTemplateCount = db.prepare('SELECT COUNT(*) as c FROM review_templates').get().c;
if (reviewTemplateCount === 0) {
  const insT = db.prepare('INSERT INTO review_templates (template_id,shop,category,sub_category,template_text) VALUES (?,?,?,?,?)');
  const TEMPLATES = [
    ['T001','ALL','通用','5星無評論','感謝您給予五星好評！⭐⭐⭐⭐⭐ 您的支持是我們最大的鼓勵，期待未來能再次為您服務，祝您生活愉快！😊'],
    ['T002','ALL','通用','5星無評論','謝謝您的五星肯定！🌟 很高興這次購物體驗能讓您滿意，我們會繼續把關每個環節。祝您使用愉快，期待下次再見！'],
    ['T003','ALL','通用','5星無評論','感謝您給予最高評價！✨ 能獲得您的肯定是我們最大的鼓勵，期待持續為您提供優質的商品與服務。祝您天天順心！'],
    ['T004','ALL','通用','出貨速度快、服務好之類的','非常感謝您給予的五星好評🌟您的推薦與支持對我們來說非常重要，也期待未來能再次為您服務，持續帶來安心、值得信賴的好選擇😊 再次感謝您的鼓勵，祝您健康順心！'],
    ['T005','ALL','通用','出貨速度快、服務好之類的','非常感謝您的五星好評！🚚 很高興產品能快速平安地送到您手中。我們一直致力於提供最高效的出貨流程與親切的服務，看到您的肯定我們感到非常有動力。期待下次能再為您服務！祝您順心。'],
    ['T006','ALL','通用','出貨速度快、服務好之類的','您好！謝謝您的好評與鼓勵。✨ 很高興您對我們的服務與物流速度感到滿意。您的支持是我們持續進步的動力，我們會繼續努力把關每一個服務細節。祝您健康愉快，期待您的再次蒞臨！'],
    ['T007','ALL','通用','包裝完整','您好！謝謝您的好評與鼓勵。✨ 很高興您對我們的服務與包裝感到滿意。您的支持是我們持續進步的動力，我們會繼續努力把關每一個服務細節。祝您健康愉快，期待您的再次蒞臨！'],
    ['T008','ALL','通用','包裝完整','謝謝您的肯定！📦 很高興產品能平安送到您手中。我們非常重視包裝的細節，就是希望每位顧客收到的當下都能感到安心。期待下次再為您服務！'],
    ['T009','ALL','通用','包裝完整','您好！感謝您的五星好評。✨ 看到您對包裝感到滿意，小編也很開心。我們會持續維持高品質的服務與出貨水準。祝您使用順利，健康愉快！'],
    ['T010','ALL','通用','有部分建議','感謝您的分享與寶貴建議！📝 針對您提到的細節，我們會列入內部優化清單中。您的回饋是我們進步的養分，希望能持續提供更貼近您需求的服務。祝您順心。'],
    ['T011','ALL','通用','有部分建議','謝謝您的五星好評及真實回饋！✨ 我們非常重視每一位使用者的心聲。關於您的建議，我們會與團隊溝通討論優化。期待下次能為您帶來更完美的體驗！'],
    ['T012','ALL','通用','肯定產品','非常感謝您給予五星好評與用心分享 ⭐ 很開心看到您選擇這款產品作為日常保養的好選擇，也謝謝您對產品品質與整體體驗的認可。能獲得您的支持與推薦，是我們持續堅持原料與製程把關的重要動力。我們會持續維持穩定的服務品質，讓每一次購買都能安心又放心 😊 祝您保養順心、天天美好！'],
    ['T013','ALL','通用','肯定產品','感謝您的好評！💎 很高興這款產品能符合您的期待。我們在成份與配方上下了許多功夫，就是為了帶給每位使用者最棒的體驗。您的肯定讓我們深感自豪，期待繼續守護您的日常。'],
    ['T014','ALL','通用','肯定產品','您好！謝謝您的用心評價。✨ 看到您對產品品質感到滿意，我們也感到非常開心！我們會繼續堅持高標準的生產細節，不負您的信賴。祝您天天保持最佳狀態，精彩每一天！'],
    ['T015','ALL','通用','喜歡行銷活動、贈品活動，點數兌換活動','非常感謝您給予的五星好評🌟 很高興您在這次在活動期間補貨，也感謝您對商品的肯定與支持。期待未來能再次為您服務，持續帶來安心、值得信賴的好選擇😊 再次感謝您的鼓勵，祝您健康順心'],
    ['T016','ALL','通用','喜歡行銷活動、贈品活動，點數兌換活動','感謝您的好評與對活動的支持！🎁 很高興您能在這次活動中入手心儀商品。我們會不定期推出驚喜活動來回饋大家，記得關注我們才不會漏掉福利喔！祝您購物愉快，健康順心。'],
    ['T017','ALL','通用','喜歡行銷活動、贈品活動，點數兌換活動','您好，謝謝您的五星肯定！✨ 看到您滿意這次的活動，我們也很開心。希望能透過多樣化的活動讓大家在保養的同時也能享有樂趣與優惠。期待下次活動再見到您！祝您生活充滿小確幸。'],
    ['T018','ALL','保健品','5星無評論','謝謝您給我們五顆星支持 ⭐⭐⭐⭐⭐ 感謝您的信任與支持，未來我們也會持續把關品質，陪伴您在不同階段好好照顧自己 😊 祝您天天順心！'],
    ['T019','ALL','保健品','5星無評論','親愛的顧客您好：非常感謝您的五星好評與支持！🥰 若保養期間有任何產品使用上的疑問，或是想分享您的食用心得，都歡迎隨時找我們聊聊喔！✨ 期待未來能持續為您服務，祝您每天都順心愉快、活力滿滿！🧡'],
    ['T020','ALL','保健品','5星無評論','感謝您的五星肯定！🌟 我們會繼續秉持專業，為您的健康把關。祝您身心健康，每一天都充滿活力！'],
    ['T021','ALL','保健品','回購顧客','非常感謝您給予的五星好評🌟 很開心您願意長期選擇這款產品作為日常營養補充。能被您視為值得持續選擇的好商品，對我們來說是很大的鼓勵😍 再次感謝您的支持，祝您健康順心！'],
    ['T022','ALL','保健品','回購顧客','非常感謝您給予的五星好評🌟 能夠多年來一直陪伴在您的日常選擇中。對我們來說真的非常感動。很開心這款產品能成為您生活裡穩定、安心的營養補充夥伴，這也是我們持續用心把關品買的最大動力。謝謝您的信任與支持，未來我們也會持續努力，陪您把每一天都照顧好，祝您天天順心！'],
    ['T023','ALL','保健品','回購顧客','感謝老客戶的回購支持！💖 謝謝您對品牌長期的信任，我們會持續守護這份信任，維持最高標準的產品質量。您的滿意就是我們最大的動力，期待下一次為您服務！'],
    ['T024','ALL','保健品','吃了有用','非常感謝您給予的五星好評🌟 很開心看到您分享持續補充後，對整體感受有正向的變化，能陪伴您維持良好的保養狀態，對我們來說是很大的鼓勵。我們會持續把關品質與服務，陪伴大家安心做好每日保養。再次感謝您的支持，祝您健康順心！'],
    ['T025','ALL','保健品','吃了有用','謝謝您的五星好評！🎉 聽到產品對您有幫助，這是我們最開心的事。保健食品的效果會隨時間顯現，建議您可以持續穩定地補充，維持身體的最佳狀態。我們會繼續加油，期待看到您更好的分享！'],
    ['T026','ALL','保健品','吃了有用','您好，感謝您的熱情回饋！🌟 很高興產品讓您感到滿意。能成為您健康路上的夥伴是我們的榮幸，我們會繼續堅持高品質，讓您每天都吃得安心有感。祝您活力十足，事事順心！'],
    ['T027','ALL','保健品','剛吃不確定效果','非常感謝您給予的五星好評🌟 很開心您選擇這款產品作為日常營養補充的選擇。能被您視為值得嘗試、願意持續關注的產品，對我們來說是非常大的鼓勵。後續若有任何使用上的心得或需要協助的地方，歡迎隨時與我們聯繫😊 再次感謝您的支持與信任，祝您一切順心！'],
    ['T028','ALL','保健品','剛吃不確定效果','感謝您的五星支持！✨ 保健食品的作用是溫和且持續的，建議您可以先依照建議用量服用一段時間（約2-3個月）來觀察身體的細微變化。過程中若有任何想了解的，歡迎隨時私訊小編唷。加油！'],
    ['T029','ALL','保健品','剛吃不確定效果','謝謝您的好評與鼓勵！💪 每個人的體質吸收速度不同，建議您先放心地持續補充，讓營養在體內逐步累積。我們會陪伴您一起觀察效果，也歡迎隨時分享您的初期感受喔。祝您保養順心！'],
    ['T030','ALL','保健品','*魚油通用(小顆)','非常感謝您給予五星好評與回饋 ⭐\n 很開心您肯定我們的包裝完整度、出貨速度與服務品質，也謝謝您特別提到顆粒小、好吞食的優點，這正是我們在產品設計上，希望能讓日常補充更輕鬆無負擔的重點之一。\n 您的推薦與支持對我們來說非常重要，也期待未來能再次為您服務，持續帶來安心、值得信賴的好選擇 😊\n 再次感謝您的鼓勵，祝您健康順心！'],
    ['T031','ALL','保養品','喜歡養髮液、生髮洗髮精等洗劑的味道','您好，謝謝您的支持！✨ 很高興您喜歡我們細心調配的味道，希望能成為您保養路上的最佳戰友！💪'],
    ['T032','ALL','保養品','喜歡養髮液、生髮洗髮精等洗劑的味道','感謝您的五星好評！🛁 味道是產品體驗中很重要的一環，很高興我們的香調能獲得您的青睞。希望每次清潔保養都能帶給您好心情。期待您的再次回購！'],
    ['T033','ALL','保養品','喜歡養髮液、生髮洗髮精等洗劑的味道','謝謝您的肯定！✨ 研發過程中我們對香味確實做了多次調整，就是希望洗髮的同時也能放鬆身心。能被您喜歡真的很開心！祝您使用愉快，頭皮健康清爽。'],
    ['T034','ALL','保養品','用了有用（養髮液）','謝謝您的五星好評與支持！⭐⭐⭐⭐⭐很高興您親身感受到它的幫助！希望能成為您保養路上的最佳戰友！💪'],
    ['T035','ALL','保養品','用了有用（養髮液）','感謝您的熱情分享！🎉 看到產品讓您的毛髮健康狀況有所改善，小編真的非常激動。堅持使用是看到成果的關鍵，我們會繼續陪伴您，守護您的自信豐盈！'],
    ['T036','ALL','保養品','用了有用（養髮液）','您的五星肯定對我們來說是最好的動力！✨ 很高興這款產品能對您的狀況有所助益。頭皮保養需要時間與耐心，我們會繼續提供最優質的配方。祝您天天充滿自信光采！'],
    ['T037','ALL','保養品','剛用不確定效果（養髮液）','您好，非常感謝您的五星好評與支持！🥰 看到您對產品的使用效果充滿期待，小編也感到非常開心！✨ 這款產品的成分是經過精心研發的，建議您可以每日穩定使用感受其變化。若後續使用後有任何心得分享，隨時歡迎找我們聊聊喔！祝您每天都散發亮麗光采、順心愉快！🧡'],
    ['T038','ALL','保養品','剛用不確定效果（養髮液）','感謝您的好評支持！💪 髮類保養通常需要一個完整的生長週期（約3-4個月）來觀察變化，建議您先每天早晚穩定使用。我們會一直在此提供諮詢服務，期待之後聽您分享心得喔！'],
    ['T039','ALL','保養品','剛用不確定效果（養髮液）','謝謝您的信任與五星！🌟 剛開始使用時請保持耐心，持之以恆的每日保養非常重要。若在按摩手法或使用量上有任何疑問，歡迎隨時找我們。祝您保養過程愉快，期待您的變化！'],
    ['T040','ALL','保養品','回購顧客（養髮液）','非常感謝您給予的五星好評🌟 很開心您願意長期選擇這款產品作為日常生活使用。能被您視為值得持續選擇的好商品，對我們來說是很大的鼓勵😍 再次感謝您的支持，祝您健康順心！'],
    ['T041','ALL','保養品','回購顧客（養髮液）','歡迎老朋友回購！💖 謝謝您長期對產品的熱愛與信任。頭皮環境的穩定需要持續呵護，很榮幸能成為您日常保養的一部分。我們會持續把關品質，期待下一次再為您服務！'],
    ['T042','ALL','保養品','回購顧客（養髮液）','再次感謝您的五星肯定！✨ 回購就是對產品最大的認可。我們深知您的期待，因此始終堅持不妥協的高標準。希望這份保養能持續帶給您安心與自信。祝您生活愉快！'],
    ['T043','ALL','保養品','回購','感謝您再次回購💖\n 很開心我們的保養品能陪伴您照顧肌膚🥰\n 希望每一次使用都能帶來溫和安心、深層滋潤與修護✨\n 我們會持續用心，守護您的肌膚健康🌿'],
    ['T044','ALL','保養品','回購','謝謝您的回購與信任🙏\n 每一款保養品都經過嚴格配方設計與檢驗，為您提供高效、安心的護膚體驗💧\n 期待持續幫助您改善膚況、維持穩定與健康✨\n 您的支持是我們進步的最大動力🌿'],
    ['T045','ALL','保養品','回購','感謝您的再次回購⭐️ 看到您持續選擇我們的保養品真的很開心🥹 希望每一次保養都能讓肌膚感到舒適、保濕又修護💖 也歡迎隨時分享使用心得，我們很樂意陪伴您一起養出好膚質✨'],
    ['T046','ALL','保養品','包裝','感謝您的回饋🙏\n 很高興收到您的分享，並確認商品包裝完整📦\n 希望每一次使用都能為肌膚帶來溫和保養、深層滋潤與修護✨\n 我們會持續用心，陪伴您的肌膚健康🌿'],
    ['T047','ALL','保養品','包裝','親愛的顧客您好：非常感謝您的五星好評與支持！🥰 很高興商品包裝完整、安全送達📦 每一款保養品都經過嚴格檢驗與精心配方設計💧 期待持續陪伴您的肌膚維持穩定健康，享受安心護膚體驗✨ 若保養期間有任何產品使用上的疑問，或是想分享您的心得，都歡迎隨時找我們聊聊喔！✨ 期待未來能持續為您服務，祝您每天都順心愉快、活力滿滿！🧡'],
    ['T048','ALL','保養品','包裝','感謝您的支持⭐️\n 收到包裝完整的商品讓人很安心🥹\n 希望我們的保養品能持續為您的肌膚帶來舒適、保濕與修護💖\n 也歡迎隨時分享使用心得，我們很樂意陪伴您一起養出好膚質✨'],
    ['T049','ALL','寵物','5星無評論','感謝您給予五星好評！⭐⭐⭐⭐⭐ 能獲得您對毛孩產品的肯定，我們感到非常開心！希望毛孩也喜歡這款商品，祝您與毛孩生活愉快！🐾'],
    ['T050','ALL','寵物','5星無評論','謝謝您的五星支持！🌟 希望我們的產品能讓您的毛孩健康快樂。期待未來能持續為您和您的寶貝服務！🐱🐶'],
    ['T051','ALL','寵物','5星無評論','非常感謝您的五星好評！✨ 知道毛孩的主人滿意，就是我們最大的動力。祝您與毛孩天天開心、健康幸福！🐾'],
    ['T052','ALL','寵物','回購顧客','歡迎老朋友回購！💖 很開心您和毛孩繼續支持我們。您的信任是我們持續提升品質的最大動力，期待繼續陪伴您和毛孩的每一天！🐾'],
    ['T053','ALL','寵物','回購顧客','感謝您的回購！🌟 能持續陪伴您和毛孩，是我們最開心的事。我們會繼續把關每一款產品品質，讓毛孩吃得安心、用得放心！🐶🐱'],
    ['T054','ALL','寵物','回購顧客','再次感謝您的回購支持！✨ 看到您長期信任我們的產品，我們深感榮幸。會持續提供最優質的毛孩商品，祝您和毛孩健康快樂！💖'],
    ['T055','ALL','寵物','肯定產品品質','非常感謝您的五星好評與用心分享！🌟 很高興我們的產品能獲得您和毛孩的認可。我們在原料與品質上嚴格把關，就是為了讓每位毛孩都能安心享用。期待繼續為您服務！🐾'],
    ['T056','ALL','寵物','肯定產品品質','感謝您對產品品質的肯定！✨ 知道毛孩使用後狀況良好，是我們最大的成就感。我們會持續嚴選原料，讓每款產品都值得信賴。祝您與毛孩生活充滿歡樂！🐱🐶'],
    ['T057','ALL','寵物','肯定產品品質','謝謝您的熱情分享！💖 毛孩的健康與快樂是我們研發每款產品的初衷，能獲得您的肯定讓我們充滿動力。期待下次再為您和毛孩服務！🐾'],
    ['T058','ALL','清潔用品','5星無評論','非常感謝您給予五星好評！⭐⭐⭐⭐⭐ 很高興我們的產品能讓您滿意。品質與清潔效果是我們的堅持，期待下次再為您服務！✨'],
    ['T059','ALL','清潔用品','5星無評論','謝謝您的五星支持！🌟 您的肯定讓我們更有動力持續提升產品品質，期待未來能繼續帶給您安心、有效的清潔體驗！😊'],
    ['T060','ALL','清潔用品','5星無評論','感謝您給予最高評價！✨ 我們在成分與配方上嚴格把關，確保每一款產品既有效又安全。祝您使用愉快，期待下次光臨！'],
    ['T061','ALL','清潔用品','清潔效果好','感謝您的五星好評與分享！🌟 很高興產品的清潔效果能符合您的期待，這也是我們持續優化配方的動力。期待下次能再為您服務！✨'],
    ['T062','ALL','清潔用品','清潔效果好','謝謝您的肯定！💪 研發過程中我們在配方上下了許多心思，就是希望帶給每位使用者最有效的清潔體驗。您的滿意是我們最好的回饋！'],
    ['T063','ALL','清潔用品','清潔效果好','非常感謝您的五星評價！✨ 很高興產品讓您感到滿意。我們會持續把關每一款產品的品質與安全性，讓您使用更安心。祝您生活輕鬆愉快！'],
    ['T064','ALL','清潔用品','回購顧客','歡迎老朋友回購！💖 謝謝您長期的支持與信任，您的回購是對我們品質最大的認可。我們會繼續保持高標準，期待下次再為您服務！'],
    ['T065','ALL','清潔用品','回購顧客','感謝您的再次回購！🌟 能持續獲得您的信任，是我們不斷進步的動力。我們會繼續嚴選原料、把關品質，確保每次使用都讓您安心滿意！✨'],
    ['T066','ALL','清潔用品','回購顧客','再次感謝您的回購支持！✨ 您的長期信任是我們最大的鼓勵。我們會持續提升產品效果與服務品質，期待繼續陪伴您的每一天！😊'],
    // ── 4星無評論 ─────────────────────────────────────
    ['T067','ALL','通用','4星無評論','感謝您給予四星評價！⭐⭐⭐⭐ 很高興這次購物體驗讓您滿意。若有任何可以改進的地方，歡迎隨時告訴我們，期待下次能為您帶來更完美的體驗！😊'],
    ['T068','ALL','通用','4星無評論','謝謝您的四星支持！🌟 您的肯定是我們前進的動力。若這次體驗有任何未盡完美之處，煩請告知，我們會積極改善。期待下次能提供更棒的服務！✨'],
    ['T069','ALL','保健品','4星無評論','感謝您給予四星評價！⭐⭐⭐⭐ 很開心您選擇了我們的保健商品！若您在使用過程中有任何疑問或建議，歡迎隨時告訴我們。祝您健康順心，期待未來持續為您服務！😊'],
    ['T070','ALL','保健品','4星無評論','謝謝您的四星支持！🌟 保健品的效果需要時間慢慢累積，若您有任何想法或建議，我們非常樂意聆聽。期待之後能看到您更好的分享！祝您每天健康愉快！✨'],
    ['T071','ALL','保養品','4星無評論','感謝您給予四星評價！⭐⭐⭐⭐ 很高興您願意選擇我們的保養品！若使用過程中有任何建議或疑問，歡迎告訴我們，我們很樂意改進。期待能提供更好的保養體驗！🌿'],
    ['T072','ALL','寵物','4星無評論','感謝您給予四星評價！⭐⭐⭐⭐ 希望毛孩也喜歡這次的商品 🐾 若有任何可以改進的地方，歡迎隨時告訴我們！祝您和毛孩生活愉快！'],
    // ── 3星無評論 ─────────────────────────────────────
    ['T073','ALL','通用','3星無評論','感謝您給予三星評價。🙏 我們非常重視每位顧客的體驗，若這次有任何讓您不滿意的地方，歡迎告訴我們，我們一定積極改善。期待有機會為您帶來更好的服務！'],
    ['T074','ALL','通用','3星無評論','謝謝您的評價！🙏 三星代表您對我們仍有期待，我們非常想了解有哪些地方需要改進。如方便的話，歡迎分享您的想法，我們會虛心接受並努力進步！'],
    ['T075','ALL','保健品','3星無評論','感謝您給予三星評價。🙏 我們很重視您的購物體驗，若產品或服務有任何不符期待之處，歡迎隨時告訴我們。您的回饋是我們進步最重要的動力，祝您健康順心！'],
    ['T076','ALL','保養品','3星無評論','感謝您的評價！🙏 我們非常希望每位顧客都能對我們的保養品感到滿意。若這次體驗有任何需要改進的地方，歡迎告訴我們。期待能為您帶來更好的保養體驗！🌿'],
    // ══ 寵物食品及用品模板（資料來源：彙總表-寵物食品及用品.html）══
    // ── 一、通用回覆 ──
    ['T077','ALL','寵物','5星無評論','謝謝您的五星好評❤️\n很高興有機會為您的毛孩服務，您的肯定是我們持續把關品質的最大動力。也期待未來能繼續陪伴毛寶貝健康成長，一起守護每一天的幸福😊'],
    ['T078','ALL','寵物','5星無評論','感謝您給予的五顆星支持⭐⭐⭐⭐⭐\n看到您滿意我們的商品真的很開心！若日後有任何使用心得或想分享毛孩的狀況，都歡迎隨時找我們聊聊，期待下次再為您服務～'],
    ['T079','ALL','寵物','5星無評論','謝謝您的好評支持🐾\n每一個五星對我們來說都是滿滿的鼓勵，我們會持續用最嚴謹的態度為毛孩把關，希望成為您和毛寶貝長期安心的選擇。祝您和毛孩天天健康快樂！'],
    ['T080','ALL','寵物','3星無評論','謝謝您的回饋😊\n若產品使用上有任何不清楚或需要改進的地方，非常歡迎您透過「聊聊」私訊我們，讓我們有機會為您服務、改善不足之處。期待能帶給您和毛孩更好的體驗！'],
    ['T081','ALL','寵物','3星無評論','感謝您的評價🧡\n想了解是否產品在運送或使用上有什麼我們可以優化的地方呢？您的意見對我們非常重要，歡迎隨時與我們聯繫，我們一定會竭誠為您處理。'],
    ['T082','ALL','寵物','3星無評論','謝謝您的支持🙏\n如果使用過程中遇到任何問題，或有希望我們改進的地方，都歡迎隨時告訴我們。我們會將您的意見列入改善參考，持續努力提供更貼近毛爸媽需求的服務！'],
    ['T083','ALL','寵物','快速到貨、出貨速度快','謝謝您的好評與鼓勵🚚\n很高興商品能快速平安送到您手中。我們一直致力於提供最有效率的出貨流程，看到您的肯定讓我們非常有動力，期待下次再為您和毛孩服務！'],
    ['T084','ALL','寵物','快速到貨、出貨速度快','謝謝您的推薦與好評❤️\n出貨速度快是一定要的！最重要的是希望我們的產品可以實質幫到您的毛寶貝😊 祝毛孩健康活力滿滿～'],
    ['T085','ALL','寵物','快速到貨、出貨速度快','感謝您的五星肯定✨\n快速出貨是對毛爸媽最基本的誠意，也謝謝您給予我們物流效率的認可。我們會持續維持高效且細心的服務，讓您每次購物都安心又放心！'],
    ['T086','ALL','寵物','包裝完整','謝謝您的肯定📦\n很高興產品能平安完整送到您手中。我們非常重視包裝的每個細節，就是希望每位毛爸媽收到當下都能感到安心。期待下次再為您和毛孩服務！'],
    ['T087','ALL','寵物','包裝完整','感謝您的五星好評✨\n看到您對包裝感到滿意，小編也非常開心。我們會持續維持穩定的出貨水準，讓每份商品都以最完整的狀態送到您和毛寶貝身邊🐾'],
    ['T088','ALL','寵物','包裝完整','謝謝您的好評❤️\n包裝完整是我們最在意的細節之一，畢竟裡面承載的是毛孩的健康與幸福。很高興我們把這份用心傳遞到您手中，祝您和毛孩生活愉快！'],
    ['T089','ALL','寵物','CP值高、商品品質好','謝謝您的推薦與好評❤️\nCP值高、商品品質優良是一定要的！我們在成分與配方上下了不少功夫，就是希望提供最實在的選擇。最重要的是希望我們的產品可以實質幫到您的毛孩😊'],
    ['T090','ALL','寵物','CP值高、商品品質好','感謝您的肯定💎\n我們一直堅持「把預算花在真正重要的地方」——讓好成分進入毛孩的身體，而不是用在過度包裝上。很開心您感受到這份用心，祝毛寶貝越來越健康！'],
    ['T091','ALL','寵物','CP值高、商品品質好','謝謝您的五星好評⭐\n看到您認可我們產品的價值，真的是最大的鼓勵。我們會持續堅持高標準的原料與製程，讓每一份都物超所值，陪伴毛孩長期健康。'],
    ['T092','ALL','寵物','稱讚客服','謝謝您對客服的稱讚❤️\n讓毛孩可以健康食用與使用、讓家長安心是我們最在意的！期待產品也可以實質幫到你們，任何問題都歡迎隨時找我們😊'],
    ['T093','ALL','寵物','稱讚客服','感謝您對我們客服團隊的肯定🧡\n能為每一位毛爸媽解決疑問、提供貼心服務，是我們最有成就感的事。若未來有任何需求，歡迎隨時再來找我們！'],
    ['T094','ALL','寵物','稱讚客服','謝謝您溫暖的好評✨\n客服的目標就是陪伴毛爸媽在照顧毛孩的路上不再孤單。很開心我們有幫到您，也期待未來繼續為您和毛寶貝服務！'],
    ['T095','ALL','寵物','有部分建議','謝謝您寶貴的建議❤️\n您的回饋我們會轉達給相關部門，作為持續優化產品與服務的重要參考。再次感謝您的支持，也希望下次能帶給您和毛孩更好的體驗😊'],
    ['T096','ALL','寵物','有部分建議','感謝您的分享與建議📝\n我們會將您提到的細節列入內部優化清單，您的聲音是我們進步的養分。希望能持續提供更貼近毛爸媽需求的服務，期待下次再為您服務！'],
    ['T097','ALL','寵物','有部分建議','謝謝您的好評及真實回饋✨\n我們非常重視每一位毛爸媽的心聲，關於您的建議會與團隊討論、研議可行的改善方向。再次感謝您讓品牌變得更好！'],
    ['T098','ALL','寵物','成分透明','成分透明標示清楚是必須的💪\n我們所有商品皆通過嚴格檢驗，從來源、配方到製程都力求讓毛爸媽看得明白、用得安心。希望產品也可以實質幫到您和毛孩😊'],
    ['T099','ALL','寵物','成分透明','謝謝您的好評❤️\n我們深信「好產品禁得起檢視」，所以堅持透明標示、無隱藏添加。能獲得您對成分的認可，是我們堅持下去的動力，祝毛寶貝健康快樂！'],
    ['T100','ALL','寵物','成分透明','感謝您用心的回饋✨\n毛孩不會說話，所以毛爸媽幫他們把關的第一步就是看成分。我們會持續堅持這份透明與誠實，讓您每一次選擇都無後顧之憂🐾'],
    ['T101','ALL','寵物','喜歡行銷活動、贈品、點數兌換','非常感謝您給予的五星好評🌟\n很高興您在這次活動期間入手心儀商品，也感謝您對品牌的肯定與支持。我們會不定期推出優惠與驚喜活動來回饋大家，記得多多關注才不會錯過唷！'],
    ['T102','ALL','寵物','喜歡行銷活動、贈品、點數兌換','謝謝您的好評與支持🎁\n能讓您開心地享受優惠，我們也覺得很開心！小編會持續與團隊規劃更多有趣的活動與贈品，陪伴毛爸媽在照顧毛孩的路上獲得更多小確幸😊'],
    ['T103','ALL','寵物','喜歡行銷活動、贈品、點數兌換','感謝您對活動的肯定與五星好評✨\n贈品與活動是我們對長期支持者的心意，希望每次都能帶給大家一點額外的驚喜。也期待下次活動再見到您和毛寶貝！'],
    // ── 二、保健食品共通 ──
    ['T104','ALL','寵物','回購顧客（保健食品）','謝謝您的回購支持與好評❤️\n能成為您和毛孩長期信賴的選擇，是我們莫大的榮幸。我們會持續把關品質，陪伴毛寶貝在每個階段都吃得安心、活得健康，期待繼續為你們服務😊'],
    ['T105','ALL','寵物','回購顧客（保健食品）','感謝老客戶的回購支持💖\n您對品牌長期的信任，是我們最珍惜的動力。會繼續維持最高標準的產品品質與服務，讓每一次購買都值得。祝毛孩健康茁壯！'],
    ['T106','ALL','寵物','回購顧客（保健食品）','謝謝您再次選擇我們❤️\n回購代表的是最真實的肯定，我們深知這份信任得之不易，會繼續用心守護每份訂單、每隻毛寶貝。期待陪你們走過更多精彩的日常！'],
    ['T107','ALL','寵物','剛開始使用、不確定效果','謝謝您的信任與五星好評🌟\n保健食品的作用是溫和且循序漸進的，建議您先依建議劑量穩定補充一段時間，再觀察毛孩的細微變化。過程中若有任何疑問，歡迎隨時私訊小編，我們會陪伴您一起調整😊'],
    ['T108','ALL','寵物','剛開始使用、不確定效果','感謝您的好評與鼓勵💪\n每個毛孩的體質與吸收速度不同，建議先安心地持續餵食，讓營養在體內逐步累積。若您願意分享毛寶貝的初期狀況，我們也很樂意提供更貼近的建議，祝保養順心！'],
    ['T109','ALL','寵物','剛開始使用、不確定效果','謝謝您的支持❤️\n剛開始使用階段，建議維持定時定量，並搭配充足飲水與日常飲食。我們相信持續的陪伴才能帶來真正的改變，期待之後聽您分享毛孩的進步🐾'],
    ['T110','ALL','寵物','吃了有效、改善明顯','哇～好感人的改善！！😭\n謝謝您願意分享這份喜悅，讓更多有相同困擾的毛爸媽也能看到希望。能成為您和毛孩健康路上的夥伴，是我們最大的成就感，會繼續加油守護大家😊'],
    ['T111','ALL','寵物','吃了有效、改善明顯','謝謝您的熱情回饋❤️\n看到毛寶貝有正向變化，小編非常替你開心！堅持穩定補充是看到成果的關鍵，我們會繼續陪伴您，守護毛孩的健康與活力💪'],
    ['T112','ALL','寵物','吃了有效、改善明顯','感謝您的五星肯定與詳細分享✨\n毛孩不會說話，但身體的變化就是最真實的回饋。您的心得對其他毛爸媽來說是非常珍貴的參考，也謝謝您對品牌的信任，祝毛寶貝健康長壽！'],
    ['T113','ALL','寵物','吃了沒用、覺得沒效','您好，謝謝您的回饋😊\n保健食品無添加藥物，屬於溫和型日常保養，需透過持續補充讓營養在體內累積，效果不會像藥物一樣立即出現。建議可再觀察一段時間，若仍覺得不明顯，歡迎透過「聊聊」私訊我們，客服會依毛孩狀況提供更合適的補充建議～'],
    ['T114','ALL','寵物','吃了沒用、覺得沒效','感謝您的真實分享🌿\n每隻毛孩的體質吸收速度不同，保健食品通常需要3-6個月的「營養累積期」才會逐漸顯現變化。建議先維持定時定量，並搭配適當飲水與均衡飲食。若有搭配上的疑問，歡迎隨時找我們討論！'],
    ['T115','ALL','寵物','吃多久有效','會建議連續補充3-6個月\n才較能從根本觀察到毛孩的體質變化與維持狀況。使用上有任何問題隨時可以跟我們說，我們一起讓毛孩變得更健康茁壯💪'],
    ['T116','ALL','寵物','吃多久有效','保健食品會建議吃3-6個月\n讓營養素在體內穩定累積，才能從根本改善體質。過程中有任何疑問，歡迎隨時透過「聊聊」聯繫我們😊'],
    ['T117','ALL','寵物','吃多久有效','建議至少連續補充3個月以上\n有些毛孩會在1-2個月感受到變化，有些則需要更長時間。保健食品講究的是「陪伴」，穩定補充才能帶來穩定的改變。一起加油吧🐾'],
    ['T118','ALL','寵物','毛孩不吃、不賞臉','QQ希望毛孩可以多賞臉～\n您可以嘗試將產品與乾飼料、罐頭、鮮食或常溫水一起混合餵食（鮮食請控制在40度以下）。若搭配水餵食，建議1小時內讓毛孩喝完，避免天氣悶熱造成變質😊'],
    ['T119','ALL','寵物','毛孩不吃、不賞臉','辛苦毛爸媽了🥺\n每隻毛孩的喜好不同，可以試試將產品壓碎混入罐頭、肉泥或牠最愛的食物中，通常能大幅提升接受度。若嘗試多種方式仍不願意食用，歡迎私訊我們，協助您找到更適合的餵食方法！'],
    ['T120','ALL','寵物','毛孩不吃、不賞臉','謝謝您的回饋🐾\n毛孩剛接觸新產品時，可以從少量開始、漸進式增加，讓牠慢慢適應味道與口感。也建議固定時間、固定位置餵食，建立習慣後通常會更順利。若有任何困擾都歡迎隨時聯繫我們～'],
    ['T121','ALL','寵物','適口性好','兼顧有效與適口性是我們最堅持的目標！\n我們的產品都經過適口性測試，回饋都很好～希望產品也可以繼續幫到您和毛孩😊'],
    ['T122','ALL','寵物','適口性好','謝謝您的好評！也謝謝毛孩賞臉❤️\n我們在不添加化學調味劑的前提下，努力維持最好的適口性，畢竟毛寶貝願意吃下肚，才是保健的第一步💪'],
    ['T123','ALL','寵物','適口性好','感謝您的分享✨\n適口性是保健食品能否長期餵食的關鍵，我們在配方與質地設計上都下了不少功夫。很開心毛孩願意主動吃，讓毛爸媽餵食更輕鬆！祝毛寶貝天天元氣十足～'],
    // ── 三、寵物食品 ──
    ['T124','ALL','寵物','飼料（貓糧、犬糧）','謝謝您的信任嘗試與好評❤️\n我們的飼料符合AAFCO與FEDIAF的營養規範，嚴選優質肉品來源，含有毛寶貝所需的高蛋白、維生素與礦物質，希望能全方位滿足毛孩的身體需求😊'],
    ['T125','ALL','寵物','飼料（貓糧、犬糧）','感謝您的回購支持💪\n飼料是毛孩每日主要的營養來源，我們在原料挑選、營養比例與適口性上都嚴格把關，就是希望牠吃得開心、養得健康。祝毛寶貝毛色亮麗、活力滿滿！'],
    ['T126','ALL','寵物','飼料（貓糧、犬糧）','謝謝您的好評與分享✨\n看到毛孩對飼料的接受度很好，真的是最棒的回饋。均衡營養＋高適口性一直是我們對主食的堅持，會繼續為毛爸媽把關好每一餐🐾'],
    ['T127','ALL','寵物','肉泥、滴雞精','謝謝您的信任嘗試與好評❤️\n我們的保健肉泥堅持「0膠類、0化學誘食劑、0防腐劑」，完全回歸食材本味，特別添加人食用級的滴雞精，希望毛寶貝享受美味點心的同時也能健康無負擔！'],
    ['T128','ALL','寵物','肉泥、滴雞精','感謝您的好評🧡\n很多毛爸媽會把這款肉泥當作毛孩「不愛喝水」或「需要餵藥」時的最佳神隊友，能實質幫助減輕照顧負擔，是我們最開心的事。祝毛寶貝健康快樂每一天！'],
    ['T129','ALL','寵物','肉泥、滴雞精','謝謝您的推薦與分享✨\n肉泥不只是零食，更是毛孩補水、補營養、建立信任感的好幫手。我們會繼續用心研發更多天然美味的選擇，讓您和毛寶貝的日常更豐富～'],
    ['T130','ALL','寵物','凍乾零食','謝謝您的信任嘗試與好評❤️\n我們的100%原型鮮肉凍乾零食使用天然原肉塊，無添加化學調味劑，並結合保健成分，讓毛寶貝吃零食無負擔，還能一起補充健康😊'],
    ['T131','ALL','寵物','凍乾零食','感謝您的好評🐾\n凍乾兼顧了原肉風味與營養保留，是很多毛爸媽信賴的點心選擇。很高興獲得您的肯定，也祝毛孩每天都能享受美味又安心的小確幸！'],
    ['T132','ALL','寵物','凍乾零食','謝謝您的推薦分享✨\n我們堅持使用真食材、不走捷徑，就是希望零食不只是零食，而是毛孩值得的獎勵。祝毛寶貝吃得開心、動得活力💪'],
    ['T133','ALL','寵物','試吃包','謝謝您的好評❤️\n試吃包是認識我們產品最輕鬆的方式，很高興毛孩願意嘗試。若後續有使用上的問題，歡迎隨時透過「聊聊」與我們聯繫，期待未來能繼續為您和毛寶貝服務😊'],
    ['T134','ALL','寵物','試吃包','感謝您願意給我們機會🧡\n試吃包讓毛爸媽可以先評估毛孩的接受度與反應，我們也期待聽到您完整的使用心得。祝毛寶貝健康活力滿滿～'],
    ['T135','ALL','寵物','試吃包','謝謝您的好評與分享✨\n很多毛爸媽都是從試吃包開始，進而成為品牌的長期夥伴。若毛孩有特別喜歡或需要加強的部分，歡迎與我們分享，我們會協助推薦更合適的選擇🐾'],
    // ── 四、寵物用品 ──
    ['T136','ALL','寵物','豆腐砂','謝謝您的信任嘗試與好評❤️\n我們的90%纖維絲蘭豆腐砂通過SGS、Intertek雙檢驗，除臭力業界最長16小時，且獨家高壓技術3倍緊實力，零粉塵、零病菌，希望一起守護貓咪與毛爸媽的健康😊'],
    ['T137','ALL','寵物','豆腐砂','感謝您的回購支持🐾\n豆腐砂兼顧環保、低粉塵與強除臭，是許多貓奴的日常好夥伴。能獲得您的肯定，是我們持續堅持品質的動力，祝貓主子優雅如廁每一天！'],
    ['T138','ALL','寵物','豆腐砂','謝謝您的好評與分享✨\n豆腐砂的每個細節——凝結力、除臭、粉塵——我們都反覆測試與優化。很高興它成為您家貓咪的首選，也會繼續精益求精！'],
    ['T139','ALL','寵物','原味礦砂','謝謝您的信任嘗試與好評❤️\n我們的0甲醛強凝結無塵原礦砂是市售唯一經SGS、Intertek雙檢驗除臭力的礦砂，除臭力業界最長16小時，使用獨家10道除塵工序（而非添加甲醛）來減少粉塵，希望一起守護貓咪與毛爸媽的健康😊'],
    ['T140','ALL','寵物','原味礦砂','感謝您的好評與支持🐾\n礦砂的強凝結力與低粉塵是貓奴最在意的點，我們堅持以天然工序達成，不走添加甲醛的捷徑。很開心獲得您的肯定，祝貓主子天天舒適自在！'],
    ['T141','ALL','寵物','原味礦砂','謝謝您的回購與分享✨\n貓砂雖然是消耗品，但對貓咪健康與居家環境的影響非常大。能被您長期信賴，是我們堅持好原料與好工藝的最大動力！'],
    ['T142','ALL','寵物','貓砂失真空','謝謝您的回饋😊\n貓砂出廠時都是真空狀態，主要是為了減少配送過程擠壓與節省運送空間。失真空可能是運送過程中碰撞導致洩壓，不影響貓砂的正常使用品質，可安心使用唷～'],
  ];
  const seedTemplates = db.transaction(() => { TEMPLATES.forEach(r => insT.run(...r)); });
  seedTemplates();
}

function getReviewTemplates(templateCategory) {
  if (templateCategory) {
    return db.prepare("SELECT * FROM review_templates WHERE active=1 AND (category='通用' OR category=?) ORDER BY template_id").all(templateCategory);
  }
  return db.prepare("SELECT * FROM review_templates WHERE active=1 AND category='通用' ORDER BY template_id").all();
}

function getAllReviewTemplates() {
  return db.prepare('SELECT * FROM review_templates ORDER BY category, template_id').all();
}

function updateReviewTemplateText(id, templateText) {
  return db.prepare('UPDATE review_templates SET template_text=? WHERE id=?').run(templateText, id);
}

function getReviewTemplateById(id) {
  return db.prepare('SELECT * FROM review_templates WHERE id=?').get(id);
}

function toggleReviewTemplate(id, active) {
  return db.prepare('UPDATE review_templates SET active=? WHERE id=?').run(active ? 1 : 0, id);
}

function getNextTemplateId() {
  // Find the highest numeric T### id and return the next one
  const row = db.prepare(
    "SELECT template_id FROM review_templates WHERE template_id GLOB 'T[0-9]*' ORDER BY LENGTH(template_id) DESC, template_id DESC LIMIT 1"
  ).get();
  if (!row) return 'T001';
  const num = parseInt(row.template_id.replace(/^T0*/, ''), 10) || 0;
  return 'T' + String(num + 1).padStart(3, '0');
}

function addReviewTemplate({ category, sub_category, template_text, shop = 'ALL' }) {
  const template_id = getNextTemplateId();
  const r = db.prepare(
    'INSERT INTO review_templates (template_id,shop,category,sub_category,template_text) VALUES (?,?,?,?,?)'
  ).run(template_id, shop, category, sub_category, template_text);
  return { id: r.lastInsertRowid, template_id };
}

function deleteReviewTemplate(id) {
  return db.prepare('DELETE FROM review_templates WHERE id=?').run(id);
}

function updateReviewTemplateFull(id, { category, sub_category, template_text }) {
  return db.prepare(
    'UPDATE review_templates SET category=?,sub_category=?,template_text=? WHERE id=?'
  ).run(category, sub_category, template_text, id);
}

// ── Product Info Knowledge Base ───────────────────
// Migration: if old schema (has 'sku' col but not 'product_code'), rename and recreate
{
  const piCols = db.prepare(`PRAGMA table_info(product_info)`).all().map(c => c.name);
  if (piCols.length > 0 && piCols.includes('sku') && !piCols.includes('product_code')) {
    console.log('[db] Migrating product_info to new schema…');
    db.exec(`ALTER TABLE product_info RENAME TO product_info_v1_bak`);
  }
  // Add priority col if not present (migration for existing installations)
  if (piCols.length > 0 && !piCols.includes('priority')) {
    console.log('[db] Adding priority column to product_info…');
    db.exec(`ALTER TABLE product_info ADD COLUMN priority INTEGER NOT NULL DEFAULT 999`);
  }
  // Add lab_report_url col if not present
  if (piCols.length > 0 && !piCols.includes('lab_report_url')) {
    console.log('[db] Adding lab_report_url column to product_info…');
    db.exec(`ALTER TABLE product_info ADD COLUMN lab_report_url TEXT`);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS product_info (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id          INTEGER REFERENCES brands(id),
    product_code      TEXT,
    product_name      TEXT NOT NULL,
    product_url       TEXT,
    dosage_form       TEXT,
    spec              TEXT,
    shelf_life        TEXT,
    origin            TEXT,
    dietary           TEXT,
    price             TEXT,
    key_ingredients   TEXT,
    all_ingredients   TEXT,
    nutrition         TEXT,
    certifications    TEXT,
    precautions       TEXT,
    usage_method      TEXT,
    target_groups     TEXT,
    supplement_timing TEXT,
    marketing_copy    TEXT,
    keywords          TEXT,
    faq_public        TEXT,
    faq_internal      TEXT,
    notes             TEXT,
    lab_report_url    TEXT,
    priority          INTEGER NOT NULL DEFAULT 999,
    active            INTEGER NOT NULL DEFAULT 1,
    created_at        TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
  );
`);

// Clean up migration backup if it exists
try { db.exec(`DROP TABLE IF EXISTS product_info_v1_bak`); } catch (_) {}

function getProductInfoList({ brandId } = {}) {
  if (brandId) {
    return db.prepare(
      'SELECT p.*,b.name as brand_name FROM product_info p LEFT JOIN brands b ON p.brand_id=b.id WHERE p.brand_id=? ORDER BY p.priority ASC, p.product_name'
    ).all(brandId);
  }
  return db.prepare(
    'SELECT p.*,b.name as brand_name FROM product_info p LEFT JOIN brands b ON p.brand_id=b.id ORDER BY p.priority ASC, p.product_name'
  ).all();
}

function getProductInfoById(id) {
  return db.prepare('SELECT * FROM product_info WHERE id=?').get(id);
}

function searchProductInfo(keyword) {
  const kw = `%${keyword}%`;
  return db.prepare(`
    SELECT * FROM product_info WHERE active=1 AND (
      product_name      LIKE ? OR
      product_code      LIKE ? OR
      key_ingredients   LIKE ? OR
      all_ingredients   LIKE ? OR
      nutrition         LIKE ? OR
      certifications    LIKE ? OR
      precautions       LIKE ? OR
      target_groups     LIKE ? OR
      keywords          LIKE ? OR
      notes             LIKE ?
    ) ORDER BY priority ASC, product_name
  `).all(kw, kw, kw, kw, kw, kw, kw, kw, kw, kw);
}

function upsertProductInfo(d) {
  const bId = d.brand_id ? parseInt(d.brand_id) : null;
  const name = (d.product_name || '').trim();
  const existing = db.prepare('SELECT id FROM product_info WHERE brand_id IS ? AND product_name=?').get(bId, name);
  const pri = d.priority != null ? parseInt(d.priority) : 999;
  const vals = [
    d.product_url||null, d.product_code||null, d.dosage_form||null, d.spec||null,
    d.shelf_life||null, d.origin||null, d.dietary||null, d.price||null,
    d.key_ingredients||null, d.all_ingredients||null, d.nutrition||null,
    d.certifications||null, d.precautions||null, d.usage_method||null,
    d.target_groups||null, d.supplement_timing||null, d.marketing_copy||null,
    d.keywords||null, d.faq_public||null, d.faq_internal||null, d.notes||null,
    d.lab_report_url||null, pri,
  ];
  if (existing) {
    db.prepare(`UPDATE product_info SET
      product_url=?,product_code=?,dosage_form=?,spec=?,shelf_life=?,origin=?,dietary=?,price=?,
      key_ingredients=?,all_ingredients=?,nutrition=?,certifications=?,precautions=?,usage_method=?,
      target_groups=?,supplement_timing=?,marketing_copy=?,keywords=?,faq_public=?,faq_internal=?,
      notes=?,lab_report_url=?,priority=?,updated_at=datetime('now','+8 hours') WHERE id=?`
    ).run(...vals, existing.id);
    return { action: 'updated', id: existing.id };
  }
  const r = db.prepare(`INSERT INTO product_info (
    brand_id,product_name,product_url,product_code,dosage_form,spec,shelf_life,origin,dietary,price,
    key_ingredients,all_ingredients,nutrition,certifications,precautions,usage_method,
    target_groups,supplement_timing,marketing_copy,keywords,faq_public,faq_internal,notes,
    lab_report_url,priority
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(bId, name, ...vals);
  return { action: 'inserted', id: r.lastInsertRowid };
}

function updateProductInfo(id, d) {
  return db.prepare(`UPDATE product_info SET
    brand_id=?,product_name=?,product_url=?,product_code=?,dosage_form=?,spec=?,shelf_life=?,
    origin=?,dietary=?,price=?,key_ingredients=?,all_ingredients=?,nutrition=?,certifications=?,
    precautions=?,usage_method=?,target_groups=?,supplement_timing=?,marketing_copy=?,
    keywords=?,faq_public=?,faq_internal=?,notes=?,lab_report_url=?,priority=?,active=?,
    updated_at=datetime('now','+8 hours') WHERE id=?`
  ).run(
    d.brand_id||null, d.product_name, d.product_url||null, d.product_code||null,
    d.dosage_form||null, d.spec||null, d.shelf_life||null, d.origin||null,
    d.dietary||null, d.price||null, d.key_ingredients||null, d.all_ingredients||null,
    d.nutrition||null, d.certifications||null, d.precautions||null, d.usage_method||null,
    d.target_groups||null, d.supplement_timing||null, d.marketing_copy||null,
    d.keywords||null, d.faq_public||null, d.faq_internal||null, d.notes||null,
    d.lab_report_url||null, d.priority ?? 999, d.active ?? 1, id
  );
}

function deleteProductInfo(id) { return db.prepare('DELETE FROM product_info WHERE id=?').run(id); }

// ── Conversation Logs ─────────────────────────────
function logMessage({ brandId, roomId, platform, role, message }) {
  // Store in Taipei time (UTC+8)
  return db.prepare("INSERT INTO conversation_logs (brand_id,room_id,platform,role,message,created_at) VALUES (?,?,?,?,?,datetime('now','+8 hours'))")
    .run(brandId ?? null, roomId, platform, role, message);
}
function getLogs({ brandId, limit = 100, offset = 0 } = {}) {
  if (brandId) {
    return db.prepare('SELECT l.*,b.name as brand_name FROM conversation_logs l LEFT JOIN brands b ON l.brand_id=b.id WHERE l.brand_id=? ORDER BY l.id DESC LIMIT ? OFFSET ?').all(brandId, limit, offset);
  }
  return db.prepare('SELECT l.*,b.name as brand_name FROM conversation_logs l LEFT JOIN brands b ON l.brand_id=b.id ORDER BY l.id DESC LIMIT ? OFFSET ?').all(limit, offset);
}
function getLogRooms({ brandId, platform, search, includeSandbox = false } = {}) {
  const conds = [], params = [];
  // Exclude sandbox test conversations by default
  if (!includeSandbox) { conds.push("l.room_id NOT LIKE 'sandbox-%'"); }
  if (brandId)  { conds.push('l.brand_id=?');       params.push(brandId); }
  if (platform) { conds.push('l.platform=?');        params.push(platform); }
  if (search)   { conds.push('l.room_id LIKE ?');    params.push(`%${search}%`); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  return db.prepare(`
    SELECT l.room_id, l.platform, l.brand_id, b.name as brand_name,
           MIN(l.created_at) as started, MAX(l.created_at) as last_msg, COUNT(*) as msg_count
    FROM conversation_logs l LEFT JOIN brands b ON l.brand_id=b.id
    ${where}
    GROUP BY l.room_id ORDER BY last_msg DESC LIMIT 100
  `).all(...params);
}
function getLogPlatforms() {
  return db.prepare('SELECT DISTINCT platform FROM conversation_logs WHERE platform IS NOT NULL ORDER BY platform').all().map(r => r.platform);
}
function getRoomMessages(roomId) {
  return db.prepare('SELECT * FROM conversation_logs WHERE room_id=? ORDER BY id').all(roomId);
}

module.exports = {
  getBrands, getBrandById, updateBrand,
  getRules, getGlobalRules, getCategoryRules, getEnabledRules, addRule, upsertRule, updateRule, deleteRule,
  getFaqs, getGlobalFaqs, getCategoryFaqs, getEnabledFaqs, addFaq, upsertFaq, updateFaq, deleteFaq,
  getReviewTemplates, getAllReviewTemplates, updateReviewTemplateText, getReviewTemplateById,
  toggleReviewTemplate, getNextTemplateId, addReviewTemplate, deleteReviewTemplate, updateReviewTemplateFull,
  getProductInfoList, getProductInfoById, searchProductInfo, upsertProductInfo, updateProductInfo, deleteProductInfo,
  logMessage, getLogs, getLogRooms, getLogPlatforms, getRoomMessages,
};
