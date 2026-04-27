'use strict';

const { Router } = require('express');
const multer = require('multer');
const db = require('./db');

const router = Router();
const BASE = '/tsa-ai-agent-manage';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const CATEGORIES = ['保健品', '寵物品牌', '保養品', '個人清潔用品'];
const CAT_COLOR = { '保健品':'#2e7d32','寵物品牌':'#e65100','保養品':'#6a1b9a','個人清潔用品':'#1565c0','其他':'#546e7a' };

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
    const list = grouped[cat];
    if (!list?.length) return '';
    const color = CAT_COLOR[cat] || '#546e7a';
    const brandItems = list.map(b =>
      `<a href="${BASE}/brands/${b.id}" class="sb-item sb-brand${activeKey===`brand-${b.id}`?' active':''}">${esc(b.name)}</a>`
    ).join('');
    return `<div class="sb-group">
      <a href="${BASE}/category/${encodeURIComponent(cat)}" class="sb-item sb-cat-link${activeKey===`cat-${cat}`?' active':''}" style="color:${color}">
        <span>${cat}</span>
      </a>
      ${brandItems}
    </div>`;
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
.sb-cat-link{font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px;padding:8px 16px 5px}
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
      <a href="${BASE}/global" class="sb-item${activeKey==='global'?' active':''}">🌐 全域設定</a>
      <a href="${BASE}/logs"   class="sb-item${activeKey==='logs'  ?' active':''}">📋 對話紀錄</a>
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
    const list = grouped[cat];
    if (!list?.length) return '';
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

// ── Conversation Logs ─────────────────────────────
router.get('/logs', requireLogin, (req, res) => {
  const brandId = req.query.brand ? parseInt(req.query.brand) : null;
  const brands  = db.getBrands();
  const rooms   = db.getLogRooms(brandId);

  const filter = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:18px;flex-wrap:wrap">
    <span style="font-size:12px;color:#888">篩選：</span>
    <a href="${BASE}/logs" class="btn btn-sm ${!brandId?'btn-primary':'btn-ghost'}">全部</a>
    ${brands.map(b=>`<a href="${BASE}/logs?brand=${b.id}" class="btn btn-sm ${brandId===b.id?'btn-primary':'btn-ghost'}">${esc(b.name)}</a>`).join('')}
  </div>`;

  const rows = rooms.length
    ? rooms.map(r=>`<tr>
        <td><a href="${BASE}/logs/room/${encodeURIComponent(r.room_id)}" style="color:#1a237e;text-decoration:none;font-family:monospace;font-size:12px">${esc(r.room_id.slice(-12))}</a></td>
        <td>${esc(r.brand_name||'—')}</td>
        <td>${esc(r.platform||'—')}</td>
        <td>${r.msg_count}</td>
        <td style="font-size:12px;color:#888">${esc(r.last_msg)}</td>
        <td><a href="${BASE}/logs/room/${encodeURIComponent(r.room_id)}" class="btn btn-primary btn-sm">查看</a></td>
      </tr>`).join('')
    : `<tr><td colspan="6" class="empty">尚無對話紀錄</td></tr>`;

  const body = `<h2>📋 對話紀錄</h2>
  <p style="color:#999;font-size:13px;margin-bottom:16px">顯示最近 50 個對話</p>
  ${filter}
  <div class="card"><table>
    <thead><tr><th>Room ID</th><th>品牌</th><th>平台</th><th>訊息數</th><th>最後時間</th><th>操作</th></tr></thead>
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

module.exports = router;
