/* ── v0.52 마디 평가(👍·👎) 모아 보기 — 앱 「📤 마디 평가 내보내기」 파일(JSON)을 받아 엔진 조정 근거를 뽑는다 ──
   사용: node tools/feedback_report.js 파일1.json [파일2.json …] [--md 결과.md]
   · 같은 기록(id)이 여러 파일에 있으면 하나로 · 같은 솔로·마디를 다시 평가했으면 마지막 것만
   · 기법 태그·릭·곡·난이도별 좋아요 비율, 마디 음 특징(코드톤·크로매틱·도약·음 수·셋잇단·쉼) 👍/👎 평균 비교
   · 평가 파일은 사용자 기기에서 나온 자료 — 저장소에 커밋하지 않는다(feedback/ 는 .gitignore). 결과 요약만 CHANGELOG에 적는다 */
'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const CT=(()=>{const src=fs.readFileSync(path.join(root,'engine/engine_core.js'),'utf8');const m=src.match(/const CHORD_TYPES = (\{[\s\S]*?\n\});/);return Function('return '+m[1])()})();
const args=process.argv.slice(2),mdAt=args.indexOf('--md'),mdOut=mdAt>=0?args[mdAt+1]:null;
const files=args.filter((a,i)=>!(a==='--md'||(mdAt>=0&&i===mdAt+1)));
if(!files.length){console.error('사용: node tools/feedback_report.js 파일.json … [--md 결과.md]');process.exit(1)}
/* 모으기 */
const byId=new Map();
for(const f of files){
  const d=JSON.parse(fs.readFileSync(f,'utf8'));
  if(d.kind!=='bar-feedback'||!Array.isArray(d.records))throw new Error(f+': 마디 평가 파일이 아님');
  d.records.forEach(r=>byId.set(r.id,r));
}
const last=new Map();[...byId.values()].sort((a,b)=>a.ts<b.ts?-1:1).forEach(r=>last.set(r.sk+'#'+r.bar,r));
const R=[...last.values()];
const mod=x=>((x%12)+12)%12;
/* 마디 음 특징 */
function feat(r){
  if(!r.notes)return null;
  const N=r.notes.filter(n=>n[2]!==null),bpb=r.bpb||4,TPB=bpb*6,nCh=Math.max(1,r.chords.length);
  if(!N.length)return {n:0,rest:1};
  const chordAt=t=>r.chords[Math.min(nCh-1,Math.floor(t/(TPB/nCh)))]||r.chords[0];
  let ct=0,sc=0,out=0,leapMax=0,leapSum=0,trip=0,strongCt=0,strongN=0;
  N.forEach((n,k)=>{
    const c=chordAt(n[0]),T=CT[c&&c.type]||CT['7'],iv=mod(n[2]-(c?c.root:0));
    if(T.iv.map(mod).includes(iv))ct++;else if(T.scale.includes(iv))sc++;else out++;
    if(n[0]%6===0){strongN++;if(T.iv.map(mod).includes(iv))strongCt++}
    if(k){const l=Math.abs(n[2]-N[k-1][2]);leapMax=Math.max(leapMax,l);leapSum+=l}
    if(n[3]==='t'||n[1]===2||n[1]===4)trip++;
  });
  const sounding=N.reduce((a,n)=>a+n[1],0);
  const ms=N.map(n=>n[2]);
  return {n:N.length,ct:ct/N.length,out:out/N.length,strongCt:strongN?strongCt/strongN:null,leapMax,leapAvg:N.length>1?leapSum/(N.length-1):0,
    trip:trip/N.length,rest:Math.max(0,1-sounding/TPB),pitch:ms.reduce((a,b)=>a+b,0)/ms.length,range:Math.max(...ms)-Math.min(...ms),
    entry:r.prev===null||r.prev===undefined?null:Math.abs(N[0][2]-r.prev)};
}
const up=R.filter(r=>r.r>0),dn=R.filter(r=>r.r<0);
const out=[];const P=s=>out.push(s);
const pct=x=>x===null||isNaN(x)?'-':(x*100).toFixed(0)+'%';
P('# Clu 마디 평가 요약');
P('');P('- 파일 '+files.length+'개 · 기록 '+byId.size+'개 → 마디 '+R.length+'개(같은 솔로·마디는 마지막 평가) · 👍 '+up.length+' · 👎 '+dn.length);
const vs=[...new Set(R.map(r=>r.v))].sort();P('- 앱 버전: '+vs.join(', '));
P('- 기간: '+(R.length?R.map(r=>r.ts).sort()[0].slice(0,10)+' ~ '+R.map(r=>r.ts).sort().pop().slice(0,10):'-'));
/* 묶어 세기 */
function table(title,keyFn,min){
  const M=new Map();R.forEach(r=>{[].concat(keyFn(r)).filter(Boolean).forEach(k=>{const o=M.get(k)||{u:0,d:0};r.r>0?o.u++:o.d++;M.set(k,o)})});
  const rows=[...M.entries()].filter(([,o])=>o.u+o.d>=(min||1)).map(([k,o])=>({k,...o,n:o.u+o.d,p:o.u/(o.u+o.d)}));
  rows.sort((a,b)=>b.n-a.n||b.p-a.p);
  P('');P('## '+title);P('');P('| 항목 | 👍 | 👎 | 좋아요 비율 |');P('|---|---:|---:|---:|');
  rows.forEach(x=>P('| '+x.k+' | '+x.u+' | '+x.d+' | '+pct(x.p)+' |'));
  if(!rows.length)P('| (자료 부족) | | | |');
}
const base=up.length/Math.max(1,R.length);
P('- 전체 좋아요 비율 '+pct(base)+' — 아래 표에서 이보다 크게 낮은 항목이 손볼 후보');
table('기법 태그별(마디에 붙은 태그)',r=>(r.tags||[]).map(t=>t.replace(/^릭: .*/,'릭')),2);
table('릭별',r=>(r.tags||[]).filter(t=>/^릭: /.test(t)),1);
table('난이도',r=>'난이도 '+r.set.diff);
table('스타일',r=>String(r.set.style));
table('반주(feel)',r=>String(r.set.feel||'-'));
table('곡',r=>r.song.n+(r.song.my?' (불러온 곡)':''),1);
/* 음 특징 비교 */
const keys=[['n','음 수'],['ct','코드톤 비율'],['strongCt','강박 코드톤'],['out','코드·스케일 밖 음'],['leapAvg','평균 음정 간격(반음)'],['leapMax','최대 도약(반음)'],['trip','셋잇단 비율'],['rest','쉼 비율'],['range','음역 폭(반음)'],['entry','앞 마디에서 들어오는 간격'],['pitch','평균 음높이(midi)']];
const avg=(arr,k)=>{const v=arr.map(feat).filter(f=>f&&f[k]!==null&&f[k]!==undefined).map(f=>f[k]);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null};
P('');P('## 마디 음 특징 — 👍 평균 vs 👎 평균');P('');P('| 특징 | 👍 | 👎 | 차이 |');P('|---|---:|---:|---:|');
const isP=k=>['ct','strongCt','out','trip','rest'].includes(k),fmt=(k,x)=>x===null?'-':isP(k)?pct(x):x.toFixed(1);
keys.forEach(([k,lab])=>{const a=avg(up,k),b=avg(dn,k);P('| '+lab+' | '+fmt(k,a)+' | '+fmt(k,b)+' | '+(a===null||b===null?'-':(isP(k)?((a-b)*100).toFixed(0)+'%p':(a-b).toFixed(1)))+' |')});
const nh=R.filter(r=>r.head).length,ne=R.filter(r=>r.edited).length;
P('');P('- 헤드 마디(음 기록 없음) '+nh+'개 · 사용자가 음을 고친 마디 '+ne+'개');
P('');P('> 표본이 작으면(항목당 10개 미만) 방향만 참고. 반영은 규칙 가중치·릭 사전 조정으로 하고, test.js 화성 지표가 떨어지지 않는지 함께 본다.');
const text=out.join('\n');
if(mdOut)fs.writeFileSync(mdOut,text+'\n');
console.log(text);
