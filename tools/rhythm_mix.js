/* 리듬 구성 지표(v0.59) — 셋잇단 비율 · 8분 연속(4음 이상 이어진 8분) 비율 · 긴 음(4분음표 넘게) 비율을
   노래↔비밥 값·코러스 위치별로 잰다. 사용: node tools/rhythm_mix.js [곡 수=60]
   틱: 8분 = 3틱, 셋잇단 8분 = 2틱, 4분 = 6틱 */
const {loadEngine}=require('./lib_load');const E=loadEngine();
const N=+(process.argv[2]||60);
const ids=Object.keys(E.SONGDB).filter(id=>(E.SONGDB[id].bpb||4)===4).slice(0,N);
function mix(opts,diff,chs){
  let n=0,trip=0,e8=0,run8=0,long=0,half=0;
  ids.forEach((id,si)=>{const s=E.SONGDB[id];
    for(const c of chs){const so=E.generateSolo(id,s.key,diff,1000+si*37+c.i*101,'wind',Object.assign({style:'all'},opts,{arc:c}));
      const ev=[];so.bars.forEach((b,bi)=>b.notes.forEach(x=>{if(x.midi!==null)ev.push({d:x.d,trip:x.trip||x.d===2,t:bi*24+x.t})}));
      let r=0;const flush=()=>{if(r>=4)run8+=r;r=0};
      ev.forEach((x,k)=>{n++;if(x.trip)trip++;if(x.d===3&&!x.trip){e8++;const pv=ev[k-1];if(pv&&pv.d===3&&!pv.trip&&pv.t+3===x.t)r++;else{flush();r=1}}else flush();if(x.d>6)long++;if(x.d>=12)half++});flush();}});
  const p=v=>(v/n*100).toFixed(1).padStart(5)+'%';
  return '음표 '+String(n).padStart(6)+' · 셋잇단 '+p(trip)+' · 8분 '+p(e8)+' · 8분 4연속+ '+p(run8)+' · 4분 초과 '+p(long)+' · 2분 이상 '+p(half);
}
const one=[{i:0,n:1}],four=[0,1,2,3].map(i=>({i,n:4}));
for(const diff of [2,3]){
  console.log('난이도',diff,'· 1코러스');
  for(const L of [0,0.05,0.1,0.2,0.3,0.5,0.7,1])console.log('  노래',String(Math.round(L*100)).padStart(3),'%',mix({lyric:L},diff,one));
  console.log('난이도',diff,'· 4코러스(노래 30%) 코러스별');
  for(const c of four)console.log('  ',c.i+1,'코러스',mix({lyric:0.3},diff,[c]));
}
