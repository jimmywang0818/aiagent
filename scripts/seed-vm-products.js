'use strict';

/**
 * seed-vm-products.js
 * Inserts 達摩本草 product_info records into the DB.
 * Usage: node scripts/seed-vm-products.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const data = require('./product-seed-data.json');

const db = new Database(path.join(__dirname, '../data/agent.db'));

const cols = [
  'brand_id','product_code','product_name','product_url','dosage_form','spec',
  'shelf_life','origin','dietary','price','key_ingredients','all_ingredients','nutrition',
  'certifications','precautions','usage_method','target_groups','supplement_timing',
  'marketing_copy','keywords','faq_public','faq_internal','notes','lab_report_url',
  'priority','active',
];

const placeholders = cols.map(() => '?').join(',');

const del = db.prepare('DELETE FROM product_info WHERE brand_id=7');
const ins = db.prepare(`INSERT INTO product_info (${cols.join(',')}) VALUES (${placeholders})`);

const run = db.transaction(() => {
  del.run();
  for (const row of data) {
    ins.run(cols.map(c => row[c] ?? null));
  }
});

run();
console.log(`[seed] Done: inserted ${data.length} products (brand_id=7) into product_info.`);
