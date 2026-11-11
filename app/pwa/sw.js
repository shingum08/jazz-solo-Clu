/* 서비스 워커 — 앱 껍데기는 '네트워크 우선'(온라인이면 항상 새 버전), 악기 샘플·글꼴은 '캐시 우선'(한 번 받으면 오프라인 재생).
   __VERSION__은 tools/build.py가 빌드할 때 채운다 — 버전이 바뀌면 옛 앱 캐시를 지운다. */
const VER='__VERSION__';
const APP='clu-app-'+VER, RUNTIME='clu-runtime-v1';
const SHELL=['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(APP).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('clu-app-')&&k!==APP).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
const RUNTIME_HOSTS=['gleitz.github.io','fonts.googleapis.com','fonts.gstatic.com'];
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin===self.location.origin){
    /* 앱 껍데기: 네트워크 우선 → 실패하면 캐시 */
    e.respondWith(fetch(req).then(r=>{if(r.ok){const cp=r.clone();caches.open(APP).then(c=>c.put(req,cp))}return r})
      .catch(()=>caches.match(req).then(r=>r||(req.mode==='navigate'?caches.match('./index.html'):undefined))));
    return;
  }
  if(RUNTIME_HOSTS.includes(url.hostname)){
    /* 악기 샘플·글꼴: 캐시 우선 */
    e.respondWith(caches.open(RUNTIME).then(c=>c.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok||r.type==='opaque')c.put(req,r.clone());return r}))));
  }
});
