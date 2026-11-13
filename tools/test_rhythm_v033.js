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
    s.bars.forEach((b,bi)=>b.notes.forEach(n=>{const tie=pv;pv=!!n.tie;if(n.midi===null)return;if(tie&&ns.length){ns[ns.length-1].d+=n.d;return}ns.push({T:bi*24+n.t,d:n.d,trip:!!n.trip});if(d===2&&n.trip&&n.d===2)trip2++   /* v0.61 2박 셋잇단(4틱)은 난이도 2(단계 3)에 허용 */}));
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
/* ── v0.34 기법 검사: 8분 라인 · 셋잇단 반복 · 반전 도약 ── */
{
  let lines=0,run8=0,trepTags=0,trepOk=0,disp=0,dispBad=0,dispFill=0,solos=0;
  const ids=Object.keys(E.SONGDB).filter((id,i)=>i%3===0&&(E.SONGDB[id].bpb||4)===4);
  for(const id of ids)for(let k=0;k<3;k++){
    const song=E.SONGDB[id],s=E.generateSolo(id,song.key,3,4100+k*13,'wind',{});solos++;
    const ns=[];let pv=false;
    s.bars.forEach((b,bi)=>{b.tags.forEach(t=>{if(t==='8분 라인')lines++});
      b.notes.forEach(n=>{const tie=pv;pv=!!n.tie;if(n.midi===null)return;if(tie&&ns.length){ns[ns.length-1].d+=n.d;return}ns.push(Object.assign({T:bi*24+n.t,bar:bi},n))})});
    let run=1;for(let i=1;i<ns.length;i++){if(ns[i].T-ns[i-1].T===3)run++;else{if(run>=8)run8++;run=1}}
    /* 셋잇단 반복: 태그가 붙은 마디에 같은 3음이 연속 두 박 */
    s.bars.forEach((b,bi)=>{if(!b.tags.includes('셋잇단 반복(6연음 느낌)'))return;trepTags++;
      const tr=ns.filter(x=>x.trip);
      for(let i=0;i+5<tr.length;i++){const a=tr.slice(i,i+3),c=tr.slice(i+3,i+6);
        if(a[0].T%6===0&&c[0].T===a[0].T+6&&(a[0].bar===bi||c[0].bar===bi)&&a.every((x,q)=>x.midi===c[q].midi)){trepOk++;break}}});
    /* 반전 도약: 위로 8~12반음, 엇박, 다음 음은 내려온다 */
    for(let i=1;i<ns.length;i++){const n=ns[i];if(!n.disp)continue;disp++;
      const up=n.midi-ns[i-1].midi;if(!(up>=8&&up<=12)||n.T%6!==3)dispBad++;
      if(ns[i+1]&&ns[i+1].midi<n.midi)dispFill++}
  }
  console.log(JSON.stringify({solos,lines,run8,trepTags,trepOk,disp,dispBad,dispFill}));
  assert(lines>=solos*0.3&&run8>=lines*0.5,'8분 라인이 거의 없음');
  assert(trepTags>0&&trepOk>=trepTags*0.9,'셋잇단 반복 태그와 실제 음형이 맞지 않음 '+trepOk+'/'+trepTags);
  assert(disp>0&&dispBad===0,'반전 도약 규칙 위반 '+dispBad+'/'+disp);
  assert(dispFill>=disp*0.6,'반전 도약 뒤 내려오는 음이 부족 '+dispFill+'/'+disp);
  console.log('v0.34 기법 검사 통과');
}
/* ── v0.35 검사: 하이라이트 장치 음형 · 크로매틱 해결 ── */
{
  const mod=x=>((x%12)+12)%12;
  const cnt={perc:[0,0],pivot:[0,0],hemiola:[0,0]};let outN=0,outBad=0,solos=0;
  const ids=Object.keys(E.SONGDB).filter((id,i)=>i%3===0&&(E.SONGDB[id].bpb||4)===4);
  for(const id of ids)for(const d of [2,3])for(let k=0;k<2;k++){
    const song=E.SONGDB[id],s=E.generateSolo(id,song.key,d,5200+k*17+d,'wind',{});solos++;
    const harm=E.analyzeHarmony(E.barChords(song,s.keyPc),s.keyPc,4);
    const segAt=t=>{for(let i=harm.length-1;i>=0;i--)if(harm[i].t0<=t)return harm[i];return harm[0]};
    const ns=[];let pv=false;
    s.bars.forEach((b,bi)=>b.notes.forEach(n=>{const tie=pv;pv=!!n.tie;if(tie&&ns.length&&n.midi!==null){ns[ns.length-1].d+=n.d;return}ns.push({T:bi*24+n.t,d:n.d,m:n.midi,bar:bi})}));
    const snd=ns.filter(x=>x.m!==null);
    /* 크로매틱: 스케일 밖 음은 바로 이어지는 음으로 반음 해결 */
    for(let i=0;i<ns.length;i++){const x=ns[i];if(x.m===null)continue;const sg=segAt(x.T),r=mod(x.m-sg.root);if(sg.ct.includes(r)||sg.scale.includes(r))continue;outN++;
      const nx=ns[i+1];const ok=nx&&nx.m!==null&&nx.T===x.T+x.d&&Math.abs(nx.m-x.m)===1;if(!ok&&!s.bars[x.bar].tags.includes('3음 시퀀스(헤미올라)')&&!s.bars[x.bar].tags.includes('블루스 스케일')&&!s.bars[x.bar].tags.some(g=>/^스케일 색/.test(g))&&!s.bars[x.bar].tags.some(g=>/^릭: 얼터드/.test(g)))outBad++}   /* v0.39 블루노트(♭3·♭5)는 일부러 스케일 밖 · v0.40 얼터드 릭(♭9·♯9·♭13)도 의도한 바깥음 */
    s.bars.forEach((b,bi)=>{
      const inBar=snd.filter(x=>x.bar===bi||x.bar===bi+1);
      if(b.tags.includes('리듬 반복(한 음)')){cnt.perc[1]++;let run=1,best=1;for(let i=1;i<inBar.length;i++){run=inBar[i].m===inBar[i-1].m?run+1:1;best=Math.max(best,run)}if(best>=4)cnt.perc[0]++}
      if(b.tags.includes('피벗 패턴')){cnt.pivot[1]++;let ok=false;for(let i=0;i+5<inBar.length;i++){const a=inBar.slice(i,i+6);if(a.every((x,q)=>q===0||x.T-a[q-1].T===3)&&a[0].m===a[3].m&&a[3].m===a[5].m&&a[1].m!==a[0].m){ok=true;break}}if(ok)cnt.pivot[0]++}
      if(b.tags.includes('3음 시퀀스(헤미올라)')){cnt.hemiola[1]++;let ok=false;for(let i=0;i+5<inBar.length;i++){const a=inBar.slice(i,i+6);if(!a.every((x,q)=>q===0||x.T-a[q-1].T===3))continue;const d1=Math.sign(a[1].m-a[0].m),mono=c=>Math.sign(a[c+1].m-a[c].m)===d1&&Math.sign(a[c+2].m-a[c+1].m)===d1;if(d1!==0&&mono(0)&&mono(3)&&Math.sign(a[3].m-a[0].m)===d1){ok=true;break}}if(ok)cnt.hemiola[0]++}
    });
  }
  console.log(JSON.stringify({solos,devices:cnt,outOfScale:outN,unresolved:outBad}));
  for(const k in cnt){assert(cnt[k][1]>0,k+' 장치가 한 번도 안 나옴');assert(cnt[k][0]>=cnt[k][1]*0.8,k+' 태그와 음형 불일치 '+cnt[k])}
  assert(outBad<=outN*0.03,'해결되지 않는 크로매틱 '+outBad+'/'+outN);
  console.log('v0.35 장치·크로매틱 검사 통과');
}
