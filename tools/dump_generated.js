/* 생성 솔로를 리듬 비교용 JSON으로 덤프 — node tools/dump_generated.js out.json [seeds] */
const {loadEngine}=require('./lib_load.js');const fs=require('fs');
const E=loadEngine();
const out=process.argv[2]||'gen.json',SEEDS=+(process.argv[3]||6);
const opts=process.argv[4]?JSON.parse(process.argv[4]):{};
const ids=Object.keys(E.SONGDB).filter(id=>(E.SONGDB[id].bpb||4)===4);
const solos=[];
ids.forEach((id,si)=>{
  if(si%3)return;   /* 곡 1/3만 */
  const song=E.SONGDB[id];
  for(const d of [2,3])for(let k=0;k<SEEDS;k++){
    const s=E.generateSolo(id,song.key,d,9000+si*17+k*101+d,'wind',Object.assign({},opts));
    const notes=[];let pvTie=false;
    s.bars.forEach((b,bi)=>b.notes.forEach(n=>{const tie=pvTie;pvTie=!!n.tie;
      if(n.midi===null)return;
      if(tie&&notes.length){notes[notes.length-1].d+=n.d;return}
      notes.push({T:bi*24+n.t,d:n.d,trip:!!n.trip,ps:!!n.phStart,pe:!!n.phEnd,m:n.midi})}));
    solos.push({id,diff:d,bpm:song.bpm,nbars:s.bars.length,notes});
  }
});
fs.writeFileSync(out,JSON.stringify(solos));
console.log('solos',solos.length);
