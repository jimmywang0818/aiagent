'use strict';

/**
 * import-products.js
 * Parses 產品基本資訊_達摩本草.xlsx and upserts records into product_info table.
 * Usage: node scripts/import-products.js
 */

const path = require('path');
const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const fs = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────
// NOTE: path.resolve from __dirname goes through /c/... in Git Bash and breaks.
// Use the explicit Windows absolute path instead, with env-var override for portability.
const EXCEL_PATH = process.env.EXCEL_PATH ||
  'C:\\Users\\Jimmy Wang\\Downloads\\Claude\\inbox\\processed\\產品基本資訊_達摩本草.xlsx';
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_PATH  = path.join(DATA_DIR, 'agent.db');
const BRAND_ID = 7; // 達摩本草

// Supplement timing column labels
const TIMING_LABELS = ['早上', '中午', '晚上', '飯前', '飯後', '睡前', '經期', '孕哺', '兒童'];
// Checkmark characters
const CHECK_RE = /[✔✓☑●▲▪]/;

// Sheets to skip
const SKIP_PATTERN = /[（(]停[）)]|[（(]未[）)]|OLD|停産|停產|^0\./;
// Product sheet name pattern
const PRODUCT_SHEET_PATTERN = /^\d+[\.\-]/;

// ── Helpers ───────────────────────────────────────────────────────────────────

function cell(val) {
  if (val === undefined || val === null) return '';
  return String(val).trim();
}

/**
 * Find first [row, col] where cell contains text (case-insensitive).
 */
function findCell(rows, text) {
  const t = text.toLowerCase();
  for (let r = 0; r < rows.length; r++) {
    if (!rows[r]) continue;
    for (let c = 0; c < rows[r].length; c++) {
      if (cell(rows[r][c]).toLowerCase().includes(t)) return [r, c];
    }
  }
  return null;
}

/**
 * Find column index in a specific row that contains text.
 */
function findColInRow(row, text) {
  if (!row) return -1;
  const t = text.toLowerCase();
  for (let c = 0; c < row.length; c++) {
    if (cell(row[c]).toLowerCase().includes(t)) return c;
  }
  return -1;
}

/**
 * Get block of text after a label cell.
 * Collects the content starting at [labelRow+1][labelCol] and continues
 * until an empty cell or section header. Returns joined string.
 */
function getBlockBelow(rows, labelRow, labelCol) {
  const parts = [];
  for (let r = labelRow + 1; r < rows.length && r < labelRow + 100; r++) {
    if (!rows[r]) continue;
    const v = cell(rows[r][labelCol]);
    if (!v) break;
    // Stop at obvious new section headers (short text with known keywords)
    if (v.length < 25 && isSectionHeader(v)) break;
    parts.push(v);
  }
  return parts.join('\n').trim() || null;
}

const SECTION_KEYWORDS = [
  '料號', '成分', '營養', '注意', '食用', '補充', '賣點', '話術', '關鍵字',
  '建議', 'FAQ', '客服', '銷售', '認證', '族群', '外顯', '參考', '其他',
  '產地', '劑型', '規格', '保存', '葷素', '售價', '全成分',
];
function isSectionHeader(v) {
  const lower = v.toLowerCase();
  return SECTION_KEYWORDS.some(k => lower.includes(k.toLowerCase()));
}

// ── Sheet parser ──────────────────────────────────────────────────────────────

