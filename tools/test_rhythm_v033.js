/* v0.33 리듬 v2 회귀 검사 — WJD 실측 대비 핵심 리듬 성질(원본 DB 없이 CI에서 도는 임계값)
   기준값은 tools/rhythm_compare.py로 잰 WJD 실측: 프레이즈 시작 엇박 62% · 끝음 길이 중앙값 0.58박 · 프레이즈 안 짧은 쉼 15% */
const assert=require('assert'),{loadEngine}=require('./lib_load.js');
const E=loadEngine();
function measure(opts,diffs){
  const ids=Object.keys(E.SONGDB).filter((id,i)=>i%4===0&&(E.SONGDB[id].bpb||4)===4);
  let ph=0,phOff=0,inGap=0,pairs=0,qs=0,beats=0,trip2=0;const lastLen=[];
  for(const id of ids)for(const d of diffs)for(let k=0;k<3;k++){
    const song=E.SONGDB[id],s=E.generateSolo(id,song.key,d,777+k*31+d,'wind',opts);
    const ns=[];let pv=false;
    s.bars.forEach((b,bi)=>b.notes.forEach(n=>{const tie=pv;pv=!!n.tie;if(n.midi===null)return;if(tie&&ns.length){ns[ns.length-1].d+=n.d;return}ns.push({T:bi*24+n.t,d:n.d,trip:!!n.trip});if(d===2&&n.trip)trip2++}));
    beats+=s.bars.length*4;
    let cur=[ns[0]];const P=[];
    for(let i=1;i<ns.length;i++){const a=ns[i-1],b=ns[i];if(b.T-(a.T+a.d)>=6){P.push(cur);cur=[b]}else{cur.push(b);pairs++;if(b.T-(a.T+a.d)>=1)inGap++}}
    P.push(cur);
    P.slice(0,-1).forEach(p=>{if(p.length<2)return;ph++;if(p[0].T%6!==0)phOff++;lastLen.push(p[p.length-1].d/6)});
    for(let i=0;i+1<ns.length;i++){const a=ns[i],b=ns[i+1];if(a.T%6===0&&a.d===3&&b.T-a.T>=6)qs++}
  }
  lastLen.sort((a,b)=>a-b);
  return {phStartOff:phOff/ph,lastMed:lastLen[lastLen.length>>1],inGap:inGap/pairs,qsPerBeat:qs/beats,trip2};
}
const v2=measure({},[2,3]),v1=measure({rhythmV2:false},[2,3]);
console.log(JSON.stringify({v2,v1}));
assert(v2.phStartOff>=0.45,'프레이즈 시작 엇박 비율이 너무 낮음 '+v2.phStartOff);
assert(v2.lastMed<=1,'프레이즈 끝음이 너무 김 '+v2.lastMed);
assert(v2.inGap>=0.07,'프레이즈 안 짧은 쉼이 너무 적음 '+v2.inGap);
assert(v2.qsPerBeat>=0.02,'짧게 끊는 정박 8분(Qs)이 거의 없음 '+v2.qsPerBeat);
assert(v2.trip2===0,'난이도 2에 셋잇단');
assert(v2.phStartOff>v1.phStartOff+0.1&&v2.lastMed<v1.lastMed,'rhythmV2:false 스위치가 이전 모델로 돌아가지 않음');
/* 난이도 1은 v2를 쓰지 않는다(입문: 4분·2분 위주 유지) — 정박 8분 끊음(Qs)이 나오지 않아야 한다 */
{const s=E.generateSolo('all-of-me',E.SONGDB['all-of-me'].key,1,5,'wind',{});assert(s.bars.every(b=>b.notes.every(n=>n.midi===null||n.d>=6)),'난이도 1에 8분 이하 음')}
console.log('리듬 v2 검사 통과');
