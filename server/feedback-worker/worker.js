/* ── Clu 마디 평가 수신 Worker (v0.53) — Cloudflare Workers + D1 ─────────────────────────────────────────────
   앱(웹 테스트판)에서 👍·👎를 누르면 익명 평가가 여기로 온다 → D1 표 fb 에 저장 → (선택) 100개마다 깃허브 비공개 저장소로 묶어 올림.
   비밀 값(관리자 키·깃허브 토큰)은 Cloudflare 화면의 「변수 및 비밀」에만 넣는다. 이 파일·앱 페이지·대화에는 절대 넣지 않는다.

   바인딩·변수(Cloudflare 화면에서 설정 — server/feedback-worker/README.md)
     DB             D1 데이터베이스 바인딩(필수)
     ADMIN_KEY      비밀 — 관리자 내보내기·즉시 동기화용(필수 아님, 없으면 관리자 기능 꺼짐)
     GH_TOKEN       비밀 — 깃허브 동기화용 토큰(그 저장소 하나 · Contents 읽기/쓰기만). 없으면 동기화 꺼짐
     GH_REPO        일반 — 예) shingum08/clu-feedback
     GH_BRANCH      일반 — 기본 main
     BATCH          일반 — 몇 개 모이면 올릴지, 기본 100
     ALLOW_ORIGINS  일반 — 쉼표로 구분한 허용 주소. 기본 https://clu-lab-0412.pages.dev(그 미리보기 하위 주소 포함), https://shingum08.github.io

   경로
     POST /v1/feedback   {cid, v, records:[…]}  → {ok, saved}
     GET  /v1/health     → {ok, total, unsynced}
     GET  /v1/export?key=관리자키[&since=ISO]  → 앱 내보내기와 같은 형식 JSON
     POST /v1/sync?key=관리자키            → 개수와 상관없이 지금 깃허브로 올림
   개인정보: IP는 저장하지 않는다. 남용 막기용으로 「IP+날짜+SALT」 해시만(날마다 바뀜) 남긴다. cid = 앱이 기기마다 만든 무작위 값 ── */

const LIMITS={bodyBytes:96*1024,perRequest:60,recordBytes:6000,notes:96,tags:24,str:120,perIp10min:400};
const DEF_ORIGINS=['https://clu-lab-0412.pages.dev','https://shingum08.github.io'];

