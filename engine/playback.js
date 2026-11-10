/* ── Web Audio 재생 엔진 v0.18 (룩어헤드 스케줄러 · 코러스별 솔로) ──
   · 스윙비: WJD 실측(템포별 중앙값 120BPM 0.63 → 280BPM 0.54) + 연주자 프로필 보정
   · 아티큘레이션: 붙임줄 음은 한 소리로, 엇박 8분 살짝 강조(비밥 악센트), 라인 속 낮은 음은 고스트,
     프레이즈 끝음은 길게 + 비브라토, 레가토 겹침
   · 반주: 가이드톤 기반 루트리스 보이싱(A/B형 교대, 보이스리딩), 박마다 화성을 읽는 워킹 베이스 */
const SWING_TABLE=[[60,0.53],[100,0.60],[140,0.626],[180,0.627],[220,0.60],[260,0.577],[300,0.54]];
function swingRatio(bpm,style){
  let r=SWING_TABLE[0][1];
  for(let i=0;i<SWING_TABLE.length-1;i++){const [a,ra]=SWING_TABLE[i],[b,rb]=SWING_TABLE[i+1];
    if(bpm>=a&&bpm<=b){r=ra+(rb-ra)*(bpm-a)/(b-a);break}if(bpm>b)r=rb}
  const off=(typeof STYLE_DATA!=='undefined'&&STYLE_DATA.profiles[style])?STYLE_DATA.profiles[style].swingOff||0:0;
  return Math.max(0.52,Math.min(0.68,r+off));
}
function midiFreq(m){return 440*Math.pow(2,(m-69)/12)}
/* ── v0.21 샘플 가상악기 — midi-js-soundfonts(FluidR3_GM: CC BY 3.0 · MusyngKite: CC BY-SA 3.0, Benjamin Gleitzman)
   필요한 음만 장3도 간격으로 받아 가장 가까운 샘플을 피치 이동해 쓴다. 디코딩된 버퍼는 페이지 안에서 재사용.
   네트워크가 안 되면(오프라인·차단) 자동으로 내장 신스로 재생한다. */
const SAMPLE_BASE='https://gleitz.github.io/midi-js-soundfonts/';
const SAMPLE_SETS={
  piano:{font:'MusyngKite',inst:'acoustic_grand_piano',lo:45,hi:81},
  epiano:{font:'MusyngKite',inst:'electric_piano_1',lo:45,hi:81},
  nylon:{font:'MusyngKite',inst:'acoustic_guitar_nylon',lo:45,hi:77},
  bass:{font:'MusyngKite',inst:'acoustic_bass',lo:28,hi:60},
  ebass:{font:'MusyngKite',inst:'electric_bass_finger',lo:28,hi:60},
  tenor:{font:'MusyngKite',inst:'tenor_sax',lo:46,hi:82},
  alto:{font:'MusyngKite',inst:'alto_sax',lo:52,hi:88},
  trumpet:{font:'MusyngKite',inst:'trumpet',lo:52,hi:88},
  flute:{font:'MusyngKite',inst:'flute',lo:58,hi:96},
  vibes:{font:'MusyngKite',inst:'vibraphone',lo:52,hi:88},
  clarinet:{font:'MusyngKite',inst:'clarinet',lo:48,hi:86}
};
/* v0.30 음원 세트 비교 — cur.soundSet: 'musyng'(기본) · 'ccby'(전부 FluidR3, 출처 표시만) · 'cc0'(피아노·테너는 VCSL CC0, 나머지 FluidR3) · 'synth'(샘플 없음)
   VCSL(Versilian Community Sample Library, CC0 1.0)에서 변환한 mp3는 저장소 samples/cc0/ 에 직접 둔다(외부 서버 의존 없음). */
