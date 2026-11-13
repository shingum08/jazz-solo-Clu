/* v0.53 피드백 수신 Worker 시험 — node:sqlite로 D1 흉내, 깃허브 API는 가짜 fetch. node tools/test_fbworker_v053.mjs */
import assert from 'node:assert';
import {DatabaseSync} from 'node:sqlite';
import worker from '../server/feedback-worker/worker.js';

/* D1 흉내: prepare().bind().run/all/first, batch */
function fakeD1(){
  const db=new DatabaseSync(':memory:');
  const mk=(sql,args=[])=>({bind:(...a)=>mk(sql,a),
    run:async()=>{db.prepare(sql).run(...args);return {success:true}},
    all:async()=>({results:db.prepare(sql).all(...args)}),
    first:async()=>db.prepare(sql).get(...args)||null});
  return {prepare:sql=>mk(sql),batch:async st=>{for(const s of st)await s.run();return []},_db:db};
}
const env={DB:fakeD1(),ADMIN_KEY:'admin-test',GH_TOKEN:'gh-test',GH_REPO:'me/clu-feedback',BATCH:'5'};
const waits=[];const ctx={waitUntil:p=>waits.push(p)};
const gh=[];const realFetch=globalThis.fetch;
globalThis.fetch=async(u,o)=>{gh.push({u,o});return new Response('{}',{status:201})};
const O='https://clu-lab-0412.pages.dev';
const rec=(bar,r,extra)=>Object.assign({id:'x'+bar,sk:'song|1|2|all|wind|30|auto|0',ts:new Date().toISOString(),v:'0.53.0',r,
  song:{id:'form-jazzblues',n:'재즈 블루스 F',my:false,cls:'블루스',keyPc:5,form:{phrase:4,sections:['A','A','B']}},
  set:{seed:1,diff:2,style:'all',inst:'wind',lyric:30,topic:'auto',feel:'swing',bpm:145,choruses:2},
  ch:0,bar,nb:12,bpb:4,chords:[{root:5,type:'7'}],tags:['가이드톤 타깃'],head:false,edited:false,notes:[[0,3,65],[3,3,67],[6,2,69,'t']],prev:64,next:65,evil:'<script>'},extra||{});
const post=(body,origin=O)=>worker.fetch(new Request('https://w.example/v1/feedback',{method:'POST',headers:{origin,'content-type':'text/plain','cf-connecting-ip':'1.2.3.4'},body:typeof body==='string'?body:JSON.stringify(body)}),env,ctx);

/* 1) 허용 안 된 주소 → 403 */
assert.strictEqual((await post({cid:'abcdefgh-1',records:[rec(0,1)]},'https://evil.example')).status,403);
/* 2) 미리보기 하위 주소는 허용 + 정리(모르는 칸 제거) */
let res=await post({cid:'abcdefgh-1',records:[rec(0,1),rec(1,-1),rec(2,7)]},'https://abc123.clu-lab-0412.pages.dev');
assert.strictEqual(res.status,200);assert.strictEqual(res.headers.get('access-control-allow-origin'),'https://abc123.clu-lab-0412.pages.dev');
assert.strictEqual((await res.json()).saved,2,'r=7은 버림');
const row=env.DB._db.prepare('SELECT * FROM fb WHERE bar=0').get();
assert.ok(!JSON.parse(row.body).evil,'모르는 칸 제거');assert.ok(!/1\.2\.3\.4/.test(JSON.stringify(row)),'IP 원문 저장 안 함');
/* 3) 같은 기기·솔로·마디 다시 평가 → 덮어씀 */
await post({cid:'abcdefgh-1',records:[rec(1,1)]});
assert.strictEqual(env.DB._db.prepare('SELECT COUNT(*) n FROM fb').get().n,2);
assert.strictEqual(env.DB._db.prepare('SELECT r FROM fb WHERE bar=1').get().r,1);
/* 4) 잘못된 cid · 깨진 JSON */
assert.strictEqual((await post({cid:'x',records:[rec(3,1)]})).status,400);
assert.strictEqual((await post('{nope')).status,400);
/* 5) 헤드 마디는 음을 받아도 버림 */
await post({cid:'abcdefgh-2',records:[rec(4,1,{head:true})]});
assert.strictEqual(JSON.parse(env.DB._db.prepare("SELECT body FROM fb WHERE cid='abcdefgh-2'").get().body).notes,null);
/* 6) BATCH(5) 미만이면 깃허브로 안 올림, 5개 넘으면 올림 + synced 표시 */
await Promise.all(waits.splice(0));assert.strictEqual(gh.length,0);
await post({cid:'abcdefgh-3',records:[rec(5,1),rec(6,-1)]});await Promise.all(waits.splice(0));
assert.strictEqual(gh.length,1,'5개 → 동기화');
assert.ok(/repos\/me\/clu-feedback\/contents\/batches\//.test(gh[0].u));
const put=JSON.parse(gh[0].o.body),file=JSON.parse(Buffer.from(put.content,'base64').toString('utf8'));
assert.strictEqual(file.kind,'bar-feedback');assert.strictEqual(file.count,5);
assert.strictEqual(env.DB._db.prepare('SELECT COUNT(*) n FROM fb WHERE synced=0').get().n,0);
/* 7) 관리자 내보내기 · 키 없으면 401 · health */
assert.strictEqual((await worker.fetch(new Request('https://w.example/v1/export'),env,ctx)).status,401);
assert.strictEqual((await (await worker.fetch(new Request('https://w.example/v1/export?key=nope'),env,ctx)).json()).error.slice(0,9),'key-wrong');
assert.strictEqual((await worker.fetch(new Request('https://w.example/v1/export?key=%3Cadmin-test%3E%20'),env,ctx)).status,200,'< > 공백 허용');
const ex=await (await worker.fetch(new Request('https://w.example/v1/export?key=admin-test'),env,ctx)).json();
assert.strictEqual(ex.count,5);
const h=await (await worker.fetch(new Request('https://w.example/v1/health'),env,ctx)).json();
assert.deepStrictEqual([h.total,h.unsynced],[5,0]);
/* 8) 속도 제한 */
const many=Array.from({length:60},(_,i)=>rec(100+i,1));let last;
for(let k=0;k<8;k++)last=await post({cid:'abcdefgh-4',records:many.map(r=>({...r,bar:r.bar+k*60}))});
assert.strictEqual(last.status,429,'10분 400개 넘으면 429');
/* 9) 즉시 동기화(관리자) — BATCH 미만 1개도 올림 */
await Promise.all(waits.splice(0));
await post({cid:'abcdefgh-5',records:[rec(900,1)]},O).catch(()=>{});
env.DB._db.prepare("INSERT OR REPLACE INTO fb(id,cid,ts,rcv,v,r,song,ch,bar,body,iph,synced) VALUES('m1','abcdefgh-6','t','t','v',1,'s',0,1,?, 'h',0)").run(JSON.stringify(rec(1,1)));
await Promise.all(waits.splice(0));gh.length=0;const sy=await (await worker.fetch(new Request('https://w.example/v1/sync?key=admin-test',{method:'POST'}),env,ctx)).json();
assert.ok(sy.ok&&sy.synced>0&&gh.length===1);
globalThis.fetch=realFetch;
console.log('v0.53 피드백 Worker 시험 통과');
