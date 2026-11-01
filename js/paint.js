/* 《地貌猜地点》程序绘画引擎：按"老队长胶片盒"照片的配色与构图，把风景画成 SVG。
 * 所有画均为运行时生成的原创矢量画——不嵌入任何摄影图。
 * Painting.scene(key, seed) → svg 字符串（viewBox 800x450，preserveAspectRatio slice） */
'use strict';
(function (root) {
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  }
  // 平滑山脊线：多级正弦叠加 + 轻微抖动，二次贝塞尔连接
  function ridge(r, w, baseY, amp, freq, phase, jag) {
    var pts = [];
    for (var x = -12; x <= w + 12; x += 10) {
      var y = baseY + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.63 + phase * 1.7) * amp * 0.34 + (r() - 0.5) * jag;
      pts.push([x, y]);
    }
    var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += 'Q' + pts[i][0].toFixed(1) + ' ' + pts[i][1].toFixed(1) + ' ' + mx.toFixed(1) + ' ' + my.toFixed(1);
    }
    return d;
  }
  function closeDown(d, w, h) { return d + 'L' + (w + 12) + ' ' + h + 'L-12 ' + h + 'Z'; }
  function f1(n) { return n.toFixed(1); }

  // —— 水岸（洱海水草滩 + 蒲苇：canglan-shore / canglan-reed 的配色构图） ——
  function shore(seed) {
    var r = rng(seed || 11), w = 800, h = 450;
    var clouds = '', i;
    for (i = 0; i < 6; i++) {
      var cx = 60 + r() * 680, cy = 118 + r() * 66, s = 0.6 + r() * 0.9;
      clouds += '<ellipse cx="' + f1(cx) + '" cy="' + f1(cy) + '" rx="' + f1(70 * s) + '" ry="' + f1(20 * s) + '" fill="#ffffff" opacity="' + f1(0.4 + r() * 0.3) + '" filter="url(#soft)"/>' +
        '<ellipse cx="' + f1(cx + 30 * s) + '" cy="' + f1(cy - 12 * s) + '" rx="' + f1(44 * s) + '" ry="' + f1(14 * s) + '" fill="#ffffff" opacity="' + f1(0.35 + r() * 0.3) + '" filter="url(#soft)"/>';
    }
    var patches = '';
    for (i = 0; i < 12; i++) {
      var px = 30 + r() * 740, py = 268 + r() * 84, rw = 40 + r() * 110;
      patches += '<ellipse cx="' + f1(px) + '" cy="' + f1(py) + '" rx="' + f1(rw) + '" ry="' + f1(6 + r() * 8) + '" fill="#4f83a8" opacity="' + f1(0.3 + r() * 0.3) + '"/>' +
        '<ellipse cx="' + f1(px) + '" cy="' + f1(py + 2) + '" rx="' + f1(rw * 0.7) + '" ry="' + f1(3 + r() * 4) + '" fill="#a8cbd8" opacity="' + f1(0.15 + r() * 0.2) + '"/>';
    }
    var reeds = '';
    for (i = 0; i < 16; i++) {
      var bx = 20 + r() * 760, topY = 128 + r() * 120, lean = (r() - 0.5) * 46;
      reeds += '<path d="M' + f1(bx) + ' 452 Q' + f1(bx + lean * 0.3) + ' ' + f1(400) + ' ' + f1(bx + lean) + ' ' + f1(topY) + '" stroke="#c8bc90" stroke-width="' + f1(1.6 + r()) + '" fill="none" opacity=".9"/>';
      reeds += '<ellipse cx="' + f1(bx + lean) + '" cy="' + f1(topY - 8 - r() * 12) + '" rx="' + f1(7 + r() * 6) + '" ry="' + f1(15 + r() * 11) + '" fill="#efe6d0" opacity="' + f1(0.75 + r() * 0.2) + '" filter="url(#soft)"/>';
    }
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid slice" role="img" aria-label="程序绘画：水岸">' +
      '<defs>' +
      '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe0f2"/><stop offset=".55" stop-color="#8fc1e0"/><stop offset="1" stop-color="#5d9cc8"/></linearGradient>' +
      '<linearGradient id="plain" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ba05b"/><stop offset="1" stop-color="#4f7442"/></linearGradient>' +
      '<filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7"/></filter>' +
      '</defs>' +
      '<rect width="' + w + '" height="' + h + '" fill="url(#sky)"/>' + clouds +
      '<path d="' + closeDown(ridge(r, w, 196, 13, 0.012, 1.2, 3), w, 262) + '" fill="#7a9cc0" opacity=".75"/>' +
      '<path d="' + closeDown(ridge(r, w, 218, 16, 0.009, 4.1, 4), w, 275) + '" fill="#5c86ad" opacity=".9"/>' +
      '<rect y="246" width="' + w + '" height="204" fill="url(#plain)"/>' +
      '<rect y="244" width="' + w + '" height="10" fill="#8fb6d4" opacity=".35"/>' + patches +
      '<path d="' + closeDown(ridge(r, w, 262, 7, 0.02, 2.2, 2), w, 330) + '" fill="#55804a" opacity=".8"/>' + reeds +
      '<rect width="' + w + '" height="' + h + '" fill="none" stroke="rgba(20,40,50,.12)" stroke-width="14"/>' +
      '</svg>';
  }

  // —— 日落（洱海日落：sunset 的配色构图，剪影树与波光） ——
  function sunset(seed) {
    var r = rng(seed || 7), w = 800, h = 450;
    var glow = '', streaks = '', birds = '', i;
    for (i = 0; i < 5; i++) {
      glow += '<circle cx="205" cy="205" r="' + f1(26 + i * 24) + '" fill="#ffd98a" opacity="' + f1(0.16 - i * 0.025) + '" filter="url(#soft)"/>';
    }
    for (i = 0; i < 30; i++) {
      var sx = 120 + r() * 180, sy = 252 + r() * 80, len = 14 + r() * 80;
      streaks += '<rect x="' + f1(sx - len / 2) + '" y="' + f1(sy) + '" width="' + f1(len) + '" height="' + f1(1.6 + r() * 3.2) + '" rx="1" fill="' + (r() < 0.5 ? '#f2c178' : '#f7d291') + '" opacity="' + f1(0.35 + r() * 0.5) + '"/>';
    }
    for (i = 0; i < 4; i++) {
      var bx = 320 + r() * 420, by = 128 + r() * 60, bs = 3 + r() * 3;
      birds += '<path d="M' + f1(bx - bs) + ' ' + f1(by) + ' Q' + f1(bx - bs / 2) + ' ' + f1(by - bs * 0.8) + ' ' + f1(bx) + ' ' + f1(by) + ' Q' + f1(bx + bs / 2) + ' ' + f1(by - bs * 0.8) + ' ' + f1(bx + bs) + ' ' + f1(by) + '" stroke="#2a3644" stroke-width="1.4" fill="none" opacity=".8"/>';
    }
    // 水杉式剪影：主干挺拔微斜，分枝一律向上收
    function tree(x, base, hh, lean) {
      var s = '<g stroke="#111a22" fill="none" stroke-linecap="round">';
      var topX = x + lean, topY = base - hh;
      s += '<path d="M' + f1(x) + ' ' + f1(base) + ' Q' + f1(x + lean * 0.35) + ' ' + f1(base - hh * 0.6) + ' ' + f1(topX) + ' ' + f1(topY) + '" stroke-width="' + f1(4 + hh * 0.025) + '"/>';
      for (var b = 0; b < 5; b++) {
        var t = 0.32 + b * 0.13, jx = x + lean * t, jy = base - hh * t;
        var bl = (16 + r() * 18) * (1 - t * 0.45), dir = b % 2 === 0 ? -1 : 1;
        s += '<path d="M' + f1(jx) + ' ' + f1(jy) + ' Q' + f1(jx + dir * bl * 0.25) + ' ' + f1(jy - bl * 0.75) + ' ' + f1(jx + dir * bl * 0.55) + ' ' + f1(jy - bl) + '" stroke-width="1.6"/>';
        for (var k = 0; k < 3; k++) {
          s += '<path d="M' + f1(jx + dir * bl * (0.25 + k * 0.14)) + ' ' + f1(jy - bl * (0.4 + k * 0.18)) + ' q' + f1(dir * 2) + ' ' + f1(-7 - r() * 6) + ' ' + f1(dir * (2 + r() * 4)) + ' ' + f1(-13 - r() * 8) + '" stroke-width="1" opacity=".92"/>';
        }
      }
      return s + '</g>';
    }
    var trees = tree(455, 246, 84, 8) + tree(492, 248, 108, -7) + tree(532, 247, 66, 6) + tree(424, 247, 52, -5);
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid slice" role="img" aria-label="程序绘画：日落">' +
      '<defs>' +
      '<linearGradient id="sky2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c93b4"/><stop offset=".42" stop-color="#d9a86a"/><stop offset=".68" stop-color="#f2b95c"/><stop offset="1" stop-color="#f7d291"/></linearGradient>' +
      '<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c5570"/><stop offset="1" stop-color="#16293a"/></linearGradient>' +
      '<filter id="soft2" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="9"/></filter>' +
      '</defs>' +
      '<rect width="' + w + '" height="' + h + '" fill="url(#sky2)"/>' + glow +
      '<circle cx="205" cy="205" r="21" fill="#fff6dd"/>' +
      '<path d="' + closeDown(ridge(r, w, 236, 6, 0.014, 2.6, 1.5), w, 262) + '" fill="#31485c" opacity=".55"/>' +
      '<rect y="240" width="' + w + '" height="210" fill="url(#sea)"/>' + streaks + birds + trees +
      '<rect width="' + w + '" height="' + h + '" fill="none" stroke="rgba(8,14,20,.18)" stroke-width="14"/>' +
      '</svg>';
  }

  // —— 丹霞彩丘（张掖：zhangye 的配色构图，条纹山体） ——
  function danxia(seed) {
    var r = rng(seed || 23), w = 800, h = 450;
    var layers = '', i;
    var sky = '<rect width="' + w + '" height="' + h + '" fill="url(#sky3)"/>';
    for (i = 0; i < 4; i++) {
      var pink = '<ellipse cx="' + f1(80 + r() * 640) + '" cy="' + f1(128 + r() * 50) + '" rx="' + f1(90 + r() * 90) + '" ry="' + f1(12 + r() * 14) + '" fill="#e8a0a0" opacity=".5" filter="url(#soft3)"/>';
      sky += pink;
    }
    var defs = '<linearGradient id="sky3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2d7cf"/><stop offset=".6" stop-color="#f0b28e"/><stop offset="1" stop-color="#e8a584"/></linearGradient>' +
      '<filter id="soft3" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="8"/></filter>';
    var palettes = [
      ['#b97a6a', '#c98f74'],
      ['#c1552f', '#d98a3f', '#b06046', '#e0b25c'],
      ['#d98a3f', '#e0b25c', '#c1552f', '#a8916a'],
      ['#8a5a4a', '#a05c42', '#c1785a', '#6e4a52']
    ];
    var bases = [188, 236, 288, 336], amps = [13, 24, 32, 30];
    for (i = 0; i < 4; i++) {
      var pal = palettes[i], gid = 'lg' + i;
      var stops = '';
      for (var s = 0; s < pal.length; s++) stops += '<stop offset="' + f1(s / (pal.length - 1)) + '" stop-color="' + pal[s] + '"/>';
      defs += '<linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' + stops + '</linearGradient>';
      var rd = ridge(r, w, bases[i], amps[i], 0.006 + i * 0.002, i * 2.1, 3);
      layers += '<path d="' + closeDown(rd, w, h) + '" fill="url(#' + gid + ')"/>';
      // 沟壑短痕：从脊线往下的小竖痕
      if (i > 0) {
        for (var k = 0; k < 16; k++) {
          var gx = 30 + r() * 740, gy = bases[i] - amps[i] * 0.4 + r() * amps[i];
          layers += '<path d="M' + f1(gx) + ' ' + f1(gy) + ' q' + f1((r() - 0.5) * 10) + ' ' + f1(10 + r() * 14) + ' ' + f1((r() - 0.5) * 6) + ' ' + f1(24 + r() * 20) + '" stroke="rgba(90,40,25,.3)" stroke-width="1.2" fill="none"/>';
        }
      }
      layers += '<path d="' + rd + '" stroke="rgba(70,30,20,.35)" stroke-width="1.4" fill="none"/>';
    }
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid slice" role="img" aria-label="程序绘画：丹霞彩丘">' +
      '<defs>' + defs + '</defs>' + sky + layers +
      '<rect width="' + w + '" height="' + h + '" fill="none" stroke="rgba(60,20,10,.15)" stroke-width="14"/>' +
      '</svg>';
  }

  root.Painting = {
    keys: [
      { key: 'shore', title: '水岸', note: '洱海水草滩与蒲苇的配色' },
      { key: 'sunset', title: '日落', note: '日落金的暖调与剪影' },
      { key: 'danxia', title: '丹霞', note: '彩丘条纹的赭红与金黄' }
    ],
    scene: function (key, seed) {
      if (key === 'sunset') return sunset(seed);
      if (key === 'danxia') return danxia(seed);
      return shore(seed);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