(function(){
  for(const k of Object.keys(SAMPLE_SETS))SAMPLE_SETS[k+'@ccby']=Object.assign({},SAMPLE_SETS[k],{font:'FluidR3_GM'});
  SAMPLE_SETS['piano@cc0']={local:'samples/cc0/piano/',notes:[36,40,44,48,52,56,60,64,68,72,76,80,84]};
  SAMPLE_SETS['tenor@cc0']={local:'samples/cc0/tenor/',notes:[44,46,48,50,52,54,56,58,60,62,64,66,68,70,72,74,76,78,80,82,84,86,88]};
})();
function soundKey(name){
  const st=(typeof cur!=='undefined'&&cur.soundSet)||'musyng';
  if(st==='cc0')return SAMPLE_SETS[name+'@cc0']?name+'@cc0':name+'@ccby';
  if(st==='ccby')return name+'@ccby';
  return name;
}
const SAMPLE_NAMES=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const SAMPLE_CACHE={};   /* key → Promise<{midi:AudioBuffer-raw ArrayBuffer}> */
const SAMPLE_BUF=new WeakMap();
function sampleNotes(set){if(set.notes)return set.notes.slice();const o=[];for(let m=set.lo;m<=set.hi;m+=4)o.push(m);return o}
function fetchSampleSet(name){
  name=soundKey(name);
  if(SAMPLE_CACHE[name])return SAMPLE_CACHE[name];
  const set=SAMPLE_SETS[name];
  SAMPLE_CACHE[name]=Promise.all(sampleNotes(set).map(m=>{
    const url=set.local?set.local+m+'.mp3':SAMPLE_BASE+set.font+'/'+set.inst+'-mp3/'+SAMPLE_NAMES[m%12]+(Math.floor(m/12)-1)+'.mp3';
    return fetch(url).then(r=>{if(!r.ok)throw new Error(r.status+' '+url);return r.arrayBuffer()}).then(b=>[m,b]);
  })).then(arr=>{const o={};arr.forEach(([m,b])=>o[m]=b);return o}).catch(e=>{delete SAMPLE_CACHE[name];throw e});
  return SAMPLE_CACHE[name];
}
function prefetchSamples(feel,tone){
  try{const sd=FEEL_SOUND[feel]||FEEL_SOUND.swing;[sd.comp,sd.bass,LEAD_SOUND[tone]].filter(Boolean).forEach(n=>fetchSampleSet(n).catch(()=>{}))}catch(e){}
}
async function decodeSet(ac,name){
  const raw=await fetchSampleSet(name);
  let per=SAMPLE_BUF.get(ac);if(!per){per={};SAMPLE_BUF.set(ac,per)}
  name=soundKey(name);
  if(per[name])return per[name];
  const out={};
  await Promise.all(Object.keys(raw).map(async m=>{out[m]=await ac.decodeAudioData(raw[m].slice(0))}));
  per[name]=out;return out;
}
/* 샘플 한 음 재생 — 가장 가까운 샘플을 playbackRate로 맞춘다 */
function playSample(ac,out,bank,when,dur,midi,vol,rel){
  let best=null;for(const k in bank){const d=Math.abs(+k-midi);if(best===null||d<Math.abs(best-midi))best=+k}
  if(best===null)return false;
  const src=ac.createBufferSource(),g=ac.createGain();
  src.buffer=bank[best];src.playbackRate.value=Math.pow(2,(midi-best)/12);
  const r=rel||0.12;
  g.gain.setValueAtTime(vol,when);
  g.gain.setValueAtTime(vol,when+Math.max(0.01,dur));
  g.gain.exponentialRampToValueAtTime(0.0008,when+Math.max(0.01,dur)+r);
  src.connect(g);g.connect(out);src.start(when);src.stop(when+dur+r+0.05);
  return true;
}
/* 반주 스타일별 음원 구성 */
const FEEL_SOUND={swing:{comp:'piano',bass:'bass'},ballad:{comp:'piano',bass:'bass'},bossa:{comp:'nylon',bass:'bass'},
  latin:{comp:'piano',bass:'bass'},shuffle:{comp:'piano',bass:'bass'},funk:{comp:'epiano',bass:'ebass'}};
