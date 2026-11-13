/* v0.56 홈페이지 시험 — 홈(/)에서 로그인 → 로딩 화면 → 앱(/app/)이 같은 계정으로 이어받아 동기화, 메일 링크 넘기기, 예시 솔로 넘기기
   사용: python3 tools/build.py --web && node --no-warnings tools/test_landing_v056.mjs   (Supabase는 가짜 서버로 흉내) */
import {createRequire} from 'node:module';
import fs from 'node:fs';import path from 'node:path';
const require=createRequire(import.meta.url);
let pw;try{pw=require('playwright')}catch(e){pw=require('/opt/node22/lib/node_modules/playwright')}
const WEB=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..','dist','web'),ORIGIN='https://ezimprovjazz.com';
const users={'t@x.kr':{id:'u0',pw:'12345678'}},rows={};let seq=0,fail=0;
const ok=(c,m)=>{console.log((c?'  ✓ ':'  ✗ ')+m);if(!c)fail++};
async function sb(route){const q=route.request(),u=new URL(q.url()),m=q.method(),body=q.postData()?JSON.parse(q.postData()):null;
  const tok=(q.headers()['authorization']||'').replace('Bearer ',''),uid=tok.startsWith('tok-')?tok.slice(4):null;
  const J=(o,st=200)=>route.fulfill({status:st,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
  if(m==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  if(u.pathname==='/auth/v1/token'){const x=users[body.email];if(!x||x.pw!==body.password)return J({error_description:'Invalid login credentials'},400);return J({access_token:'tok-'+x.id,refresh_token:'r',expires_in:3600,user:{id:x.id,email:body.email}})}
  if(u.pathname==='/auth/v1/user')return J({id:uid,email:'t@x.kr'});
  if(u.pathname==='/rest/v1/user_store'){if(!uid)return J({message:'no auth'},401);const R=rows[uid]||(rows[uid]={});
    if(m==='GET')return J(Object.entries(R).map(([key,v])=>({key,value:v.value,updated_at:v.updated_at})));
    if(m==='POST')return J(body.map(r=>{R[r.key]={value:r.value,updated_at:new Date(Date.now()+seq++).toISOString()};return {...r,updated_at:R[r.key].updated_at}}),201)}
  return J({message:'??'},404)}
function site(route){let p=new URL(route.request().url()).pathname;if(p.endsWith('/'))p+='index.html';const f=path.join(WEB,p);
  if(!fs.existsSync(f))return route.fulfill({status:404,body:'not found'});
  const ext=path.extname(f),ct={'.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'}[ext]||'application/octet-stream';
  return route.fulfill({status:200,contentType:ct,body:fs.readFileSync(f)})}
const b=await pw.chromium.launch(),errs=[];
async function page(){const c=await b.newContext({viewport:{width:390,height:844}}),p=await c.newPage();p.on('pageerror',e=>errs.push(e.message));
  await p.route(/^https?:\/\//,r=>{const u=r.request().url();if(u.includes('supabase.co'))return sb(r);if(u.startsWith(ORIGIN))return site(r);return r.abort()});return p}
console.log('홈 → 로그인 → 앱');
let p=await page();await p.goto(ORIGIN+'/');
const n0=await p.textContent('#demoCount');await p.click('#btnDemo');ok(n0==='1 / 5'&&await p.textContent('#demoCount')==='2 / 5','예시 솔로 넘기기 (1 / 5 → 2 / 5)');
ok(await p.isHidden('#lgSignup'),'베타가 아니면 가입하기 숨김');
await p.click('.cta [data-launch]');ok(await p.evaluate(()=>document.querySelector('#loginDlg').open),'로그인 안 했으면 「프로그램 실행」이 로그인 창을 연다');
await p.fill('#lgEmail','t@x.kr');await p.fill('#lgPw','wrong');await p.click('#lgSubmit');await p.waitForTimeout(300);
ok(/맞지 않아요/.test(await p.textContent('#lgMsg')),'틀린 비밀번호 안내');
await p.fill('#lgPw','12345678');await p.click('#lgSubmit');
await p.waitForTimeout(100);ok(await p.evaluate(()=>document.getElementById('boot').classList.contains('on')),'로그인하면 로딩 화면');
await p.waitForURL(ORIGIN+'/app/');await p.waitForTimeout(2500);
const s=await p.evaluate(()=>({sess:JSON.parse(localStorage.getItem('clu.auth.v1')||'null'),boot:!!document.getElementById('boot'),brand:document.querySelector('#brandLink').getAttribute('href')}));
ok(s.sess&&s.sess.email==='t@x.kr'&&s.sess.uid==='u0','앱이 홈의 로그인을 이어받음');
ok(!s.boot,'앱 로딩 화면이 걷힘');ok(s.brand==='../','앱 제목을 누르면 홈으로');
ok(rows.u0&&Object.keys(rows.u0).length===4,'앱이 계정과 동기화(저장소 4종)');
await p.goto(ORIGIN+'/');await p.waitForTimeout(200);
ok(await p.textContent('#who')==='t@x.kr','홈 위쪽에 로그인한 이메일');
await p.click('.cta [data-launch]');await p.waitForURL(ORIGIN+'/app/');ok(true,'로그인돼 있으면 「프로그램 실행」이 바로 앱으로');
console.log('메일 링크(비밀번호 재설정)');
p=await page();await p.goto(ORIGIN+'/#access_token=tok-u0&refresh_token=r&expires_in=3600&type=recovery');
await p.waitForURL(/\/app\//);await p.waitForTimeout(1800);
ok(await p.evaluate(()=>cur._acctRecovery===true&&!/access_token/.test(location.hash)),'홈으로 온 토큰을 앱으로 넘겨 새 비밀번호 단계로');
console.log('로그인 없이 시작');
p=await page();await p.goto(ORIGIN+'/');await p.click('#top [data-launch]');await p.click('#lgGuest');await p.waitForURL(ORIGIN+'/app/');
ok(await p.evaluate(()=>!localStorage.getItem('clu.auth.v1')),'로그인 없이 앱이 열림');
ok(errs.length===0,'페이지 오류 없음 '+JSON.stringify(errs));
await b.close();console.log(fail?'실패 '+fail:'v0.56 홈페이지 시험 통과');process.exit(fail?1:0);
