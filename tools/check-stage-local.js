/* 本地验证 stage 静态服务：node tools/check-stage-local.js [端口] */
'use strict';
var http = require('http');
var paths = ['/', '/js/data.js', '/wiki-imgs/Q25.jpg', '/style.css', '/js/wiki-photos.js'];
var port = Number(process.argv[2] || 3000);
function g(p) {
  return new Promise(function (r) {
    http.get('http://127.0.0.1:' + port + p, function (x) {
      var c = [];
      x.on('data', function (d) { c.push(d); });
      x.on('end', function () {
        r(p + ' -> ' + x.statusCode + (p === '/' ? ' | 含标题: ' + c.join('').includes('地貌猜地点') : ''));
      });
    }).on('error', function (e) { r(p + ' ERR ' + e.message); });
  });
}
Promise.all(paths.map(g)).then(function (a) { console.log(a.join('\n')); }).catch(console.error);
