/* 문장 흐름 지표(v0.64) — 스윙 곡 × 4코러스 × 단계 3·5: 쉼(1박 이상)으로 나뉜 「문장」 평균 길이(마디)·코러스당 문장 수·
   곡 중간 2박 이상 쉼 수·마디당 음표 수. 사용: node tools/phrase_flow.js */
const {loadEngine}=require('./lib_load');const E=loadEngine();
const ids=Object.keys(E.SONGDB).filter((id,i)=>i%4===0&&(E.SONGDB[id].bpb||4)===4&&(E.SONGDB[id].c||'')!=='발라드');
for(const lv of [3,5]){const per=[0,1,2,3].map(()=>({sent:[],r2:0,n:0,notes:0,bars:0}));
  ids.forEach((id,si)=>{const s=E.SONGDB[id];for(let c=0;c<4;c++){const so=E.generateSolo(id,s.key,E.LEVELS[lv].diff,500+si*11,'wind',{style:'all',lyric:0.3,level:lv,arc:{i:c,n:4}});const P=per[c];P.n++;P.bars+=so.bars.length;
    const ev=[];so.bars.forEach((b,bi)=>b.notes.forEach(n=>{ev.push({T:bi*24+n.t,d:n.d,r:n.midi===null});if(n.midi!==null)P.notes++}));
    let r=0,start=null,lastEnd=0;
    ev.forEach(x=>{if(x.r){r+=x.d;return}if(start===null)start=x.T;if(r>=6&&lastEnd>start){P.sent.push((lastEnd-start)/24);start=x.T}if(r>=12&&lastEnd>0)P.r2++;r=0;lastEnd=x.T+x.d});
    if(start!==null)P.sent.push((lastEnd-start)/24)}});
  const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
  console.log('단계',lv,per.map((P,c)=>(c+1)+'코: 문장 '+avg(P.sent).toFixed(2)+'마디·'+(P.sent.length/P.n).toFixed(1)+'개 · 2박+쉼 '+(P.r2/P.n).toFixed(1)+' · '+(P.notes/P.bars).toFixed(2)+'음/마디').join(' | '))}
