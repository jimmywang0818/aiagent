'use strict';

/**
 * Migration: update T030 fish oil template + add T143
 * Safe to re-run (UPDATE is idempotent, INSERT OR IGNORE skips if exists)
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '../data/omnichat.db');
const db = new Database(DB_PATH);

const T030_NEW = '非常感謝您給予五星好評與回饋 ⭐\n謝謝您特別提到顆粒小、好吞食的優點，這正是我們在產品設計上，希望能讓日常補充更輕鬆無負擔的重點之一。\n您的推薦與支持對我們來說非常重要，期待未來能持續為您帶來安心、值得信賴的好選擇 😊 再次感謝您的鼓勵，祝您健康順心！';

const T143 = {
  template_id:   'T143',
  brand_id:      null,
  category:      'ALL',
  product_line:  '保健品',
  sub_category:  '*魚油通用(小顆)-足量建議',
  template_text: '感謝您的五星好評！⭐ 很高興您喜歡我們迷你膠囊的設計，小顆好吞讓每天補充更輕鬆無負擔 🐟\n小提醒：因為是迷你膠囊，若想做足量保養，建議每天可以吃到 4 顆唷，營養補充會更完整！\n有任何問題歡迎隨時告訴我們，祝您健康順心！',
};

// 1. Update T030
const updated = db.prepare(
  'UPDATE review_templates SET template_text = ? WHERE template_id = ?'
).run(T030_NEW, 'T030');
console.log(`[update] T030: ${updated.changes} row(s) updated`);

// 2. Insert T143 (skip if already exists)
const inserted = db.prepare(`
  INSERT OR IGNORE INTO review_templates
    (template_id, brand_id, category, product_line, sub_category, template_text)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(
  T143.template_id, T143.brand_id, T143.category,
  T143.product_line, T143.sub_category, T143.template_text
);
console.log(`[insert] T143: ${inserted.changes} row(s) inserted (0 = already existed)`);

db.close();
console.log('Done.');
