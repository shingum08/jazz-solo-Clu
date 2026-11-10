/* 솔로 지표 추출 — eval_players / eval_motif 공용 */
function median(a){if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y),h=s.length>>1;return s.length%2?s[h]:(s[h-1]+s[h])/2}
function soloFeatures(E,solo,song){
  const TPB=solo.bpb*6;
  const harm=E.analyzeHarmony(E.barChords(song,solo.keyPc),solo.keyPc,solo.bpb);
  const segAt=t=>{for(let i=harm.length-1;i>=0;i--)if(harm[i].t0<=t)return harm[i];return harm[0]};
  const notes=[];let pvTie=false;
  solo.bars.forEach((bar,b)=>bar.notes.forEach(n=>{
    const tie=pvTie;pvTie=!!n.tie;
    notes.push({T:b*TPB+n.t,d:n.d,midi:n.midi,trip:!!n.trip,tie,phStart:!!n.phStart,phEnd:!!n.phEnd});
  }));
  const on=notes.filter(n=>n.midi!==null&&!n.tie);
  let strong=0,ct=0,chrom=0,eighth=0,trip=0,ivN=0,ivSum=0,step=0,leap5=0,rest=0,tot=0,high=0;
  for(const n of on){
    const sg=segAt(n.T),rel=((n.midi-sg.root)%12+12)%12;
    const isCt=sg.ct.includes(rel);
    if(n.T%6===0){strong++;if(isCt)ct++}
    if(!isCt&&!sg.scale.includes(rel))chrom++;
    if(n.trip)trip++;else if(n.d<=3)eighth++;
    high+=n.midi;
  }
  for(let k=1;k<on.length;k++){
    if(on[k].T!==on[k-1].T+on[k-1].d&&on[k].T-on[k-1].T>12)continue;     /* 긴 쉼 너머는 음정 통계에서 제외 */
    const a=Math.abs(on[k].midi-on[k-1].midi);ivN++;ivSum+=a;if(a<=2&&a>0)step++;if(a>=5)leap5++;
  }
  /* 프레이즈: 음표 사이 쉼(또는 phEnd)로 끊은 음 개수와, 프레이즈 사이 쉼 길이(박) */
  const phr=[],gaps=[];let cnt=0,lastEnd=null;
  for(let k=0;k<notes.length;k++){
    const n=notes[k];
    if(n.midi===null){tot+=n.d;rest+=n.d;continue}
    tot+=n.d;
    if(!n.tie){
      if(lastEnd!==null&&n.T>lastEnd+0&&cnt===0)gaps.push((n.T-lastEnd)/6);
      cnt++;
    }
    const nx=notes[k+1],endsHere=!nx||nx.midi===null||n.phEnd;
    if(endsHere&&!n.tie||(endsHere&&nx&&nx.midi===null)){if(cnt)phr.push(cnt);cnt=0;lastEnd=n.T+n.d}
  }
  return {
    n:on.length,
    ctOn:strong?ct/strong:0, chrom:chrom/Math.max(1,on.length), eighth:eighth/Math.max(1,on.length), trip:trip/Math.max(1,on.length),
    phraseMed:median(phr), gapMed:median(gaps),
    meanInt:ivN?ivSum/ivN:0, step:ivN?step/ivN:0, leap5:ivN?leap5/ivN:0, restRatio:tot?rest/tot:0, meanPitch:on.length?high/on.length:0
  };
}
module.exports={soloFeatures,median};
