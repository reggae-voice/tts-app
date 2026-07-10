/* InkNote Service Worker v3
   - HTML(アプリ本体): ネットワーク優先 → 常に最新版を取得、オフライン時のみキャッシュを使用
   - 静的アセット(CDNライブラリ等): キャッシュ優先 → 高速起動
*/
var CACHE = "inknote-v3";

self.addEventListener("install", function(e){
  self.skipWaiting();   // 新しいSWを即座に有効化
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        if (k !== CACHE) return caches.delete(k);   // 旧キャッシュを掃除
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  if (req.method !== "GET") return;

  var accept = req.headers.get("accept") || "";
  var isHTML = req.mode === "navigate" || accept.indexOf("text/html") !== -1;

  if (isHTML) {
    // ネットワーク優先: GitHubに上げた最新版が必ず反映される
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
        return res;
      }).catch(function(){
        // オフライン時のみキャッシュで起動
        return caches.match(req).then(function(r){
          return r || caches.match("index.html");
        });
      })
    );
    return;
  }

  var url = req.url;
  var cacheable = url.indexOf(self.location.origin) === 0 ||
                  url.indexOf("cdnjs.cloudflare.com") !== -1 ||
                  url.indexOf("www.gstatic.com/firebasejs") !== -1;
  if (!cacheable) return;

  e.respondWith(
    caches.match(req).then(function(hit){
      if (hit) return hit;
      return fetch(req).then(function(res){
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
