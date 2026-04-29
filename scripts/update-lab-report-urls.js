'use strict';

/**
 * update-lab-report-urls.js
 * Sets lab_report_url on product_info rows by fuzzy-matching product names.
 * Usage: node scripts/update-lab-report-urls.js
 * Safe to re-run (uses UPDATE, not INSERT).
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../data/agent.db'));

// Ensure lab_report_url column exists (migration)
const cols = db.prepare('PRAGMA table_info(product_info)').all().map(c => c.name);
if (!cols.includes('lab_report_url')) {
  db.exec('ALTER TABLE product_info ADD COLUMN lab_report_url TEXT');
  console.log('[update] Added lab_report_url column');
}

// Map: keyword fragments (lowercase) → Superlab URL
// Matching: if a product_name contains ALL fragments (space-separated), it matches.
const LAB_REPORT_MAP = [
  { match: ['好敏通'],                       url: 'https://superlab.tw/20173/' },
  { match: ['300億', 'abc'],                 url: 'https://superlab.tw/20163/' },
  { match: ['孅酵眠'],                       url: 'https://superlab.tw/14039/' },
  { match: ['白腎豆'],                       url: 'https://superlab.tw/14029/' },
  { match: ['脂固康'],                       url: 'https://superlab.tw/12599/' },
  { match: ['老虎蔘'],                       url: 'https://superlab.tw/12023/' },
  { match: ['瑪卡', '軟糖'],                 url: 'https://superlab.tw/11444/' },
  { match: ['益菌軟糖'],                     url: 'https://superlab.tw/11436/' },
  { match: ['明亮補給'],                     url: 'https://superlab.tw/11425/' },
  { match: ['甲殼素'],                       url: 'https://superlab.tw/9938/'  },
  { match: ['紅豆複方'],                     url: 'https://superlab.tw/9929/'  },
  { match: ['龜鹿精華四寶', '膠囊'],         url: 'https://superlab.tw/9793/'  },
  { match: ['epa', '魚油'],                  url: 'https://superlab.tw/7724/'  },
  { match: ['印加果油'],                     url: 'https://superlab.tw/7717/'  },
  { match: ['白高顆'],                       url: 'https://superlab.tw/7708/'  },
  { match: ['孕哺', '卵磷脂'],              url: 'https://superlab.tw/7702/'  },
  { match: ['uc-ii', '膠囊'],               url: 'https://superlab.tw/7691/'  },
  { match: ['關益固'],                       url: 'https://superlab.tw/7691/'  },
  { match: ['龜鹿關鍵'],                     url: 'https://superlab.tw/7684/'  },
  { match: ['薑黃素'],                       url: 'https://superlab.tw/7678/'  },
  { match: ['靈芝'],                         url: 'https://superlab.tw/7672/'  },
  { match: ['穀胱甘肽'],                     url: 'https://superlab.tw/7662/'  },
  { match: ['消化酵素'],                     url: 'https://superlab.tw/7653/'  },
  { match: ['gaba', 'ex plus'],              url: 'https://superlab.tw/7646/'  },
  { match: ['黑芝麻', 'gaba'],               url: 'https://superlab.tw/7638/'  },
  { match: ['長大人'],                       url: 'https://superlab.tw/7631/'  },
  { match: ['女性綜合維他命'],               url: 'https://superlab.tw/7619/'  },
  { match: ['山苦瓜胜肽', 'ex'],             url: 'https://superlab.tw/7613/'  },
  { match: ['南瓜籽'],                       url: 'https://superlab.tw/7583/'  },
  { match: ['dha', '藻油'],                  url: 'https://superlab.tw/7575/'  },
  { match: ['蔓越莓'],                       url: 'https://superlab.tw/7566/'  },
  { match: ['b群'],                          url: 'https://superlab.tw/7558/'  },
  { match: ['92%', 'omega'],                 url: 'https://superlab.tw/7262/'  },
  { match: ['蜂王乳'],                       url: 'https://superlab.tw/7256/'  },
  { match: ['ucii', '粉包'],                 url: 'https://superlab.tw/7250/'  },
  { match: ['二型膠原蛋白', '粉包'],         url: 'https://superlab.tw/7250/'  },
  { match: ['海藻鈣'],                       url: 'https://superlab.tw/7244/'  },
  { match: ['納豆紅麴'],                     url: 'https://superlab.tw/7237/'  },
  { match: ['山苦瓜胜肽'],                   url: 'https://superlab.tw/6544/'  },
  { match: ['褐藻醣膠'],                     url: 'https://superlab.tw/6538/'  },
  { match: ['寧記助'],                       url: 'https://superlab.tw/6538/'  },
  { match: ['西印度櫻桃'],                   url: 'https://superlab.tw/6511/'  },
];

const upd = db.prepare('UPDATE product_info SET lab_report_url=? WHERE id=?');
const products = db.prepare('SELECT id, product_name FROM product_info WHERE brand_id=7').all();

let updated = 0;
let skipped = 0;

for (const product of products) {
  const nameLow = product.product_name.toLowerCase();
  const match = LAB_REPORT_MAP.find(entry =>
    entry.match.every(fragment => nameLow.includes(fragment.toLowerCase()))
  );
  if (match) {
    upd.run(match.url, product.id);
    console.log(`[update] ✓ "${product.product_name}" → ${match.url}`);
    updated++;
  } else {
    console.log(`[update] - "${product.product_name}" (no match)`);
    skipped++;
  }
}

console.log(`\n[update] Done: ${updated} updated, ${skipped} no match.`);
