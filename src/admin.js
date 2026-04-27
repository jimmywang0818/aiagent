'use strict';

const { Router } = require('express');
const multer = require('multer');
const db = require('./db');
const { getAIReply, clearHistory } = require('./agent');
const { getProductCache, loadAllProducts } = require('./cyberbiz');

const router = Router();
const BASE = '/tsa-ai-agent-manage';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const CATEGORIES = ['保健品', '寵物品牌', '保養品', '個人清潔用品'];
const CAT_COLOR  = { '保健品':'#2e7d32','寵物品牌':'#e65100','保養品':'#6a1b9a','個人清潔用品':'#1565c0','其他':'#546e7a' };

// Custom brand display order per category (brands not listed appear at the end)
const BRAND_ORDER = {
  '保健品':     ['達摩', '御熹堂', '大島'],
  '寵物品牌':   ['毛孩', '奧沛', '優固倍', '愛旺斯'],
  '保養品':     ['芙木', 'Tryme', 'XXS'],
  '個人清潔用品':['PH'],
};

function sortBrands(brands, cat) {
  const order = BRAND_ORDER[cat];
  if (!order) return brands;
  return [...brands].sort((a, b) => {
    const ai = order.indexOf(a.name), bi = order.indexOf(b.name);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function requireLogin(req, res, next) {
  if (req.session.loggedIn) return next();
  res.redirect(`${BASE}/login`);
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function layout(title, body, activeKey) {
  const brands = db.getBrands();
  const grouped = {};
  [...CATEGORIES, '其他'].forEach(c => { grouped[c] = []; });
  brands.forEach(b => { (grouped[b.category] || grouped['其他']).push(b); });

  const catLinks = [...CATEGORIES, '其他'].map(cat => {
    const rawList = grouped[cat];
    if (!rawList?.length) return '';
    const list  = sortBrands(rawList, cat);
    const color = CAT_COLOR[cat] || '#546e7a';
    const isActive = activeKey === `cat-${cat}` || list.some(b => activeKey === `brand-${b.id}`);
    const brandItems = list.map(b =>
      `<a href="${BASE}/brands/${b.id}" class="sb-item sb-brand${activeKey===`brand-${b.id}`?' active':''}">${esc(b.name)}</a>`
    ).join('');
    return `<details class="sb-group"${isActive ? ' open' : ' open'}>
      <summary class="sb-item sb-cat-link${activeKey===`cat-${cat}`?' active':''}" style="color:${color}">
        <a href="${BASE}/category/${encodeURIComponent(cat)}" class="sb-cat-label" style="color:${color};text-decoration:none">${cat}</a>
        <span class="sb-chevron">▾</span>
      </summary>
      ${brandItems}
    </details>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — TSA AI Agent</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;color:#333;display:flex;flex-direction:column;min-height:100vh}
.topbar{background:#1a237e;color:#fff;padding:0 20px;height:50px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.topbar-home{color:#fff;text-decoration:none;font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px}
.topbar-home:hover{opacity:.85}
.topbar nav a{color:rgba(255,255,255,.8);text-decoration:none;font-size:13px;margin-left:18px}
.topbar nav a:hover{color:#fff}
.body-wrap{display:flex;flex:1;overflow:hidden}
.sidebar{width:190px;background:#fff;border-right:1px solid #e8e8e8;overflow-y:auto;flex-shrink:0;padding:10px 0}
.sb-special{padding:5px 0}
.sb-item{display:block;padding:7px 16px;font-size:13px;color:#444;text-decoration:none;transition:background .12s}
.sb-item:hover{background:#f5f5f5}
.sb-item.active{background:#e8eaf6;color:#1a237e;font-weight:600}
.sb-cat-link{font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px;padding:8px 16px 5px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none}
.sb-cat-label{flex:1}
.sb-chevron{font-size:11px;color:#aaa;transition:transform .2s;flex-shrink:0}
details.sb-group{border:none}
details.sb-group>summary{list-style:none}
details.sb-group>summary::-webkit-details-marker{display:none}
details.sb-group>summary::marker{display:none}
details.sb-group:not([open])>.sb-chevron,details.sb-group:not([open]) .sb-chevron{transform:rotate(-90deg)}
.sb-brand{padding-left:24px;font-size:13px}
.sb-divider{border:none;border-top:1px solid #f0f0f0;margin:6px 0}
.main{flex:1;overflow-y:auto;padding:24px 28px}
h2{font-size:19px;margin-bottom:4px}
.page-header{display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid #e5e5e5;flex-wrap:wrap}
.badge-cat{padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;color:#fff}
.tabs{display:flex;margin-bottom:20px;border-bottom:2px solid #e5e5e5}
.tab{padding:9px 18px;font-size:13px;font-weight:600;color:#888;text-decoration:none;border-bottom:2px solid transparent;margin-bottom:-2px}
.tab:hover{color:#1a237e}
.tab.active{color:#1a237e;border-bottom-color:#1a237e}
.card{background:#fff;border-radius:10px;padding:22px;margin-bottom:20px;box-shadow:0 1px 4px rgba(0,0,0,.07)}
.card h3{font-size:14px;font-weight:700;color:#555;margin-bottom:14px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:8px 11px;border-bottom:2px solid #eee;color:#999;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.4px}
td{padding:8px 11px;border-bottom:1px solid #f5f5f5;vertical-align:top}
tr:last-child td{border-bottom:none}
.badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600}
.badge.on{background:#e8f5e9;color:#2e7d32}
.badge.off{background:#fce4ec;color:#c62828}
input[type=text],textarea,input[type=file]{width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:inherit}
input[type=text]:focus,textarea:focus{outline:none;border-color:#3f51b5}
textarea{min-height:72px;resize:vertical}
.btn{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;text-decoration:none;transition:opacity .15s}
.btn:hover{opacity:.82}
.btn-primary{background:#1a237e;color:#fff}
.btn-success{background:#2e7d32;color:#fff}
.btn-danger{background:#c62828;color:#fff}
.btn-ghost{background:#efefef;color:#444}
.btn-sm{padding:3px 9px;font-size:12px}
.form-row{display:flex;gap:10px;margin-bottom:9px}
.form-row .grow{flex:1}
.form-actions{display:flex;gap:8px;margin-top:12px}
.empty{color:#ccc;font-size:13px;padding:20px 0;text-align:center}
.dashboard-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px;margin-bottom:28px}
.brand-card{background:#fff;border-radius:10px;padding:18px;box-shadow:0 1px 4px rgba(0,0,0,.07);text-decoration:none;color:#333;transition:box-shadow .18s,transform .18s;display:flex;flex-direction:column;gap:6px}
.brand-card:hover{box-shadow:0 4px 14px rgba(0,0,0,.12);transform:translateY(-2px)}
.brand-card-name{font-size:16px;font-weight:700}
.stat{font-size:11px;color:#aaa;margin-top:2px}
.section-title{font-size:12px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.6px;margin:24px 0 10px}
.plat-badge{display:inline-block;padding:2px 9px;border-radius:99px;font-size:11px;font-weight:600;background:#e3f2fd;color:#1565c0}
.upload-area{border:2px dashed #ddd;border-radius:8px;padding:20px;text-align:center;background:#fafafa}
.upload-area:hover{border-color:#3f51b5}
.alert{padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:13px}
.alert-success{background:#e8f5e9;color:#2e7d32;border:1px solid #c8e6c9}
.alert-error{background:#fce4ec;color:#c62828;border:1px solid #f8bbd0}
</style>
</head>
<body>
<div class="topbar">
  <a href="${BASE}" class="topbar-home">🏠 TSA AI Agent</a>
  <nav>
    <a href="${BASE}/global">全域設定</a>
    <a href="${BASE}/logs">對話紀錄</a>
    <a href="${BASE}/logout">登出</a>
  </nav>
</div>
<div class="body-wrap">
  <div class="sidebar">
    <div class="sb-special">
      <a href="${BASE}/global"   class="sb-item${activeKey==='global'  ?' active':''}">🌐 全域設定</a>
      <a href="${BASE}/sandbox"  class="sb-item${activeKey==='sandbox' ?' active':''}">🧪 沙盒測試</a>
      <a href="${BASE}/logs"     class="sb-item${activeKey==='logs'    ?' active':''}">📋 對話紀錄</a>
      <a href="${BASE}/reviews"   class="sb-item${activeKey==='reviews'  ?' active':''}">🏷 評論模板</a>
      <a href="${BASE}/products"  class="sb-item${activeKey==='products' ?' active':''}">🛍 商品快取</a>
    </div>
    <hr class="sb-divider">
    ${catLinks}
  </div>
  <div class="main">${body}</div>
</div>
</body></html>`;
}

// ── Auth ──────────────────────────────────────────
router.get('/login', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="UTF-8"><title>登入</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#f0f2f5;display:flex;align-items:center;justify-content:center;min-height:100vh}.box{background:#fff;padding:40px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.1);width:320px}h2{margin-bottom:6px;color:#1a237e;font-size:21px}p{color:#999;font-size:13px;margin-bottom:26px}input{width:100%;padding:10px 12px;margin-bottom:12px;border:1px solid #ddd;border-radius:7px;font-size:14px}input:focus{outline:none;border-color:#3f51b5}button{width:100%;padding:11px;background:#1a237e;color:#fff;border:none;border-radius:7px;font-size:14px;font-weight:600;cursor:pointer}.err{color:#c62828;font-size:13px;margin-bottom:10px}</style>
</head><body><div class="box">
<h2>TSA AI Agent</h2><p>請輸入管理密碼</p>
${req.query.err ? '<p class="err">密碼錯誤</p>' : ''}
<form method="POST" action="${BASE}/login">
  <input type="password" name="password" placeholder="管理密碼" autofocus>
  <button type="submit">登入</button>
</form>
</div></body></html>`);
});
router.post('/login', (req, res) => {
  if (req.body.password === process.env.ADMIN_PASSWORD) { req.session.loggedIn = true; res.redirect(BASE); }
  else res.redirect(`${BASE}/login?err=1`);
});
router.get('/logout', (req, res) => { req.session.destroy(); res.redirect(`${BASE}/login`); });

// ── Dashboard ─────────────────────────────────────
router.get('/', requireLogin, (req, res) => {
  const brands = db.getBrands();
  const grouped = {};
  [...CATEGORIES, '其他'].forEach(c => { grouped[c] = []; });
  brands.forEach(b => { (grouped[b.category] || grouped['其他']).push(b); });

  const sections = [...CATEGORIES, '其他'].map(cat => {
    const rawList = grouped[cat];
    if (!rawList?.length) return '';
    const list  = sortBrands(rawList, cat);
    const color = CAT_COLOR[cat] || '#546e7a';
    const catRules = db.getCategoryRules(cat).length;
    const catFaqs  = db.getCategoryFaqs(cat).length;
    const cards = list.map(b => {
      const rCount = db.getRules(b.id).length;
      const fCount = db.getFaqs(b.id).length;
      return `<a href="${BASE}/brands/${b.id}" class="brand-card">
        <span class="brand-card-name">${esc(b.name)}</span>
        <span class="stat">守則 ${rCount} ・ FAQ ${fCount}</span>
      </a>`;
    }).join('');
    return `<div class="section-title" style="color:${color}">
      ${cat}
      <a href="${BASE}/category/${encodeURIComponent(cat)}" style="margin-left:10px;font-size:11px;color:${color};text-decoration:none;background:rgba(0,0,0,.06);padding:2px 8px;border-radius:99px">類別設定 ${catRules+catFaqs > 0 ? `(${catRules+catFaqs})` : ''}</a>
    </div>
    <div class="dashboard-grid">${cards}</div>`;
  }).join('');

  const gRules = db.getGlobalRules().length;
  const gFaqs  = db.getGlobalFaqs().length;

  res.send(layout('首頁', `
    <h2>品牌總覽</h2>
    <p style="color:#999;font-size:13px;margin-bottom:20px">點選品牌進入管理，或點選「類別設定」設定該類別共用守則/FAQ</p>
    <div style="display:flex;gap:12px;margin-bottom:24px">
      <a href="${BASE}/global" class="btn btn-ghost">🌐 全域設定（${gRules+gFaqs} 筆）</a>
    </div>
    ${sections}`));
});

// ── Shared rule/faq table helpers ─────────────────
function rulesTable(rules, editBase, deleteBase) {
  if (!rules.length) return `<tr><td colspan="5" class="empty">尚無資料</td></tr>`;
  return rules.map(r => `<tr>
    <td width="36">${r.id}</td>
    <td><strong>${esc(r.title)}</strong></td>
    <td style="white-space:pre-wrap;max-width:360px">${esc(r.content)}</td>
    <td width="65"><span class="badge ${r.enabled?'on':'off'}">${r.enabled?'啟用':'停用'}</span></td>
    <td width="110">
      <a href="${editBase}/${r.id}/edit" class="btn btn-primary btn-sm">編輯</a>
      <form method="POST" action="${deleteBase}/${r.id}/delete" style="display:inline" onsubmit="return confirm('確定刪除？')">
        <button class="btn btn-danger btn-sm">刪除</button>
      </form>
    </td>
  </tr>`).join('');
}

function faqsTable(faqs, editBase, deleteBase) {
  if (!faqs.length) return `<tr><td colspan="5" class="empty">尚無資料</td></tr>`;
  return faqs.map(f => `<tr>
    <td width="36">${f.id}</td>
    <td style="max-width:200px">${esc(f.question)}</td>
    <td style="white-space:pre-wrap;max-width:360px">${esc(f.answer)}</td>
    <td width="65"><span class="badge ${f.enabled?'on':'off'}">${f.enabled?'啟用':'停用'}</span></td>
    <td width="110">
      <a href="${editBase}/${f.id}/edit" class="btn btn-primary btn-sm">編輯</a>
      <form method="POST" action="${deleteBase}/${f.id}/delete" style="display:inline" onsubmit="return confirm('確定刪除？')">
        <button class="btn btn-danger btn-sm">刪除</button>
      </form>
    </td>
  </tr>`).join('');
}

function csvUploadCard(uploadUrl, type) {
  const isRule = type === 'rules';
  const cols   = isRule ? 'title,content' : 'question,answer';
  const ex1    = isRule ? '回覆語氣,"請以親切口吻回覆顧客"' : '"有哪些付款方式?","提供信用卡、ATM、LINE Pay"';
  return `<div class="card">
    <h3>📥 CSV 批量匯入${isRule ? '守則' : 'FAQ'}（同名自動更新）</h3>
    <p style="font-size:12px;color:#999;margin-bottom:12px">CSV 格式：第一行為欄位名稱 <code>${cols}</code>，UTF-8 編碼</p>
    <p style="font-size:12px;color:#aaa;margin-bottom:14px">範例：<code>${ex1}</code></p>
    <form method="POST" action="${uploadUrl}" enctype="multipart/form-data">
      <input type="file" name="csv" accept=".csv" required>
      <div class="form-actions"><button class="btn btn-primary" type="submit">上傳匯入</button>
        <a href="${uploadUrl}/template?type=${type}" class="btn btn-ghost">下載模板</a>
      </div>
    </form>
  </div>`;
}

function parseCSV(buffer) {
  const lines = buffer.toString('utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const cols = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cols[i] || '').replace(/^"|"$/g, ''); });
    return obj;
  }).filter(r => Object.values(r).some(v => v));
}

// ── Global pages ──────────────────────────────────
function globalPage(req, res, activeTab) {
  const rules = db.getGlobalRules();
  const faqs  = db.getGlobalFaqs();
  const msg   = req.query.msg;
  const alert = msg ? `<div class="alert alert-success">${esc(msg)}</div>` : '';

  const header = `<div class="page-header"><h2>🌐 全域設定</h2>
    <span style="font-size:12px;color:#999">套用於所有品牌</span></div>`;
  const tabs = `<div class="tabs">
    <a href="${BASE}/global/rules" class="tab ${activeTab==='rules'?'active':''}">守則 (${rules.length})</a>
    <a href="${BASE}/global/faqs"  class="tab ${activeTab==='faqs' ?'active':''}">FAQ (${faqs.length})</a>
  </div>`;

  if (activeTab === 'rules') {
    const body = `${header}${tabs}${alert}
    <div class="card"><h3>新增全域守則</h3>
      <form method="POST" action="${BASE}/global/rules">
        <div class="form-row"><div class="grow"><input type="text" name="title" placeholder="守則名稱" required></div></div>
        <textarea name="content" placeholder="守則內容，對所有品牌生效" required></textarea>
        <div class="form-actions"><button class="btn btn-success" type="submit">＋ 新增</button></div>
      </form>
    </div>
    ${csvUploadCard(`${BASE}/global/rules/upload`, 'rules')}
    <div class="card"><table>
      <thead><tr><th>ID</th><th>名稱</th><th>內容</th><th>狀態</th><th>操作</th></tr></thead>
      <tbody>${rulesTable(rules, `${BASE}/global/rules`, `${BASE}/global/rules`)}</tbody>
    </table></div>`;
    return res.send(layout('全域守則', body, 'global'));
  }
  const body = `${header}${tabs}${alert}
  <div class="card"><h3>新增全域 FAQ</h3>
    <form method="POST" action="${BASE}/global/faqs">
      <div class="form-row"><div class="grow"><input type="text" name="question" placeholder="問題" required></div></div>
      <textarea name="answer" placeholder="回覆內容，對所有品牌生效" required></textarea>
      <div class="form-actions"><button class="btn btn-success" type="submit">＋ 新增</button></div>
    </form>
  </div>
  ${csvUploadCard(`${BASE}/global/faqs/upload`, 'faqs')}
  <div class="card"><table>
    <thead><tr><th>ID</th><th>問題</th><th>回覆</th><th>狀態</th><th>操作</th></tr></thead>
    <tbody>${faqsTable(faqs, `${BASE}/global/faqs`, `${BASE}/global/faqs`)}</tbody>
  </table></div>`;
  return res.send(layout('全域 FAQ', body, 'global'));
}

router.get('/global',       requireLogin, (req, res) => res.redirect(`${BASE}/global/rules`));
router.get('/global/rules', requireLogin, (req, res) => globalPage(req, res, 'rules'));
router.get('/global/faqs',  requireLogin, (req, res) => globalPage(req, res, 'faqs'));

router.post('/global/rules', requireLogin, (req, res) => {
  const { title, content } = req.body;
  if (title && content) db.addRule(null, title.trim(), content.trim(), null);
  res.redirect(`${BASE}/global/rules`);
});
router.post('/global/faqs', requireLogin, (req, res) => {
  const { question, answer } = req.body;
  if (question && answer) db.addFaq(null, question.trim(), answer.trim(), null);
  res.redirect(`${BASE}/global/faqs`);
});

// Global CSV upload
router.post('/global/rules/upload', requireLogin, upload.single('csv'), (req, res) => {
  const rows = parseCSV(req.file.buffer);
  let ins = 0, upd = 0;
  rows.forEach(r => { if (r.title && r.content) { const {action} = db.upsertRule(null, null, r.title, r.content); action==='inserted'?ins++:upd++; }});
  res.redirect(`${BASE}/global/rules?msg=${encodeURIComponent(`匯入完成：新增 ${ins} 筆，更新 ${upd} 筆`)}`);
});
router.post('/global/faqs/upload', requireLogin, upload.single('csv'), (req, res) => {
  const rows = parseCSV(req.file.buffer);
  let ins = 0, upd = 0;
  rows.forEach(r => { if (r.question && r.answer) { const {action} = db.upsertFaq(null, null, r.question, r.answer); action==='inserted'?ins++:upd++; }});
  res.redirect(`${BASE}/global/faqs?msg=${encodeURIComponent(`匯入完成：新增 ${ins} 筆，更新 ${upd} 筆`)}`);
});

// CSV template download
router.get('/global/rules/upload/template', requireLogin, (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="rules-template.csv"');
  res.send('﻿' + 'title,content\n守則名稱,守則內容說明\n');
});
router.get('/global/faqs/upload/template', requireLogin, (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="faqs-template.csv"');
  res.send('﻿' + 'question,answer\n問題,回覆內容\n');
});

// Global edit/delete
function editDeleteRoutes(router, pathBase, getList, updateFn, deleteFn, redirectBase, labelField) {
  router.get(`${pathBase}/:id/edit`, requireLogin, (req, res) => {
    const item = getList().find(x => x.id == req.params.id);
    if (!item) return res.redirect(redirectBase);
    const isRule = labelField === 'title';
    const f1 = isRule ? 'title' : 'question';
    const f2 = isRule ? 'content' : 'answer';
    const body = `<div class="page-header"><a href="${redirectBase}" style="color:#1a237e;font-size:13px">← 返回</a></div>
    <div class="card"><h3>編輯</h3>
      <form method="POST" action="${pathBase}/${item.id}/edit">
        <div class="form-row"><div class="grow"><input type="text" name="${f1}" value="${esc(item[f1])}" required></div></div>
        <textarea name="${f2}" required>${esc(item[f2])}</textarea>
        <div style="margin-top:10px"><label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" name="enabled" value="1" ${item.enabled?'checked':''}> 啟用</label></div>
        <div class="form-actions"><button class="btn btn-primary" type="submit">儲存</button><a href="${redirectBase}" class="btn btn-ghost">取消</a></div>
      </form>
    </div>`;
    res.send(layout('編輯', body));
  });
  router.post(`${pathBase}/:id/edit`, requireLogin, (req, res) => {
    const isRule = labelField === 'title';
    if (isRule) updateFn(req.params.id, req.body.title, req.body.content, req.body.enabled?1:0);
    else        updateFn(req.params.id, req.body.question, req.body.answer, req.body.enabled?1:0);
    res.redirect(redirectBase);
  });
  router.post(`${pathBase}/:id/delete`, requireLogin, (req, res) => {
    deleteFn(req.params.id); res.redirect(redirectBase);
  });
}

editDeleteRoutes(router, `${BASE}/global/rules`, db.getGlobalRules, db.updateRule, db.deleteRule, `${BASE}/global/rules`, 'title');
editDeleteRoutes(router, `${BASE}/global/faqs`,  db.getGlobalFaqs,  db.updateFaq,  db.deleteFaq,  `${BASE}/global/faqs`,  'question');

// ── Category pages ────────────────────────────────
function categoryPage(req, res, activeTab) {
  const cat   = decodeURIComponent(req.params.cat);
  const color = CAT_COLOR[cat] || '#546e7a';
  const rules = db.getCategoryRules(cat);
  const faqs  = db.getCategoryFaqs(cat);
  const msg   = req.query.msg;
  const alert = msg ? `<div class="alert alert-success">${esc(msg)}</div>` : '';
  const catEnc = encodeURIComponent(cat);

  const header = `<div class="page-header">
    <h2>${esc(cat)}</h2>
    <span class="badge-cat" style="background:${color}">類別設定</span>
    <span style="font-size:12px;color:#999">套用於此類別所有品牌</span>
  </div>`;
  const tabs = `<div class="tabs">
    <a href="${BASE}/category/${catEnc}/rules" class="tab ${activeTab==='rules'?'active':''}">守則 (${rules.length})</a>
    <a href="${BASE}/category/${catEnc}/faqs"  class="tab ${activeTab==='faqs' ?'active':''}">FAQ (${faqs.length})</a>
  </div>`;

  if (activeTab === 'rules') {
    const body = `${header}${tabs}${alert}
    <div class="card"><h3>新增守則</h3>
      <form method="POST" action="${BASE}/category/${catEnc}/rules">
        <div class="form-row"><div class="grow"><input type="text" name="title" placeholder="守則名稱" required></div></div>
        <textarea name="content" placeholder="守則內容，套用於 ${esc(cat)} 所有品牌" required></textarea>
        <div class="form-actions"><button class="btn btn-success" type="submit">＋ 新增</button></div>
      </form>
    </div>
    ${csvUploadCard(`${BASE}/category/${catEnc}/rules/upload`, 'rules')}
    <div class="card"><table>
      <thead><tr><th>ID</th><th>名稱</th><th>內容</th><th>狀態</th><th>操作</th></tr></thead>
      <tbody>${rulesTable(rules, `${BASE}/category/${catEnc}/rules`, `${BASE}/category/${catEnc}/rules`)}</tbody>
    </table></div>`;
    return res.send(layout(`${cat} — 守則`, body, `cat-${cat}`));
  }
  const body = `${header}${tabs}${alert}
  <div class="card"><h3>新增 FAQ</h3>
    <form method="POST" action="${BASE}/category/${catEnc}/faqs">
      <div class="form-row"><div class="grow"><input type="text" name="question" placeholder="問題" required></div></div>
      <textarea name="answer" placeholder="回覆內容，套用於 ${esc(cat)} 所有品牌" required></textarea>
      <div class="form-actions"><button class="btn btn-success" type="submit">＋ 新增</button></div>
    </form>
  </div>
  ${csvUploadCard(`${BASE}/category/${catEnc}/faqs/upload`, 'faqs')}
  <div class="card"><table>
    <thead><tr><th>ID</th><th>問題</th><th>回覆</th><th>狀態</th><th>操作</th></tr></thead>
    <tbody>${faqsTable(faqs, `${BASE}/category/${catEnc}/faqs`, `${BASE}/category/${catEnc}/faqs`)}</tbody>
  </table></div>`;
  return res.send(layout(`${cat} — FAQ`, body, `cat-${cat}`));
}

router.get('/category/:cat',       requireLogin, (req, res) => res.redirect(`${BASE}/category/${req.params.cat}/rules`));
router.get('/category/:cat/rules', requireLogin, (req, res) => categoryPage(req, res, 'rules'));
router.get('/category/:cat/faqs',  requireLogin, (req, res) => categoryPage(req, res, 'faqs'));

router.post('/category/:cat/rules', requireLogin, (req, res) => {
  const cat = decodeURIComponent(req.params.cat);
  const { title, content } = req.body;
  if (title && content) db.addRule(null, title.trim(), content.trim(), cat);
  res.redirect(`${BASE}/category/${req.params.cat}/rules`);
});
router.post('/category/:cat/faqs', requireLogin, (req, res) => {
  const cat = decodeURIComponent(req.params.cat);
  const { question, answer } = req.body;
  if (question && answer) db.addFaq(null, question.trim(), answer.trim(), cat);
  res.redirect(`${BASE}/category/${req.params.cat}/faqs`);
});

router.post('/category/:cat/rules/upload', requireLogin, upload.single('csv'), (req, res) => {
  const cat = decodeURIComponent(req.params.cat);
  const rows = parseCSV(req.file.buffer);
  let ins=0,upd=0;
  rows.forEach(r => { if(r.title&&r.content){const{action}=db.upsertRule(null,cat,r.title,r.content);action==='inserted'?ins++:upd++;}});
  res.redirect(`${BASE}/category/${req.params.cat}/rules?msg=${encodeURIComponent(`匯入完成：新增 ${ins} 筆，更新 ${upd} 筆`)}`);
});
router.post('/category/:cat/faqs/upload', requireLogin, upload.single('csv'), (req, res) => {
  const cat = decodeURIComponent(req.params.cat);
  const rows = parseCSV(req.file.buffer);
  let ins=0,upd=0;
  rows.forEach(r => { if(r.question&&r.answer){const{action}=db.upsertFaq(null,cat,r.question,r.answer);action==='inserted'?ins++:upd++;}});
  res.redirect(`${BASE}/category/${req.params.cat}/faqs?msg=${encodeURIComponent(`匯入完成：新增 ${ins} 筆，更新 ${upd} 筆`)}`);
});

router.get('/category/:cat/rules/upload/template', requireLogin, (req, res) => {
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="rules-template.csv"');
  res.send('﻿'+'title,content\n守則名稱,守則內容\n');
});
router.get('/category/:cat/faqs/upload/template', requireLogin, (req, res) => {
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="faqs-template.csv"');
  res.send('﻿'+'question,answer\n問題,回覆內容\n');
});

// Category edit/delete (reuse helpers inline)
router.get('/category/:cat/rules/:id/edit', requireLogin, (req, res) => {
  const cat = decodeURIComponent(req.params.cat);
  const rule = db.getCategoryRules(cat).find(r => r.id == req.params.id);
  if (!rule) return res.redirect(`${BASE}/category/${req.params.cat}/rules`);
  const body = `<div class="page-header"><a href="${BASE}/category/${req.params.cat}/rules" style="color:#1a237e;font-size:13px">← 返回</a></div>
  <div class="card"><h3>編輯守則</h3>
    <form method="POST" action="${BASE}/category/${req.params.cat}/rules/${rule.id}/edit">
      <div class="form-row"><div class="grow"><input type="text" name="title" value="${esc(rule.title)}" required></div></div>
      <textarea name="content" required>${esc(rule.content)}</textarea>
      <div style="margin-top:10px"><label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" name="enabled" value="1" ${rule.enabled?'checked':''}> 啟用</label></div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">儲存</button><a href="${BASE}/category/${req.params.cat}/rules" class="btn btn-ghost">取消</a></div>
    </form>
  </div>`;
  res.send(layout('編輯守則', body, `cat-${cat}`));
});
router.post('/category/:cat/rules/:id/edit', requireLogin, (req, res) => {
  db.updateRule(req.params.id, req.body.title, req.body.content, req.body.enabled?1:0);
  res.redirect(`${BASE}/category/${req.params.cat}/rules`);
});
router.post('/category/:cat/rules/:id/delete', requireLogin, (req, res) => {
  db.deleteRule(req.params.id); res.redirect(`${BASE}/category/${req.params.cat}/rules`);
});
router.get('/category/:cat/faqs/:id/edit', requireLogin, (req, res) => {
  const cat = decodeURIComponent(req.params.cat);
  const faq = db.getCategoryFaqs(cat).find(f => f.id == req.params.id);
  if (!faq) return res.redirect(`${BASE}/category/${req.params.cat}/faqs`);
  const body = `<div class="page-header"><a href="${BASE}/category/${req.params.cat}/faqs" style="color:#1a237e;font-size:13px">← 返回</a></div>
  <div class="card"><h3>編輯 FAQ</h3>
    <form method="POST" action="${BASE}/category/${req.params.cat}/faqs/${faq.id}/edit">
      <div class="form-row"><div class="grow"><input type="text" name="question" value="${esc(faq.question)}" required></div></div>
      <textarea name="answer" required>${esc(faq.answer)}</textarea>
      <div style="margin-top:10px"><label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" name="enabled" value="1" ${faq.enabled?'checked':''}> 啟用</label></div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">儲存</button><a href="${BASE}/category/${req.params.cat}/faqs" class="btn btn-ghost">取消</a></div>
    </form>
  </div>`;
  res.send(layout('編輯 FAQ', body, `cat-${cat}`));
});
router.post('/category/:cat/faqs/:id/edit', requireLogin, (req, res) => {
  db.updateFaq(req.params.id, req.body.question, req.body.answer, req.body.enabled?1:0);
  res.redirect(`${BASE}/category/${req.params.cat}/faqs`);
});
router.post('/category/:cat/faqs/:id/delete', requireLogin, (req, res) => {
  db.deleteFaq(req.params.id); res.redirect(`${BASE}/category/${req.params.cat}/faqs`);
});

// ── Brand pages ───────────────────────────────────
function brandPage(req, res, activeTab) {
  const brand = db.getBrandById(req.params.id);
  if (!brand) return res.redirect(BASE);
  const color = CAT_COLOR[brand.category] || '#546e7a';
  const rules = db.getRules(brand.id);
  const faqs  = db.getFaqs(brand.id);
  const msg   = req.query.msg;
  const alert = msg ? `<div class="alert alert-success">${esc(msg)}</div>` : '';

  const header = `<div class="page-header">
    <h2>${esc(brand.name)}</h2>
    <span class="badge-cat" style="background:${color}">${esc(brand.category)}</span>
  </div>`;
  const tabs = `<div class="tabs">
    <a href="${BASE}/brands/${brand.id}/rules" class="tab ${activeTab==='rules'?'active':''}">守則 (${rules.length})</a>
    <a href="${BASE}/brands/${brand.id}/faqs"  class="tab ${activeTab==='faqs' ?'active':''}">FAQ (${faqs.length})</a>
  </div>`;

  if (activeTab === 'rules') {
    const body = `${header}${tabs}${alert}
    <div class="card"><h3>新增守則</h3>
      <form method="POST" action="${BASE}/brands/${brand.id}/rules">
        <div class="form-row"><div class="grow"><input type="text" name="title" placeholder="守則名稱" required></div></div>
        <textarea name="content" placeholder="守則內容" required></textarea>
        <div class="form-actions"><button class="btn btn-success" type="submit">＋ 新增</button></div>
      </form>
    </div>
    ${csvUploadCard(`${BASE}/brands/${brand.id}/rules/upload`, 'rules')}
    <div class="card"><table>
      <thead><tr><th>ID</th><th>名稱</th><th>內容</th><th>狀態</th><th>操作</th></tr></thead>
      <tbody>${rulesTable(rules, `${BASE}/brands/${brand.id}/rules`, `${BASE}/brands/${brand.id}/rules`)}</tbody>
    </table></div>`;
    return res.send(layout(`${brand.name} — 守則`, body, `brand-${brand.id}`));
  }
  const body = `${header}${tabs}${alert}
  <div class="card"><h3>新增 FAQ</h3>
    <form method="POST" action="${BASE}/brands/${brand.id}/faqs">
      <div class="form-row"><div class="grow"><input type="text" name="question" placeholder="問題" required></div></div>
      <textarea name="answer" placeholder="回覆內容" required></textarea>
      <div class="form-actions"><button class="btn btn-success" type="submit">＋ 新增</button></div>
    </form>
  </div>
  ${csvUploadCard(`${BASE}/brands/${brand.id}/faqs/upload`, 'faqs')}
  <div class="card"><table>
    <thead><tr><th>ID</th><th>問題</th><th>回覆</th><th>狀態</th><th>操作</th></tr></thead>
    <tbody>${faqsTable(faqs, `${BASE}/brands/${brand.id}/faqs`, `${BASE}/brands/${brand.id}/faqs`)}</tbody>
  </table></div>`;
  return res.send(layout(`${brand.name} — FAQ`, body, `brand-${brand.id}`));
}

router.get('/brands/:id',       requireLogin, (req, res) => res.redirect(`${BASE}/brands/${req.params.id}/rules`));
router.get('/brands/:id/rules', requireLogin, (req, res) => brandPage(req, res, 'rules'));
router.get('/brands/:id/faqs',  requireLogin, (req, res) => brandPage(req, res, 'faqs'));

router.post('/brands/:id/rules', requireLogin, (req, res) => {
  const { title, content } = req.body;
  if (title && content) db.addRule(req.params.id, title.trim(), content.trim(), null);
  res.redirect(`${BASE}/brands/${req.params.id}/rules`);
});
router.post('/brands/:id/faqs', requireLogin, (req, res) => {
  const { question, answer } = req.body;
  if (question && answer) db.addFaq(req.params.id, question.trim(), answer.trim(), null);
  res.redirect(`${BASE}/brands/${req.params.id}/faqs`);
});

router.post('/brands/:id/rules/upload', requireLogin, upload.single('csv'), (req, res) => {
  const brandId = parseInt(req.params.id);
  const rows = parseCSV(req.file.buffer);
  let ins=0,upd=0;
  rows.forEach(r => { if(r.title&&r.content){const{action}=db.upsertRule(brandId,null,r.title,r.content);action==='inserted'?ins++:upd++;}});
  res.redirect(`${BASE}/brands/${req.params.id}/rules?msg=${encodeURIComponent(`匯入完成：新增 ${ins} 筆，更新 ${upd} 筆`)}`);
});
router.post('/brands/:id/faqs/upload', requireLogin, upload.single('csv'), (req, res) => {
  const brandId = parseInt(req.params.id);
  const rows = parseCSV(req.file.buffer);
  let ins=0,upd=0;
  rows.forEach(r => { if(r.question&&r.answer){const{action}=db.upsertFaq(brandId,null,r.question,r.answer);action==='inserted'?ins++:upd++;}});
  res.redirect(`${BASE}/brands/${req.params.id}/faqs?msg=${encodeURIComponent(`匯入完成：新增 ${ins} 筆，更新 ${upd} 筆`)}`);
});

router.get('/brands/:id/rules/upload/template', requireLogin, (req, res) => {
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="rules-template.csv"');
  res.send('﻿'+'title,content\n守則名稱,守則內容\n');
});
router.get('/brands/:id/faqs/upload/template', requireLogin, (req, res) => {
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="faqs-template.csv"');
  res.send('﻿'+'question,answer\n問題,回覆內容\n');
});

router.get('/brands/:id/rules/:rid/edit', requireLogin, (req, res) => {
  const brand = db.getBrandById(req.params.id);
  const rule  = db.getRules(req.params.id).find(r => r.id == req.params.rid);
  if (!brand||!rule) return res.redirect(`${BASE}/brands/${req.params.id}/rules`);
  const body = `<div class="page-header"><a href="${BASE}/brands/${brand.id}/rules" style="color:#1a237e;font-size:13px">← 返回</a></div>
  <div class="card"><h3>編輯守則</h3>
    <form method="POST" action="${BASE}/brands/${brand.id}/rules/${rule.id}/edit">
      <div class="form-row"><div class="grow"><input type="text" name="title" value="${esc(rule.title)}" required></div></div>
      <textarea name="content" required>${esc(rule.content)}</textarea>
      <div style="margin-top:10px"><label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" name="enabled" value="1" ${rule.enabled?'checked':''}> 啟用</label></div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">儲存</button><a href="${BASE}/brands/${brand.id}/rules" class="btn btn-ghost">取消</a></div>
    </form>
  </div>`;
  res.send(layout('編輯守則', body, `brand-${brand.id}`));
});
router.post('/brands/:id/rules/:rid/edit', requireLogin, (req, res) => {
  db.updateRule(req.params.rid, req.body.title, req.body.content, req.body.enabled?1:0);
  res.redirect(`${BASE}/brands/${req.params.id}/rules`);
});
router.post('/brands/:id/rules/:rid/delete', requireLogin, (req, res) => {
  db.deleteRule(req.params.rid); res.redirect(`${BASE}/brands/${req.params.id}/rules`);
});

router.get('/brands/:id/faqs/:fid/edit', requireLogin, (req, res) => {
  const brand = db.getBrandById(req.params.id);
  const faq   = db.getFaqs(req.params.id).find(f => f.id == req.params.fid);
  if (!brand||!faq) return res.redirect(`${BASE}/brands/${req.params.id}/faqs`);
  const body = `<div class="page-header"><a href="${BASE}/brands/${brand.id}/faqs" style="color:#1a237e;font-size:13px">← 返回</a></div>
  <div class="card"><h3>編輯 FAQ</h3>
    <form method="POST" action="${BASE}/brands/${brand.id}/faqs/${faq.id}/edit">
      <div class="form-row"><div class="grow"><input type="text" name="question" value="${esc(faq.question)}" required></div></div>
      <textarea name="answer" required>${esc(faq.answer)}</textarea>
      <div style="margin-top:10px"><label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" name="enabled" value="1" ${faq.enabled?'checked':''}> 啟用</label></div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">儲存</button><a href="${BASE}/brands/${brand.id}/faqs" class="btn btn-ghost">取消</a></div>
    </form>
  </div>`;
  res.send(layout('編輯 FAQ', body, `brand-${brand.id}`));
});
router.post('/brands/:id/faqs/:fid/edit', requireLogin, (req, res) => {
  db.updateFaq(req.params.fid, req.body.question, req.body.answer, req.body.enabled?1:0);
  res.redirect(`${BASE}/brands/${req.params.id}/faqs`);
});
router.post('/brands/:id/faqs/:fid/delete', requireLogin, (req, res) => {
  db.deleteFaq(req.params.fid); res.redirect(`${BASE}/brands/${req.params.id}/faqs`);
});

// ── Sandbox ───────────────────────────────────────
router.get('/sandbox', requireLogin, (req, res) => {
  const allBrands = db.getBrands().filter(b => b.enabled);
  const defaultBrandId = parseInt(process.env.BRAND_ID || '7');
  const brandId = req.query.brand ? parseInt(req.query.brand) : defaultBrandId;
  const brand   = db.getBrandById(brandId) || db.getBrandById(defaultBrandId);
  const safeBrandId = brand?.id || defaultBrandId;

  const brandOptions = allBrands.map(b =>
    `<option value="${b.id}"${b.id === safeBrandId ? ' selected' : ''}>${esc(b.name)}</option>`
  ).join('');

  const body = `
  <div class="page-header" style="margin-bottom:12px">
    <h2>🧪 沙盒測試</h2>
    <span style="font-size:12px;color:#999">直接與 AI 對話，測試守則與 FAQ 設定是否正確。對話不會送出到 Omnichat。</span>
  </div>
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
    <label style="font-size:13px;color:#555;display:flex;align-items:center;gap:8px">
      測試品牌：
      <select id="brand-select" onchange="switchBrand(this.value)"
        style="padding:5px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;background:#fff">
        ${brandOptions}
      </select>
    </label>
    <button onclick="clearChat()" class="btn btn-ghost btn-sm">🗑 清除對話</button>
  </div>
  <div class="card" style="padding:0;display:flex;flex-direction:column;height:calc(100vh - 220px);min-height:400px">
    <div id="chat-log" style="flex:1;overflow-y:auto;padding:18px 20px;display:flex;flex-direction:column;gap:10px"></div>
    <div style="border-top:1px solid #eee;padding:12px 16px;display:flex;gap:8px;background:#fafafa;border-radius:0 0 10px 10px">
      <input id="chat-input" type="text" placeholder="輸入訊息，按 Enter 送出…" style="flex:1;margin:0"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMsg()}">
      <button onclick="sendMsg()" class="btn btn-primary">送出</button>
    </div>
  </div>

  <script>
  const log = document.getElementById('chat-log');
  const input = document.getElementById('chat-input');
  let currentBrandId = ${safeBrandId};

  function switchBrand(newBrandId) {
    if (parseInt(newBrandId) === currentBrandId) return;
    currentBrandId = parseInt(newBrandId);
    // Clear chat history on server for this session+brand
    fetch('${BASE}/sandbox/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId: currentBrandId }),
    });
    log.innerHTML = '';
    appendBubble('ai', '已切換品牌，對話已重置。請開始測試。');
    // Update URL without reload
    const url = new URL(window.location);
    url.searchParams.set('brand', currentBrandId);
    history.replaceState(null, '', url);
  }

  function appendBubble(role, text) {
    const isUser = role === 'user';
    const isErr  = role === 'error';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:' + (isUser ? 'flex-end' : 'flex-start');
    const label = document.createElement('span');
    label.style.cssText = 'font-size:11px;color:#bbb;margin-bottom:3px';
    label.textContent = isUser ? '您' : isErr ? '系統錯誤' : 'AI 客服';
    const bubble = document.createElement('div');
    bubble.style.cssText = 'padding:10px 14px;border-radius:12px;max-width:78%;font-size:13px;line-height:1.65;white-space:pre-wrap;word-break:break-word;background:'
      + (isUser ? '#1a237e;color:#fff' : isErr ? '#fce4ec;color:#c62828' : '#f1f3f4;color:#333');
    bubble.textContent = text;
    wrap.appendChild(label);
    wrap.appendChild(bubble);
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return wrap;
  }

  function appendThinking() {
    const wrap = appendBubble('ai', '正在思考中…');
    wrap.querySelector('div').style.opacity = '0.5';
    return wrap;
  }

  async function sendMsg() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.disabled = true;
    appendBubble('user', text);
    const thinking = appendThinking();
    try {
      const res = await fetch('${BASE}/sandbox/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, brandId: currentBrandId }),
      });
      const data = await res.json();
      thinking.remove();
      if (data.shouldTransfer) {
        appendBubble('ai', '⚡ [轉接] 此情況會轉接真人客服');
      } else if (data.error) {
        appendBubble('error', data.error);
      } else {
        appendBubble('ai', data.reply);
      }
    } catch (e) {
      thinking.remove();
      appendBubble('error', '連線失敗：' + e.message);
    }
    input.disabled = false;
    input.focus();
  }

  async function clearChat() {
    if (!confirm('確定清除目前對話？')) return;
    await fetch('${BASE}/sandbox/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId: currentBrandId }),
    });
    log.innerHTML = '';
    appendBubble('ai', '對話已清除，可以重新開始測試。');
  }

  // Welcome message
  appendBubble('ai', '您好！我是 AI 客服助理，請輸入問題開始測試。');
  input.focus();
  </script>`;

  res.send(layout('沙盒測試', body, 'sandbox'));
});

router.post('/sandbox/chat', requireLogin, async (req, res) => {
  const brandId  = req.body.brandId ? parseInt(req.body.brandId) : parseInt(process.env.BRAND_ID || '7');
  const roomId   = `sandbox-${req.session.id}-${brandId}`;
  const userText = (req.body.message || '').trim();
  if (!userText) return res.json({ error: '訊息不能為空' });
  try {
    const { reply, shouldTransfer } = await getAIReply({ roomId, userText, brandId });
    res.json({ reply, shouldTransfer });
  } catch (err) {
    console.error('[sandbox] AI error:', err.message);
    res.json({ error: err.message });
  }
});

router.post('/sandbox/clear', requireLogin, (req, res) => {
  const brandId = req.body.brandId ? parseInt(req.body.brandId) : parseInt(process.env.BRAND_ID || '7');
  clearHistory(`sandbox-${req.session.id}-${brandId}`);
  res.json({ ok: true });
});

// ── Conversation Logs ─────────────────────────────
router.get('/logs', requireLogin, (req, res) => {
  const brandId  = req.query.brand    ? parseInt(req.query.brand) : null;
  const platform = req.query.platform || null;
  const search   = req.query.q        || null;
  const brands   = db.getBrands();
  const platforms= db.getLogPlatforms();
  const rooms    = db.getLogRooms({ brandId, platform, search });

  // Build a query string helper (keeps existing filters when adding one more)
  function qs(extra) {
    const p = {};
    if (brandId)  p.brand    = brandId;
    if (platform) p.platform = platform;
    if (search)   p.q        = search;
    Object.assign(p, extra);
    // remove nulls
    Object.keys(p).forEach(k => { if (!p[k] && p[k] !== 0) delete p[k]; });
    const str = new URLSearchParams(p).toString();
    return str ? '?' + str : '';
  }

  const brandFilter = `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
    <span style="font-size:12px;color:#888;white-space:nowrap;min-width:32px">品牌：</span>
    <a href="${BASE}/logs${qs({brand:null})}" class="btn btn-sm ${!brandId?'btn-primary':'btn-ghost'}">全部</a>
    ${brands.map(b=>`<a href="${BASE}/logs${qs({brand:b.id})}" class="btn btn-sm ${brandId===b.id?'btn-primary':'btn-ghost'}">${esc(b.name)}</a>`).join('')}
  </div>`;

  const platFilter = platforms.length ? `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px">
    <span style="font-size:12px;color:#888;white-space:nowrap;min-width:32px">平台：</span>
    <a href="${BASE}/logs${qs({platform:null})}" class="btn btn-sm ${!platform?'btn-primary':'btn-ghost'}">全部</a>
    ${platforms.map(p=>`<a href="${BASE}/logs${qs({platform:p})}" class="btn btn-sm ${platform===p?'btn-primary':'btn-ghost'}">${esc(p)}</a>`).join('')}
  </div>` : '';

  const clearSearch = search ? `<a href="${BASE}/logs${qs({q:null})}" class="btn btn-ghost btn-sm">✕ 清除</a>` : '';
  const searchBox = `<form method="GET" action="${BASE}/logs" style="margin-top:10px;display:flex;gap:8px;align-items:center">
    ${brandId  ? `<input type="hidden" name="brand"    value="${brandId}">` : ''}
    ${platform ? `<input type="hidden" name="platform" value="${esc(platform)}">` : ''}
    <input type="text" name="q" value="${esc(search||'')}" placeholder="搜尋 Room ID..." style="width:220px;margin:0">
    <button class="btn btn-ghost btn-sm" type="submit">🔍 搜尋</button>
    ${clearSearch}
  </form>`;

  const rows = rooms.length
    ? rooms.map(r=>`<tr>
        <td><span class="plat-badge">${esc(r.platform||'—')}</span></td>
        <td>${esc(r.brand_name||'—')}</td>
        <td>${r.msg_count}</td>
        <td style="font-size:12px;color:#888">${esc(r.last_msg)}</td>
        <td><a href="${BASE}/logs/room/${encodeURIComponent(r.room_id)}" class="btn btn-primary btn-sm">查看</a></td>
      </tr>`).join('')
    : `<tr><td colspan="5" class="empty">尚無對話紀錄</td></tr>`;

  const body = `<h2>📋 對話紀錄</h2>
  <p style="color:#999;font-size:13px;margin-bottom:16px">顯示最近 100 個對話</p>
  <div class="card" style="margin-bottom:16px;padding:14px 18px">
    ${brandFilter}${platFilter}${searchBox}
  </div>
  <div class="card"><table>
    <thead><tr><th>平台</th><th>品牌</th><th>訊息數</th><th>最後時間</th><th>操作</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
  res.send(layout('對話紀錄', body, 'logs'));
});

