/* ── v0.30 마디 고정 — 마음에 든 마디는 그대로 두고 나머지만 새로 생성한다 ──
   locks = {마디번호(0부터): 그 마디의 음표 배열(실음·원조)}. 순수 함수라 Node에서 검사한다. */
function spliceLockedBars(solo,locks){
  const nb=solo.bars.length,TPBAR=(solo.bpb||4)*6;
  Object.keys(locks||{}).forEach(k=>{
    const b=+k,notes=locks[k];
    if(!(b>=0&&b<nb)||!Array.isArray(notes)||!notes.length)return;
    if(notes.reduce((a,n)=>a+n.d,0)!==TPBAR)return;          /* 박자가 다른 곡의 마디는 무시 */
    solo.bars[b].notes=JSON.parse(JSON.stringify(notes));
    solo.bars[b].locked=true;
    if(!solo.bars[b].tags.includes('고정 마디'))solo.bars[b].tags.push('고정 마디');
  });
  /* 이음매 정리: 붙임줄은 다음 마디 첫 음이 같은 음일 때만 남긴다 */
  for(let b=0;b<nb;b++){
    const ns=solo.bars[b].notes,last=ns[ns.length-1],nx=solo.bars[b+1];
    if(!last||!last.tie)continue;
    const seam=!nx||!!solo.bars[b].locked!==!!nx.locked;
    if(!nx||(seam&&(nx.notes[0].midi===null||nx.notes[0].midi!==last.midi)))delete last.tie;
  }
  return solo;
}
/* 고정 마디와 새 마디가 만나는 곳의 어색함: 7반음을 넘는 도약만큼 비용 */
function lockSeamCost(solo){
  let cost=0;
  const edge=(bar,first)=>{const p=bar.notes.filter(n=>n.midi!==null);return p.length?(first?p[0]:p[p.length-1]).midi:null};
  for(let b=0;b+1<solo.bars.length;b++){
    if(!!solo.bars[b].locked===!!solo.bars[b+1].locked)continue;
    const a=edge(solo.bars[b],false),c=edge(solo.bars[b+1],true);
    if(a!==null&&c!==null)cost+=Math.max(0,Math.abs(a-c)-7);
  }
  return cost;
}
