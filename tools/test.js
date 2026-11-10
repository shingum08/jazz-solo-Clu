/* 전수 테스트 — 모든 수록 곡 × 난이도 3 × 악기 3 × 시드 2 (총 1800 솔로 이상) */
const fs=require('fs');
const code=['engine/engine_core.js','engine/style_data.js',...require('fs').readdirSync('engine').filter(f=>/^songs_part\d+\.js$/.test(f)).sort().map(f=>'engine/'+f)]
  .map(f=>fs.readFileSync(f,'utf8')).join('\n')
  +'\nmodule.exports={RAW_SONGS,generateSolo,toAbc,SONGDB,analyzeHarmony,barChords,transposeSolo};';
fs.writeFileSync('/tmp/opencode_test.js',code);
const E=require('/tmp/opencode_test.js');
let N=0,errs=[],viol={bar:0,range:0,leap:0,trip:0,overlap:0};
const m={ctStrong:0,strong:0,notes:0,guide:0,chg:0,chrom:0,rests:0,ivs:0,rep:0};
/* 등록 누락·중복 검사: RAW_SONGS의 모든 곡이 SONGDB에 있어야 한다 */
{const seen=new Set(),dup=[],miss=[];
 for(const r of E.RAW_SONGS){if(seen.has(r.id))dup.push(r.id);seen.add(r.id);if(!E.SONGDB[r.id])miss.push(r.id)}
 console.log('RAW_SONGS',E.RAW_SONGS.length,'SONGDB',Object.keys(E.SONGDB).length,'누락',miss.length,'중복',dup.length);
 if(miss.length||dup.length){console.error('곡 등록 오류 — 누락:',miss.join(','),'중복:',dup.join(','));process.exitCode=1}}
const ids=Object.keys(E.SONGDB);
for(const id of ids){
  const song=E.SONGDB[id],TPB=song.bpb*6;
  const harm=E.analyzeHarmony(E.barChords(song,song.key),song.key,song.bpb);
  const segAt=t=>{for(let i=harm.length-1;i>=0;i--)if(harm[i].t0<=t)return harm[i];return harm[0]};
  for(const diff of [1,2,3])for(const inst of ['wind','brass','free'])for(let sd=1;sd<=2;sd++){
    let solo;
    try{solo=E.generateSolo(id,song.key,diff,sd*7919+diff,inst,{style:'all'})}
    catch(e){errs.push(id+' d'+diff+' '+e.message);continue}
    N++;
    const RG={brass:[59,82],wind:[59,82],free:[52,86]}[inst];
    let pv=null,pvTie=false;
    solo.bars.forEach((bar,b)=>{
      const sum=bar.notes.reduce((a,n)=>a+n.d,0);
      if(sum!==TPB){viol.bar++;if(viol.bar<4)errs.push('마디 합 '+sum+'/'+TPB+' '+id+' b'+b)}
      let t=0;for(const n of bar.notes){if(n.t!==t)viol.overlap++;t+=n.d}
      let tc=0;for(const n of bar.notes){if(n.trip)tc++;else{if(tc%3)viol.trip++;tc=0}}if(tc%3)viol.trip++;
      bar.notes.forEach(n=>{
        const tie=pvTie;pvTie=!!n.tie;
        if(n.midi===null){m.rests++;return}
        if(tie)return;
        if(n.midi<RG[0]||n.midi>RG[1])viol.range++;
        m.notes++;
        const T=b*TPB+n.t,sg=segAt(T),rel=((n.midi-sg.root)%12+12)%12;
        const ct=sg.ct.includes(rel);
        if(n.t%6===0){m.strong++;if(ct)m.ctStrong++}
        if(!ct&&!sg.scale.includes(rel))m.chrom++;
        if(T===sg.t0&&T>0){m.chg++;if(sg.guide.includes(rel))m.guide++}
        if(pv!==null){const a=Math.abs(n.midi-pv);m.ivs++;if(a===0)m.rep++;if(inst!=='free'&&a>7&&!(n.disp&&n.midi>pv&&a<=12))viol.leap++}
        pv=n.midi;
      });
    });
    const abc=E.toAbc(solo,120,0);
  }
}
/* 12키 스윕 — 조 변환 전 구간 */
for(let kp=0;kp<12;kp++)E.generateSolo('blue-bossa',kp,2,sd3(kp),'wind',{style:'parker'});
function sd3(k){return 1234+k*17}
console.log('곡 '+ids.length+'개 · 솔로 '+N+'개 · 오류 '+errs.length);
errs.slice(0,8).forEach(e=>console.log(' !',e));
const r=(a,b)=>(100*a/Math.max(1,b)).toFixed(1)+'%';
console.log('위반',{bar:viol.bar,range:viol.range,leap:viol.leap,trip:viol.trip,overlap:viol.overlap});
console.log({강박코드톤:r(m.ctStrong,m.strong),전환가이드톤:r(m.guide,m.chg),크로매틱:r(m.chrom,m.notes),반복:r(m.rep,m.ivs)});
/* 조 변환 검증 — 같은 솔로를 이동: 코드·음표가 정확히 같은 음정만큼 이동 */
{
  const base=E.generateSolo('all-of-me',0,2,777,'wind',{style:'all'});
  let bad=0;
  for(let tr=-11;tr<=11;tr++){
    const t=E.transposeSolo(base,tr,'wind');
    base.bars.forEach((b,bi)=>{
      b.chords.forEach((c,ci)=>{if(t.bars[bi].chords[ci].root!==((c.root+tr)%12+12)%12)bad++});
      b.notes.forEach((n,ni)=>{const m=t.bars[bi].notes[ni].midi;if(n.midi!==null&&(((m-n.midi-tr)%12+12)%12)!==0)bad++});
    });
  }
  const b1=E.barChords(E.SONGDB['all-of-me'],2)[0][0];
  console.log('조 변환 검증: 오류 '+bad+' · All of Me +2 첫 코드 root='+b1.root+'(D=2) '+b1.type);
  if(bad)process.exitCode=1;
}
if(errs.length||Object.values(viol).some(n=>n>0))process.exitCode=1;
