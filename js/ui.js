/* 《地貌猜地点》浏览器薄壳：只做渲染与事件绑定，一切判定走纯逻辑引擎 Engine。
 * 数据来自 js/data.js（window.QBANK）与 js/worldmap.js（window.WORLDMAP）。
 * 视觉系统：11 类地貌主题色注入 body；亮/暗主题与音效开关存 localStorage；file:// 直开亦可。 */
'use strict';
(function () {
  var BANK = (window.QBANK && window.QBANK.questions) || [];
  var state = null;
  var selCat = '', selDiff = 0;

  // —— 11 类地貌主题色（暗色版；亮色版由 CSS 的 body.light 覆盖） ——
  var CAT_COLORS = {
    '喀斯特': '#45d0c0', '红层丹霞': '#e8825a', '红树林': '#54c78d', '潮滩': '#d8b877',
    '三角洲': '#6aa7e0', '黄土': '#d9a441', '河流地貌': '#5ea8d8', '荒漠地貌': '#e0964b',
    '冰川峡湾': '#8fd0e8', '火山地热': '#e06a5a', '海岸与珊瑚礁': '#e88a9a'
  };
  var LOG_FACE = { host: '#face-host', judge: '#face-judge', hint: '#face-note' };
  var heroKey = null; // 用户手选的画；null = 按主题默认

  // 结算评语：按成绩分档的老队长口吻
  function verdictLine(t) {
    if (!t.played) return '一页没写，老队长把烟斗装上了。';
    if (t.correct === t.played && t.played >= 3) return '整册干净利落。老队长磕了磕烟斗：“下册，上难度。”';
    if (t.perfect >= 3) return '连翻底牌的机会都不给——老队长开始翻进阶题库了。';
    if (t.correct >= Math.ceil(t.played * 0.6)) return '路子正。红批注替你省了半本。';
    if (!t.correct) return '满页红批注……把推理链抄一遍，下册见真章。';
    return '有几页走得磕绊，把批注读完再出发。';
  }

  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function applyCat(cat) {
    var col = CAT_COLORS[cat];
    var s = document.body.style;
    if (!col) { s.removeProperty('--cat'); s.removeProperty('--cat-soft'); s.removeProperty('--cat-line'); return; }
    s.setProperty('--cat', col);
    s.setProperty('--cat-soft', hexA(col, .14));
    s.setProperty('--cat-line', hexA(col, .5));
  }

  // —— 胶片盒（程序绘画：配色构图取自参考照片；设置页背景 + 换画） ——
  function applyHero() {
    var isLight = document.body.classList.contains('light');
    var key = heroKey || (isLight ? 'shore' : 'sunset');
    var hero = $('hero');
    if (!hero) return;
    hero.innerHTML = Painting.scene(key, isLight ? 11 : 7);
    var cap = document.createElement('div');
    cap.className = 'hero-caption';
    cap.textContent = '这张 hero 不是照片——是程序按老队长胶片盒的配色与构图画的画（大理洱海 × 张掖丹霞）。点一张，换一种心情。';
    hero.appendChild(cap);
    var thumbs = document.createElement('div');
    thumbs.className = 'film-thumbs';
    thumbs.id = 'filmThumbs';
    Painting.keys.forEach(function (s, i) {
      var el = document.createElement('span');
      el.className = 'film-thumb' + (s.key === key ? ' on' : '');
      el.title = s.title + ' — ' + s.note;
      el.innerHTML = Painting.scene(s.key, 11);
      el.onclick = function () { heroKey = s.key; applyHero(); };
      thumbs.appendChild(el);
    });
    hero.appendChild(thumbs);
  }

  // —— 主题（暗色夜景 / 亮色手账） ——
  function applyTheme(light, save) {
    document.body.classList.toggle('light', light);
    $('btnTheme').textContent = light ? '🌑' : '📜';
    $('btnTheme').title = light ? '切换暗色夜景' : '切换亮色手账';
    if (save) { try { localStorage.setItem('gdz-theme', light ? 'light' : 'dark'); } catch (e) { /* 忽略 */ } }
    if (!$('filmThumbs') || !$('hero').classList.contains('hidden')) applyHero(); // 可见时随主题换默认画
  }

  // —— 连击统计（纯展示聚合，读 state.results） ——
  function streakNow(results) {
    var n = 0, i = results.length - 1;
    while (i >= 0 && results[i].correct) { n++; i--; }
    return n;
  }
  function streakBest(results) {
    var b = 0, c = 0;
    results.forEach(function (r) { if (r.correct) { c++; if (c > b) b = c; } else c = 0; });
    return b;
  }
  function showToast(text) {
    var t = $('toast');
    t.textContent = text;
    t.classList.remove('hidden'); t.classList.remove('go');
    void t.offsetWidth;
    t.classList.add('go');
    clearTimeout(showToast._h);
    showToast._h = setTimeout(function () { t.classList.add('hidden'); }, 1900);
  }

  var $ = function (id) { return document.getElementById(id); };
  var $ = function (id) { return document.getElementById(id); };

  // ---------- 存档（localStorage 自动保存 + 导出/导入搬运） ----------
  var SAVE_KEY = 'gdz-save-v1', PROFILE_KEY = 'gdz-profile-v1';
  function loadJSON(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function saveJSON(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 隐私模式等 */ } }
  function saveRound() {
    if (state && (state.phase === 'playing' || state.phase === 'revealed')) {
      saveJSON(SAVE_KEY, { state: state, at: Date.now() });
    }
  }
  function clearRound() { saveJSON(SAVE_KEY, null); }
  // 生涯战绩：按"会话 id:页序"为键合并各次对局的 results，天然去重、可断点续记
  function syncProfile() {
    if (!state) return;
    var p = loadJSON(PROFILE_KEY) || { map: {} };
    p.map = p.map || {};
    state.results.forEach(function (r, i) {
      var key = (state.sid || 's') + ':' + i;
      if (!p.map[key]) p.map[key] = { id: r.id, s: r.score, c: r.correct ? 1 : 0 };
    });
    saveJSON(PROFILE_KEY, p);
  }
  function career() {
    var p = loadJSON(PROFILE_KEY) || { map: {} };
    var t = { score: 0, played: 0, correct: 0, perfect: 0, best: 0, cur: 0 };
    Object.keys(p.map).forEach(function (k) {
      var r = p.map[k];
      t.score += r.s; t.played++;
      if (r.c) { t.correct++; t.cur++; if (t.cur > t.best) t.best = t.cur; } else t.cur = 0;
      if (r.s === 100) t.perfect++;
    });
    return t;
  }

  function show(id, on) { $(id).classList.toggle('hidden', !on); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function byId(id) { for (var i = 0; i < BANK.length; i++) if (BANK[i].id === id) return BANK[i]; return null; }

  // ---------- 开局设置 ----------
  function buildSetup() {
    $('setupCount').textContent = BANK.length;
    // 生涯战绩
    var c = career();
    var careerEl = $('careerLine');
    if (c.played) {
      careerEl.textContent = '生涯战绩：' + c.score + ' 分 · 已玩 ' + c.played + ' 页 · 答对 ' + c.correct +
        ' · 一击命中 ' + c.perfect + ' · 最长连对 ' + c.best;
      careerEl.classList.remove('hidden');
    } else careerEl.classList.add('hidden');
    // 继续上次
    var save = loadJSON(SAVE_KEY);
    var row = $('resumeRow');
    if (save && save.state && (save.state.phase === 'playing' || save.state.phase === 'revealed')) {
      $('resumeInfo').textContent = '上次玩到第 ' + Math.min(save.state.pos + 1, save.state.queue.length) +
        ' / ' + save.state.queue.length + ' 页 · 本局积分 ' + save.state.totals.score;
      row.classList.remove('hidden');
    } else row.classList.add('hidden');
    var cats = [''].concat((window.QBANK.meta && window.QBANK.meta.cats) || []);
    var wrap = $('catChips'); wrap.innerHTML = '';
    cats.forEach(function (c) {
      var el = document.createElement('span');
      el.className = 'chip' + (c === selCat ? ' on' : '');
      var col = CAT_COLORS[c];
      el.innerHTML = (col ? '<i class="dot" style="background:' + col + ';color:' + col + '"></i>' : '') + esc(c === '' ? '全部' : c);
      el.onclick = function () { selCat = c; buildSetup(); };
      wrap.appendChild(el);
    });
    var dw = $('diffChips'); dw.innerHTML = '';
    [0, 1, 2, 3, 4, 5].forEach(function (d) {
      var el = document.createElement('span');
      el.className = 'chip' + (d === selDiff ? ' on' : '');
      el.textContent = d === 0 ? '不限' : '★'.repeat(d);
      el.onclick = function () { selDiff = d; buildSetup(); };
      dw.appendChild(el);
    });
  }

  // ---------- 渲染 ----------
  function renderHud(v) {
    $('hudScore').textContent = v.totals.score;
    $('hudCorrect').textContent = v.totals.correct + '/' + v.totals.played;
    $('hudPerfect').textContent = v.totals.perfect;
    $('hudStreak').textContent = state ? streakNow(state.results) : 0;
    $('hudStreak').classList.toggle('hot', state ? streakNow(state.results) >= 2 : false);
    $('hudProgress').textContent = v.phase === 'board' ? '-' : (Math.min(v.pos + 1, v.queueLen) + '/' + v.queueLen);
    $('ftPage').textContent = v.phase === 'board'
      ? (state ? '空页待写（共 ' + state.queue.length + ' 页地貌）' : '共 50 页地貌')
      : '第 ' + Math.min(v.pos + 1, v.queueLen) + ' / ' + v.queueLen + ' 页';
    $('ftSeed').textContent = '底本编号 ' + v.seed;
  }

  function renderLog(v) {
    var box = $('logBox');
    box.innerHTML = v.log.map(function (l) {
      return '<div class="log-line ' + l.who + '"><span class="avatar"><svg class="face"><use href="' + LOG_FACE[l.who] + '"/></svg></span>' +
        '<span class="bubble">' + esc(l.text) + '</span></div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  function renderGame() {
    var q = Engine.currentQ(state, BANK);
    var v = Engine.view(state, q);
    applyCat(q.cat);
    renderHud(v); renderLog(v);
    show('setup', false); show('game', true); show('summary', false);
    show('reveal', state.phase === 'revealed');

    $('qCat').textContent = q.cat;
    $('qDiff').textContent = '难度 ' + '★'.repeat(q.diff);
    $('qPotential').textContent = '当前可得分 ' + v.potential;
    $('qClueCount').textContent = '线索 ' + v.revealed + '/' + v.cluesTotal;

    $('clueList').innerHTML = v.clues.map(function (c, i) {
      return '<div class="clue-card" style="animation-delay:' + (i * 70) + 'ms">' +
        '<span class="clue-num">' + (i + 1) + '</span>' +
        '<div class="clue-body"><span class="clue-tag">' + esc(c.tag) + '</span>' +
        '<span class="clue-text">' + esc(c.text) + '</span></div></div>';
    }).join('');
    $('hintList').innerHTML = v.hintsShown.map(function (h, i) {
      return '<div class="clue-card"><span class="clue-num">💡</span>' +
        '<div class="clue-body"><span class="clue-tag">提示' + (i + 1) + '</span>' +
        '<span class="clue-text">' + esc(h) + '</span></div></div>';
    }).join('');

    var allClues = v.revealed >= v.cluesTotal;
    $('btnClue').disabled = allClues || state.phase !== 'playing';
    $('btnHint').disabled = state.hints.length >= v.hintsTotal || state.phase !== 'playing';
    $('btnGiveUp').disabled = state.phase !== 'playing';
    $('btnGuess').disabled = state.phase !== 'playing';
    $('guessInput').disabled = state.phase !== 'playing';

    if (state.phase === 'revealed') renderReveal(q, v);
    syncProfile();
    saveRound();
    return v;
  }

  // ---------- 揭晓：地图落点 ----------
  function renderMap(q) {
    var box = $('mapBox');
    var W = 360, H = 180;
    var x = Math.max(3, Math.min(W - 3, q.lon + 180));
    var y = Math.max(3, Math.min(H - 3, 90 - q.lat));
    var g = '';
    var lon, lat;
    for (lon = -150; lon <= 180; lon += 30) g += '<line x1="' + (lon + 180) + '" y1="0" x2="' + (lon + 180) + '" y2="' + H + '"/>';
    for (lat = -60; lat <= 60; lat += 30) g += '<line x1="0" y1="' + (90 - lat) + '" x2="' + W + '" y2="' + (90 - lat) + '"/>';
    var special =
      '<line class="eq" x1="0" y1="90" x2="' + W + '" y2="90"/>' +
      '<line class="tr" x1="0" y1="' + (90 - 23.44).toFixed(2) + '" x2="' + W + '" y2="' + (90 - 23.44).toFixed(2) + '"/>' +
      '<line class="tr" x1="0" y1="' + (90 + 23.44).toFixed(2) + '" x2="' + W + '" y2="' + (90 + 23.44).toFixed(2) + '"/>';
    var land = (window.WORLDMAP && window.WORLDMAP.d) ? '<path class="land" d="' + window.WORLDMAP.d + '"/>' : '';
    var latStr = (q.lat >= 0 ? q.lat.toFixed(1) + '°N' : (-q.lat).toFixed(1) + '°S');
    var lonStr = (q.lon >= 0 ? q.lon.toFixed(1) + '°E' : (-q.lon).toFixed(1) + '°W');
    var right = x > W * 0.62;
    var lx = right ? x - 8 : x + 8;
    var ly = Math.max(9, y - 7);
    box.innerHTML =
      '<svg class="locmap" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="答案落点地图">' +
      '<rect class="sea" x="0" y="0" width="' + W + '" height="' + H + '"/>' + land +
      '<g class="grat">' + g + '</g>' + special +
      '<line class="aim" x1="0" y1="' + y + '" x2="' + x + '" y2="' + y + '"/>' +
      '<line class="aim" x1="' + x + '" y1="0" x2="' + x + '" y2="' + y + '"/>' +
      '<g class="marker" transform="translate(' + x + ',' + y + ')">' +
      '<circle class="pulse p1" r="5"/><circle class="pulse p2" r="5"/><circle class="core" r="3.4"/></g>' +
      '<text class="mlabel" x="' + lx + '" y="' + ly + '" text-anchor="' + (right ? 'end' : 'start') + '">' + esc(latStr + '  ' + lonStr) + '</text>' +
      '</svg>';
  }

  function renderReveal(q, v) {
    $('ansName').textContent = v.answer.name;
    $('ansMeta').innerHTML =
      '地貌类型：<b>' + esc(v.landform) + '</b><br>' +
      '位置：<b>' + esc(v.answer.country) + (v.answer.region && v.answer.region !== v.answer.country ? ' · ' + esc(v.answer.region) : '') + '</b>' +
      '　坐标：<b>' + v.answer.lat.toFixed(2) + '°N, ' + v.answer.lon.toFixed(2) + '°E</b><br>' +
      '还可认作：' + esc(v.answer.alias.join(' / '));
    var lastScore = state.results[state.results.length - 1] ? state.results[state.results.length - 1].score : 0;
    var ring = $('scoreRing');
    ring.style.setProperty('--p', lastScore);
    ring.classList.toggle('zero', lastScore === 0);
    $('roundScore').textContent = lastScore;
    renderMap(q);

    $('chainList').innerHTML = v.chain.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    $('factBox').innerHTML = '<b>顺耳一听</b>' + esc(v.fact);
    var gs = state.guesses;
    $('guessRecap').textContent = gs.length
      ? '这页你的试探（' + gs.length + ' 次）：' + gs.map(function (g) { return '「' + g.text + '」'; }).join(' ')
      : '这页你一次都没试探。';
    $('btnNext').textContent = state.pos + 1 >= state.queue.length ? '合上这本 →' : '下一页 →';
    // 揭晓配图：优先实景照（js/wiki-photos.js，自由版权+署名），否则手绘明信片
    var art = $('artCard'), wiki = $('wikiCard');
    var wp = window.WIKIPHOTOS && window.WIKIPHOTOS[q.id];
    if (wp) {
      $('wikiImg').src = 'wiki-imgs/' + q.id + '.jpg';
      $('wikiLink').href = wp.pageUrl || '#';
      $('wikiTitle').textContent = wp.title || q.answer;
      $('wikiCredit').textContent = '图：' + (wp.author || '佚名') + ' · ' + (wp.license || '自由版权') + ' · Wikimedia Commons';
      wiki.classList.remove('hidden');
      art.classList.add('hidden');
    } else if (v.art && window.Painting) {
      $('artSvg').innerHTML = Painting.scene(v.art, 99);
      art.classList.remove('hidden');
      wiki.classList.add('hidden');
    } else {
      art.classList.add('hidden');
      wiki.classList.add('hidden');
    }
  }

  // ---------- 结算徽章 ----------
  function renderBadges() {
    var t = state.totals;
    var catOk = {};
    state.results.forEach(function (r) {
      if (!r.correct) return;
      var q = byId(r.id);
      if (q) catOk[q.cat] = 1;
    });
    var best = streakBest(state.results);
    var badges = [
      { icon: '🥇', name: '首战告捷', desc: '首次答对', got: t.correct >= 1 },
      { icon: '🎯', name: '一击命中', desc: '首条线索即答对', got: t.perfect >= 1 },
      { icon: '💯', name: '满分大师', desc: '一击命中 3 次', got: t.perfect >= 3 },
      { icon: '🔥', name: '三连击', desc: '连续答对 3 题', got: best >= 3 },
      { icon: '🧭', name: '十题百炼', desc: '完成 10 题', got: t.played >= 10 },
      { icon: '🌏', name: '环球旅行家', desc: '答对覆盖 3 类地貌', got: Object.keys(catOk).length >= 3 }
    ];
    $('badgeWall').innerHTML = badges.map(function (b) {
      return '<div class="badge-card ' + (b.got ? 'got' : 'lock') + '">' +
        '<span class="b-icon">' + (b.got ? b.icon : '🔒') + '</span>' +
        '<b>' + b.name + '</b><i>' + b.desc + '</i></div>';
    }).join('');
  }

  function renderSummary() {
    show('setup', false); show('game', true); show('reveal', false); show('summary', true);
    $('clueList').innerHTML = ''; $('hintList').innerHTML = '';
    var t = state.totals;
    var rows = state.results.map(function (r, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(r.id) + '</td><td>' + (r.correct ? '✔' : '✘') + '</td><td>' + r.score + '</td></tr>';
    }).join('');
    $('summaryBody').innerHTML =
      '<div class="verdict">' + esc(verdictLine(t)) + '</div>' +
      '<div class="score-line">总分 ' + t.score + '</div>' +
      '走了 ' + t.played + ' 页，猜对 ' + t.correct + ' 页，其中 ' + t.perfect + ' 页一次命中，最长连对 ' + streakBest(state.results) + ' 页。<br>' +
      '批注里点过 ' + t.typeHit + ' 次地貌类型、' + t.regionHit + ' 次大区。' +
      (t.played ? '<table><tr><th>#</th><th>页码</th><th>结果</th><th>记分</th></tr>' + rows + '</table>' : '');
    renderBadges();
    var c = career();
    $('summaryBody').innerHTML +=
      '<div class="career">生涯累计：' + c.score + ' 分 · ' + c.played + ' 页 · 答对 ' + c.correct +
      ' · 一击命中 ' + c.perfect + ' · 最长连对 ' + c.best + '</div>';
    syncProfile();
    clearRound(); // 合上本册：续玩存档清掉，生涯战绩已入册
    renderHud({ totals: t, phase: 'board', pos: 0, queueLen: state.queue.length, seed: state.seed });
  }

  // ---------- 动作 ----------
  function actClue() {
    var r = Engine.revealClueCtx(state, Engine.currentQ(state, BANK));
    if (r.ok) window.SFX && SFX.play('clue');
    renderGame();
  }
  function actHint() {
    var r = Engine.revealHintCtx(state, Engine.currentQ(state, BANK));
    if (r.ok) window.SFX && SFX.play('hint');
    renderGame();
  }
  function actGiveUp() {
    var r = Engine.giveUpCtx(state, Engine.currentQ(state, BANK));
    if (r.ok) window.SFX && SFX.play('giveup');
    renderGame();
    if (state.phase === 'revealed') {
      var rv = $('reveal');
      if (rv && rv.scrollIntoView) rv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  function actGuess() {
    var inp = $('guessInput');
    var text = inp.value.trim();
    if (!text) return;
    var wasPerfect = state.revealed === 1 && state.hints.length === 0 && state.miss === 0;
    var r = Engine.guessCtx(state, Engine.currentQ(state, BANK), text);
    inp.value = '';
    if (window.SFX) {
      var snd = { FULL: wasPerfect ? 'perfect' : 'full', MISS: 'miss', TYPE: 'type', TYPE_REGION: 'type', REGION: 'region', CONFUSE: 'confuse' }[r.verdict];
      if (snd) SFX.play(snd);
    }
    if (r.verdict === 'FULL') {
      var n = streakNow(state.results);
      if (n >= 2) showToast('🔥 连对 ' + n + '！');
    }
    renderGame();
    if (state.phase === 'revealed') {
      var rv = $('reveal');
      if (rv && rv.scrollIntoView) rv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  function actNext() {
    var r = Engine.nextCtx(state);
    if (r.ended) { window.SFX && SFX.play('fanfare'); renderSummary(); }
    else { renderGame(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }
  function actStart() {
    var seedRaw = $('seedInput').value.trim();
    var seed = seedRaw === '' ? 0 : (parseInt(seedRaw, 10) >>> 0);
    state = Engine.newGame(BANK, { seed: seed, cat: selCat || null, diff: selDiff || null });
    state.sid = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    clearRound(); // 新局覆盖上次的续玩存档（生涯战绩已同步，不受影响）
    show('hero', false);
    renderGame();
    window.scrollTo({ top: 0 });
  }
  function actResume() {
    var save = loadJSON(SAVE_KEY);
    if (!save || !save.state) return;
    // 校验：题库版本变了（队列出图失败）就丢弃旧档
    var ok = (save.state.queue || []).every(function (id) { return byId(id); });
    if (!ok) { clearRound(); buildSetup(); return; }
    state = save.state;
    renderGame();
    window.scrollTo({ top: 0 });
  }
  function actExport() {
    var payload = { v: 1, profile: loadJSON(PROFILE_KEY), save: loadJSON(SAVE_KEY) };
    var code = JSON.stringify(payload);
    window.prompt('全选复制这段存档码，发给朋友或自己存好：', code);
  }
  function actImport() {
    var code = window.prompt('粘贴存档码：', '');
    if (!code) return;
    try {
      var payload = JSON.parse(code.trim());
      if (!payload || (!payload.profile && !payload.save)) throw new Error('格式不对');
      if (payload.profile) saveJSON(PROFILE_KEY, payload.profile);
      if (payload.save) saveJSON(SAVE_KEY, payload.save); else clearRound();
      location.reload();
    } catch (e) { showToast('存档码无效'); }
  }
  function actRestart() {
    applyCat('');
    show('hero', true);
    applyHero();
    show('summary', false); show('setup', true); show('game', false);
  }
  function actSfx() {
    if (!window.SFX) return;
    var on = SFX.toggle();
    $('btnSfx').textContent = on ? '🔊' : '🔇';
    $('btnSfx').title = on ? '关闭音效' : '开启音效';
  }

  // ---------- 绑定 ----------
  $('btnStart').onclick = actStart;
  $('btnResume').onclick = actResume;
  $('btnExport').onclick = actExport;
  $('btnImport').onclick = actImport;
  $('btnClue').onclick = actClue;
  $('btnHint').onclick = actHint;
  $('btnGiveUp').onclick = actGiveUp;
  $('btnGuess').onclick = actGuess;
  $('btnNext').onclick = actNext;
  $('btnRestart').onclick = actRestart;
  $('btnSfx').onclick = actSfx;
  $('btnTheme').onclick = function () { applyTheme(!document.body.classList.contains('light'), true); };
  $('guessInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') actGuess(); });
  window.addEventListener('pagehide', function () { saveRound(); syncProfile(); }); // 关页兜底存档

  // ---------- 初始化偏好 ----------
  var savedTheme = '';
  try { savedTheme = localStorage.getItem('gdz-theme') || ''; } catch (e) { /* 忽略 */ }
  applyTheme(savedTheme === 'light', false);
  if (window.SFX) $('btnSfx').textContent = SFX.enabled() ? '🔊' : '🔇'; // SFX 模块已自行读存储

  show('hero', true);
  applyHero();
  buildSetup();
})();
