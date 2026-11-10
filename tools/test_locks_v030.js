/* v0.30 마디 고정 검사 — 고정한 마디는 그대로, 나머지는 새로, 마디 길이·붙임줄 불변식 유지 */
const assert=require('assert'),{loadEngine}=require('./lib_load.js');
const E=loadEngine();let checks=0,tieFix=0,cost0=0,costBest=0,trials=0;
const ids=Object.keys(E.SONGDB);
for(let si=0;si<ids.length;si++){
  const id=ids[si],song=E.SONGDB[id],TPB=(song.bpb||4)*6;
  for(const d of [2,3]){
    const a=E.generateSolo(id,song.key,d,1000+si,'wind',{});
    const nb=a.bars.length,pick=[...new Set([0,1,Math.floor(nb/2),nb-1,(si*7)%nb])].filter(b=>b<nb);
    const locks={};pick.forEach(b=>{locks[b]=JSON.parse(JSON.stringify(a.bars[b].notes))});
    const snap=JSON.stringify(locks);
    let best=null;
    for(let k=0;k<6;k++){
      const s=E.generateSolo(id,song.key,d,5000+si*13+k,'wind',{});
      const before=JSON.stringify(s.bars.map(b=>b.notes));
      E.spliceLockedBars(s,locks);
      assert.strictEqual(JSON.stringify(locks),snap,'잠금 원본이 바뀌면 안 됨');
      s.bars.forEach((bar,b)=>{
        let t=0;for(const n of bar.notes){assert(n.t===t,`${id} 마디 ${b} 겹침`);t+=n.d}
        assert(t===TPB,`${id} 마디 ${b} 길이 ${t}`);
        const ns=bar.notes,last=ns[ns.length-1],nx=s.bars[b+1];
        if(last.tie){assert(nx,'마지막 마디 붙임줄');
          if(!!bar.locked!==!!nx.locked)assert(nx.notes[0].midi===last.midi,`${id} 마디 ${b} 이음매 붙임줄이 다른 음으로 이어짐`)}
        if(locks[b]){
          assert(bar.locked,'locked 표시');
          const strip=x=>x.map(n=>({t:n.t,d:n.d,midi:n.midi}));
          assert(JSON.stringify(strip(bar.notes))===JSON.stringify(strip(locks[b])),`${id} 마디 ${b} 고정 내용 보존`);
        }else assert(!bar.locked);
      });
      const after=JSON.parse(before);
      s.bars.forEach((bar,b)=>{if(!locks[b]){const x=JSON.stringify(bar.notes.map(n=>[n.t,n.d,n.midi])),y=JSON.stringify(after[b].map(n=>[n.t,n.d,n.midi]));assert(x===y,'고정하지 않은 마디의 음은 그대로')}});
      const c=E.lockSeamCost(s);if(k===0)cost0+=c;if(best===null||c<best)best=c;
      checks++;
    }
    costBest+=best;trials++;
  }
}
/* 박자가 다른 마디·범위 밖 마디는 무시 */
{const s=E.generateSolo('all-of-me',E.SONGDB['all-of-me'].key,2,1,'wind',{});const b0=JSON.stringify(s.bars[0].notes);
 E.spliceLockedBars(s,{0:[{t:0,d:6,midi:60}],999:[{t:0,d:24,midi:60}]});assert(JSON.stringify(s.bars[0].notes)===b0&&!s.bars[0].locked,'잘못된 잠금 무시');checks++}
assert(costBest<=cost0,'시드 고르기가 이음매 비용을 늘리면 안 됨');
console.log(JSON.stringify({test:'locks-v030',checks,seamCostFirstSeed:cost0,seamCostBestOf6:costBest,trials}));
