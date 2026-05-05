'use strict';

/**
 * migrate-subcats.js
 * 1. 將 review_templates 的 sub_category 去掉前置數字（如「2、包裝完整」→「包裝完整」）
 * 2. 順便新增 T067-T076（4星/3星無評論模板），若已存在則跳過
 *
 * 安全重複執行。
 * 用法：node scripts/migrate-subcats.js
 */

require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data', 'agent.db'));

// ── Step 1：重命名現有 sub_category ────────────────
const RENAMES = [
  ['0、5星無評論',                        '5星無評論'],
  ['1、5星無評論',                        '5星無評論'],
  ['1、出貨速度快、服務好之類的',           '出貨速度快、服務好之類的'],
  ['2、包裝完整',                          '包裝完整'],
  ['3、有部分建議',                        '有部分建議'],
  ['4、肯定產品',                          '肯定產品'],
  ['5、喜歡行銷活動、贈品活動，點數兌換活動', '喜歡行銷活動、贈品活動，點數兌換活動'],
  ['2、回購顧客',                          '回購顧客'],
  ['3、吃了有用',                          '吃了有用'],
  ['4、剛吃不確定效果',                    '剛吃不確定效果'],
  ['1、喜歡養髮液、生髮洗髮精等洗劑的味道', '喜歡養髮液、生髮洗髮精等洗劑的味道'],
  ['2、用了有用（養髮液）',                '用了有用（養髮液）'],
  ['3、剛用不確定效果（養髮液）',           '剛用不確定效果（養髮液）'],
  ['4、回購顧客（養髮液）',                '回購顧客（養髮液）'],
  ['5、回購',                              '回購'],
  ['6、包裝',                              '包裝'],
  ['2、清潔效果好',                        '清潔效果好'],
  ['3、回購顧客',                          '回購顧客'],
  ['3、肯定產品品質',                      '肯定產品品質'],
];

const upd = db.prepare('UPDATE review_templates SET sub_category=? WHERE sub_category=?');

console.log('\n── Step 1：重命名 sub_category ──');
let renamed = 0;
for (const [from, to] of RENAMES) {
  const info = upd.run(to, from);
  if (info.changes > 0) {
    renamed += info.changes;
    console.log(`  [✓] "${from}" → "${to}" (${info.changes} 筆)`);
  } else {
    console.log(`  [=] "${from}" 不存在或已更新，跳過`);
  }
}
console.log(`  更新 ${renamed} 筆`);

// ── Step 2：新增 T067-T076（INSERT OR IGNORE）──────
const NEW_TEMPLATES = [
  ['T067', 'ALL', '通用',  '4星無評論', '感謝您給予四星評價！⭐⭐⭐⭐ 很高興這次購物體驗讓您滿意。若有任何可以改進的地方，歡迎隨時告訴我們，期待下次能為您帶來更完美的體驗！😊'],
  ['T068', 'ALL', '通用',  '4星無評論', '謝謝您的四星支持！🌟 您的肯定是我們前進的動力。若這次體驗有任何未盡完美之處，煩請告知，我們會積極改善。期待下次能提供更棒的服務！✨'],
  ['T069', 'ALL', '保健品', '4星無評論', '感謝您給予四星評價！⭐⭐⭐⭐ 很開心您選擇了我們的保健商品！若您在使用過程中有任何疑問或建議，歡迎隨時告訴我們。祝您健康順心，期待未來持續為您服務！😊'],
  ['T070', 'ALL', '保健品', '4星無評論', '謝謝您的四星支持！🌟 保健品的效果需要時間慢慢累積，若您有任何想法或建議，我們非常樂意聆聽。期待之後能看到您更好的分享！祝您每天健康愉快！✨'],
  ['T071', 'ALL', '保養品', '4星無評論', '感謝您給予四星評價！⭐⭐⭐⭐ 很高興您願意選擇我們的保養品！若使用過程中有任何建議或疑問，歡迎告訴我們，我們很樂意改進。期待能提供更好的保養體驗！🌿'],
  ['T072', 'ALL', '寵物',  '4星無評論', '感謝您給予四星評價！⭐⭐⭐⭐ 希望毛孩也喜歡這次的商品 🐾 若有任何可以改進的地方，歡迎隨時告訴我們！祝您和毛孩生活愉快！'],
  ['T073', 'ALL', '通用',  '3星無評論', '感謝您給予三星評價。🙏 我們非常重視每位顧客的體驗，若這次有任何讓您不滿意的地方，歡迎告訴我們，我們一定積極改善。期待有機會為您帶來更好的服務！'],
  ['T074', 'ALL', '通用',  '3星無評論', '謝謝您的評價！🙏 三星代表您對我們仍有期待，我們非常想了解有哪些地方需要改進。如方便的話，歡迎分享您的想法，我們會虛心接受並努力進步！'],
  ['T075', 'ALL', '保健品', '3星無評論', '感謝您給予三星評價。🙏 我們很重視您的購物體驗，若產品或服務有任何不符期待之處，歡迎隨時告訴我們。您的回饋是我們進步最重要的動力，祝您健康順心！'],
  ['T076', 'ALL', '保養品', '3星無評論', '感謝您的評價！🙏 我們非常希望每位顧客都能對我們的保養品感到滿意。若這次體驗有任何需要改進的地方，歡迎告訴我們。期待能為您帶來更好的保養體驗！🌿'],
];

const ins = db.prepare(
  'INSERT OR IGNORE INTO review_templates (template_id,shop,category,sub_category,template_text) VALUES (?,?,?,?,?)'
);

console.log('\n── Step 2：新增 T067-T076 ──');
let inserted = 0, skipped = 0;
const seed = db.transaction(() => {
  for (const row of NEW_TEMPLATES) {
    const info = ins.run(...row);
    if (info.changes > 0) { inserted++; console.log(`  [+] ${row[0]} ${row[2]} / ${row[3]}`); }
    else                  { skipped++;  console.log(`  [=] ${row[0]} 已存在，跳過`); }
  }
});
seed();

console.log(`\n完成：重命名 ${renamed} 筆，新增模板 ${inserted} 筆，跳過 ${skipped} 筆。`);
