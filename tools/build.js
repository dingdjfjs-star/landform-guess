/* 批量出题构建器：合并 data/source/part*.js → 生成 js/data.js（浏览器/Node 双端可用）
 * 用法：node tools/build.js
 * 退出码：0 成功；1 结构错误（重复 id 等）。数据质量门禁在 test/test.js。 */
'use strict';
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var srcDir = path.join(root, 'data', 'source');

var parts = fs.readdirSync(srcDir).filter(function (f) { return /^part\d+\.js$/.test(f); }).sort();
var questions = [];
var seenIds = {};
parts.forEach(function (f) {
  var list = require(path.join(srcDir, f));
  list.forEach(function (q) {
    if (!q.id) { console.error('[build] ' + f + ' 存在无 id 的题'); process.exit(1); }
    if (seenIds[q.id]) { console.error('[build] 重复题号 ' + q.id); process.exit(1); }
    seenIds[q.id] = true;
    questions.push(q);
  });
});

// 基础结构速查（详细门禁在 test/test.js）
var missing = [];
questions.forEach(function (q) {
  ['cat', 'landform', 'diff', 'answer', 'region', 'country', 'lat', 'lon', 'alias',
    'black', 'clues', 'hints', 'confuse', 'judge', 'chain', 'fact', 'solvable'].forEach(function (k) {
    if (q[k] === undefined || q[k] === null || q[k] === '') missing.push(q.id + '.' + k);
  });
});
if (missing.length) { console.error('[build] 缺字段: ' + missing.join(', ')); process.exit(1); }

// 类别清单（保持首现顺序）
var cats = [];
questions.forEach(function (q) { if (cats.indexOf(q.cat) < 0) cats.push(q.cat); });

var bank = { questions: questions, meta: { count: questions.length, cats: cats, generated: 'part files: ' + parts.join(', ') } };

var out = '/* 本文件由 node tools/build.js 批量生成，勿手改；改题请去 data/source/part*.js */\n' +
  "'use strict';\n" +
  '(function (root) {\n' +
  '  root.QBANK = ' + JSON.stringify(bank, null, 1) + ';\n' +
  "  if (typeof module !== 'undefined' && module.exports) module.exports = root.QBANK;\n" +
  "})(typeof window !== 'undefined' ? window : globalThis);\n";

fs.writeFileSync(path.join(root, 'js', 'data.js'), out, 'utf8');

console.log('[build] 题库 ' + questions.length + ' 套，类别 ' + cats.length + ' 类：' + cats.join('、'));
console.log('[build] 已生成 js/data.js');
