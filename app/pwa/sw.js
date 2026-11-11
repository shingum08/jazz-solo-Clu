/* 서비스 워커(테스트용 앱 빌드 전용) — v0.41.1
   · 앱 껍데기: 「캐시 우선」 — 설치된 버전으로 바로 열리고(오프라인 포함), 새 버전은 뒤에서 받아 둔다.
   · 새 버전: 바로 바꾸지 않고 기다린다(waiting). 화면에서 「지금 업데이트」를 누르면 SKIP_WAITING → 새로고침.
   · 악기 샘플·글꼴: 캐시 우선(한 번 재생한 악기는 인터넷 없이도 소리 남).
   __VERSION__은 tools/build.py --app 이 채운다. */
const VER='__VERSION__';
const APP='clu-app-'+VER, RUNTIME='clu-runtime-v1';
const SHELL=['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(APP).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('clu-app-')&&k!==APP).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('message',e=>{
  const d=e.data||{};
  if(d.type==='SKIP_WAITING')self.skipWaiting();
  else if(d.type==='VER'&&e.ports&&e.ports[0])e.ports[0].postMessage({ver:VER});
});
const RUNTIME_HOSTS=['gleitz.github.io','fonts.googleapis.com','fonts.gstatic.com'];
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin===self.location.origin){
    if(url.pathname.endsWith('/sw.js'))return;
    e.respondWith((async()=>{
      const c=await caches.open(APP);
      let hit=await c.match(req,{ignoreSearch:true});
      if(!hit&&req.mode==='navigate')hit=await c.match('./index.html');
      if(hit)return hit;
      try{const r=await fetch(req);if(r.ok)c.put(req,r.clone());return r}
      catch(err){return (await c.match('./index.html'))||Response.error()}
    })());
    return;
  }
  if(RUNTIME_HOSTS.includes(url.hostname)){
    e.respondWith(caches.open(RUNTIME).then(c=>c.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok||r.type==='opaque')c.put(req,r.clone());return r}))));
  }
});