router.get('/logs/room/:roomId', requireLogin, (req, res) => {
  const roomId = decodeURIComponent(req.params.roomId);
  const msgs   = db.getRoomMessages(roomId);
  const bubbles = msgs.map(m => {
    const isUser = m.role === 'user';
    const bg = isUser ? '#e3f2fd' : '#e8f5e9';
    const align = isUser ? 'flex-start' : 'flex-end';
    return `<div style="display:flex;flex-direction:column;align-items:${align};margin-bottom:10px">
      <span style="font-size:11px;color:#bbb;margin-bottom:3px">${isUser?'顧客':'AI'} · ${esc(m.created_at)}</span>
      <div style="background:${bg};padding:10px 14px;border-radius:10px;max-width:75%;font-size:13px;line-height:1.6;white-space:pre-wrap">${esc(m.message)}</div>
    </div>`;
  }).join('') || '<p class="empty">無訊息紀錄</p>';

  const body = `<div class="page-header">
    <a href="${BASE}/logs" style="color:#1a237e;text-decoration:none;font-size:13px">← 返回列表</a>
    <h2 style="font-size:14px;font-family:monospace;margin-left:8px">${esc(roomId)}</h2>
  </div>
  <div class="card" style="max-width:680px">${bubbles}</div>`;
  res.send(layout('對話內容', body, 'logs'));
});

