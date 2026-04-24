'use strict';

const { Router } = require('express');
const db = require('./db');

const router = Router();
const BASE = '/tsa-ai-agent-manage';

const CATEGORY_ORDER = ['保健品', '寵物品牌', '保養品', '個人清潔用品', '其他'];
const CATEGORY_COLOR = {
  '保健品':     '#2e7d32',
  '寵物品牌':   '#e65100',
  '保養品':     '#6a1b9a',
  '個人清潔用品':'#1565c0',
  '其他':       '#546e7a',
};

function requireLogin(req, res, next) {
  if (req.session.loggedIn) return next();
  res.redirect(`${BASE}/login`);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function layout(title, body, activeBrand) {
  const brands = db.getBrands();
  const grouped = {};
  CATEGORY_ORDER.forEach(c => { grouped[c] = []; });
  brands.forEach(b => {
    if (!grouped[b.category]) grouped[b.category] = [];
    grouped[b.category].push(b);
  });

  const sidebar = CATEGORY_ORDER.map(cat => {
    const list = grouped[cat];
    if (!list?.length) return '';
    const color = CATEGORY_COLOR[cat] || '#546e7a';
    const items = list.map(b => {
      const active = activeBrand && activeBrand.id === b.id;
      return `<a href="${BASE}/brands/${b.id}" class="sb-brand${active ? ' active' : ''}${!b.enabled ? ' disabled' : ''}">
        ${esc(b.name)}
        <span class="sb-badges">
          ${b.has_omnichat ? '<span class="dot dot-line" title="Omnichat">L</span>' : ''}
          ${b.has_shopee   ? '<span class="dot dot-shopee" title="蝦皮">蝦</span>' : ''}
        </span>
      </a>`;
    }).join('');
    return `<div class="sb-group">
      <div class="sb-cat" style="color:${color}">${cat}</div>
      ${items}
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
.topbar{background:#1a237e;color:#fff;padding:0 24px;height:52px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;z-index:10}
.topbar-title{font-size:16px;font-weight:700;letter-spacing:.5px}
.topbar nav a{color:rgba(255,255,255,.8);text-decoration:none;font-size:13px;margin-left:20px}
.topbar nav a:hover{color:#fff}
.body-wrap{display:flex;flex:1;overflow:hidden}
.sidebar{width:200px;background:#fff;border-right:1px solid #e8e8e8;overflow-y:auto;flex-shrink:0;padding:16px 0}
.sb-group{margin-bottom:8px}
.sb-cat{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;padding:8px 16px 4px;opacity:.9}
.sb-brand{display:flex;align-items:center;justify-content:space-between;padding:7px 16px;font-size:13px;color:#444;text-decoration:none;transition:background .15s}
.sb-brand:hover{background:#f5f5f5}
.sb-brand.active{background:#e8eaf6;color:#1a237e;font-weight:600}
.sb-brand.disabled{opacity:.4}
.sb-badges{display:flex;gap:3px}
.dot{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;font-size:9px;font-weight:700;color:#fff}
.dot-line{background:#06c755}
.dot-shopee{background:#ee4d2d}
.main{flex:1;overflow-y:auto;padding:28px 32px}
h2{font-size:20px;margin-bottom:6px}
.brand-header{display:flex;align-items:center;gap:12px;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #e0e0e0}
.brand-badge{padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;color:#fff}
.channel-tags{display:flex;gap:6px;margin-left:auto}
.channel-tag{padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600}
.channel-tag.line{background:#e8f5e9;color:#2e7d32}
.channel-tag.shopee{background:#fff3e0;color:#e65100}
.channel-tag.off{background:#f5f5f5;color:#999}
.tabs{display:flex;gap:0;margin-bottom:24px;border-bottom:2px solid #e0e0e0}
.tab{padding:10px 20px;font-size:14px;font-weight:600;color:#666;text-decoration:none;border-bottom:2px solid transparent;margin-bottom:-2px}
.tab:hover{color:#1a237e}
.tab.active{color:#1a237e;border-bottom-color:#1a237e}
.card{background:#fff;border-radius:10px;padding:24px;margin-bottom:24px;box-shadow:0 1px 4px rgba(0,0,0,.07)}
.card h3{font-size:15px;margin-bottom:16px;color:#444}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:9px 12px;border-bottom:2px solid #eee;color:#888;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.4px}
td{padding:9px 12px;border-bottom:1px solid #f5f5f5;vertical-align:top}
tr:last-child td{border-bottom:none}
.badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600}
.badge.on{background:#e8f5e9;color:#2e7d32}
.badge.off{background:#fce4ec;color:#c62828}
input[type=text],textarea{width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:inherit}
input[type=text]:focus,textarea:focus{outline:none;border-color:#3f51b5}
textarea{min-height:80px;resize:vertical}
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;text-decoration:none;transition:opacity .15s}
.btn:hover{opacity:.85}
.btn-primary{background:#1a237e;color:#fff}
.btn-success{background:#2e7d32;color:#fff}
.btn-danger{background:#c62828;color:#fff}
.btn-ghost{background:#f0f0f0;color:#444}
.btn-sm{padding:4px 10px;font-size:12px}
.form-row{display:flex;gap:12px;margin-bottom:10px}
.form-row .grow{flex:1}
.form-actions{display:flex;gap:8px;margin-top:14px}
.empty{color:#bbb;font-size:13px;padding:24px 0;text-align:center}
.dashboard-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:32px}
.brand-card{background:#fff;border-radius:10px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,.07);text-decoration:none;color:#333;transition:box-shadow .2s,transform .2s;display:flex;flex-direction:column;gap:8px}
.brand-card:hover{box-shadow:0 4px 16px rgba(0,0,0,.12);transform:translateY(-2px)}
.brand-card-name{font-size:17px;font-weight:700}
.brand-card-cat{font-size:12px;padding:2px 8px;border-radius:99px;color:#fff;display:inline-block;margin-bottom:4px}
.brand-card-channels{display:flex;gap:6px;margin-top:4px}
.stat{font-size:12px;color:#888}
.section-title{font-size:13px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.6px;margin:28px 0 12px}
</style>
</head>
<body>
<div class="topbar">
  <span class="topbar-title">TSA AI Agent 管理後台</span>
  <nav>
    <a href="${BASE}">品牌總覽</a>
    <a href="${BASE}/logout">登出</a>
  </nav>
</div>
<div class="body-wrap">
  <div class="sidebar">${sidebar}</div>
  <div class="main">${body}</div>
</div>
</body></html>`;
}

// ── Auth ──────────────────────────────────────────
router.get('/login', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="UTF-8"><title>登入 — TSA AI Agent</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,sans-serif;background:#f0f2f5;display:flex;align-items:center;justify-content:center;min-height:100vh}
.box{background:#fff;padding:40px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.1);width:340px}
h2{margin-bottom:8px;color:#1a237e;font-size:22px}
p{color:#888;font-size:13px;margin-bottom:28px}
input{width:100%;padding:11px 12px;margin-bottom:14px;border:1px solid #ddd;border-radius:7px;font-size:14px}
input:focus{outline:none;border-color:#3f51b5}
button{width:100%;padding:11px;background:#1a237e;color:#fff;border:none;border-radius:7px;font-size:15px;font-weight:600;cursor:pointer}
.err{color:#c62828;font-size:13px;margin-bottom:12px}
</style></head>
<body><div class="box">
<h2>TSA AI Agent</h2>
<p>請輸入管理密碼登入後台</p>
${req.query.err ? '<p class="err">密碼錯誤，請重試</p>' : ''}
<form method="POST" action="${BASE}/login">
  <input type="password" name="password" placeholder="管理密碼" autofocus>
  <button type="submit">登入</button>
</form>
</div></body></html>`);
});

router.post('/login', (req, res) => {
  if (req.body.password === process.env.ADMIN_PASSWORD) {
    req.session.loggedIn = true;
    res.redirect(BASE);
  } else {
    res.redirect(`${BASE}/login?err=1`);
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect(`${BASE}/login`);
});

// ── Dashboard ─────────────────────────────────────
router.get('/', requireLogin, (req, res) => {
  const brands = db.getBrands();
  const grouped = {};
  CATEGORY_ORDER.forEach(c => { grouped[c] = []; });
  brands.forEach(b => {
    if (!grouped[b.category]) grouped[b.category] = [];
    grouped[b.category].push(b);
  });

  const sections = CATEGORY_ORDER.map(cat => {
    const list = grouped[cat];
    if (!list?.length) return '';
    const color = CATEGORY_COLOR[cat] || '#546e7a';
    const cards = list.map(b => {
      const rCount = db.getRules(b.id).length;
      const fCount = db.getFaqs(b.id).length;
      return `<a href="${BASE}/brands/${b.id}" class="brand-card">
        <span class="brand-card-cat" style="background:${color}">${esc(b.category)}</span>
        <span class="brand-card-name">${esc(b.name)}</span>
        <div class="brand-card-channels">
          <span class="channel-tag ${b.has_omnichat ? 'line' : 'off'}">Omnichat${b.has_omnichat ? ' ✓' : ' —'}</span>
          <span class="channel-tag ${b.has_shopee ? 'shopee' : 'off'}">蝦皮${b.has_shopee ? ' ✓' : ' —'}</span>
        </div>
        <span class="stat">守則 ${rCount} 條 ・ FAQ ${fCount} 條</span>
      </a>`;
    }).join('');
    return `<div class="section-title">${cat}</div>
    <div class="dashboard-grid">${cards}</div>`;
  }).join('');

  res.send(layout('品牌總覽', `<h2>品牌總覽</h2>
<p style="color:#888;font-size:13px;margin-bottom:24px">點選品牌卡片進入管理頁面，設定 AI 守則與 FAQ 知識庫</p>
${sections}`));
});

// ── Brand detail ──────────────────────────────────
router.get('/brands/:id', requireLogin, (req, res) => {
  res.redirect(`${BASE}/brands/${req.params.id}/rules`);
});

function brandPage(req, res, activeTab) {
  const brand = db.getBrandById(req.params.id);
  if (!brand) return res.redirect(BASE);

  const color = CATEGORY_COLOR[brand.category] || '#546e7a';
  const rules = db.getRules(brand.id);
  const faqs  = db.getFaqs(brand.id);

  const header = `<div class="brand-header">
    <h2>${esc(brand.name)}</h2>
    <span class="brand-badge" style="background:${color}">${esc(brand.category)}</span>
    <div class="channel-tags">
      <span class="channel-tag ${brand.has_omnichat ? 'line' : 'off'}">Omnichat ${brand.has_omnichat ? '✓' : '—'}</span>
      <span class="channel-tag ${brand.has_shopee ? 'shopee' : 'off'}">蝦皮 ${brand.has_shopee ? '✓' : '—'}</span>
    </div>
  </div>`;

  const tabs = `<div class="tabs">
    <a href="${BASE}/brands/${brand.id}/rules" class="tab ${activeTab === 'rules' ? 'active' : ''}">守則設定 (${rules.length})</a>
    <a href="${BASE}/brands/${brand.id}/faqs"  class="tab ${activeTab === 'faqs'  ? 'active' : ''}">FAQ 知識庫 (${faqs.length})</a>
    <a href="${BASE}/brands/${brand.id}/settings" class="tab ${activeTab === 'settings' ? 'active' : ''}">渠道設定</a>
  </div>`;

  if (activeTab === 'rules') {
    const rows = rules.length
      ? rules.map(r => `<tr>
          <td width="40">${r.id}</td>
          <td><strong>${esc(r.title)}</strong></td>
          <td style="white-space:pre-wrap">${esc(r.content)}</td>
          <td width="70"><span class="badge ${r.enabled ? 'on' : 'off'}">${r.enabled ? '啟用' : '停用'}</span></td>
          <td width="120">
            <a href="${BASE}/brands/${brand.id}/rules/${r.id}/edit" class="btn btn-primary btn-sm">編輯</a>
            <form method="POST" action="${BASE}/brands/${brand.id}/rules/${r.id}/delete" style="display:inline" onsubmit="return confirm('確定刪除？')">
              <button class="btn btn-danger btn-sm">刪除</button>
            </form>
          </td>
        </tr>`).join('')
      : `<tr><td colspan="5" class="empty">尚無守則，請新增</td></tr>`;

    const body = `${header}${tabs}
    <div class="card">
      <h3>新增守則</h3>
      <form method="POST" action="${BASE}/brands/${brand.id}/rules">
        <div class="form-row"><div class="grow"><input type="text" name="title" placeholder="守則名稱（例：促銷活動說明）" required></div></div>
        <textarea name="content" placeholder="守則內容" required></textarea>
        <div class="form-actions"><button class="btn btn-success" type="submit">＋ 新增守則</button></div>
      </form>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>ID</th><th>名稱</th><th>內容</th><th>狀態</th><th>操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
    return res.send(layout(`${brand.name} — 守則設定`, body, brand));
  }

  if (activeTab === 'faqs') {
    const rows = faqs.length
      ? faqs.map(f => `<tr>
          <td width="40">${f.id}</td>
          <td style="max-width:220px">${esc(f.question)}</td>
          <td style="white-space:pre-wrap">${esc(f.answer)}</td>
          <td width="70"><span class="badge ${f.enabled ? 'on' : 'off'}">${f.enabled ? '啟用' : '停用'}</span></td>
          <td width="120">
            <a href="${BASE}/brands/${brand.id}/faqs/${f.id}/edit" class="btn btn-primary btn-sm">編輯</a>
            <form method="POST" action="${BASE}/brands/${brand.id}/faqs/${f.id}/delete" style="display:inline" onsubmit="return confirm('確定刪除？')">
              <button class="btn btn-danger btn-sm">刪除</button>
            </form>
          </td>
        </tr>`).join('')
      : `<tr><td colspan="5" class="empty">尚無 FAQ，請新增</td></tr>`;

    const body = `${header}${tabs}
    <div class="card">
      <h3>新增 FAQ</h3>
      <form method="POST" action="${BASE}/brands/${brand.id}/faqs">
        <div class="form-row"><div class="grow"><input type="text" name="question" placeholder="問題（例：請問有哪些付款方式？）" required></div></div>
        <textarea name="answer" placeholder="回覆內容" required></textarea>
        <div class="form-actions"><button class="btn btn-success" type="submit">＋ 新增 FAQ</button></div>
      </form>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>ID</th><th>問題</th><th>回覆</th><th>狀態</th><th>操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
    return res.send(layout(`${brand.name} — FAQ`, body, brand));
  }

  if (activeTab === 'settings') {
    const body = `${header}${tabs}
    <div class="card">
      <h3>渠道設定</h3>
      <form method="POST" action="${BASE}/brands/${brand.id}/settings">
        <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:16px">
          <label style="display:flex;align-items:center;gap:10px;font-size:14px">
            <input type="checkbox" name="has_omnichat" value="1" ${brand.has_omnichat ? 'checked' : ''} style="width:16px;height:16px">
            <span>Omnichat（LINE / Webchat）</span>
          </label>
          <label style="display:flex;align-items:center;gap:10px;font-size:14px">
            <input type="checkbox" name="has_shopee" value="1" ${brand.has_shopee ? 'checked' : ''} style="width:16px;height:16px">
            <span>蝦皮</span>
          </label>
          <label style="display:flex;align-items:center;gap:10px;font-size:14px">
            <input type="checkbox" name="enabled" value="1" ${brand.enabled ? 'checked' : ''} style="width:16px;height:16px">
            <span>品牌啟用</span>
          </label>
        </div>
        <div class="form-actions"><button class="btn btn-primary" type="submit">儲存設定</button></div>
      </form>
    </div>`;
    return res.send(layout(`${brand.name} — 渠道設定`, body, brand));
  }
}

router.get('/brands/:id/rules',    requireLogin, (req, res) => brandPage(req, res, 'rules'));
router.get('/brands/:id/faqs',     requireLogin, (req, res) => brandPage(req, res, 'faqs'));
router.get('/brands/:id/settings', requireLogin, (req, res) => brandPage(req, res, 'settings'));

// Rules CRUD
router.post('/brands/:id/rules', requireLogin, (req, res) => {
  const { title, content } = req.body;
  if (title && content) db.addRule(req.params.id, title.trim(), content.trim());
  res.redirect(`${BASE}/brands/${req.params.id}/rules`);
});

router.get('/brands/:id/rules/:rid/edit', requireLogin, (req, res) => {
  const brand = db.getBrandById(req.params.id);
  const rule  = db.getRules(req.params.id).find(r => r.id == req.params.rid);
  if (!brand || !rule) return res.redirect(`${BASE}/brands/${req.params.id}/rules`);
  const body = `<div class="brand-header"><h2>${esc(brand.name)}</h2></div>
  <div class="card">
    <h3>編輯守則</h3>
    <form method="POST" action="${BASE}/brands/${brand.id}/rules/${rule.id}/edit">
      <div class="form-row"><div class="grow"><input type="text" name="title" value="${esc(rule.title)}" required></div></div>
      <textarea name="content" required>${esc(rule.content)}</textarea>
      <div style="margin-top:12px"><label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" name="enabled" value="1" ${rule.enabled ? 'checked' : ''}> 啟用</label></div>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">儲存</button>
        <a href="${BASE}/brands/${brand.id}/rules" class="btn btn-ghost">取消</a>
      </div>
    </form>
  </div>`;
  res.send(layout('編輯守則', body, brand));
});

router.post('/brands/:id/rules/:rid/edit', requireLogin, (req, res) => {
  const { title, content, enabled } = req.body;
  db.updateRule(req.params.rid, title.trim(), content.trim(), enabled ? 1 : 0);
  res.redirect(`${BASE}/brands/${req.params.id}/rules`);
});

router.post('/brands/:id/rules/:rid/delete', requireLogin, (req, res) => {
  db.deleteRule(req.params.rid);
  res.redirect(`${BASE}/brands/${req.params.id}/rules`);
});

// FAQs CRUD
router.post('/brands/:id/faqs', requireLogin, (req, res) => {
  const { question, answer } = req.body;
  if (question && answer) db.addFaq(req.params.id, question.trim(), answer.trim());
  res.redirect(`${BASE}/brands/${req.params.id}/faqs`);
});

router.get('/brands/:id/faqs/:fid/edit', requireLogin, (req, res) => {
  const brand = db.getBrandById(req.params.id);
  const faq   = db.getFaqs(req.params.id).find(f => f.id == req.params.fid);
  if (!brand || !faq) return res.redirect(`${BASE}/brands/${req.params.id}/faqs`);
  const body = `<div class="brand-header"><h2>${esc(brand.name)}</h2></div>
  <div class="card">
    <h3>編輯 FAQ</h3>
    <form method="POST" action="${BASE}/brands/${brand.id}/faqs/${faq.id}/edit">
      <div class="form-row"><div class="grow"><input type="text" name="question" value="${esc(faq.question)}" required></div></div>
      <textarea name="answer" required>${esc(faq.answer)}</textarea>
      <div style="margin-top:12px"><label style="display:flex;align-items:center;gap:8px;font-size:13px"><input type="checkbox" name="enabled" value="1" ${faq.enabled ? 'checked' : ''}> 啟用</label></div>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">儲存</button>
        <a href="${BASE}/brands/${brand.id}/faqs" class="btn btn-ghost">取消</a>
      </div>
    </form>
  </div>`;
  res.send(layout('編輯 FAQ', body, brand));
});

router.post('/brands/:id/faqs/:fid/edit', requireLogin, (req, res) => {
  const { question, answer, enabled } = req.body;
  db.updateFaq(req.params.fid, question.trim(), answer.trim(), enabled ? 1 : 0);
  res.redirect(`${BASE}/brands/${req.params.id}/faqs`);
});

router.post('/brands/:id/faqs/:fid/delete', requireLogin, (req, res) => {
  db.deleteFaq(req.params.fid);
  res.redirect(`${BASE}/brands/${req.params.id}/faqs`);
});

// Settings
router.post('/brands/:id/settings', requireLogin, (req, res) => {
  const { has_omnichat, has_shopee, enabled } = req.body;
  db.updateBrand(req.params.id, {
    has_omnichat: has_omnichat ? 1 : 0,
    has_shopee:   has_shopee   ? 1 : 0,
    enabled:      enabled      ? 1 : 0,
  });
  res.redirect(`${BASE}/brands/${req.params.id}/settings`);
});

module.exports = router;
