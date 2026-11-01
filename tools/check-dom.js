/* 检查 ui.js 引用的元素 id 是否都存在于 index.html（部署前自检） */
'use strict';
var fs = require('fs');
var ui = fs.readFileSync('js/ui.js', 'utf8');
var html = fs.readFileSync('index.html', 'utf8');
var ids = {};
var re = /\$\('([A-Za-z0-9_-]+)'\)/g, m;
while ((m = re.exec(ui))) ids[m[1]] = 1;
var missing = Object.keys(ids).filter(function (id) { return html.indexOf('id="' + id + '"') < 0; });
console.log('ui.js 引用元素 ' + Object.keys(ids).length + ' 个；index.html 缺失：' + (missing.length ? missing.join(', ') : '无'));
process.exitCode = missing.length ? 1 : 0;
