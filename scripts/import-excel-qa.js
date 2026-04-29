'use strict';

/**
 * import-excel-qa.js
 * 從 產品基本資訊_達摩本草.xlsx 的各產品頁面，
 * 把 銷售賣點、關鍵字、FAQ、客服QA、補充說明、補充時段 補進 product_info。
 * 比對依據：product_code（料號）。
 *
 * Usage:
 *   node scripts/import-excel-qa.js [path/to/file.xlsx]
 *   （不帶路徑時使用預設路徑）
 *
 * 策略：
 *   - 只補空白欄位（有資料的欄位不覆蓋），除非加 --force 參數
 *   - 沒有 product_code 的 sheet 跳過
 *   - product_code 在 DB 找不到的 sheet 跳過並列出
 */

const XLSX   = require('xlsx');
const path   = require('path');
const Database = require('better-sqlite3');

const FORCE   = process.argv.includes('--force');
const xlsxPath = process.argv.find(a => a.endsWith('.xlsx'))
  || path.join(__dirname, '../../../inbox/產品基本資訊_達摩本草.xlsx');

const db = new Database(path.join(__dirname, '../data/agent.db'));

// ── Ensure lab_report_url column exists (safety) ───
{
  const cols = db.prepare('PRAGMA table_info(product_info)').all().map(c => c.name);
  if (!cols.includes('lab_report_url')) {
    db.exec('ALTER TABLE product_info ADD COLUMN lab_report_url TEXT');
  }
}

console.log(`[import] Reading: ${xlsxPath}`);
const wb = XLSX.readFile(xlsxPath);

// ── Skip non-product sheets ────────────────────────
const SKIP_SHEETS = new Set([
  '保健品通用QA', '官網主活動', '蝦皮直播抽獎', '0.產品包裝總表(工作區)',
]);

// ── Supplement timing labels ───────────────────────
const TIMING_LABELS = ['早上', '中午', '晚上', '飯前', '飯後', '睡前', '經期', '孕哺'];

function parseSheet(sheetName) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // product_code: row 0, col 1
  const code = String(rows[0]?.[1] || '').trim();
  if (!code || code === '產品料號') return null;

  const cell = (r, c) => String(rows[r]?.[c] || '').trim();

  // target_groups: row 6, col 7 (補充說明族群/疾病)
  const target_groups = cell(6, 7);

  // supplement_timing: row 15 has ✔ marks, row 14 has labels
  const timingChecks = rows[15] || [];
  const timingChecked = TIMING_LABELS.filter((_, i) => String(timingChecks[i] || '').includes('✔'));
  const supplement_timing = timingChecked.join(',');

  // all_ingredients: row 17, col 1
  const all_ingredients = cell(17, 1);

  // marketing_copy: row 18, col 1
  const marketing_copy = cell(18, 1);

  // keywords: rows 19 (外顯) + 20 (隱藏), cols 1-N
  const kwPublic  = (rows[19] || []).slice(1).map(v => String(v).trim()).filter(Boolean);
  const kwHidden  = (rows[20] || []).slice(1).map(v => String(v).trim()).filter(Boolean);
  const keywords  = [...kwPublic, ...kwHidden].join(',');

  // faq_public: row 21, col 1
  const faq_public = cell(21, 1);

  // faq_internal: rows 22+ where col 0 = '' or '客服使用QA(非公開)', col 1 = Q, col 3 = A
  const qaLines = [];
  for (let i = 22; i < rows.length; i++) {
    const r = rows[i] || [];
    const label = String(r[0] || '').trim();
    const q     = String(r[1] || '').trim();
    const a     = String(r[3] || '').trim();
    if (!label || label === '客服使用QA(非公開)') {
      if (q && a) {
        qaLines.push(`Q：${q}\nA：${a}`);
      }
    }
  }
  const faq_internal = qaLines.join('\n\n');

  return { code, target_groups, supplement_timing, all_ingredients, marketing_copy, keywords, faq_public, faq_internal };
}

// ── DB helpers ─────────────────────────────────────
const findByCode = db.prepare('SELECT * FROM product_info WHERE product_code=? AND brand_id=7 LIMIT 1');

const updateStmt = db.prepare(`
  UPDATE product_info SET
    target_groups     = CASE WHEN (target_groups     IS NULL OR target_groups     = '' OR ?) THEN ? ELSE target_groups     END,
    supplement_timing = CASE WHEN (supplement_timing IS NULL OR supplement_timing = '' OR ?) THEN ? ELSE supplement_timing END,
    all_ingredients   = CASE WHEN (all_ingredients   IS NULL OR all_ingredients   = '' OR ?) THEN ? ELSE all_ingredients   END,
    marketing_copy    = CASE WHEN (marketing_copy    IS NULL OR marketing_copy    = '' OR ?) THEN ? ELSE marketing_copy    END,
    keywords          = CASE WHEN (keywords          IS NULL OR keywords          = '' OR ?) THEN ? ELSE keywords          END,
    faq_public        = CASE WHEN (faq_public        IS NULL OR faq_public        = '' OR ?) THEN ? ELSE faq_public        END,
    faq_internal      = CASE WHEN (faq_internal      IS NULL OR faq_internal      = '' OR ?) THEN ? ELSE faq_internal      END,
    updated_at        = datetime('now','+8 hours')
  WHERE id = ?
`);

// ── Main loop ──────────────────────────────────────
let updated = 0, skippedNoCode = 0, skippedNotFound = 0, total = 0;
const notFound = [];

for (const sheetName of wb.SheetNames) {
  if (SKIP_SHEETS.has(sheetName)) continue;

  const data = parseSheet(sheetName);
  if (!data) { skippedNoCode++; continue; }

  const record = findByCode.get(data.code);
  if (!record) {
    notFound.push(`${sheetName} (code: ${data.code})`);
    skippedNotFound++;
    continue;
  }

  total++;
  const f = FORCE ? 1 : 0; // force = overwrite even if not empty
  updateStmt.run(
    f, data.target_groups     || null,
    f, data.supplement_timing || null,
    f, data.all_ingredients   || null,
    f, data.marketing_copy    || null,
    f, data.keywords          || null,
    f, data.faq_public        || null,
    f, data.faq_internal      || null,
    record.id
  );

  const fields = [
    data.target_groups     ? 'target_groups'     : '',
    data.supplement_timing ? 'supplement_timing' : '',
    data.all_ingredients   ? 'all_ingredients'   : '',
    data.marketing_copy    ? 'marketing_copy'    : '',
    data.keywords          ? 'keywords'          : '',
    data.faq_public        ? 'faq_public'        : '',
    data.faq_internal      ? `faq_internal(${data.faq_internal.split('\n\n').length}條)` : '',
  ].filter(Boolean).join(', ');

  console.log(`[import] ✓ ${sheetName} → "${record.product_name}" | ${fields || '(no new data)'}`);
  updated++;
}

console.log(`\n[import] Done: ${updated} products updated (${total} matched)`);
if (skippedNotFound > 0) {
  console.log(`[import] Not in DB (${skippedNotFound}):`);
  notFound.forEach(s => console.log(`  - ${s}`));
}
console.log(`[import] Skipped (no code): ${skippedNoCode}`);
console.log(`\n加 --force 可強制覆蓋已有資料`);
