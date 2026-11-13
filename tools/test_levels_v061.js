/* v0.61 난이도 5단계 · 2박 셋잇단 · 셋잇단 연달아 2묶음까지 검사
   사용: node tools/test_levels_v061.js */
const assert=require('assert');const {loadEngine}=require('./lib_load');const E=loadEngine();
const ids=Object.keys(E.SONGDB).filter((id,i)=>i%2===0);
const LV=E.LEVELS||{1:{diff:1},2:{diff:2},3:{diff:2},4:{diff:3},5:{diff:3}};
const out={};let solos=0;
for(let lv=1;lv<=5;lv++){
  const st={notes:0,bars:0,trip8:0,trip2:0,maxRun:0,eighth:0,bad:0};
  for(const id of ids){const s=E.SONGDB[id];if((s.bpb||4)!==4)continue;
    for(const sd of [11,23]){
      const a=E.generateSolo(id,s.key,LV[lv].diff,sd,'wind',{style:'all',level:lv});solos++;
      if(sd===11){const b=E.generateSolo(id,s.key,LV[lv].diff,sd,'wind',{style:'all',level:lv});assert.deepStrictEqual(JSON.stringify(a.bars.map(x=>x.notes)),JSON.stringify(b.bars.map(x=>x.notes)),'같은 시드 다른 결과 '+id+' 단계 '+lv)}
      const ns=[];a.bars.forEach((bar,bi)=>{const sum=bar.notes.reduce((x,n)=>x+n.d,0);assert.strictEqual(sum,24,'마디 합 '+id+' '+bi);bar.notes.forEach(n=>ns.push(Object.assign({T:bi*24+n.t},n)))});
      st.bars+=a.bars.length;
      /* 셋잇단 묶음: 셋잇단 음 셋 = 한 묶음. 앞 묶음이 끝난 자리에서 바로 이어지면 연속 */
      let run=0,lastEnd=-1;
      for(let i=0;i<ns.length;i++){const n=ns[i];if(n.midi!==null)st.notes++;if(n.d===3&&!n.trip&&n.midi!==null)st.eighth++;
        if(!n.trip)continue;const g=ns.slice(i,i+3);
        if(g.length<3||!g.every(x=>x.trip&&x.d===g[0].d)){st.bad++;continue}
        if(g[0].d===4){st.trip2++;if(g[0].T%12!==0)st.bad++}else if(g[0].d===2){st.trip8++;if(g[0].T%6!==0)st.bad++}else st.bad++;
        run=g[0].T===lastEnd?run+1:1;lastEnd=g[2].T+g[2].d;st.maxRun=Math.max(st.maxRun,run);i+=2}
    }}
  out[lv]={label:(E.LEVELS&&E.LEVELS[lv].label)||'',음표_마디당:(st.notes/st.bars).toFixed(2),'8분%':(st.eighth/st.notes*100).toFixed(1),셋잇단8분묶음:st.trip8,'2박셋잇단':st.trip2,최대연속묶음:st.maxRun,이상:st.bad};
  assert.strictEqual(st.bad,0,'셋잇단 묶음 이상 — 단계 '+lv);
  assert.ok(st.maxRun<=2,'셋잇단이 연달아 3묶음 이상 — 단계 '+lv+' ('+st.maxRun+')');
  if(lv<=2)assert.strictEqual(st.trip8+st.trip2,0,'단계 '+lv+'에 셋잇단');
  if(lv===3)assert.ok(st.trip8===0&&st.trip2>0,'단계 3은 2박 셋잇단만');
  if(lv>=4)assert.ok(st.trip8>0&&st.trip2>0,'단계 '+lv+'에 셋잇단 없음');
}
console.table(out);
assert.ok(+out[2].음표_마디당<+out[3].음표_마디당,'단계 2가 3보다 촘촘함');
console.log('v0.61 단계·셋잇단 검사 통과 (솔로 '+solos+'개)');
