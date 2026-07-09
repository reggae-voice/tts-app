/* InkNote Service Worker: アプリ本体とCDNライブラリをキャッシュしてオフライン動作させる */
var CACHE = "inknote-v2";
var CORE = ["./", "./index.html", "./inknote.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // 存在しないファイルがあっても全体が失敗しないよう個別に追加
      return Promise.all(CORE.map(function (u) { return c.add(u).catch(function () {}); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        var url = req.url;
        // 自サイトとcdnjs(PDF.js/jsPDF)は取得後にキャッシュ → 2回目以降オフラインでも動く
        if (res && res.ok &&
            (url.indexOf(self.location.origin) === 0 ||
             url.indexOf("cdnjs.cloudflare.com") !== -1 ||
             url.indexOf("www.gstatic.com/firebasejs") !== -1)) {
          var clone = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, clone); });
        }
        return res;
      }).catch(function () {
        if (req.mode === "navigate") {
          return caches.match("./inknote.html").then(function (r) {
            return r || caches.match("./index.html").then(function (r2) {
              return r2 || caches.match("./");
            });
          });
        }
      });
    })
  );
});
