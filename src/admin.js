'use strict';

const { Router } = require('express');
const db = require('./db');

const router = Router();

function requireLogin(req, res, next) {
  if (req.session.loggedIn) return next();
  res.redirect('/tsa-ai-agent-manage/login');
}

function layout(title, body) {
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — 達摩本草 AI 管理</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #333; }
  .topbar { background: #1a6e3c; color: #fff; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; }
  .topbar a { color: #fff; text-decoration: none; font-size: 14px; }
  .topbar nav a { margin-left: 20px; opacity: 0.85; }
  .topbar nav a:hover { opacity: 1; }
  .container { max-width: 900px; margin: 32px auto; padding: 0 16px; }
  h2 { margin-bottom: 20px; font-size: 20px; }
  .card { background: #fff; border-radius: 8px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; padding: 10px 12px; border-bottom: 2px solid #eee; color: #666; font-weight: 600; }
  td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 12px; }
  .badge.on { background: #d4edda; color: #155724; }
  .badge.off { background: #f8d7da; color: #721c24; }
  input[type=text], textarea { width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; font-family: inherit; }
  textarea { min-height: 80px; resize: vertical; }
  .btn { display: inline-block; padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; text-decoration: none; }
  .btn-primary { background: #1a6e3c; color: #fff; }
  .btn-primary:hover { background: #155732; }
  .btn-danger { background: #dc3545; color: #fff; }
  .btn-danger:hover { background: #c82333; }
  .btn-sm { padding: 4px 10px; font-size: 13px; }
  .form-row { display: flex; gap: 12px; margin-bottom: 12px; }
  .form-row .grow { flex: 1; }
  .form-actions { display: flex; gap: 8px; margin-top: 16px; }
  .alert { padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 14px; }
  .alert-success { background: #d4edda; color: #155724; }
  .empty { color: #999; font-size: 14px; padding: 20px 0; text-align: center; }
</style>
</head>
<body>
<div class="topbar">
  <a href="/tsa-ai-agent-manage" style="font-size:16px;font-weight:600;">🌿 達摩本草 AI 管理</a>
  <nav>
    <a href="/tsa-ai-agent-manage/rules">守則設定</a>
    <a href="/tsa-ai-agent-manage/faqs">FAQ 知識庫</a>
    <a href="/tsa-ai-agent-manage/logout">登出</a>
  </nav>
</div>
<div class="container">${body}</div>
</body></html>`;
}

// Login
router.get('/login', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="UTF-8"><title>登入</title>
<style>
  body { font-family: -apple-system,sans-serif; background:#f5f5f5; display:flex; align-items:center; justify-content:center; min-height:100vh; }
  .box { background:#fff; padding:36px; border-radius:10px; box-shadow:0 2px 12px rgba(0,0,0,0.1); width:320px; }
  h2 { margin-bottom:24px; color:#1a6e3c; text-align:center; }
  input { width:100%; padding:10px; margin-bottom:14px; border:1px solid #ddd; border-radius:6px; font-size:14px; }
  button { width:100%; padding:10px; background:#1a6e3c; color:#fff; border:none; border-radius:6px; font-size:15px; cursor:pointer; }
  .err { color:#dc3545; font-size:13px; margin-bottom:12px; }
</style></head>
<body><div class="box">
<h2>🌿 AI 管理後台</h2>
${req.query.err ? '<p class="err">密碼錯誤，請重試</p>' : ''}
<form method="POST" action="/tsa-ai-agent-manage/login">
  <input type="password" name="password" placeholder="請輸入管理密碼" autofocus>
  <button type="submit">登入</button>
</form>
</div></body></html>`);
});

router.post('/login', (req, res) => {
  if (req.body.password === process.env.ADMIN_PASSWORD) {
    req.session.loggedIn = true;
    res.redirect('/tsa-ai-agent-manage/rules');
  } else {
    res.redirect('/tsa-ai-agent-manage/login?err=1');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/tsa-ai-agent-manage/login');
});

// Dashboard redirect
router.get('/', requireLogin, (req, res) => res.redirect('/tsa-ai-agent-manage/rules'));

// ── Rules ──────────────────────────────────────────
router.get('/rules', requireLogin, (req, res) => {
  const rules = db.getRules();
  const rows = rules.length
    ? rules.map(r => `
      <tr>
        <td>${r.id}</td>
        <td><strong>${esc(r.title)}</strong></td>
        <td style="white-space:pre-wrap;max-width:400px;">${esc(r.content)}</td>
        <td><span class="badge ${r.enabled ? 'on' : 'off'}">${r.enabled ? '啟用' : '停用'}</span></td>
        <td>
          <a href="/tsa-ai-agent-manage/rules/${r.id}/edit" class="btn btn-sm btn-primary">編輯</a>
          <form method="POST" action="/tsa-ai-agent-manage/rules/${r.id}/delete" style="display:inline" onsubmit="return confirm('確定刪除？')">
            <button class="btn btn-sm btn-danger">刪除</button>
          </form>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="5" class="empty">尚無守則，請新增</td></tr>`;

  res.send(layout('守則設定', `
    <h2>AI 守則設定</h2>
    <div class="card">
      <h3 style="margin-bottom:16px;font-size:15px;">新增守則</h3>
      <form method="POST" action="/tsa-ai-agent-manage/rules">
        <div class="form-row">
          <div class="grow"><input type="text" name="title" placeholder="守則名稱（例：母親節活動）" required></div>
        </div>
        <textarea name="content" placeholder="守則內容（例：母親節活動 4/28–5/12，滿 $2000 加贈保健包）" required></textarea>
        <div class="form-actions"><button class="btn btn-primary" type="submit">新增</button></div>
      </form>
    </div>
    <div class="card">
      <table>
        <thead><tr><th width="40">ID</th><th width="160">名稱</th><th>內容</th><th width="70">狀態</th><th width="120">操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`));
});

router.post('/rules', requireLogin, (req, res) => {
  const { title, content } = req.body;
  if (title && content) db.addRule(title.trim(), content.trim());
  res.redirect('/tsa-ai-agent-manage/rules');
});

router.get('/rules/:id/edit', requireLogin, (req, res) => {
  const rule = db.getRules().find(r => r.id == req.params.id);
  if (!rule) return res.redirect('/tsa-ai-agent-manage/rules');
  res.send(layout('編輯守則', `
    <h2>編輯守則</h2>
    <div class="card">
      <form method="POST" action="/tsa-ai-agent-manage/rules/${rule.id}/edit">
        <div class="form-row">
          <div class="grow"><input type="text" name="title" value="${esc(rule.title)}" required></div>
        </div>
        <textarea name="content" required>${esc(rule.content)}</textarea>
        <div class="form-row" style="margin-top:12px;align-items:center;">
          <label><input type="checkbox" name="enabled" value="1" ${rule.enabled ? 'checked' : ''}> 啟用</label>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit">儲存</button>
          <a href="/tsa-ai-agent-manage/rules" class="btn" style="background:#eee;color:#333;">取消</a>
        </div>
      </form>
    </div>`));
});

router.post('/rules/:id/edit', requireLogin, (req, res) => {
  const { title, content, enabled } = req.body;
  db.updateRule(req.params.id, title.trim(), content.trim(), enabled ? 1 : 0);
  res.redirect('/tsa-ai-agent-manage/rules');
});

router.post('/rules/:id/delete', requireLogin, (req, res) => {
  db.deleteRule(req.params.id);
  res.redirect('/tsa-ai-agent-manage/rules');
});

// ── FAQs ───────────────────────────────────────────
router.get('/faqs', requireLogin, (req, res) => {
  const faqs = db.getFaqs();
  const rows = faqs.length
    ? faqs.map(f => `
      <tr>
        <td>${f.id}</td>
        <td style="max-width:250px;">${esc(f.question)}</td>
        <td style="white-space:pre-wrap;max-width:350px;">${esc(f.answer)}</td>
        <td><span class="badge ${f.enabled ? 'on' : 'off'}">${f.enabled ? '啟用' : '停用'}</span></td>
        <td>
          <a href="/tsa-ai-agent-manage/faqs/${f.id}/edit" class="btn btn-sm btn-primary">編輯</a>
          <form method="POST" action="/tsa-ai-agent-manage/faqs/${f.id}/delete" style="display:inline" onsubmit="return confirm('確定刪除？')">
            <button class="btn btn-sm btn-danger">刪除</button>
          </form>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="5" class="empty">尚無 FAQ，請新增</td></tr>`;

  res.send(layout('FAQ 知識庫', `
    <h2>FAQ 知識庫</h2>
    <div class="card">
      <h3 style="margin-bottom:16px;font-size:15px;">新增 FAQ</h3>
      <form method="POST" action="/tsa-ai-agent-manage/faqs">
        <div class="form-row">
          <div class="grow"><input type="text" name="question" placeholder="問題（例：請問有貨到付款嗎？）" required></div>
        </div>
        <textarea name="answer" placeholder="回覆內容（例：我們提供信用卡、ATM 轉帳、貨到付款，貨到付款需另加 $30 手續費）" required></textarea>
        <div class="form-actions"><button class="btn btn-primary" type="submit">新增</button></div>
      </form>
    </div>
    <div class="card">
      <table>
        <thead><tr><th width="40">ID</th><th>問題</th><th>回覆</th><th width="70">狀態</th><th width="120">操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`));
});

router.post('/faqs', requireLogin, (req, res) => {
  const { question, answer } = req.body;
  if (question && answer) db.addFaq(question.trim(), answer.trim());
  res.redirect('/tsa-ai-agent-manage/faqs');
});

router.get('/faqs/:id/edit', requireLogin, (req, res) => {
  const faq = db.getFaqs().find(f => f.id == req.params.id);
  if (!faq) return res.redirect('/tsa-ai-agent-manage/faqs');
  res.send(layout('編輯 FAQ', `
    <h2>編輯 FAQ</h2>
    <div class="card">
      <form method="POST" action="/tsa-ai-agent-manage/faqs/${faq.id}/edit">
        <div class="form-row">
          <div class="grow"><input type="text" name="question" value="${esc(faq.question)}" required></div>
        </div>
        <textarea name="answer" required>${esc(faq.answer)}</textarea>
        <div class="form-row" style="margin-top:12px;align-items:center;">
          <label><input type="checkbox" name="enabled" value="1" ${faq.enabled ? 'checked' : ''}> 啟用</label>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit">儲存</button>
          <a href="/tsa-ai-agent-manage/faqs" class="btn" style="background:#eee;color:#333;">取消</a>
        </div>
      </form>
    </div>`));
});

router.post('/faqs/:id/edit', requireLogin, (req, res) => {
  const { question, answer, enabled } = req.body;
  db.updateFaq(req.params.id, question.trim(), answer.trim(), enabled ? 1 : 0);
  res.redirect('/tsa-ai-agent-manage/faqs');
});

router.post('/faqs/:id/delete', requireLogin, (req, res) => {
  db.deleteFaq(req.params.id);
  res.redirect('/tsa-ai-agent-manage/faqs');
});

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = router;
