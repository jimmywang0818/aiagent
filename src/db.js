'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data', 'agent.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// Rules
function getRules() {
  return db.prepare('SELECT * FROM rules ORDER BY id').all();
}
function getEnabledRules() {
  return db.prepare('SELECT content FROM rules WHERE enabled = 1 ORDER BY id').all();
}
function addRule(title, content) {
  return db.prepare('INSERT INTO rules (title, content) VALUES (?, ?)').run(title, content);
}
function updateRule(id, title, content, enabled) {
  return db.prepare('UPDATE rules SET title=?, content=?, enabled=? WHERE id=?').run(title, content, enabled, id);
}
function deleteRule(id) {
  return db.prepare('DELETE FROM rules WHERE id=?').run(id);
}

// FAQs
function getFaqs() {
  return db.prepare('SELECT * FROM faqs ORDER BY id').all();
}
function getEnabledFaqs() {
  return db.prepare('SELECT question, answer FROM faqs WHERE enabled = 1 ORDER BY id').all();
}
function addFaq(question, answer) {
  return db.prepare('INSERT INTO faqs (question, answer) VALUES (?, ?)').run(question, answer);
}
function updateFaq(id, question, answer, enabled) {
  return db.prepare('UPDATE faqs SET question=?, answer=?, enabled=? WHERE id=?').run(question, answer, enabled, id);
}
function deleteFaq(id) {
  return db.prepare('DELETE FROM faqs WHERE id=?').run(id);
}

module.exports = {
  getRules, getEnabledRules, addRule, updateRule, deleteRule,
  getFaqs, getEnabledFaqs, addFaq, updateFaq, deleteFaq,
};
