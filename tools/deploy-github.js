/* GitHub 部署助手：从系统凭据管理器（GCM）取已存 GitHub 登录 → 调 GitHub API
 *   node tools/deploy-github.js create  建公开仓库（已存在则跳过）
 *   node tools/deploy-github.js pages   开启 Pages（main 根目录）并轮询到站点可用
 *   node tools/deploy-github.js url     打印仓库/在线地址
 * 凭据只在进程内使用，不打印不落盘。 */
'use strict';
var https = require('https');
var { execFileSync } = require('child_process');

var REPO = 'landform-guess';
var OWNER, TOKEN;

function api(method, path, body, cb, attempt) {
  attempt = attempt || 1;
  var data = body ? JSON.stringify(body) : null;
  var req = https.request({
    hostname: 'api.github.com', path: path, method: method,
    headers: {
      'User-Agent': 'geom-guess-deploy', 'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + TOKEN,
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data || '')
    }
  }, function (res) {
    var chunks = [];
    res.on('data', function (c) { chunks.push(c); });
    res.on('end', function () {
      var text = Buffer.concat(chunks).toString('utf8');
      if (res.statusCode >= 500 && attempt <= 3) {
        return setTimeout(function () { api(method, path, body, cb, attempt + 1); }, 3000 * attempt);
      }
      cb(res.statusCode, text);
    });
  });
  req.on('error', function (e) {
    if (attempt <= 3) return setTimeout(function () { api(method, path, body, cb, attempt + 1); }, 3000 * attempt);
    cb(0, String(e));
  });
  req.end(data);
}

function fillToken() {
  var out = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8'
  });
  var user = '', pass = '';
  out.split('\n').forEach(function (l) {
    if (l.indexOf('username=') === 0) user = l.slice(9);
    if (l.indexOf('password=') === 0) pass = l.slice(9);
  });
  if (!pass) throw new Error('GCM 中没有已存的 GitHub 登录（先 git push 一次或 gh auth login）');
  OWNER = user;
  TOKEN = pass;
}

function cmdCreate() {
  api('POST', '/user/repos', {
    name: REPO, private: false, has_wiki: false,
    description: '《地貌猜地点》野外考察手账——AI 出题+裁判的全球地貌推理游戏（50 套题/11 类地貌/程序绘画/实景署名照）'
  }, function (code, text) {
    if (code === 201) console.log('[ok] 仓库已创建 https://github.com/' + OWNER + '/' + REPO);
    else if (code === 422) console.log('[skip] 仓库已存在 https://github.com/' + OWNER + '/' + REPO);
    else { console.error('[fail] ' + code + ' ' + text.slice(0, 200)); process.exitCode = 1; }
  });
}

function cmdPages() {
  api('GET', '/repos/' + OWNER + '/' + REPO + '/pages', null, function (code) {
    if (code === 200) return console.log('[skip] Pages 已开启');
    api('POST', '/repos/' + OWNER + '/' + REPO + '/pages',
      { source: { branch: 'main', path: '/' } },
      function (code2, text2) {
        if (code2 === 201 || code2 === 204) console.log('[ok] Pages 已开启，等待首次构建…');
        else { console.error('[fail] ' + code2 + ' ' + text2.slice(0, 200)); process.exitCode = 1; }
      });
  });
}

function cmdUrl() {
  var site = 'https://' + OWNER + '.github.io/' + REPO + '/';
  console.log('repo=' + 'https://github.com/' + OWNER + '/' + REPO);
  console.log('site=' + site);
}

function cmdWait() {
  var site = 'https://' + OWNER + '.github.io/' + REPO + '/';
  var tries = 0;
  (function poll() {
    tries++;
    var req = https.get(site, { headers: { 'User-Agent': 'geom-guess-deploy' } }, function (res) {
      if (res.statusCode === 200) { console.log('[ok] 在线可用 ' + site + '（第 ' + tries + ' 次探测）'); return; }
      console.log('[wait] ' + res.statusCode + '，10s 后再试…'); setTimeout(poll, 10000);
    });
    req.on('error', function () { console.log('[wait] 网络未就绪，10s 后再试…'); setTimeout(poll, 10000); });
  })();
  setTimeout(function () { console.error('[fail] 4 分钟内未就绪（Pages 构建可能较慢，稍后手动刷新即可）'); process.exitCode = 1; }, 240000);
}

fillToken();
var cmd = process.argv[2] || 'url';
if (cmd === 'create') cmdCreate();
else if (cmd === 'pages') cmdPages();
else if (cmd === 'wait') cmdWait();
else cmdUrl();
