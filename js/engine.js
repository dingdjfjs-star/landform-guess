/* 《地貌猜地点》纯逻辑引擎：确定性（种子随机）、状态可序列化（JSON 往返一致）、浏览器/Node 双端可用。
 * 裁判判定链：FULL(答对) → CONFUSE(典型误猜引导) → TYPE/REGION(部分命中) → MISS(未中)。
 * 打分：起始潜力 100；每多要一条线索 -15，每用一条提示 -12，每次未命中 -7，下限 15；揭晓/放弃 = 0。 */
'use strict';
(function (root) {
  // ---------- 确定性随机 ----------
  function mulberry32Step(state) {
    // state.r 为 32 位无符号整数，返回 [0,1) 并推进
    var t = (state.r = (state.r + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffled(arr, rngState) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(mulberry32Step(rngState) * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---------- 文本规范化 ----------
  var PUNCT = /[\s\-—_~·.,!?;:'"’“”()（）\[\]【】<>《》、。！？；：…]+/g;
  function normalize(text) {
    if (!text) return '';
    var s = String(text).toLowerCase();
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      // 全角 → 半角
      if (c >= 0xFF01 && c <= 0xFF5E) c -= 0xFEE0;
      out += String.fromCharCode(c);
    }
    return out.replace(PUNCT, '');
  }
  function contains(text, token) {
    if (!text || !token || String(token).length < 2) return false;
    return text.indexOf(normalize(token)) >= 0; // token 同样归一化（去空格标点、小写）
  }

  // ---------- 常量 ----------
  var MAX_POTENTIAL = 100, MIN_POTENTIAL = 15;
  var CLUE_COST = 15, HINT_COST = 12, MISS_COST = 7;
  var OPENING_LINES = [
    '老队长合上地图册，看了你一眼：“心里先别预设答案，线索会带你走。”',
    '“这地方的石头会说话。”老队长放下茶缸，“第一条线索，听好了。”',
    '“我年轻时在那儿蹲过两个雨季。”老队长在纸页上敲了敲，“你来猜。”',
    '“别急着报地名。”老队长划了根火柴点烟斗，“先把线索读全。”',
    '“山不说话，”老队长笑了，“但痕迹都替你记在纸上了。”'
  ];
  var NUDGES = [
    '不挨边。回头看第一条线索——先弄清这地方是冻出来的，还是泡出来的。',
    '差得远。岩性那页再读一遍：什么样的石头肯长成这样？',
    '不对。把水文和外力两条线索摞起来看，路就显出来了。',
    '急什么。这地方熬了上万年才熬成这样，你也多熬一页。',
    '没摸着门。动植物那两条会把纬度框死，顺着走。',
    '不对哦。人文线索里埋着行政区划，顺着藤摸。',
    '再想想。海拔那一条，已经替你划掉半张地图了。',
    '不是这儿。拿你心里的地方跟海陆位置对一对，对不上就换。'
  ];

  // ---------- 内部工具 ----------
  function qClues(q) { return q.clues; }
  function potentialOf(st) {
    var hintsUsed = 0, i;
    for (i = 0; i < st.hints.length; i++) if (st.hints[i]) hintsUsed++;
    var p = MAX_POTENTIAL - CLUE_COST * Math.max(0, st.revealed - 1) - HINT_COST * hintsUsed - MISS_COST * st.miss;
    return Math.max(MIN_POTENTIAL, p);
  }
  function pushLog(st, who, text) { st.log.push({ who: who, text: text }); }

  // 造一份新题状态（重置本轮字段，不动会话字段）
  function resetRound(st, first) {
    st.phase = 'playing';
    st.revealed = 1; // 第一条线索免费给出
    st.hints = [];
    st.guesses = [];
    st.miss = 0;
    st.potential = MAX_POTENTIAL;
    st.log = [];
    var opening = OPENING_LINES[Math.floor(mulberry32Step(st) * OPENING_LINES.length)];
    pushLog(st, 'host', opening);
  }

  // ---------- 对外 API ----------
  var Engine = {
    MAX_POTENTIAL: MAX_POTENTIAL, MIN_POTENTIAL: MIN_POTENTIAL,
    CLUE_COST: CLUE_COST, HINT_COST: HINT_COST, MISS_COST: MISS_COST,
    NUDGES: NUDGES,
    normalize: normalize,
    contains: contains,

    // 某题的"全对"判定词（答案+市级别名+别名），供测试与裁判共用
    fullTokens: function (q) {
      var toks = [q.answer, q.local].concat(q.alias || []);
      return toks.filter(function (t) { return t && t.length >= 2; });
    },
    // 某题的"防泄露"词表（全对词 + 作者自标黑名单），测试用
    leakTokens: function (q) {
      return Engine.fullTokens(q).concat(q.black || []);
    },

    // 开新会话：bank 为题目数组；opts: {seed, cat, diff}
    newGame: function (bank, opts) {
      opts = opts || {};
      var seed = (opts.seed >>> 0) || ((Date.now() & 0xFFFFFFFF) >>> 0);
      var st = { seed: seed, r: seed >>> 0, pos: 0, results: [], totals: { score: 0, correct: 0, played: 0, perfect: 0, typeHit: 0, regionHit: 0 } };
      var pool = bank.filter(function (q) {
        if (opts.cat && q.cat !== opts.cat) return false;
        if (opts.diff && q.diff !== opts.diff) return false;
        return true;
      });
      if (pool.length === 0) pool = bank.slice();
      st.queue = shuffled(pool, st).map(function (q) { return q.id; });
      st.bank = null; // 引擎不持有 bank 引用，保持纯数据
      st.qid = st.queue[0];
      resetRound(st, true);
      return st;
    },

    currentQ: function (st, bank) {
      var id = st.queue[st.pos];
      for (var i = 0; i < bank.length; i++) if (bank[i].id === id) return bank[i];
      return null;
    },

    // 会话是否结束
    sessionEnded: function (st) { return st.pos >= st.queue.length; },

    // 引擎方法统一用 ctx = {st, q} 形式：st 是可序列化状态，q 从题库按 id 查得
    revealClueCtx: function (st, q) {
      if (st.phase !== 'playing') return { ok: false, msg: '本题已揭晓。' };
      var n = qClues(q).length;
      if (st.revealed >= n) return { ok: false, msg: '线索已全部给出。' };
      st.revealed++;
      st.potential = potentialOf(st);
      var c = qClues(q)[st.revealed - 1];
      pushLog(st, 'host', '【线索' + st.revealed + '·' + c[0] + '】' + c[1]);
      return { ok: true, revealed: st.revealed };
    },

    revealHintCtx: function (st, q) {
      if (st.phase !== 'playing') return { ok: false, msg: '本题已揭晓。' };
      var idx = st.hints.length;
      if (idx >= q.hints.length) return { ok: false, msg: '提示已用完。' };
      st.hints.push(true);
      st.potential = potentialOf(st);
      pushLog(st, 'hint', '【出题人提示' + (idx + 1) + '】' + q.hints[idx]);
      return { ok: true, hints: st.hints.length };
    },

    guessCtx: function (st, q, text) {
      var g = normalize(text);
      if (!g) return { verdict: 'EMPTY', messages: [] };
      st.guesses.push({ text: String(text), verdict: '' });
      if (st.phase !== 'playing') {
        st.guesses[st.guesses.length - 1].verdict = 'POST';
        return { verdict: 'POST', messages: ['这页已见底——「' + q.answer + '」。批注看完，翻下页。'] };
      }
      var i, j;
      // 1) 全对
      var fulls = Engine.fullTokens(q);
      for (i = 0; i < fulls.length; i++) {
        if (contains(g, fulls[i])) {
          st.guesses[st.guesses.length - 1].verdict = 'FULL';
          st.phase = 'revealed';
          var score = potentialOf(st);
          st.potential = score;
          st.results.push({ id: q.id, score: score, correct: true });
          st.totals.score += score; st.totals.played++; st.totals.correct++;
          if (st.revealed === 1 && st.hints.length === 0 && st.miss === 0) st.totals.perfect++;
          pushLog(st, 'judge', '判词：正是此处！记 ' + score + ' 分，这页干净。');
          return { verdict: 'FULL', score: score, messages: ['正是此处——' + q.answer + '。'] };
        }
      }
      // 2) 典型误猜引导
      if (q.confuse) {
        for (i = 0; i < q.confuse.length; i++) {
          if (contains(g, q.confuse[i][0])) {
            st.guesses[st.guesses.length - 1].verdict = 'CONFUSE';
            pushLog(st, 'judge', q.confuse[i][1]);
            return { verdict: 'CONFUSE', messages: [q.confuse[i][1]] };
          }
        }
      }
      // 3) 地貌类型 / 区域 部分命中
      var typeHit = false, regionHit = false;
      for (i = 0; i < (q.judge.type || []).length; i++) if (contains(g, q.judge.type[i])) { typeHit = true; break; }
      for (i = 0; i < (q.judge.region || []).length; i++) if (contains(g, q.judge.region[i])) { regionHit = true; break; }
      if (typeHit && regionHit) {
        st.guesses[st.guesses.length - 1].verdict = 'TYPE_REGION';
        st.totals.typeHit++; st.totals.regionHit++;
        pushLog(st, 'judge', '批注：类型和大区都挨着边了，就差最后一口气。');
        return { verdict: 'TYPE_REGION', messages: ['类型和大区都挨着边了——把网收到具体那一处。'] };
      }
      if (typeHit) {
        st.guesses[st.guesses.length - 1].verdict = 'TYPE';
        st.totals.typeHit++;
        pushLog(st, 'judge', '批注：石头认对了，地方还没到。');
        return { verdict: 'TYPE', messages: ['石头你认对了，地方还差着。拿线索里的区域信息再收一收。'] };
      }
      if (regionHit) {
        st.guesses[st.guesses.length - 1].verdict = 'REGION';
        st.totals.regionHit++;
        pushLog(st, 'judge', '批注：大方向对了，收网。');
        return { verdict: 'REGION', messages: ['大方向对了——把网收到具体那一处。'] };
      }
      // 4) 未命中
      st.miss++;
      st.guesses[st.guesses.length - 1].verdict = 'MISS';
      st.potential = potentialOf(st);
      var nudge = NUDGES[Math.floor(mulberry32Step(st) * NUDGES.length)];
      pushLog(st, 'judge', '批注：不挨边（-' + MISS_COST + '）。' + nudge);
      return { verdict: 'MISS', messages: ['不挨边，记 -' + MISS_COST + '。' + nudge] };
    },

    giveUpCtx: function (st, q) {
      if (st.phase !== 'playing') return { ok: false };
      st.phase = 'revealed';
      st.results.push({ id: q.id, score: 0, correct: false });
      st.totals.played++;
      st.potential = 0;
      pushLog(st, 'judge', '翻底牌。这页记 0 分——推理链全给你，下页找回来。');
      return { ok: true };
    },

    // 进入下一题；返回 'sessionEnd' 表示打完
    nextCtx: function (st) {
      st.pos++;
      if (st.pos >= st.queue.length) return { ended: true };
      st.qid = st.queue[st.pos];
      resetRound(st);
      return { ended: false };
    },

    // UI 视图：揭晓前绝不携带 answer/chain/fact 等敏感字段
    view: function (st, q) {
      var v = {
        id: q.id, cat: q.cat, landform: null, diff: q.diff,
        phase: st.phase, revealed: st.revealed, cluesTotal: q.clues.length,
        clues: [], hintsShown: [], hintsTotal: q.hints.length,
        potential: st.potential, log: st.log, guesses: st.guesses.slice(),
        pos: st.pos, queueLen: st.queue.length, totals: st.totals, seed: st.seed
      };
      for (var i = 0; i < st.revealed; i++) v.clues.push({ tag: q.clues[i][0], text: q.clues[i][1] });
      for (i = 0; i < st.hints.length; i++) v.hintsShown.push(q.hints[i]);
      if (st.phase === 'revealed') {
        v.landform = q.landform;
        v.answer = {
          name: q.answer, region: q.region, country: q.country,
          lat: q.lat, lon: q.lon, alias: q.alias
        };
        v.chain = q.chain; v.fact = q.fact; v.solvable = q.solvable || '';
        v.art = q.art || null;       // 手绘明信片场景 key（js/paint.js）
        v.wiki = q.id;               // 实景照查 js/wiki-photos.js
      }
      return v;
    }
  };

  root.Engine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