export default {
  async fetch(req,env,ctx){
    const url=new URL(req.url),origin=req.headers.get('origin')||'';
    const cors=corsHeaders(origin,env);
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    try{
      await ensureSchema(env);
      if(url.pathname==='/v1/feedback'&&req.method==='POST'){
        if(!cors['Access-Control-Allow-Origin'])return json({ok:false,error:'origin'},403,cors);
        return await postFeedback(req,env,ctx,cors);
      }
      if(url.pathname==='/v1/health'&&req.method==='GET'){
        const t=await env.DB.prepare('SELECT COUNT(*) n, SUM(CASE WHEN synced=0 THEN 1 ELSE 0 END) u FROM fb').first();
        return json({ok:true,total:t.n||0,unsynced:t.u||0},200,cors);
      }
      if(url.pathname==='/v1/export'&&req.method==='GET'){
        {const why=adminCheck(req,url,env);if(why)return json({ok:false,error:why},401,cors)}
        const since=url.searchParams.get('since')||'';
        const rs=await env.DB.prepare('SELECT body FROM fb WHERE rcv>=? ORDER BY rcv').bind(since).all();
        const recs=(rs.results||[]).map(r=>JSON.parse(r.body));
        const name='clu-마디평가-서버-'+new Date().toISOString().slice(0,16).replace(/[-:T]/g,'')+'-'+recs.length+'개.json';
        return new Response(JSON.stringify(pack(recs)),{headers:{...cors,'content-type':'application/json; charset=utf-8','content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(name)}});
      }
      if(url.pathname==='/v1/sync'&&req.method==='POST'){
        {const why=adminCheck(req,url,env);if(why)return json({ok:false,error:why},401,cors)}
        return json(await syncGitHub(env,true),200,cors);
      }
      return json({ok:false,error:'not found'},404,cors);
    }catch(e){return json({ok:false,error:String(e&&e.message||e).slice(0,200)},500,cors)}
  },
  async scheduled(ev,env,ctx){ctx.waitUntil(ensureSchema(env).then(()=>syncGitHub(env,false)))}   /* 크론 — 모인 게 BATCH 이상이면 올림 */
};

/* ── 저장 ── */
async function postFeedback(req,env,ctx,cors){
  const raw=await req.text();
  if(raw.length>LIMITS.bodyBytes)return json({ok:false,error:'too large'},413,cors);
  let d;try{d=JSON.parse(raw)}catch(e){return json({ok:false,error:'json'},400,cors)}
  const cid=cleanId(d&&d.cid);if(!cid)return json({ok:false,error:'cid'},400,cors);
  const recs=Array.isArray(d.records)?d.records.slice(0,LIMITS.perRequest):[];
  if(!recs.length)return json({ok:true,saved:0},200,cors);
  const ip=req.headers.get('cf-connecting-ip')||'',day=new Date().toISOString().slice(0,10);
  const iph=await sha256hex(ip+'|'+day+'|'+(env.SALT||'clu-fb'));
  const since=new Date(Date.now()-10*60*1000).toISOString();
  const seen=await env.DB.prepare('SELECT COUNT(*) n FROM fb WHERE iph=? AND rcv>=?').bind(iph,since).first();
  if((seen&&seen.n||0)+recs.length>LIMITS.perIp10min)return json({ok:false,error:'slow down'},429,cors);
  const now=new Date().toISOString(),st=[];let saved=0;
  for(const r0 of recs){
    const r=clean(r0);if(!r)continue;
    const body=JSON.stringify(r);if(body.length>LIMITS.recordBytes)continue;
    const key=cid+'|'+r.sk+'|'+r.bar;   /* 같은 기기·같은 솔로·같은 마디 = 마지막 평가로 덮어씀 */
    st.push(env.DB.prepare('INSERT OR REPLACE INTO fb(id,cid,ts,rcv,v,r,song,ch,bar,body,iph,synced) VALUES(?,?,?,?,?,?,?,?,?,?,?,0)')
      .bind(key,cid,r.ts,now,r.v,r.r,r.song.id,r.ch,r.bar,body,iph));
    saved++;
  }
  if(st.length)await env.DB.batch(st);
  /* 모인 게 BATCH 이상이면 응답 뒤에 깃허브로(크론을 안 켜도 돌게) */
  if(env.GH_TOKEN&&env.GH_REPO)ctx.waitUntil(syncGitHub(env,false).catch(()=>{}));
  return json({ok:true,saved},200,cors);
}
/* 받은 기록에서 정해진 칸만 남기고 길이·형식을 자른다 */
function clean(r){
  if(!r||typeof r!=='object')return null;
  const S=(x,n)=>typeof x==='string'?x.slice(0,n||LIMITS.str):'',N=(x,lo,hi)=>Number.isFinite(+x)?Math.max(lo,Math.min(hi,Math.round(+x))):null;
  const rr=+r.r;if(rr!==1&&rr!==-1)return null;
  const bar=N(r.bar,0,999),ch=N(r.ch,0,99);if(bar===null||ch===null)return null;
  const song=r.song||{},set=r.set||{};
  const notes=Array.isArray(r.notes)?r.notes.slice(0,LIMITS.notes).map(n=>Array.isArray(n)?[N(n[0],0,999),N(n[1],0,999),n[2]===null?null:N(n[2],0,127)].concat(n[3]==='t'?['t']:[]):null).filter(n=>n&&n[0]!==null&&n[1]!==null):null;
  return {id:S(r.id,64),sk:S(r.sk,300),ts:S(r.ts,40),v:S(r.v,16),r:rr,
    song:{id:S(song.id,80),n:S(song.n,120),my:!!song.my,cls:S(song.cls,20),keyPc:N(song.keyPc,0,11),form:song.form&&typeof song.form==='object'?{phrase:N(song.form.phrase,0,64),sections:Array.isArray(song.form.sections)?song.form.sections.slice(0,16).map(x=>S(x,4)):[]}:null},
    set:{seed:N(set.seed,0,1e9),diff:N(set.diff,1,5),style:S(set.style,24),inst:S(set.inst,16),lyric:N(set.lyric,0,100),topic:S(set.topic,24)||null,feel:S(set.feel,16)||null,bpm:N(set.bpm,20,400),choruses:N(set.choruses,1,64)},
    ch,bar,nb:N(r.nb,1,999),bpb:N(r.bpb,1,12),
    chords:Array.isArray(r.chords)?r.chords.slice(0,8).map(c=>({root:N(c&&c.root,0,11),type:S(c&&c.type,12)})):[],
    tags:Array.isArray(r.tags)?r.tags.slice(0,LIMITS.tags).map(t=>S(t,60)):[],
    head:!!r.head,edited:!!r.edited,notes:r.head?null:notes,
    prev:r.prev===null||r.prev===undefined?null:N(r.prev,0,127),next:r.next===null||r.next===undefined?null:N(r.next,0,127)};
}

/* ── 깃허브 동기화 — 안 올린 기록이 BATCH 이상(또는 force)이면 한 파일로 묶어 GH_REPO 의 batches/ 에 올린다 ── */
async function syncGitHub(env,force){
  if(!env.GH_TOKEN||!env.GH_REPO)return {ok:false,error:'깃허브 동기화 설정 없음(GH_TOKEN·GH_REPO)'};
  const B=Math.max(1,+env.BATCH||100);
  const c=await env.DB.prepare('SELECT COUNT(*) n FROM fb WHERE synced=0').first(),n=c&&c.n||0;
  if(!n||(!force&&n<B))return {ok:true,synced:0,waiting:n,batch:B};
  const rs=await env.DB.prepare('SELECT id,body FROM fb WHERE synced=0 ORDER BY rcv LIMIT 2000').all(),rows=rs.results||[];
  const recs=rows.map(r=>JSON.parse(r.body)),stamp=new Date().toISOString().replace(/[-:]/g,'').slice(0,13);
  const path='batches/'+stamp+'-'+recs.length+'.json';
  const res=await fetch('https://api.github.com/repos/'+env.GH_REPO+'/contents/'+path,{method:'PUT',
    headers:{'authorization':'Bearer '+env.GH_TOKEN,'accept':'application/vnd.github+json','user-agent':'clu-feedback-worker','x-github-api-version':'2022-11-28','content-type':'application/json'},
    body:JSON.stringify({message:'마디 평가 '+recs.length+'개 ('+stamp+')',content:b64utf8(JSON.stringify(pack(recs),null,1)),branch:env.GH_BRANCH||'main'})});
  if(!res.ok)return {ok:false,error:'github '+res.status+' '+(await res.text()).slice(0,160)};
  for(let i=0;i<rows.length;i+=90){const part=rows.slice(i,i+90);
    await env.DB.prepare('UPDATE fb SET synced=1 WHERE id IN ('+part.map(()=>'?').join(',')+')').bind(...part.map(r=>r.id)).run()}
  return {ok:true,synced:recs.length,path};
}

/* ── 도움 함수 ── */
let schemaOK=false;
async function ensureSchema(env){
  if(schemaOK)return;
  if(!env.DB)throw new Error('D1 바인딩 DB 없음');
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS fb(id TEXT PRIMARY KEY,cid TEXT,ts TEXT,rcv TEXT,v TEXT,r INTEGER,song TEXT,ch INTEGER,bar INTEGER,body TEXT,iph TEXT,synced INTEGER DEFAULT 0)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS fb_rcv ON fb(rcv)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS fb_sync ON fb(synced)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS fb_iph ON fb(iph,rcv)')]);
  schemaOK=true;
}
function pack(recs){return {app:'Clu',kind:'bar-feedback',format:1,source:'server',exported:new Date().toISOString(),count:recs.length,records:recs}}
function corsHeaders(origin,env){
  const list=(env.ALLOW_ORIGINS?String(env.ALLOW_ORIGINS).split(','):DEF_ORIGINS).map(s=>s.trim().replace(/\/$/,'')).filter(Boolean);
  let ok=false;
  try{const o=new URL(origin);ok=list.some(a=>{const u=new URL(a);return o.protocol===u.protocol&&(o.host===u.host||o.host.endsWith('.'+u.host))})}catch(e){}
  const h={'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'content-type','Access-Control-Max-Age':'86400','Vary':'Origin'};
  if(ok)h['Access-Control-Allow-Origin']=origin;
  return h;
}
/* 관리자 키 확인 — 앞뒤 공백·줄바꿈과 안내서 예시의 < > 괄호는 떼고 비교. 틀린 이유를 키 내용 없이 알려 준다 */
function adminCheck(req,url,env){
  const tidy=x=>String(x||'').trim().replace(/^<+|>+$/g,'').trim();
  const want=tidy(env.ADMIN_KEY);
  if(!want)return 'admin-key-not-set';
  const got=tidy(url.searchParams.get('key')||(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,''));
  if(!got)return 'key-missing';
  return got===want?'':'key-wrong (길이 '+got.length+'자를 받음)';
}
function isAdmin(req,url,env){return adminCheck(req,url,env)===''}
function cleanId(x){return typeof x==='string'&&/^[A-Za-z0-9-]{8,64}$/.test(x)?x:null}
function json(o,status,headers){return new Response(JSON.stringify(o),{status,headers:{...headers,'content-type':'application/json; charset=utf-8'}})}
async function sha256hex(s){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,32)}
function b64utf8(s){const b=new TextEncoder().encode(s);let bin='';for(let i=0;i<b.length;i+=0x8000)bin+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return btoa(bin)}
