/* 按题联网找图：Wikimedia Commons API（自由版权），50 题各配一张实景照。
 * 用法：node tools/fetch-wiki.js [--redo=Q11,Q12]（强制重抓）
 * 产物：wiki-imgs/<id>.jpg + js/wiki-photos.js（署名清单）
 * 约定：只取 CC/公有领域图，署名（作者+许可+来源页）随 js/wiki-photos.js 进揭晓页；
 *       已缓存的题自动跳过（离线可复跑生成清单）；失败/无合适图的题不出现在清单中。 */
'use strict';
var fs = require('fs');
var path = require('path');
var https = require('https');

var root = path.join(__dirname, '..');
var imgDir = path.join(root, 'wiki-imgs');
var OUT_JS = path.join(root, 'js', 'wiki-photos.js');

// 50 题的 Commons 检索词（人工选定；命中不理想时改词/skip 或用 --redo 重抓）
// 值为字符串 = 只用检索词；值为 {q, skip} = 跳过前 skip 个合规结果
var QUERIES = {
  Q01: 'Li River Guilin karst', Q02: 'Shilin Yunnan stone forest',
  Q03: { q: 'Three Natural Bridges Wulong', skip: 1 }, // 第一个合规结果是导游地图
  Q04: 'Leye Tiankeng', Q05: 'Ha Long Bay', Q06: 'Skocjan Caves',
  Q07: 'Gunung Mulu National Park', Q08: 'Pamukkale', Q09: 'Mount Danxia',
  Q10: 'Longhu Mountain', Q11: 'Zhangye Danxia', Q12: 'Arches National Park',
  Q13: 'Grand Canyon', Q14: 'Dajin Lake', Q15: 'Mangrove forest Hainan',
  Q16: 'Shankou mangrove', Q17: 'Sundarbans mangrove', Q18: 'Shenzhen Bay mangrove',
  Q19: 'Tiaozini', Q20: 'Yellow River Delta', Q21: 'Wadden Sea',
  Q22: 'Hopewell Rocks', Q23: 'Loess plateau Gansu', Q24: 'Loess Plateau gully',
  Q25: 'Qiankun Bay Yellow River', Q26: 'Dunhuang Yardang', Q27: 'Ghost City Karamay',
  Q28: 'Lop Nur', Q29: 'Sossusvlei', Q30: 'Hailuogou glacier',
  Q31: 'Glacier Tian Shan', Q32: 'Aletschgletscher', Q33: 'Sognefjorden',
  Q34: 'Heaven Lake Changbai', Q35: 'Wudalianchi', Q36: 'Kilauea',
  Q37: 'Mount Fuji Kawaguchi', Q38: 'Tengchong volcano',
  Q39: { q: 'Great Barrier Reef', skip: 1 }, // 第一个是海面游船
  Q40: 'Maldives atoll aerial', Q41: 'Yehliu', Q42: 'Durdle Door',
  Q43: 'Tiger Leaping Gorge', Q44: 'Ganges Delta', Q45: 'Mississippi River Delta',
  Q46: 'Yarlung Tsangpo Grand Canyon', Q47: 'Monument Valley', Q48: 'Salar de Uyuni',
  Q49: 'Yellowstone Grand Prismatic', Q50: { q: 'Cappadocia', skip: 1 }
};

var redo = {}, only = null;
process.argv.slice(2).forEach(function (a) {
  var m = a.match(/^--redo=(.+)$/);
  if (m) m[1].split(',').forEach(function (id) { redo[id.trim()] = 1; });
  var o = a.match(/^--only=(.+)$/);
  if (o) only = o[1].split(',').map(function (s) { return s.trim(); });
});

function get(url, cb) {
  https.get(url, { headers: { 'User-Agent': 'GeomGuessGame/1.0 (local educational game; contact: local-user)' } }, function (res) {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return get(res.headers.location, cb);
    if (res.statusCode !== 200) return cb(new Error('HTTP ' + res.statusCode));
    var chunks = [];
    res.on('data', function (c) { chunks.push(c); });
    res.on('end', function () { cb(null, Buffer.concat(chunks)); });
  }).on('error', cb);
}
function stripTags(s) { return String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); }
function okLicense(name) {
  var n = String(name || '');
  return n.indexOf('CC') === 0 || n.indexOf('Public domain') === 0 || n === 'PD' || n.indexOf('CC0') === 0;
}

if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
var manifest = {};
var idx = 0;
var DELAY = 1400; // 限流保护：每次请求间隔
// 预载已有署名（重跑时保住未重抓条目；注意必须在 manifest 声明之后）
try {
  var prev = JSON.parse(fs.readFileSync(path.join(__dirname, '_raw', 'wiki-meta.json'), 'utf8'));
  Object.keys(prev).forEach(function (k) { manifest[k] = prev[k]; });
} catch (e) { /* 首跑无清单 */ }
var ids = Object.keys(QUERIES).filter(function (id) { return !only || only.indexOf(id) >= 0; });