// ── Product Cache Debug ───────────────────────────
router.get('/products', requireLogin, (req, res) => {
  const allCache = getProductCache();
  const q = (req.query.q || '').toLowerCase().trim();
  const showAll = req.query.all === '1';
  const base = showAll ? allCache : allCache.filter(p => p.published);

  const filtered = q
    ? base.filter(p => {
        const tagStr = p.tags.map(t => typeof t === 'string' ? t : (t?.name || '')).join(' ').toLowerCase();
        return p.title.toLowerCase().includes(q) || p.handle.toLowerCase().includes(q) ||
               p.brief.toLowerCase().includes(q) || p.type.toLowerCase().includes(q) || tagStr.includes(q);
      })
    : base;

  const pubCount = allCache.filter(p => p.published).length;

  const rows = filtered.slice(0, 100).map(p => `<tr>
    <td style="font-size:11px;color:#888">${p.id}</td>
    <td><strong>${esc(p.title)}</strong>${p.published?'':' <span style="font-size:10px;color:#e65100;background:#fff3e0;padding:1px 5px;border-radius:3px">未發布</span>'}</td>
    <td style="font-size:12px;color:#888;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.brief.slice(0,60))}</td>
    <td style="font-size:12px">${esc(p.type)}</td>
    <td style="font-size:11px;color:#888">${esc(Array.isArray(p.tags) ? p.tags.map(t=>typeof t==='string'?t:(t?.name||'')).join(', ') : '')}</td>
    <td><span class="badge ${p.inStock?'on':'off'}">${p.inStock?'有貨':'缺貨'}</span></td>
    <td style="font-size:12px">${p.price ? '$'+p.price : '—'}</td>
  </tr>`).join('') || `<tr><td colspan="7" class="empty">無結果</td></tr>`;

  const toggleAllUrl = `${BASE}/products${q?`?q=${encodeURIComponent(q)}&`:'?'}all=${showAll?'0':'1'}`;

  const body = `<div class="page-header">
    <h2>🛍 商品快取 debug</h2>
    <span style="font-size:12px;color:#999">全部 ${allCache.length} 個 ／ 已發布 ${pubCount} 個（顯示前 100 筆）</span>
    <form method="GET" action="${BASE}/products" style="display:flex;gap:8px;align-items:center;margin-left:auto">
      <input type="hidden" name="all" value="${showAll?'1':'0'}">
      <input type="text" name="q" value="${esc(req.query.q||'')}" placeholder="搜尋標題/handle/簡介…" style="width:220px;margin:0">
      <button class="btn btn-ghost btn-sm" type="submit">🔍</button>
      ${q ? `<a href="${BASE}/products${showAll?'?all=1':''}" class="btn btn-ghost btn-sm">✕</a>` : ''}
    </form>
    <a href="${toggleAllUrl}" class="btn btn-sm ${showAll?'btn-primary':'btn-ghost'}" style="margin-left:8px">${showAll?'✅ 含未發布':'包含未發布'}</a>
    <form method="POST" action="${BASE}/products/reload" style="margin-left:8px">
      <button class="btn btn-primary btn-sm" type="submit">🔄 重新載入快取</button>
    </form>
  </div>
  <div class="card" style="padding:0;overflow:hidden">
    <table>
      <thead><tr><th>ID</th><th>標題</th><th>簡介</th><th>類型</th><th>Tags</th><th>庫存</th><th>售價</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
  res.send(layout('商品快取', body, 'products'));
});

router.post('/products/reload', requireLogin, async (req, res) => {
  await loadAllProducts();
  res.redirect(`${BASE}/products`);
});

// ── Review Templates ──────────────────────────────
router.get('/reviews', requireLogin, (req, res) => {
  const templates = db.getAllReviewTemplates();

  // Group by category
  const catOrder = ['通用', '保健品', '保養品', '寵物', '清潔用品'];
  const grouped = {};
  catOrder.forEach(c => { grouped[c] = []; });
  templates.forEach(t => { (grouped[t.category] || (grouped[t.category] = [])).push(t); });

  const catColors = { '通用':'#546e7a','保健品':'#2e7d32','保養品':'#6a1b9a','寵物':'#e65100','清潔用品':'#1565c0' };

  const sections = Object.entries(grouped).filter(([,list]) => list.length).map(([cat, list]) => {
    const color = catColors[cat] || '#546e7a';
    const activeCount  = list.filter(t => t.active).length;
    const rows = list.map(t => `<tr>
      <td width="60" style="font-family:monospace;font-size:12px">${esc(t.template_id)}</td>
      <td style="font-size:12px;color:#888">${esc(t.sub_category)}</td>
      <td style="max-width:380px;white-space:pre-wrap;font-size:12px;line-height:1.5">${esc(t.template_text)}</td>
      <td width="70"><span class="badge ${t.active?'on':'off'}">${t.active?'啟用':'停用'}</span></td>
      <td width="130" style="white-space:nowrap">
        <a href="${BASE}/reviews/${t.id}/edit" class="btn btn-primary btn-sm">編輯</a>
        <form method="POST" action="${BASE}/reviews/${t.id}/toggle" style="display:inline">
          <input type="hidden" name="active" value="${t.active?'0':'1'}">
          <button class="btn btn-sm ${t.active?'btn-ghost':'btn-success'}">${t.active?'停用':'啟用'}</button>
        </form>
      </td>
    </tr>`).join('');

    return `<div class="section-title" style="color:${color}">${cat} <span style="font-weight:400;font-size:11px">(${activeCount}/${list.length} 啟用)</span></div>
    <div class="card" style="padding:0;margin-bottom:20px;overflow:hidden">
      <table>
        <thead><tr><th>ID</th><th>情境</th><th>模板內容</th><th>狀態</th><th>操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');

  const body = `<div class="page-header">
    <h2>🏷 評論模板管理</h2>
    <span style="font-size:12px;color:#999">管理蝦皮評論自動回覆模板。啟用的模板才會被 AI 選用。</span>
  </div>
  ${sections}`;
  res.send(layout('評論模板', body, 'reviews'));
});