const LEAD_SOUND={tenor:'tenor',alto:'alto',trumpet:'trumpet',flute:'flute',vibes:'vibes',clarinet:'clarinet'};
function feelSwing(feel,bpm,style){return (feel==='bossa'||feel==='latin'||feel==='funk')?0.5:(feel==='ballad'?Math.min(0.6,swingRatio(bpm,style)):(feel==='shuffle'?0.66:swingRatio(bpm,style)))}
function tickToBeat(t,sw){const beat=Math.floor(t/6),r=t%6;const fr={0:0,2:1/3,3:sw,4:2/3,1:1/6,5:5/6}[r];return beat+fr}
function buildAudioEvents(solo,bpm,sw){
  const spb=60/bpm,evs=[];
  const TPB=(solo.bpb||4)*6;
  const flat=[];solo.bars.forEach((bar,bi)=>bar.notes.forEach(n=>flat.push({...n,T:bi*TPB+n.t})));
  for(let i=0;i<flat.length;i++){
    const n=flat[i];
    if(n.midi===null)continue;
    if(i>0&&flat[i-1].tie&&flat[i-1].midi===n.midi)continue;
    let endT=n.T+n.d,k=i;
    while(flat[k].tie&&flat[k+1]&&flat[k+1].midi===n.midi){k++;endT=flat[k].T+flat[k].d}
    const st=tickToBeat(n.T,sw)*spb,en=tickToBeat(endT,sw)*spb;
    const nx=flat[k+1];
    const legato=nx&&nx.midi!==null&&nx.T===endT;
    let dur=(en-st)*(legato?1.02:0.86);
    const isOff=n.T%6===3&&!n.trip;
    const pv=flat[i-1]&&flat[i-1].midi!==null?flat[i-1].midi:null;
    let vel=0.82;
    if(isOff)vel=0.95;                                    /* 엇박 8분 강조 */
    if(n.t%24===0)vel=Math.max(vel,0.9);
    if(pv!==null&&n.midi<pv-2&&n.d<=3&&!isOff)vel=0.62;   /* 하행 라인의 박 위 음은 살짝 고스트 */
    if(n.phStart)vel=Math.max(vel,0.9);
    const isEnd=!!(n.phEnd||flat[k].phEnd)||(endT-n.T)>=9;
    evs.push({start:st,dur:Math.max(0.06,dur),midi:n.midi,vel,end:isEnd});
  }
  return evs;
}
/* 워킹 베이스 — 박마다 그 박의 코드를 읽는다. 1박 근음, 4박은 다음 근음으로 반음/5도 어프로치 */
function bassLine(solo,seed){
  const BPB=solo.bpb||4;
  const rng=mulberry32((seed||1)*31+7);
  const N=m=>{while(m<40)m+=12;while(m>55)m-=12;return m};
  const beats=[];
  solo.bars.forEach(bar=>{for(let k=0;k<BPB;k++){const ch=bar.chords[(k>=Math.ceil(BPB/2)&&bar.chords.length>1)?1:0];beats.push(ch)}});
  const out=[];let prev=N(beats[0].root+40);
  for(let i=0;i<beats.length;i++){
    const ch=beats[i],nx=beats[(i+1)%beats.length];
    const iv=CHORD_TYPES[ch.type].iv,sc=CHORD_TYPES[ch.type].scale;
    const chordStart=i===0||beats[i-1]!==ch;
    const nextChange=nx!==ch;
    let m;
    if(chordStart){m=nearest([N(ch.root),N(ch.root)+12].filter(x=>x<=57),prev)}
    else if(nextChange){
      const tgt=nearest([N(nx.root),N(nx.root)+12,N(nx.root)-12].filter(x=>x>=38&&x<=57),prev);
      const r=rng();
      m=r<0.55?(prev<tgt?tgt-1:tgt+1):(r<0.8?tgt+7-12*(tgt+7>55?1:0):(prev<tgt?tgt-2:tgt+2));
      if(Math.abs(m-prev)>9)m=prev<tgt?tgt-1:tgt+1;
    }else{
      const pool=[];for(let o=36;o<=57;o++){const rel=((o-ch.root)%12+12)%12;if(iv.includes(rel)||sc.includes(rel))pool.push({v:o,w:(iv.includes(rel)?2.2:1)*Math.exp(-Math.abs(o-prev)/3)*(o===prev?0.05:1)})}
      m=pickW(rng,pool);
    }
    while(m>57)m-=12;while(m<36)m+=12;
    out.push(m);prev=m;
  }
  const bars=[];for(let b=0;b<solo.bars.length;b++)bars.push(out.slice(b*BPB,b*BPB+BPB));
  return bars;
}
/* v0.21 스타일별 베이스 — [박 위치, 음(근음 기준 반음), 길이(박)] 패턴. 근음은 워킹 베이스와 같은 음역 */
function bassPattern(feel,bar,bpb,walk){
  const R=c=>{let m=c.root+36;while(m<36)m+=12;while(m>47)m-=12;return m};
  const c0=bar.chords[0],c1=bar.chords[bar.chords.length>1?1:0];
  const fifth=c=>R(c)+((CHORD_TYPES[c.type].iv.includes(6)&&!CHORD_TYPES[c.type].iv.includes(7))?6:7);
  const half=Math.ceil(bpb/2);
  if(feel==='swing'||bpb!==4&&feel!=='bossa')return walk.map((m,k)=>[k,m,0.92]);
  if(feel==='ballad')return bpb===4?[[0,R(c0),1.9],[2,c1===c0?fifth(c0):R(c1),1.9]]:[[0,R(c0),bpb-0.2]];
  if(feel==='bossa')return bpb===4?[[0,R(c0),1.4],[1.5,fifth(c0),0.45],[2,R(c1),1.4],[3.5,fifth(c1),0.45]]:[[0,R(c0),1.4],[1.5,fifth(c0),0.45],[2,R(c1),0.9]];
  if(feel==='latin')return [[0,R(c0),1.4],[1.5,fifth(c0),0.4],[2,c1===c0?R(c0)+12:R(c1),0.9],[3,fifth(c1),0.9]];
  if(feel==='shuffle')return walk.map((m,k)=>[k,m,0.62]).concat(walk.map((m,k)=>[k+0.66,m,0.3]));
  if(feel==='funk')return [[0,R(c0),0.4],[0.75,R(c0)+12,0.2],[1.5,R(c0),0.3],[2,c1===c0?fifth(c0):R(c1),0.4],[2.75,R(c1),0.2],[3.5,fifth(c1),0.4]];
  return walk.map((m,k)=>[k,m,0.92]);
}
/* v0.21 스타일별 컴핑 리듬 — 박 위치 배열(스윙은 기존 확률 패턴 사용) */
function compPattern(feel,bpb,rng,sw){
  if(feel==='ballad')return bpb===4?(rng()<0.5?[[0,1.9],[2,1.9]]:[[0,3.8]]):[[0,bpb-0.2]];
  if(feel==='bossa')return bpb===4?(rng()<0.5?[[0,0.4],[1.5,0.4],[3,0.4]]:[[0.5,0.4],[1.5,0.4],[2.5,0.4],[3.5,0.4]]):[[0,0.4],[1.5,0.4]];
  if(feel==='latin')return [[0,0.4],[0.5,0.3],[1.5,0.4],[2.5,0.4],[3,0.3],[3.5,0.3]];
  if(feel==='shuffle')return [[0,0.3],[1,0.3],[2,0.3],[3,0.3]].map(([b,l])=>[b+0.66,l]);
  if(feel==='funk')return [[0,0.2],[0.75,0.2],[1.5,0.2],[2.5,0.2],[3.25,0.2]];
  return null;
}
/* 루트리스 보이싱 — 3·7 + 9·13(또는 5) / A형(3-5-7-9) · B형(7-9-3-5) 중 가까운 쪽 */
function voicingFor(ch,prevV){
  const t=ch.type,r=ch.root,cls=TYPE_CLS[t];
  const sets={maj:[[4,7,11,14],[11,14,16,19]],min:[[3,7,10,14],[10,14,15,19]],dom:[[4,9,10,14],[10,14,16,21]],
    domalt:[[4,8,10,13],[10,13,16,20]],hdim:[[3,6,10,12],[10,12,15,18]],dim:[[3,6,9,12],[9,12,15,18]]};
  if(t==='6')sets.maj=[[4,7,9,14],[9,14,16,19]];
  if(t==='m6')sets.min=[[3,7,9,14],[9,14,15,19]];
  let best=null;
  for(const form of sets[cls]||sets.maj){
    for(let base=48;base<=62;base++){
      if(((base-r)%12+12)%12!==0)continue;
      const v=form.map(x=>base+x);
      if(v[0]<52||v[3]>74)continue;
      const cost=prevV?v.reduce((a,x,k)=>a+Math.abs(x-prevV[k]),0):Math.abs(v[0]-58);
      if(!best||cost<best.cost)best={v,cost};
    }
  }
  return best?best.v:[r+52,r+56,r+59,r+62];
}
/* v0.21 재생 진입: 샘플 음원이면 먼저 받아서 디코딩(최대 8초) 후 시작 — 첫 마디부터 같은 음색 */
async function playAllInnerAsync(){
  const feel=(typeof currentFeel==='function')?currentFeel():'swing';
  const snd=FEEL_SOUND[feel]||FEEL_SOUND.swing;
  const useSamples=typeof fetch==='function'&&cur.soundSet!=='synth';   /* v0.22: 항상 실제 악기 샘플(실패 시에만 신스 대체) */
  const ac=new (window.AudioContext||window.webkitAudioContext)();
  if(ac.resume)ac.resume();
  const banks={};
  if(useSamples){
    const want=[snd.comp,snd.bass];const lead=LEAD_SOUND[cur.tone];if(lead)want.push(lead);
    const tok=cur._playTok=(cur._playTok||0)+1;
    if(typeof onSampleStatus==='function')onSampleStatus('loading');
    const timeout=new Promise(r=>setTimeout(()=>r('timeout'),8000));
    const res=await Promise.race([Promise.allSettled(want.map(n=>decodeSet(ac,n).then(b=>{banks[n]=b}))),timeout]);
    if(cur._playTok!==tok){try{ac.close()}catch(e){}return}   /* 로드 중 정지·재시작 */
    const missing=want.filter(n=>!banks[n]);
    if(typeof onSampleStatus==='function')onSampleStatus(missing.length?'fail':'ok',missing);
    if(missing.length)console.warn('샘플 로드 실패 — 신스로 재생:',missing.join(','),res==='timeout'?'(시간 초과)':'');
  }
  playAllInner(ac,banks,feel);
}
function playAllInner(acIn,banksIn,feelIn){
  /* v0.18 — 룩어헤드 스케줄러: 모든 음을 한 번에 만들지 않고 1초 앞까지만 예약(브라우저 부하·무음 방지)
     코러스마다 서로 다른 솔로(cur.solos[c])를 이어서 재생 */
  stopAll();
  const sols=(cur.solos&&cur.solos.length)?cur.solos:[cur.solo];
  const bpm=+$('#bpm').value;
  const bpb=sols[0].bpb||4;
  const feel=feelIn||((typeof currentFeel==='function')?currentFeel():'swing');
  const sw=feelSwing(feel,bpm,cur.style);
  const ac=acIn||new (window.AudioContext||window.webkitAudioContext)();
  const snd=FEEL_SOUND[feel]||FEEL_SOUND.swing;
  const banks=banksIn||{};   /* 디코딩 끝난 악기만 — 없으면 신스로 재생 */
  const useSamples=false;
  cur.audioFeel=feel;cur.audioBanks=Object.keys(banks);
  if(ac.resume)ac.resume();  /* 자동재생 정책: suspended 해제 */
  /* v0.21 출력 단: 헤드룸(0.5) → 컴프레서(빠른 어택·높은 비율, 리미터 역할) → 출력. 포화 왜곡 없이 0dBFS 아래 유지 */
  const master=ac.createGain();master.gain.value=1.0;
  const comp=ac.createDynamicsCompressor();
  try{comp.threshold.value=-8;comp.knee.value=4;comp.ratio.value=20;comp.attack.value=0.002;comp.release.value=0.15}catch(e){}
  const post=ac.createGain();post.gain.value=Object.keys(banks).length?4.0:1.6;   /* v0.25: 여전히 작다는 피드백 → 샘플 4배·신스 1.6배. 리미터가 클리핑 방지 */
  const lim=ac.createDynamicsCompressor();try{lim.threshold.value=-1;lim.knee.value=0;lim.ratio.value=20;lim.attack.value=0.002;lim.release.value=0.1}catch(e){}
  master.connect(comp);comp.connect(post);post.connect(lim);lim.connect(ac.destination);
  /* v0.29 믹스: 솔로 버스(lead)와 반주 버스(rb)를 나누고, 솔로를 앞으로. 공간감은 생성한 임펄스 응답 리버브로(외부 파일 없음) */
  const lead=ac.createGain();
  const lvRaw=$('#leadvol')?+$('#leadvol').value:100;
  lead.gain.value=Math.max(0,(Number.isFinite(lvRaw)?lvRaw:100)/100)*LEAD_GAIN;
  lead.connect(master);
  let wet=null;
  try{
    const cv=ac.createConvolver();cv.buffer=roomIR(ac,1.5,2.6);
    wet=ac.createGain();wet.gain.value=1;cv.connect(wet);wet.connect(master);
    const ls=ac.createGain();ls.gain.value=0.2;lead.connect(ls);ls.connect(cv);
    ac._revIn=cv;
  }catch(e){}
  const rb=ac.createGain();
  const bvRaw=+$('#backvol').value;const bv=Number.isFinite(bvRaw)?bvRaw:90;   /* 0%도 0%로 — ||90 함정 제거 */
  rb.gain.value=Math.max(0,bv/100)*BACK_GAIN*(Object.keys(banks).length?1.15:1);
  if(ac._revIn){try{const bs=ac.createGain();bs.gain.value=0.1;rb.connect(bs);bs.connect(ac._revIn)}catch(e){}}
  master.gain.value*=feel==='ballad'?1.3:1;   /* 발라드는 성긴 편성이라 전체 레벨 보정 */
  rb.connect(master);
  const spb=60/bpm,t0=ac.currentTime+(useSamples?0.6:0.15),start=t0+4*spb;  /* 샘플은 카운트인 동안 로드 */
  const nb=sols[0].bars.length,barLen=bpb*spb,chLen=nb*barLen,nCh=sols.length;
  cur.audio={ac,master,rb,lead,raf:null,timer:null,start,chLen,barLen,nCh,nb,endAt:start+nCh*chLen};
  const jobs=[];
  const clickG=ac.createGain();clickG.gain.value=0.08;clickG.connect(post);   /* v0.25: 카운트인 클릭은 음악과 별도 게인 — 음악에 맞춰 볼륨을 올려도 클릭이 덜 커진다 */
  for(let i=0;i<4;i++){const tt=t0+i*spb;jobs.push({t:tt,f:()=>click(ac,clickG,tt,i===0?1400:1000,i===0?0.5:0.3)})}
  const rng=mulberry32((cur.seed||1)*13+5);
  /* 컴핑: 찰스턴·푸시(4&→1)·2&·4박 등 싱커페이션 — 마디마다 확률적으로 고른다 */
  const COMP=bpb===3?[[0,1+sw],[0+sw,2],[1,2+sw],[0,1]]:(bpb===5?[[0,2+sw],[1+sw,3],[0,3+sw],[2,4],[1,4]]:[[0,1+sw],[0+sw,2+sw],[1+sw,3],[0,2+sw],[1,3+sw],[sw,3]]);
  let prevV=null;
  sols.forEach((so,cr)=>{
    const bl=bassLine(so,(cur.seed||1)+cr*7919);
    so.bars.forEach((bar,bi)=>{
      const barStart=start+cr*chLen+bi*barLen;
      jobs.push({t:barStart-0.05,f:()=>{
        const compB=banks[snd.comp],bassB=banks[snd.bass];
        const PH=(when,len,v,vol)=>{if(compB){v.forEach((m,k)=>playSample(ac,rb,compB,when+k*0.008,len,m,vol*1.25,feel==='ballad'?0.5:0.15))}else pianoHit(ac,rb,when,len,v,vol)};
        const BS=(when,len,m,vel)=>{if(bassB)playSample(ac,rb,bassB,when,len,m,0.75*vel,0.08);else bass(ac,rb,when,len,m,vel)};
        if(feel!=='swing'){
          const cp=compPattern(feel,bpb,rng,sw);
          if(cp)cp.forEach(([bt,l])=>{const ch=bar.chords[(bt>=bpb/2&&bar.chords.length>1)?1:0];const v=voicingFor(ch,prevV);prevV=v;
            const bAbs=Math.floor(bt),fr=bt-bAbs;const off=fr===0?0:(Math.abs(fr-0.5)<0.01?sw:fr);
            PH(barStart+(bAbs+off)*spb,l*spb,v,feel==='ballad'?0.1:0.11)});
          bassPattern(feel,bar,bpb,bl[bi]).forEach(([bt,m,l],k)=>{const bAbs=Math.floor(bt),fr=bt-bAbs;const off=fr===0?0:(Math.abs(fr-0.5)<0.01?sw:fr);BS(barStart+(bAbs+off)*spb,l*spb,m,k===0?1:0.85)});
          drumsFor(feel,ac,rb,barStart,spb,bpb,sw,rng);
          return;
        }
        const pat=COMP[Math.floor(rng()*COMP.length)];
        pat.forEach(bt=>{
          const beatAbs=bt%bpb;
          const ch=bar.chords[(beatAbs>=bpb/2&&bar.chords.length>1)?1:0];
          const v=voicingFor(ch,prevV);prevV=v;
          const len=(bt%1===0?0.9:0.55)*spb;
          PH(barStart+tickToBeat(Math.round(beatAbs*6),sw)*spb,len,v,0.12);
        });
        if(bar.chords.length>1&&!pat.some(bt=>bt>=bpb/2)){const v=voicingFor(bar.chords[1],prevV);prevV=v;PH(barStart+tickToBeat(Math.ceil(bpb/2)*6,sw)*spb,0.8*spb,v,0.11)}
        bl[bi].forEach((m,k)=>BS(barStart+k*spb,0.92*spb,m,k===0?1:(k%2?0.8:0.9)));
        if(bpb===4){
          kick(ac,rb,barStart,0.25);
          snare(ac,rb,barStart+1*spb,0.12);snare(ac,rb,barStart+3*spb,0.12);
          if(rng()<0.25)snare(ac,rb,barStart+(2+sw)*spb,0.05);
          [0,1,1+sw,2,3,3+sw].forEach(bt=>ridePing(ac,rb,barStart+bt*spb,bt%1?0.045:(bt%2?0.08:0.065)));
          hat(ac,rb,barStart+1*spb,0.08);hat(ac,rb,barStart+3*spb,0.08);
        }else{  /* 왈츠·5/4 — 1박 킥, 나머지 박 가벼운 스네어, 박마다 라이드 */
          kick(ac,rb,barStart,0.25);
          for(let k=1;k<bpb;k++)snare(ac,rb,barStart+k*spb,0.10);
          for(let k=0;k<bpb;k++){ridePing(ac,rb,barStart+k*spb,k%2?0.05:0.07);if(bpb===5||k%2===0)ridePing(ac,rb,barStart+(k+sw)*spb,0.04)}
          for(let k=1;k<bpb;k++)hat(ac,rb,barStart+k*spb,0.07);
        }
      }});
    });
    if(cur.playSolo!==false)buildAudioEvents(so,bpm,sw).forEach(e=>{
      const tt=start+cr*chLen+e.start;
      jobs.push({t:tt-0.02,f:()=>{const lb=banks[LEAD_SOUND[cur.tone]];if(lb)leadSample(ac,lead,lb,tt,e.dur,e.midi,e.vel,e.end);else mel(ac,lead,tt,e.dur,e.midi,LEAD_SOUND[cur.tone]?'flugel':(cur.tone||'flugel'),e.vel,e.end)}});
    });
  });
  jobs.sort((x,y)=>x.t-y.t);
  let ji=0;
  const LA=(typeof window!=='undefined'&&window.__PB_LOOKAHEAD)||1.0;
  const au=cur.audio;
  const pump=()=>{
    if(cur.audio!==au)return;
    const h=ac.currentTime+LA;
    while(ji<jobs.length&&jobs[ji].t<h){try{jobs[ji].f()}catch(e){console.error('스케줄 오류:',e)}ji++}
  };
  pump();au.timer=setInterval(pump,50);
  const loop=()=>{
    if(cur.audio!==au)return;
    const el=ac.currentTime-start;
    if(el>=0&&el<nCh*chLen){
      const cr=Math.floor(el/chLen),off=el-cr*chLen,bi=Math.floor(off/barLen);
      if(typeof onPlayPos==='function'){try{onPlayPos(cr,bi,(off-bi*barLen)/barLen)}catch(e){}}  /* 화면 갱신 오류가 재생을 멈추지 않게 */
    }
    if(ac.currentTime>au.endAt+1.2){stopAll();$('#btnPlay').textContent='▶ 재생';return}
    au.raf=requestAnimationFrame(loop);
  };
  loop();
}
/* v0.21 스타일별 드럼 */
function drumsFor(feel,ac,out,bs,spb,bpb,sw,rng){
  const at=b=>bs+b*spb;
  if(bpb!==4){kick(ac,out,at(0),0.22);for(let k=0;k<bpb;k++)ridePing(ac,out,at(k),0.05);return}
  if(feel==='ballad'){        /* 브러시: 2·4 스네어 쓸기 + 4분 라이드 */
    kick(ac,out,at(0),0.14);[1,3].forEach(b=>snare(ac,out,at(b),0.05));
    for(let k=0;k<4;k++)hat(ac,out,at(k),0.035);
    [0,1,2,3].forEach(b=>ridePing(ac,out,at(b),0.035));return}
  if(feel==='bossa'){         /* 크로스스틱 보사 패턴 + 8분 하이햇 + 1·3 킥 */
    [0,2].forEach(b=>kick(ac,out,at(b),0.2));[1.5,3].forEach(b=>kick(ac,out,at(b),0.1));
    [0,0.75,1.5,2.5,3.25].forEach(b=>rim(ac,out,at(b),0.07));
    for(let k=0;k<8;k++)hat(ac,out,at(k/2),k%2?0.03:0.05);return}
  if(feel==='latin'){         /* 송고/툼바오 느낌: 카우벨 + 8분 하이햇 + 킥 */
    [0,1.5,2,3.5].forEach(b=>kick(ac,out,at(b),0.2));
    [1.5,3].forEach(b=>rim(ac,out,at(b),0.08));
    for(let k=0;k<8;k++)hat(ac,out,at(k/2),k%2?0.035:0.05);return}
  if(feel==='shuffle'){       /* 셔플: 셋잇단 라이드·하이햇 + 2·4 백비트 */
    [0,2].forEach(b=>kick(ac,out,at(b),0.24));[1,3].forEach(b=>snare(ac,out,at(b),0.13));
    for(let k=0;k<4;k++){ridePing(ac,out,at(k),0.06);ridePing(ac,out,at(k+0.66),0.04)}return}
  if(feel==='funk'){          /* 16분 하이햇 + 2·4 스네어 + 고스트 */
    [0,0.75,2.5].forEach(b=>kick(ac,out,at(b),0.26));[1,3].forEach(b=>snare(ac,out,at(b),0.15));
    if(rng()<0.5)snare(ac,out,at(1.75),0.04);
    for(let k=0;k<16;k++)hat(ac,out,at(k/4),k%2?0.025:0.05);return}
}
/* 리드 샘플: 프레이즈 끝 긴 음은 여운을 길게 */
function leadSample(ac,out,bank,when,dur,midi,vel,isEnd){
  if(!ac._leadLP){ac._leadLP=ac.createBiquadFilter();ac._leadLP.type='lowpass';ac._leadLP.frequency.value=6400;ac._leadLP.Q.value=0.4;ac._leadLP.connect(out)}
  playSample(ac,ac._leadLP,bank,when,dur,midi,0.3*(vel||0.85),isEnd?0.4:0.09);
}
/* v0.29 믹스 상수 — 솔로가 반주보다 앞에 나오도록(이전: 솔로 1.0 · 반주 2.6) */
const LEAD_GAIN=1.9,BACK_GAIN=2.1;
/* 작은 방 리버브용 임펄스 응답(감쇠 잡음) — 재생용 난수라 악보 재현성과 무관 */
function roomIR(ac,sec,decay){
  const n=Math.floor(ac.sampleRate*sec),b=ac.createBuffer(2,n,ac.sampleRate);
  for(let c=0;c<2;c++){const d=b.getChannelData(c);let lp=0;
    for(let i=0;i<n;i++){const x=(Math.random()*2-1)*Math.pow(1-i/n,decay);lp+=(x-lp)*0.35;d[i]=lp*(i<ac.sampleRate*0.004?i/(ac.sampleRate*0.004):1)}}
  return b;
}
function click(ac,out,when,freq,vol){
  const o=ac.createOscillator(),g=ac.createGain();
  o.frequency.value=freq;o.type='square';
  g.gain.setValueAtTime(vol,when);g.gain.exponentialRampToValueAtTime(0.001,when+0.06);
  o.connect(g);g.connect(out);o.start(when);o.stop(when+0.08);
}
function pianoHit(ac,out,when,dur,midis,vol){
  midis.forEach((m,k)=>{
    const o=ac.createOscillator(),o2=ac.createOscillator(),g=ac.createGain(),f=ac.createBiquadFilter();
    o.type='triangle';o.frequency.value=midiFreq(m);
    o2.type='sine';o2.frequency.value=midiFreq(m)*2;
    f.type='lowpass';f.frequency.value=2200;
    const g2=ac.createGain();g2.gain.value=0.25;
    const w=when+k*0.006;  /* 살짝 롤 */
    g.gain.setValueAtTime(0.0001,w);
    g.gain.exponentialRampToValueAtTime(vol,w+0.012);
    g.gain.exponentialRampToValueAtTime(vol*0.45,Math.max(w+0.18,w+0.013));
    g.gain.exponentialRampToValueAtTime(0.001,Math.max(w+dur,w+0.181));
    o.connect(f);o2.connect(g2);g2.connect(f);f.connect(g);g.connect(out);
    o.start(w);o.stop(w+dur+0.05);o2.start(w);o2.stop(w+dur+0.05);
  });
}
function bass(ac,out,when,dur,midi,vel){
  vel=vel||1;
  const f=midiFreq(midi);
  const o=ac.createOscillator(),o2=ac.createOscillator(),g=ac.createGain(),fl=ac.createBiquadFilter();
  o.type='triangle';o.frequency.value=f;
  o2.type='square';o2.frequency.value=f*2;
  fl.type='lowpass';fl.frequency.setValueAtTime(1100,when);fl.frequency.exponentialRampToValueAtTime(500,when+0.15);
  const g2=ac.createGain();g2.gain.value=0.16;
  o2.connect(g2);g2.connect(fl);o.connect(fl);fl.connect(g);g.connect(out);
  g.gain.setValueAtTime(0.0001,when);
  g.gain.exponentialRampToValueAtTime(0.62*vel,when+0.01);
  g.gain.exponentialRampToValueAtTime(0.3*vel,Math.max(when+Math.min(0.14,dur*0.6),when+0.011));
  g.gain.exponentialRampToValueAtTime(0.001,Math.max(when+dur,when+Math.min(0.14,dur*0.6)+0.001));
  o.start(when);o.stop(when+dur+0.05);o2.start(when);o2.stop(when+dur+0.05);
}
function rim(ac,out,when,vol){   /* 림샷 — 짧은 노이즈, 메트로놈 클릭 소리가 아니다 */
  if(!ac._rim)ac._rim=noiseBuf(ac,0.06);
  const n=ac.createBufferSource(),g=ac.createGain(),f=ac.createBiquadFilter();
  n.buffer=ac._rim;f.type='bandpass';f.frequency.value=1800;f.Q.value=1.4;
  g.gain.setValueAtTime(vol,when);g.gain.exponentialRampToValueAtTime(0.001,when+0.06);
  n.connect(f);f.connect(g);g.connect(out);n.start(when);n.stop(when+0.08);
}
function kick(ac,out,when,vol){
  const o=ac.createOscillator(),g=ac.createGain();
  o.type='sine';o.frequency.setValueAtTime(150,when);o.frequency.exponentialRampToValueAtTime(50,when+0.09);
  g.gain.setValueAtTime(vol||0.5,when);g.gain.exponentialRampToValueAtTime(0.001,when+0.16);
  o.connect(g);g.connect(out);o.start(when);o.stop(when+0.18);
}
function noiseBuf(ac,len){const b=ac.createBuffer(1,ac.sampleRate*len,ac.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;return b}
function snare(ac,out,when,vol){
  if(!ac._sn)ac._sn=noiseBuf(ac,0.2);
  const n=ac.createBufferSource(),g=ac.createGain(),f=ac.createBiquadFilter();
  n.buffer=ac._sn;f.type='bandpass';f.frequency.value=2100;f.Q.value=0.7;
  g.gain.setValueAtTime(vol,when);g.gain.exponentialRampToValueAtTime(0.001,when+0.13);
  n.connect(f);f.connect(g);g.connect(out);n.start(when);n.stop(when+0.15);
}
function hat(ac,out,when,vol){
  if(!ac._ht)ac._ht=noiseBuf(ac,0.1);
  const n=ac.createBufferSource(),g=ac.createGain(),f=ac.createBiquadFilter();
  n.buffer=ac._ht;f.type='highpass';f.frequency.value=6500;
  g.gain.setValueAtTime(vol,when);g.gain.exponentialRampToValueAtTime(0.001,when+0.05);
  n.connect(f);f.connect(g);g.connect(out);n.start(when);n.stop(when+0.07);
}
function ridePing(ac,out,when,vol){
  if(!ac._rd)ac._rd=noiseBuf(ac,0.5);
  const n=ac.createBufferSource(),g=ac.createGain(),f=ac.createBiquadFilter(),f2=ac.createBiquadFilter();
  n.buffer=ac._rd;f.type='bandpass';f.frequency.value=5200;f.Q.value=2.2;f2.type='highpass';f2.frequency.value=3000;
  g.gain.setValueAtTime(vol||0.07,when);g.gain.exponentialRampToValueAtTime((vol||0.07)*0.3,when+0.05);g.gain.exponentialRampToValueAtTime(0.001,when+0.38);
  n.connect(f);f.connect(f2);f2.connect(g);g.connect(out);n.start(when);n.stop(when+0.4);
  const o=ac.createOscillator(),og=ac.createGain();o.type='sine';o.frequency.value=5800;  /* 벨 톤 */
  og.gain.setValueAtTime((vol||0.07)*0.12,when);og.gain.exponentialRampToValueAtTime(0.0005,when+0.3);
  o.connect(og);og.connect(out);o.start(when);o.stop(when+0.32);
}
function mel(ac,out,when,dur,midi,tone,vel,isEnd){
  tone=tone||'flugel';vel=vel||0.85;
  const g=ac.createGain(),f=ac.createBiquadFilter();
  f.type='lowpass';
  let oscs=[];
  const fr=midiFreq(midi);
  if(tone==='clarinet'){
    const o=ac.createOscillator();o.type='square';o.frequency.value=fr;
    f.frequency.value=1300+700*vel;oscs=[[o,0.8]];
  }else if(tone==='flugel'){
    const o=ac.createOscillator(),o2=ac.createOscillator(),o3=ac.createOscillator();
    o.type='sine';o2.type='sine';o3.type='triangle';
    o.frequency.value=fr;o2.frequency.value=fr*2;o3.frequency.value=fr;
    f.frequency.setValueAtTime(700,when);f.frequency.linearRampToValueAtTime(900+1000*vel,when+0.05);  /* 브라스 블룸 */
    oscs=[[o,1],[o2,0.22],[o3,0.35]];
  }else{
    const o=ac.createOscillator(),o2=ac.createOscillator();
    o.type='triangle';o2.type='sine';o.frequency.value=fr;o2.frequency.value=fr*2.001;
    f.frequency.value=2600;oscs=[[o,1],[o2,1]];
  }
  if(tone!=='default'&&(dur>0.4||isEnd)){
    const lfo=ac.createOscillator(),lg=ac.createGain();
    lfo.frequency.value=5.4;
    const vs=when+Math.min(0.3,dur*0.45);
    lg.gain.setValueAtTime(0,when);lg.gain.setValueAtTime(0,vs);lg.gain.linearRampToValueAtTime(fr*0.007,vs+0.25);
    lfo.connect(lg);oscs.forEach(([o])=>lg.connect(o.frequency));
    lfo.start(when);lfo.stop(when+dur+0.1);
  }
  /* 짧은 아래→제 음 스쿱(프레이즈 첫 음·긴 음에만) */
  if(tone!=='default'&&dur>0.3)oscs.forEach(([o])=>{o.frequency.setValueAtTime(fr*0.985,when);o.frequency.exponentialRampToValueAtTime(fr,when+0.05)});
  const peak=0.24*vel;
  const atk=tone==='default'?0.012:(tone==='clarinet'?0.022:0.03);
  const t1=when+atk,t2=when+atk+0.06,t3=when+Math.max(atk+0.07,dur-0.06),t4=when+dur+(isEnd?0.12:0.03);
  g.gain.setValueAtTime(0.0001,when);
  g.gain.exponentialRampToValueAtTime(peak,t1);
  g.gain.exponentialRampToValueAtTime(peak*0.82,Math.max(t2,t1+0.001));
  g.gain.setValueAtTime(peak*0.82,Math.max(t3,t2+0.001));
  g.gain.exponentialRampToValueAtTime(0.001,Math.max(t4,t3+0.001));
  oscs.forEach(([o,vol])=>{
    const vg=ac.createGain();vg.gain.value=vol;
    o.connect(vg);vg.connect(f);
    o.start(when);o.stop(when+dur+0.2);
  });
  f.connect(g);g.connect(out);
}
/* v0.31 일시정지·이어서 — AudioContext suspend/resume로 전체(솔로+반주)를 그 자리에서 멈춘다 */
function pauseAll(){if(cur.audio&&!cur.paused){cur.paused=true;try{cur.audio.ac.suspend()}catch(e){}}}
function resumeAll(){if(cur.audio&&cur.paused){cur.paused=false;try{cur.audio.ac.resume()}catch(e){}}}
function togglePause(){if(!cur.audio)return false;if(cur.paused)resumeAll();else pauseAll();return true}
function stopAll(){
  cur.paused=false;
  cur._playTok=(cur._playTok||0)+1;
  if(cur.audio){
    if(cur.audio.raf)cancelAnimationFrame(cur.audio.raf);
    if(cur.audio.timer)clearInterval(cur.audio.timer);
    try{cur.audio.ac.close()}catch(e){}
    cur.audio=null;
    [...$('#chips').children].forEach(c=>c.classList.remove('lit'));
    if(typeof clearPlayHl==='function')try{clearPlayHl()}catch(e){}
    try{document.querySelectorAll('.paper.paused').forEach(p=>p.classList.remove('paused'))}catch(e){}
  }
}

/* ── 재생 예외 복구: 조용한 실패 대신 화면에 원인을 표시 ── */
function playAll(){
  try{
    const p=playAllInnerAsync();
    if(p&&p.catch)p.catch(e=>{console.error('재생 오류:',e);stopAll();$('#btnPlay').textContent='▶ 재생';try{$('#paperTitle').textContent='⚠ 재생 오류: '+e.message}catch(_){}});
  }
  catch(e){
    console.error('재생 오류:',e);
    stopAll();$('#btnPlay').textContent='▶ 재생';
    try{$('#paperTitle').textContent='⚠ 재생 오류: '+e.message}catch(_){}
  }
}