function parseSheet(sheetName, sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const data = {};

  // ── product_code: Row 0, col A has "產品料號", value in col B ─────────────
  {
    const pos = findCell(rows, '產品料號');
    if (pos) {
      const [r, c] = pos;
      // Value is usually in the next cell (c+1), or col B of same row
      data.product_code = cell(rows[r][c + 1]) || cell(rows[r][c + 2]) || null;
    }
  }

  // ── product_name: Row 2 (index 2), col A ─────────────────────────────────
  data.product_name = cell(rows[2] && rows[2][0]);

  // ── Header row (row index 1): 劑型, 規格, 保存期限, 產地, 葷素, 售價 ───────
  // Value row is row index 2
  {
    const headerRow = rows[1] || [];
    const valueRow  = rows[2] || [];

    const headerMap = [
      ['dosage_form', ['劑型']],
      ['spec',        ['規格']],
      ['shelf_life',  ['保存期限', '保存']],
      ['origin',      ['產地']],
      ['dietary',     ['葷素']],
      ['price',       ['售價', '產品售價']],
    ];
    for (const [field, labels] of headerMap) {
      let col = -1;
      for (const lbl of labels) {
        col = findColInRow(headerRow, lbl);
        if (col !== -1) break;
      }
      data[field] = col !== -1 ? (cell(valueRow[col]) || null) : null;
    }
  }

  // ── Row 5/6 style fields: header in row ~5, value in row ~6 ──────────────
  // Pattern: scan for a header row that has both 關鍵成分 and 注意事項
  // Then get values from the row below
  {
    let sectionHeaderRow = -1;
    for (let r = 3; r < Math.min(rows.length, 15); r++) {
      if (!rows[r]) continue;
      const rowText = rows[r].map(c => cell(c)).join('');
      if (rowText.includes('關鍵成分') && rowText.includes('注意事項')) {
        sectionHeaderRow = r;
        break;
      }
    }

    if (sectionHeaderRow !== -1) {
      const hRow = rows[sectionHeaderRow];
      const vRow = rows[sectionHeaderRow + 1] || [];

      // key_ingredients
      {
        const col = findColInRow(hRow, '關鍵成分');
        if (col !== -1) {
          // Value may span multiple rows below
          const direct = cell(vRow[col]);
          if (direct) {
            // Collect multi-row value
            const parts = [direct];
            for (let r = sectionHeaderRow + 2; r < sectionHeaderRow + 10 && r < rows.length; r++) {
              const v = cell(rows[r] && rows[r][col]);
              if (!v) break;
              parts.push(v);
            }
            data.key_ingredients = parts.join('\n').trim() || null;
          } else {
            data.key_ingredients = null;
          }
        }
      }

      // precautions
      {
        const col = findColInRow(hRow, '注意事項');
        if (col !== -1) {
          const direct = cell(vRow[col]);
          data.precautions = direct || null;
          if (!direct) {
            // Try scanning below
            data.precautions = getBlockBelow(rows, sectionHeaderRow, col);
          }
        }
      }

      // usage_method
      {
        let col = findColInRow(hRow, '食用方式');
        if (col === -1) col = findColInRow(hRow, '食用方法');
        if (col !== -1) {
          data.usage_method = cell(vRow[col]) || getBlockBelow(rows, sectionHeaderRow, col) || null;
        }
      }

      // target_groups
      {
        let col = findColInRow(hRow, '補充說明');
        if (col === -1) col = findColInRow(hRow, '族群');
        if (col !== -1) {
          data.target_groups = cell(vRow[col]) || getBlockBelow(rows, sectionHeaderRow, col) || null;
        }
      }

      // nutrition: col A of value row (left-most content)
      {
        const col = findColInRow(hRow, '營養標示');
        if (col !== -1) {
          const parts = [];
          for (let r = sectionHeaderRow + 1; r < sectionHeaderRow + 15 && r < rows.length; r++) {
            const v = cell(rows[r] && rows[r][col]);
            if (v) parts.push(v);
          }
          data.nutrition = parts.join('\n').trim() || null;
        } else {
          // Fallback: scan for 營養標示 label anywhere
          const pos = findCell(rows, '營養標示');
          if (pos) {
            const [lr, lc] = pos;
            data.nutrition = getBlockBelow(rows, lr, lc);
          }
        }
      }
    } else {
      // Fallback: scan anywhere for these labels
      for (const [field, labels] of [
        ['key_ingredients', ['關鍵成分']],
        ['precautions',     ['注意事項']],
        ['usage_method',    ['食用方式', '食用方法']],
        ['target_groups',   ['補充說明', '族群']],
      ]) {
        let found = false;
        for (const lbl of labels) {
          const pos = findCell(rows, lbl);
          if (pos) {
            const [r, c] = pos;
            data[field] = cell(rows[r + 1] && rows[r + 1][c]) || getBlockBelow(rows, r, c) || null;
            found = true;
            break;
          }
        }
        if (!found) data[field] = null;
      }
      // nutrition fallback
      if (!data.nutrition) {
        const pos = findCell(rows, '營養標示');
        if (pos) {
          const [r, c] = pos;
          data.nutrition = getBlockBelow(rows, r, c);
        } else {
          data.nutrition = null;
        }
      }
    }
  }

  // ── 產品全成分: col A label, value in col B same row ──────────────────────
  {
    const pos = findCell(rows, '產品全成分');
    if (pos) {
      const [r, c] = pos;
      // Value is typically in col B (c+1) of same row
      let val = null;
      for (let nc = c + 1; nc < Math.min(rows[r].length, c + 5); nc++) {
        const v = cell(rows[r][nc]);
        if (v) { val = v; break; }
      }
      // If not found same row, try below
      if (!val) val = getBlockBelow(rows, r, c);
      data.all_ingredients = val || null;
    } else {
      data.all_ingredients = null;
    }
  }

  // ── 銷售賣點 / 話術: col A label, value in col B same row ─────────────────
  {
    let pos = findCell(rows, '銷售賣點');
    if (!pos) pos = findCell(rows, '話術');
    if (pos) {
      const [r, c] = pos;
      let val = null;
      // Same row next cols
      for (let nc = c + 1; nc < Math.min(rows[r].length, c + 5); nc++) {
        const v = cell(rows[r][nc]);
        if (v) { val = v; break; }
      }
      if (!val) val = getBlockBelow(rows, r, c);
      data.marketing_copy = val || null;
    } else {
      data.marketing_copy = null;
    }
  }

  // ── keywords: "外顯" row → next cells in same row ─────────────────────────
  {
    const pos = findCell(rows, '外顯');
    if (pos) {
      const [r, c] = pos;
      const kws = [];
      for (let nc = c + 1; nc <= c + 8 && nc < rows[r].length; nc++) {
        const v = cell(rows[r][nc]);
        if (v) kws.push(v);
      }
      data.keywords = kws.length ? kws.join(', ') : null;
    } else {
      data.keywords = null;
    }
  }

  // ── supplement_timing ────────────────────────────────────────────────────
  {
    const pos = findCell(rows, '建議補充時段');
    if (pos) {
      const [labelR] = pos;
      // Find the timing header row (has 早上, 中午, etc.)
      let headerR = -1;
      const timingCols = {};
      for (let r = labelR; r <= labelR + 5 && r < rows.length; r++) {
        if (!rows[r]) continue;
        let found = 0;
        for (const lbl of TIMING_LABELS) {
          const col = findColInRow(rows[r], lbl);
          if (col !== -1) { timingCols[lbl] = col; found++; }
        }
        if (found >= 3) { headerR = r; break; }
      }
      if (headerR !== -1) {
        // Find check row (next 1-3 rows after header)
        const checked = [];
        for (let r = headerR + 1; r <= headerR + 4 && r < rows.length; r++) {
          if (!rows[r]) continue;
          let anyCheck = false;
          for (const lbl of TIMING_LABELS) {
            const col = timingCols[lbl];
            if (col === undefined) continue;
            const v = cell(rows[r][col]);
            if (CHECK_RE.test(v) || v === 'V' || v === 'v' || v === 'X' || v === 'x' || v === '●' || v === 'O' || v === 'o') {
              checked.push(lbl);
              anyCheck = true;
            }
          }
          if (anyCheck) break;
        }
        data.supplement_timing = checked.length ? checked.join(', ') : null;
      } else {
        data.supplement_timing = null;
      }
    } else {
      data.supplement_timing = null;
    }
  }

  // ── FAQ: col A label "FAQ", value in col B same row (large text) ──────────
  {
    const pos = findCell(rows, 'FAQ');
    if (pos) {
      const [r, c] = pos;
      const labelVal = cell(rows[r][c]);
      // If label cell contains "FAQ" and is long, it might be col A with content in B
      let val = null;
      // Check next cell(s) in same row
      for (let nc = c + 1; nc < Math.min(rows[r].length, c + 5); nc++) {
        const v = cell(rows[r][nc]);
        if (v && v.length > 10) { val = v; break; }
      }
      // If the label cell itself is long (FAQ + content in same cell), use it
      if (!val && labelVal.length > 10 && !labelVal.toLowerCase().startsWith('faq')) {
        val = labelVal;
      }
      // Fallback: gather block below
      if (!val) val = getBlockBelow(rows, r, c);
      data.faq_public = val || null;
    } else {
      data.faq_public = null;
    }
  }

  // ── faq_internal: "客服使用QA" or "非公開" → Q/A pairs ──────────────────
  {
    let startRow = -1;
    const internalLabels = ['客服使用QA', '客服使用qa', '非公開'];
    for (const lbl of internalLabels) {
      const pos = findCell(rows, lbl);
      if (pos) { startRow = pos[0]; break; }
    }
    if (startRow !== -1) {
      const pairs = [];
      for (let r = startRow; r < rows.length && r < startRow + 100; r++) {
        if (!rows[r]) continue;
        // Q is in col B (index 1), A is in col D (index 3)
        const qCell = cell(rows[r][1]);
        const aCell = cell(rows[r][3]) || cell(rows[r][2]);
        if (!qCell) continue;
        // Skip the header row itself
        if (qCell.includes('客服') || qCell.includes('QA') || qCell.toLowerCase().includes('faq')) continue;
        if (qCell.length > 2) {
          const q = qCell.replace(/^[Qq？?：:]\s*/, '');
          pairs.push(`Q: ${q}\nA: ${aCell}`);
        }
      }
      data.faq_internal = pairs.length ? pairs.join('\n\n') : null;
    } else {
      data.faq_internal = null;
    }
  }

  return data;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log('[import] Loading workbook:', EXCEL_PATH);
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error('[import] ERROR: Excel file not found at', EXCEL_PATH);
    process.exit(1);
  }

  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetNames = workbook.SheetNames;
  console.log(`[import] Total sheets: ${sheetNames.length}`);

  const productSheets = sheetNames.filter(name => {
    if (!PRODUCT_SHEET_PATTERN.test(name)) return false;
    if (SKIP_PATTERN.test(name)) {
      console.log(`[import] SKIP: ${name}`);
      return false;
    }
    return true;
  });
  console.log(`[import] Product sheets to process: ${productSheets.length}`);

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = require('../src/db');

  // Verify brand exists
  const rawDb = new Database(DB_PATH);
  const brand = rawDb.prepare("SELECT id, name FROM brands WHERE name='達摩'").get();
  if (!brand) {
    console.error('[import] ERROR: Brand 達摩 not found in DB');
    rawDb.close();
    process.exit(1);
  }
  console.log(`[import] Brand confirmed: id=${brand.id}, name=${brand.name}`);
  rawDb.close();

  let inserted = 0, updated = 0, skipped = 0;

  for (const name of productSheets) {
    const sheet = workbook.Sheets[name];
    let parsed;
    try {
      parsed = parseSheet(name, sheet);
    } catch (err) {
      console.error(`[import] ERROR parsing "${name}": ${err.message}`);
      skipped++;
      continue;
    }

    if (!parsed.product_name) {
      console.log(`[import] SKIP (no product_name): ${name}`);
      skipped++;
      continue;
    }

    const record = {
      brand_id:          BRAND_ID,
      product_code:      parsed.product_code      || null,
      product_name:      parsed.product_name,
      dosage_form:       parsed.dosage_form        || null,
      spec:              parsed.spec               || null,
      shelf_life:        parsed.shelf_life         || null,
      origin:            parsed.origin             || null,
      dietary:           parsed.dietary            || null,
      price:             parsed.price              || null,
      key_ingredients:   parsed.key_ingredients    || null,
      all_ingredients:   parsed.all_ingredients    || null,
      nutrition:         parsed.nutrition          || null,
      precautions:       parsed.precautions        || null,
      usage_method:      parsed.usage_method       || null,
      target_groups:     parsed.target_groups      || null,
      supplement_timing: parsed.supplement_timing  || null,
      marketing_copy:    parsed.marketing_copy     || null,
      keywords:          parsed.keywords           || null,
      faq_public:        parsed.faq_public         || null,
      faq_internal:      parsed.faq_internal       || null,
    };

    const result = db.upsertProductInfo(record);
    if (result.action === 'inserted') inserted++;
    else updated++;

    console.log(
      `[import] ${name} → "${record.product_name}"` +
      ` | code:${record.product_code || '-'}` +
      ` | ing:${record.key_ingredients ? 'Y' : '-'}` +
      ` | usage:${record.usage_method ? 'Y' : '-'}` +
      ` | timing:${record.supplement_timing || '-'}` +
      ` | faq:${record.faq_public ? 'Y' : '-'}` +
      ` | ${result.action}(id=${result.id})`
    );
  }

  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('[import] DONE');
  console.log(`  Sheets processed : ${productSheets.length - skipped}`);
  console.log(`  Inserted         : ${inserted}`);
  console.log(`  Updated          : ${updated}`);
  console.log(`  Skipped (errors) : ${skipped}`);
  console.log('══════════════════════════════════════════');
}

main();
