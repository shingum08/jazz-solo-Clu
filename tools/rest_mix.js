/* 쉼 지표(v0.60) — 2박 이상 이어진 쉼(코러스 끝 제외)의 수, 마디 앞 2박을 통째로 쉬는 마디 비율, 8분·4분 섞인 마디 비율.
   사용: node tools/rest_mix.js [곡 수=60] [노래 비율=0.307] */
const {loadEngine}=require('./lib_load');const E=loadEngine();
const N=+(process.argv[2]||60),LY=process.argv[3]!==undefined?+process.argv[3]:0.307;
const ids=Object.keys(E.SONGDB).filter(id=>(E.SONGDB[id].bpb||4)===4).slice(0,N);
function run(diff,feel){let bars=0,head2=0,longRest=0,mixBars=0,first2=0,solos=0,beats=0,restT=0;
  ids.forEach((id,si)=>{const s=E.SONGDB[id];const so=E.generateSolo(id,s.key,diff,500+si*13,'wind',{style:'all',lyric:LY,feel});solos++;
    const ev=[];so.bars.forEach((b,bi)=>b.notes.forEach(n=>ev.push({T:bi*24+n.t,d:n.d,m:n.midi})));
    const tot=so.bars.length*24;beats+=tot;let r=0;ev.forEach((x,k)=>{if(x.m===null){r+=x.d;restT+=x.d}else{if(r>=12)longRest++;r=0}});
    so.bars.forEach((b,bi)=>{bars++;const on=b.notes.filter(n=>n.midi!==null);if(!on.some(n=>n.t<12)&&on.length&&!b.notes.some(n=>n.t===0&&n.midi===null&&false))head2++;
      if(bi===0&&!on.some(n=>n.t<12))first2++;
      const ds=new Set(on.map(n=>n.d));if(ds.has(3)&&ds.has(6))mixBars++;});});
  const p=(a,b)=>(a/b*100).toFixed(1).padStart(5)+'%';
  return '앞 2박 쉼 마디 '+p(head2,bars)+' · 첫 마디 앞 2박 쉼 '+p(first2,solos)+' · 2박+ 쉼(곡 중간) '+(longRest/solos).toFixed(2)+'회/곡 · 쉼 비율 '+p(restT,beats)+' · 8분·4분 섞인 마디 '+p(mixBars,bars)}
for(const feel of ['swing','ballad','latin'])for(const d of [2,3])console.log(feel.padEnd(6),'난이도',d,run(d,feel));
/* 여러 코러스(4) — 코러스별 */
for(const d of [2,3]){const out=[];for(let i=0;i<4;i++){let bars=0,head2=0,first2=0,lr=0;ids.forEach((id,si)=>{const s=E.SONGDB[id];const so=E.generateSolo(id,s.key,d,700+si*13+i*101,'wind',{style:'all',lyric:LY,arc:{i,n:4}});
  let r=0;so.bars.forEach(b=>b.notes.forEach(n=>{if(n.midi===null)r+=n.d;else{if(r>=12)lr++;r=0}}));
  so.bars.forEach((b,bi)=>{bars++;const on=b.notes.filter(n=>n.midi!==null);if(on.length&&!on.some(n=>n.t<12))head2++;if(bi===0&&!on.some(n=>n.t<12))first2++})});
  out.push((i+1)+'코: 앞2박쉼 '+(head2/bars*100).toFixed(1)+'% 첫마디 '+(first2/ids.length*100).toFixed(0)+'% 2박+쉼 '+(lr/ids.length).toFixed(1))}
  console.log('4코러스 난이도',d,out.join(' | '))}
