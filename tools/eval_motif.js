/* 모티프 발전·헤드 차용 평가
   [A] 프레이즈 시작 3음 윤곽이 앞 프레이즈와 닮은 비율(재현율) — 모티프 ON/OFF 비교
   [B] 최종 악보에서 모티프가 살아남는 비율(후처리 교정 후에도 계획한 음형이 남는가)
   [C] 헤드 차용: 사용자 ABC에서 뽑은 조각이 실제 솔로에 들어가는 빈도·충실도
   종료 코드: 재현율 상승이 없거나 생존율/위반이 임계 미만이면 1 */
const {loadEngine}=require('./lib_load.js');
const E=loadEngine();
const SONGS=['autumn-leaves','all-of-me','blue-monk','oleo','giant-steps','blue-bossa','four','soul-eyes','crazy-rhythm','scrapple-from-the-apple','blues12','so-what'].filter(id=>E.SONGDB[id]);
const SEEDS=+(process.argv.find(a=>/^\d+$/.test(a))||15);
function phrasesOf(solo){
  const TPB=solo.bpb*6,flat=[];let pvTie=false;
  solo.bars.forEach((b,bi)=>b.notes.forEach(n=>{const tie=pvTie;pvTie=!!n.tie;if(n.midi!==null&&!tie)flat.push({T:bi*TPB+n.t,d:n.d,midi:n.midi,ps:!!n.phStart})}));
  const out=[];let cur=null;
  for(const n of flat){if(n.ps||!cur){cur=[];out.push(cur)}cur.push(n)}
  return out.filter(p=>p.length>=4);
}
function recurrence(solo){
  const ph=phrasesOf(solo);let n=0,hitC=0,hitR=0;
  const iv=p=>[1,2,3].map(k=>p[k].midi-p[k-1].midi);
  for(let i=1;i<ph.length;i++){
    n++;const a=iv(ph[i]);let c=false,r=false;
    for(let j=0;j<i;j++){const b=iv(ph[j]);
      const closeI=a.every((x,k)=>Math.abs(x-b[k])<=1||x===-b[k]&&false);
      if(closeI){c=true;
        const da=ph[i].slice(0,4).map(x=>x.d),db=ph[j].slice(0,4).map(x=>x.d);
        if(da.every((x,k)=>x===db[k]))r=true}}
    if(c)hitC++;if(r)hitR++;
  }
  return {n,hitC,hitR};
}
function run(label,optsFn){
  let n=0,hc=0,hr=0,solos=0,mot=0,viol=0;const surv={rep:[0,0],up:[0,0],down:[0,0],inv:[0,0]};
  for(const id of SONGS)for(const d of [2,3])for(let sd=1;sd<=SEEDS;sd++){
    const song=E.SONGDB[id];
    const solo=E.generateSolo(id,song.key,d,sd*7717+d,'wind',optsFn(id));
    solos++;const r=recurrence(solo);n+=r.n;hc+=r.hitC;hr+=r.hitR;mot+=solo.stats.motif;
    /* 생존율 */
    const TPB=solo.bpb*6,tm=new Map();solo.bars.forEach((b,bi)=>b.notes.forEach(x=>{if(x.midi!==null)tm.set(bi*TPB+x.t,x.midi)}));
    for(const m of solo.motifs||[]){
      const sgn=m.kind==='inv'?-1:1;let ok=true,t=m.t;
      for(let k=0;k<m.len;k++){const got=tm.get(t);if(got===undefined){ok=false;break}
        if(k>0&&Math.abs((got-tm.get(m.t))-sgn*m.off[k])>1)ok=false;t+=m.dur[k]}
      surv[m.kind][1]++;if(ok)surv[m.kind][0]++;
    }
  }
  return {label,solos,phrasePairs:n,contourRecur:+(hc/n).toFixed(3),contourRhythmRecur:+(hr/n).toFixed(3),motifsPerSolo:+(mot/solos).toFixed(2),surv};
}
const off0=0;const off=run('모티프 OFF',()=>({motif:false}));
const on=run('모티프 ON',()=>({}));
/* 내가 임의로 만든 8마디 가짜 헤드(실존 곡 아님) — ABC → 조각 → 솔로 */
const HEAD="X:1\nT:test\nM:4/4\nL:1/8\nK:C\nE2 G c2 B A|G2 E D2 C D|E G c e d2 B G|A2 c B4|c2 e g2 e c|d2 f a2 f d|e g b d' c'2 g e|c8|";
const parsed=E.parseHeadAbc(HEAD),frags=E.headFragments(parsed);
const head=run('헤드 차용 ON',()=>({headMotifs:frags,headRate:0.6}));
let headSolos=0,headWith=0,headTotal=0,headOk=[0,0];
for(const id of SONGS)for(const d of [2,3])for(let sd=1;sd<=SEEDS;sd++){
  const song=E.SONGDB[id];
  const solo=E.generateSolo(id,song.key,d,sd*7717+d,'wind',{headMotifs:frags,headRate:0.6});
  headSolos++;const hq=(solo.motifs||[]).filter(m=>m.from==='head');if(hq.length)headWith++;headTotal+=hq.length;
}
const fmt=r=>`${r.label.padEnd(12)} 윤곽 재현 ${(r.contourRecur*100).toFixed(1)}% · 윤곽+리듬 재현 ${(r.contourRhythmRecur*100).toFixed(1)}% · 솔로당 모티프 ${r.motifsPerSolo} (프레이즈 쌍 ${r.phrasePairs})`;
console.log(fmt(off));console.log(fmt(on));console.log(fmt(head));
const sv=Object.entries(on.surv).map(([k,[a,b]])=>`${k} ${b?(100*a/b).toFixed(0):'-'}%(${a}/${b})`).join(' · ');
console.log('생존율(최종 악보에 계획한 음형이 남은 비율, ON):',sv);
console.log(`헤드 조각 ${frags.length}개 → 헤드 차용이 한 번이라도 들어간 솔로 ${(100*headWith/headSolos).toFixed(0)}% · 솔로당 평균 ${(headTotal/headSolos).toFixed(2)}회`);
const allS=Object.values(on.surv).reduce((a,[x,y])=>[a[0]+x,a[1]+y],[0,0]);
const rate=allS[1]?allS[0]/allS[1]:0;
console.log('전체 생존율',(rate*100).toFixed(1)+'%');
const badKind=Object.entries(on.surv).filter(([k,[a,b]])=>b>=20&&a/b<0.85).map(([k])=>k);
if(!(on.contourRecur>off.contourRecur+0.02)||rate<0.85||badKind.length){console.error('임계 미달: 재현율 +2%p 이상, 전체 생존율 85% 이상, 변형별(표본 20+) 생존율 85% 이상 필요'+(badKind.length?' — 미달 변형: '+badKind.join(','):''));process.exitCode=1}
