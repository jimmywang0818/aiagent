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
