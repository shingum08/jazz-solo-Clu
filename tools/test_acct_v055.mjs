/* v0.55 계정 동기화 브라우저 시험 — Supabase(GoTrue·PostgREST)를 흉내 낸 가짜 서버로 가입·로그인·기기 간 합치기·변경 반영·로그아웃 확인
   사용: python3 tools/build.py --web && node --no-warnings tools/test_acct_v055.mjs dist/web/index.html */
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let pw;try{pw=require('playwright')}catch(e){pw=require('/opt/node22/lib/node_modules/playwright')}
const {chromium}=pw;
import fs from 'node:fs';
const HTML=fs.readFileSync(process.argv[2],'utf8');
const users={},rows={};let seq=0;
const iso=()=>{const d=new Date(Date.now()+(seq++));return d.toISOString().replace('Z','')+'123+00:00'};
async function sb(route){const q=route.request(),u=new URL(q.url()),m=q.method();const body=q.postData()?JSON.parse(q.postData()):null;
  const tok=(q.headers()['authorization']||'').replace('Bearer ',''),uid=tok.startsWith('tok-')?tok.slice(4):null;
  const J=(o,st=200)=>route.fulfill({status:st,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
  if(m==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  if(u.pathname==='/auth/v1/signup'){if(users[body.email])return J({msg:'User already registered'},422);const id='u'+Object.keys(users).length;users[body.email]={id,pw:body.password};return J({access_token:'tok-'+id,refresh_token:'r',expires_in:3600,user:{id,email:body.email}})}
  if(u.pathname==='/auth/v1/token'){const x=users[body.email];if(!x||x.pw!==body.password)return J({error_description:'Invalid login credentials'},400);return J({access_token:'tok-'+x.id,refresh_token:'r',expires_in:3600,user:{id:x.id,email:body.email}})}
  if(u.pathname==='/auth/v1/logout')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*'}});
  if(u.pathname==='/rest/v1/user_store'){if(!uid)return J({message:'no auth'},401);const R=rows[uid]||(rows[uid]={});
    if(m==='GET')return J(Object.entries(R).map(([key,v])=>({key,value:v.value,updated_at:v.updated_at})));
    if(m==='POST'){const out=body.map(r=>{if(r.user_id!==uid)throw new Error('rls');R[r.key]={value:r.value,updated_at:iso()};return {user_id:uid,key:r.key,value:r.value,updated_at:R[r.key].updated_at}});return J(out,201)}}
  return J({message:'??'},404)}
const song=(id,n)=>({id,n,c:'스윙',k:0,bpm:120,m:4,f:['AABA',8],ch:'C6|Dm7 G7|C6|C6',src:'시험',added:1});
const b=await chromium.launch();const errs=[];
async function dev(name,local){const c=await b.newContext();const p=await c.newPage();p.on('pageerror',e=>errs.push(name+':'+e.message));
  await p.route(/^https?:\/\//,r=>{const u=r.request().url();if(u.includes('supabase.co'))return sb(r);if(u.startsWith('https://clu-lab-0412.pages.dev/'))return r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:HTML});return r.abort()});
  await p.goto('https://clu-lab-0412.pages.dev/');await p.evaluate(l=>{for(const k in l)localStorage.setItem(k,JSON.stringify(l[k]))},local);
  await p.goto('https://clu-lab-0412.pages.dev/?beta=1');await p.waitForTimeout(1200);await p.evaluate(()=>{$('#btnSettings').click()});await p.waitForTimeout(200);return p}
const st=p=>p.evaluate(()=>({sec:!document.getElementById('acctSec').hidden,in:!document.getElementById('acctIn').hidden,who:document.getElementById('acctWho').textContent,msg:document.getElementById('acctMsg').textContent,my:cur.mySongs.map(m=>m.n),fav:[...cur.fav],opts:[...document.getElementById('songView').options].map(o=>o.textContent).join('|')}));
const A=await dev('A',{'clu.mysongs.v1':[song('u_a','곡A')],'clu.fav.v1':['form-rhythm']});
console.log('A before',JSON.stringify(await st(A)));
await A.fill('#acctEmail','t@x.kr');await A.fill('#acctPw','12345678');await A.click('#acctSignupBtn');await A.waitForTimeout(800);
console.log('A signed',JSON.stringify(await st(A)),'server',JSON.stringify(Object.keys(rows.u0||{})));
const B=await dev('B',{'clu.mysongs.v1':[song('u_b','곡B')],'clu.fav.v1':['pd-tea-for-two']});
await B.fill('#acctEmail','t@x.kr');await B.fill('#acctPw','wrongpass');await B.click('#acctLoginBtn');await B.waitForTimeout(500);
console.log('B wrong',(await st(B)).msg);
await B.fill('#acctPw','12345678');await B.click('#acctLoginBtn');await B.waitForTimeout(900);
console.log('B merged',JSON.stringify(await st(B)),'server my',rows.u0.mysongs.value.map(x=>x.n));
await A.evaluate(()=>acctPull());await A.waitForTimeout(600);
console.log('A pulled',JSON.stringify((await st(A))));
await A.evaluate(()=>{cur.fav.add('form-minorblues');storeFav()});await A.waitForTimeout(2200);
console.log('server fav',rows.u0.fav.value, (await st(A)).msg);
await B.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await B.evaluate(()=>acctPull());await B.waitForTimeout(600);
console.log('B fav',(await st(B)).fav);
await B.click('#acctLogoutBtn');await B.waitForTimeout(300);console.log('B out',JSON.stringify(await st(B)));
console.log(errs);await b.close();