// 带退避重试的 GET：429/ECONNRESET 时按 3s/6s/9s 递增等待
function getRetry(url, attempt, cb) {
  attempt = attempt || 1;
  get(url, function (err, buf) {
    var retryable = err && (err.message.indexOf('429') >= 0 || err.message.indexOf('ECONNRESET') >= 0 || err.message.indexOf('ETIMEDOUT') >= 0);
    if (retryable && attempt <= 4) {
      var wait = 3000 * attempt;
      console.warn('  ..retry ' + attempt + ' after ' + wait + 'ms（' + err.message + '）');
      return setTimeout(function () { getRetry(url, attempt + 1, cb); }, wait);
    }
    cb(err, buf);
  });
}

function next() {
  if (idx >= ids.length) return finish();
  var id = ids[idx++];
  var jpg = path.join(imgDir, id + '.jpg');
  if (fs.existsSync(jpg) && !redo[id]) {
    var cached = {};
    try { cached = JSON.parse(fs.readFileSync(path.join(__dirname, '_raw', 'wiki-meta.json'), 'utf8')); } catch (e) { }
    if (cached[id]) { manifest[id] = cached[id]; console.log('[skip] ' + id); return setTimeout(next, 0); }
  }
  var q = QUERIES[id];
  var qspec = typeof q === 'string' ? { q: q, skip: 0 } : q;
  var api = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
    '&generator=search&gsrsearch=' + encodeURIComponent('filetype:bitmap ' + qspec.q) +
    '&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=1000';
  getRetry(api, 1, function (err, buf) {
    if (err) { console.warn('[warn] ' + id + ' 检索失败: ' + err.message); return setTimeout(next, DELAY); }
    var data;
    try { data = JSON.parse(buf.toString('utf8')); } catch (e) { return setTimeout(next, DELAY); }
    var pages = data.query && data.query.pages ? Object.keys(data.query.pages).map(function (k) { return data.query.pages[k]; }) : [];
    // 选第一张：横构图、足够大、许可合规
    pages.sort(function (a, b) { return (a.index || 99) - (b.index || 99); });
    var picked = null, passed = 0;
    for (var i = 0; i < pages.length; i++) {
      var p = pages[i];
      var ii = p.imageinfo && p.imageinfo[0];
      if (!ii) continue;
      if (ii.width < 800 || ii.height < 500) continue;
      if (ii.width / ii.height < 1.15) continue;
      var em = ii.extmetadata || {};
      var lic = stripTags((em.LicenseShortName || {}).value || '');
      if (!okLicense(lic)) continue;
      if (passed < (qspec.skip || 0)) { passed++; continue; } // 跳过前 N 个合规结果（人工审查后调参）
      picked = { p: p, ii: ii, lic: lic };
      break;
    }
    if (!picked) { console.warn('[none] ' + id + '（' + qspec.q + '）无合规横图'); return setTimeout(next, DELAY); }
    var thumb = picked.ii.thumburl || picked.ii.url;
    getRetry(thumb, 1, function (e2, img) {
      if (e2) { console.warn('[warn] ' + id + ' 下载失败: ' + e2.message); return setTimeout(next, DELAY); }
      fs.writeFileSync(jpg, img);
      var em = picked.ii.extmetadata || {};
      manifest[id] = {
        title: stripTags(picked.p.title || '').replace(/^File:/, ''),
        author: stripTags((em.Artist || {}).value || '佚名').slice(0, 60) || '佚名',
        license: picked.lic,
        pageUrl: picked.ii.descriptionurl || ''
      };
      console.log('[ok] ' + id + ' ← ' + manifest[id].title.slice(0, 40) + '（' + manifest[id].license + '）');
      setTimeout(next, DELAY);
    });
  });
}

function finish() {
  var entries = Object.keys(manifest).sort().map(function (id) {
    return '  ' + JSON.stringify(id) + ': ' + JSON.stringify(manifest[id]);
  });
  var js = '/* 实景照署名清单 —— 由 node tools/fetch-wiki.js 生成，勿手改\n' +
    ' * 图片在 wiki-imgs/<id>.jpg；均为 Wikimedia Commons 自由版权（CC/PD），署名如下 */\n' +
    "'use strict';\n" +
    '(function (root) {\n' +
    '  root.WIKIPHOTOS = {\n' + entries.join(',\n') + '\n  };\n' +
    "  if (typeof module !== 'undefined' && module.exports) module.exports = root.WIKIPHOTOS;\n" +
    "})(typeof window !== 'undefined' ? window : globalThis);\n";
  fs.writeFileSync(OUT_JS, js, 'utf8');
  var metaDir = path.join(__dirname, '_raw');
  if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });
  fs.writeFileSync(path.join(metaDir, 'wiki-meta.json'), JSON.stringify(manifest, null, 1), 'utf8');
  console.log('[done] 收图 ' + Object.keys(manifest).length + '/' + ids.length + '，清单 → js/wiki-photos.js');
}
next();
