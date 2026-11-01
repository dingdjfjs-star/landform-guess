/* 胶片盒构建器：tools/_raw/photos/*.jpg → js/photos.js（base64 data URI，离线嵌入）
 * 用法：先跑 tools/resize-photos.ps1 生成小图，再 node tools/build-photos.js */
'use strict';
var fs = require('fs');
var path = require('path');

var srcDir = path.join(__dirname, '_raw', 'photos');
var outFile = path.join(__dirname, '..', 'js', 'photos.js');

// key 供题库 photo 字段引用；note 是界面上的一句话
var META = [
  { key: 'canglan-shore', file: 'canglan-shore.jpg', title: '洱海 · 水草滩', note: '暗处青绿与亮处云白，全从这里取' },
  { key: 'canglan-house', file: 'canglan-house.jpg', title: '洱海 · 水上屋', note: '一整块沉得住气的蓝' },
  { key: 'sunset', file: 'sunset.jpg', title: '洱海 · 日落', note: '夜航主题的那盏金，是它的' },
  { key: 'canglan-reed', file: 'canglan-reed.jpg', title: '蒲苇', note: '纸面底色的奶油白，是它的绒毛' },
  { key: 'zhangye', file: 'zhangye.jpg', title: '张掖彩色丘陵', note: 'Q11 的实景照，老队长摄' }
];

var photos = META.map(function (m) {
  var p = path.join(srcDir, m.file);
  if (!fs.existsSync(p)) { console.error('[photos] 缺少 ' + p + '（先跑 resize-photos.ps1）'); process.exit(1); }
  var b64 = fs.readFileSync(p).toString('base64');
  return { key: m.key, title: m.title, note: m.note, data: 'data:image/jpeg;base64,' + b64 };
});

var js = '/* 胶片盒 —— 由 node tools/build-photos.js 生成，勿手改\n' +
  ' * 源图：参考图/（用户提供的自然摄影），已压缩为 1280 宽 JPEG base64 */\n' +
  "'use strict';\n" +
  '(function (root) {\n' +
  '  root.PHOTOS = ' + JSON.stringify(photos) + ';\n' +
  "  if (typeof module !== 'undefined' && module.exports) module.exports = root.PHOTOS;\n" +
  "})(typeof window !== 'undefined' ? window : globalThis);\n";

fs.writeFileSync(outFile, js, 'utf8');
console.log('[photos] 嵌入 ' + photos.length + ' 张，js/photos.js ' + Math.round(fs.statSync(outFile).size / 1024) + ' KB');
