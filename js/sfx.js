/* 《地貌猜地点》音效：WebAudio 纯合成（无素材、无外链），浏览器可用。
 * SFX.play(name) / SFX.toggle() / SFX.enabled()；开关状态存 localStorage。 */
'use strict';
(function (root) {
  var KEY = 'gdz-sfx';
  var enabled = true;
  try { var v = root.localStorage ? localStorage.getItem(KEY) : null; if (v !== null) enabled = v === '1'; } catch (e) { /* file:// 隐私模式等 */ }
  var ctx = null;

  function ac() {
    if (!enabled) return null;
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* 忽略 */ } }
    return ctx;
  }
  // 单音：freq→(glide)，at 为绝对时间，dur 秒，包络快起缓落
  function tone(c, freq, at, dur, type, vol, glide) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, at);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(c.destination);
    o.start(at); o.stop(at + dur + 0.05);
  }
  // 低频噪声顿感（猜错/放弃的"闷响"）
  function thud(c, at, vol, cutoff) {
    var len = (c.sampleRate * 0.12) | 0;
    var buf = c.createBuffer(1, len, c.sampleRate);
    var ch = buf.getChannelData(0);
    for (var i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var n = c.createBufferSource(); n.buffer = buf;
    var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff || 220;
    var g = c.createGain(); g.gain.value = vol;
    n.connect(f); f.connect(g); g.connect(c.destination); n.start(at);
  }

  var bank = {
    clue:    function (c, t) { tone(c, 760, t, .07, 'sine', .05); },
    hint:    function (c, t) { tone(c, 620, t, .09, 'sine', .06); tone(c, 930, t + .07, .09, 'sine', .05); },
    miss:    function (c, t) { tone(c, 200, t, .16, 'square', .05, 150); thud(c, t, .10); },
    type:    function (c, t) { tone(c, 620, t, .10, 'triangle', .07); },
    region:  function (c, t) { tone(c, 560, t, .10, 'triangle', .07); tone(c, 700, t + .08, .10, 'triangle', .05); },
    confuse: function (c, t) { tone(c, 500, t, .12, 'sine', .07); tone(c, 430, t + .10, .14, 'sine', .06); },
    full:    function (c, t) { [523, 659, 784].forEach(function (f, i) { tone(c, f, t + i * .07, .16, 'triangle', .09); }); },
    perfect: function (c, t) { [523, 659, 784, 1046].forEach(function (f, i) { tone(c, f, t + i * .06, .18, 'triangle', .09); }); tone(c, 1568, t + .26, .30, 'sine', .06); },
    giveup:  function (c, t) { tone(c, 320, t, .20, 'sine', .08, 240); tone(c, 240, t + .18, .30, 'sine', .07, 180); thud(c, t, .05, 160); },
    fanfare: function (c, t) { [523, 659, 784, 1046, 784, 1046].forEach(function (f, i) { tone(c, f, t + i * .09, .22, 'triangle', .09); }); }
  };

  root.SFX = {
    enabled: function () { return enabled; },
    toggle: function () {
      enabled = !enabled;
      try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch (e) { /* 忽略 */ }
      if (enabled) root.SFX.play('clue');
      return enabled;
    },
    play: function (name) {
      var c = ac();
      if (!c || !bank[name]) return;
      try { bank[name](c, c.currentTime + 0.01); } catch (e) { /* 音频失败不影响游戏 */ }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
