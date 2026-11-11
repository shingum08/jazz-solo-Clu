/* v0.36 코드톤 연습 모드 검사 — 정박 코드톤 · 엇박 경과음 · 반음 해결 · 코드 전환 가이드톤 착지
   정의(연주자 피드백): 다운비트(정박)에 코드톤이 떨어져야 코드톤으로 들린다. 업비트는 사이를 잇는 음.
   정박을 맞추려고 넣는 반음 경과음은 허용하되 바로 반음으로 해결해야 한다. 코드가 바뀌면 3·7음으로 착지. */
const assert=require('assert'),{loadEngine}=require('./lib_load.js');
const E=loadEngine();const mod=x=>((x%12)+12)%12;
function check(opts,diffs,label){
  let strong=0,strongCT=0,weak=0,weakScale=0,weakChrom=0,chromBad=0,change=0,changeGuide=0,leap=0,solos=0,notes=0,sameRep=0,pairs=0,stepPairs=0,plan=0;
  const ids=Object.keys(E.SONGDB).filter((id,i)=>i%2===0&&(E.SONGDB[id].bpb||4)===4);
  for(const id of ids)for(const d of diffs)for(let k=0;k<2;k++){
    const song=E.SONGDB[id],s=E.generateSolo(id,song.key,d,7300+k*29+d,'wind',opts);solos++;plan+=s.stats.ctPlan||0;
    const harm=E.analyzeHarmony(E.barChords(song,s.keyPc),s.keyPc,4);
    const segAt=t=>{for(let i=harm.length-1;i>=0;i--)if(harm[i].t0<=t)return i;return 0};
    const ns=[];let pv=false;
    s.bars.forEach((b,bi)=>b.notes.forEach(n=>{const tie=pv;pv=!!n.tie;if(tie&&ns.length&&n.midi!==null){ns[ns.length-1].d+=n.d;return}ns.push({T:bi*24+n.t,d:n.d,m:n.midi})}));
    let lastSeg=-1,prevNote=null;
    for(let i=0;i<ns.length;i++){
      const x=ns[i];if(x.m===null){continue}
      notes++;
      const si=segAt(x.T),sg=harm[si],r=mod(x.m-sg.root),ct=sg.ct.includes(r),sc=sg.scale.includes(r);
      const isStrong=x.T%6===0||x.d>=6;
      if(isStrong){strong++;if(ct)strongCT++}else{weak++;if(sc||ct)weakScale++;else{weakChrom++;const nx=ns[i+1];if(!(nx&&nx.m!==null&&nx.T===x.T+x.d&&Math.abs(nx.m-x.m)===1))chromBad++}}
      if(si!==lastSeg&&isStrong&&x.T===sg.t0){change++;if(sg.guide.includes(r))changeGuide++}
      lastSeg=si;
      if(prevNote&&x.T===prevNote.T+prevNote.d){pairs++;const iv=Math.abs(x.m-prevNote.m);if(iv===0)sameRep++;if(iv>=1&&iv<=2)stepPairs++;if(iv>7)leap++}
      prevNote=x;
    }
  }
  const r={label,solos,notes,phrasesPlanned:plan,strongCT:+(strongCT/strong).toFixed(3),weakPassing:+(weakScale/weak).toFixed(3),weakChrom:+(weakChrom/weak).toFixed(3),chromUnresolved:chromBad,
    changeGuide:+(changeGuide/Math.max(1,change)).toFixed(3),changes:change,stepwise:+(stepPairs/pairs).toFixed(3),repeat:+(sameRep/pairs).toFixed(3),leapOver7:leap};
  console.log(JSON.stringify(r));return r;
}
const ct=check({topic:'ct'},[2,3],'코드톤 모드');
const auto=check({},[2,3],'자동');
assert(ct.phrasesPlanned>0,'코드톤 라인 계획이 동작하지 않음');
assert(ct.strongCT>=0.97,'코드톤 모드: 정박 코드톤 '+ct.strongCT);
assert(ct.changeGuide>=0.85,'코드톤 모드: 코드 전환 가이드톤 착지 '+ct.changeGuide);
assert(ct.chromUnresolved===0,'코드톤 모드: 해결되지 않은 반음 경과음 '+ct.chromUnresolved);
assert(ct.leapOver7===0,'코드톤 모드: 7반음 초과 도약 '+ct.leapOver7);
assert(ct.stepwise>=0.5,'코드톤 모드: 순차 진행이 너무 적음(아르페지오만 됨) '+ct.stepwise);
assert(ct.weakPassing<0.999||ct.weakChrom>0,'반음 경과음이 전혀 쓰이지 않음');
console.log('코드톤 모드 검사 통과');
