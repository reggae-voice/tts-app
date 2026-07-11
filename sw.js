/* InkNote Service Worker v3
   - HTML(アプリ本体): ネットワーク優先 → 常に最新版を取得、オフライン時のみキャッシュを使用
   - 静的アセット(CDNライブラリ等): キャッシュ優先 → 高速起動
*/
var CACHE = "inknote-v4";

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

function shareDB() {
  return new Promise(function(res, rej){
    var r = indexedDB.open("inknote-share", 1);
    r.onupgradeneeded = function(){ r.result.createObjectStore("items", { autoIncrement: true }); };
    r.onsuccess = function(){ res(r.result); };
    r.onerror = function(){ rej(r.error); };
  });
}

self.addEventListener("fetch", function(e){
  var req = e.request;

  // Web Share Target: OSの共有メニューからのPOSTを受け取り、IndexedDBに保存して本体へ渡す
  if (req.method === "POST" && new URL(req.url).pathname.indexOf("share-target") !== -1) {
    e.respondWith(
      req.formData().then(function(fd){
        var files = fd.getAll("images") || [];
        var txt = [fd.get("title"), fd.get("text"), fd.get("url")]
          .filter(function(v){ return v; }).join("\n");
        return shareDB().then(function(db){
          return new Promise(function(res){
            var tx = db.transaction("items", "readwrite");
            var st = tx.objectStore("items");
            for (var i = 0; i < files.length; i++)
              if (files[i] && files[i].size) st.add({ type: "image", blob: files[i] });
            if (txt) st.add({ type: "text", text: txt });
            tx.oncomplete = res;
            tx.onerror = res;
          });
        });
      }).then(function(){
        return Response.redirect("./?share=1", 303);
      }).catch(function(){
        return Response.redirect("./", 303);
      })
    );
    return;
  }

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