router.get('/reviews/:id/edit', requireLogin, (req, res) => {
  const tpl = db.getReviewTemplateById(req.params.id);
  if (!tpl) return res.redirect(`${BASE}/reviews`);
  const body = `<div class="page-header">
    <a href="${BASE}/reviews" style="color:#1a237e;font-size:13px">← 返回模板列表</a>
  </div>
  <div class="card" style="max-width:680px">
    <h3>編輯模板 ${esc(tpl.template_id)}</h3>
    <p style="font-size:12px;color:#888;margin-bottom:14px">類別：${esc(tpl.category)} ／ 情境：${esc(tpl.sub_category)}</p>
    <form method="POST" action="${BASE}/reviews/${tpl.id}/edit">
      <textarea name="template_text" rows="8" style="width:100%;font-size:13px" required>${esc(tpl.template_text)}</textarea>
      <div class="form-actions" style="margin-top:12px">
        <button class="btn btn-primary" type="submit">儲存</button>
        <a href="${BASE}/reviews" class="btn btn-ghost">取消</a>
      </div>
    </form>
  </div>`;
  res.send(layout('編輯模板', body, 'reviews'));
});

router.post('/reviews/:id/edit', requireLogin, (req, res) => {
  const text = (req.body.template_text || '').trim();
  if (text) db.updateReviewTemplateText(req.params.id, text);
  res.redirect(`${BASE}/reviews`);
});

router.post('/reviews/:id/toggle', requireLogin, (req, res) => {
  const active = req.body.active === '1' ? 1 : 0;
  db.toggleReviewTemplate(req.params.id, active);
  res.redirect(`${BASE}/reviews`);
});

module.exports = router;
