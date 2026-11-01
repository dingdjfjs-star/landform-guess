/* 世界地图构建器：Natural Earth 110m land (TopoJSON, 公有领域) → 等距圆柱投影 SVG path
 * 产物：js/worldmap.js（浏览器全局 WORLDMAP = {w, h, d}）
 * 用法：node tools/build-map.js
 *   - 若 tools/_raw/land-110m.json 缺失则自动联网下载（之后离线可复跑）
 *   - 无网络且无缓存时生成 d:'' 的降级版（揭晓页退化为纯经纬网定位盘） */
'use strict';
var fs = require('fs');
var path = require('path');
var https = require('https');

var rawFile = path.join(__dirname, '_raw', 'land-110m.json');
var outFile = path.join(__dirname, '..', 'js', 'worldmap.js');
var SRC_URL = 'https://unpkg.com/world-atlas@2.0.2/land-110m.json';

function download(url, cb) {
  https.get(url, function (res) {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return download(res.headers.location, cb);
    if (res.statusCode !== 200) return cb(new Error('HTTP ' + res.statusCode));
    var chunks = [];
    res.on('data', function (c) { chunks.push(c); });
    res.on('end', function () { cb(null, Buffer.concat(chunks)); });
  }).on('error', cb);
}

function build(buf) {
  var topo = JSON.parse(buf.toString('utf8'));
  var t = topo.transform || { scale: [1, 1], translate: [0, 0] };
  var arcs = topo.arcs.map(function (arc) {
    var x = 0, y = 0;
    return arc.map(function (d) {
      x += d[0]; y += d[1];
      return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]]; // [lon, lat]
    });
  });
  function ring(idxs) {
    var pts = [];
    idxs.forEach(function (i) {
      var a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
      if (pts.length) a = a.slice(1);
      pts = pts.concat(a);
    });
    return pts;
  }
  var land = topo.objects.land;
  var geoms = land.type === 'GeometryCollection' ? land.geometries : [land];
  var polys = [];
  geoms.forEach(function (g) {
    if (!g) return;
    if (g.type === 'Polygon') polys.push(g.arcs);
    else if (g.type === 'MultiPolygon') g.arcs.forEach(function (p) { polys.push(p); });
  });

  function px(p) { return [Math.round(p[0] + 180), Math.round(90 - p[1])]; } // 经度→x 0..360，纬度→y 0..180
  function areaOf(pts) {
    var a = 0;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a) / 2;
  }
  function pathOf(pts) {
    var s = '', prev = null;
    pts.forEach(function (p, i) {
      if (prev && p[0] === prev[0] && p[1] === prev[1]) return; // 去相邻重复
      s += (i ? 'L' : 'M') + p[0] + ' ' + p[1];
      prev = p;
    });
    return s + 'Z';
  }

  var d = '', kept = 0, dropped = 0;
  polys.forEach(function (rings) {
    var outer = ring(rings[0]).map(px);
    if (areaOf(outer) < 2) { dropped++; return; } // 过滤小岛噪点
    kept++;
    d += pathOf(outer);
    for (var r = 1; r < rings.length; r++) d += pathOf(ring(rings[r]).map(px));
  });

  return { count: kept, dropped: dropped, d: d, bytes: d.length };
}

function write(result) {
  var js = '/* 世界地图 SVG path —— 由 tools/build-map.js 生成，勿手改\n' +
    ' * 数据：Natural Earth 110m land（公有领域），等距圆柱投影 360x180 */\n' +
    "'use strict';\n" +
    '(function (root) {\n' +
    '  root.WORLDMAP = { w: 360, h: 180, d: ' + JSON.stringify(result.d) + ' };\n' +
    "  if (typeof module !== 'undefined' && module.exports) module.exports = root.WORLDMAP;\n" +
    "})(typeof window !== 'undefined' ? window : globalThis);\n";
  fs.writeFileSync(outFile, js, 'utf8');
  console.log('[map] 保留多边形 ' + result.count + '（过滤小岛 ' + result.dropped + '），path ' + result.bytes + ' 字节');
  console.log('[map] 已生成 js/worldmap.js');
}

if (fs.existsSync(rawFile)) {
  console.log('[map] 使用缓存 tools/_raw/land-110m.json');
  write(build(fs.readFileSync(rawFile)));
} else {
  console.log('[map] 缓存缺失，联网下载 ' + SRC_URL);
  download(SRC_URL, function (err, buf) {
    if (err) {
      console.warn('[map] 下载失败（' + err.message + '），生成无陆地的降级版');
      write({ count: 0, dropped: 0, d: '', bytes: 0 });
      return;
    }
    fs.mkdirSync(path.dirname(rawFile), { recursive: true });
    fs.writeFileSync(rawFile, buf);
    write(build(buf));
  });
}
