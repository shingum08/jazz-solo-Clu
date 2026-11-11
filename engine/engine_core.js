/* ═══════════ 음악 엔진 v0.12 (UI와 분리 · 순수 로직) ═══════════
   v0.11 → v0.12 핵심 변경
   ① 화성 분석: 코드 종류만이 아니라 "기능"을 읽는다 (Ⅱ·Ⅴ→장조/단조·트라이톤 대리·Ⅳ 리디안·토닉 마이너)
      → 코드마다 코드-스케일·텐션·가이드톤(3·7음)을 따로 배정
   ② 타깃음 라인: 코드가 바뀌는 다운비트에 가이드톤을 먼저 정하고, 그 앞 1~2음을
      반음 어프로치·스케일 어프로치·인클로저로 "역산"해 채운다 (비밥 라인의 기본 원리)
   ③ 리듬: 반마디 템플릿 대신 박 단위 마르코프 체인 — Weimar Jazz Database 실측 전이 확률
   ④ 프레이즈: 고정 8마디 대신 실측 길이·쉼 분포(연주자별)로 호흡을 계획, 형식 경계에 종지 정렬
   ⑤ 음 선택: 연주자 프로필의 "코드 대비 음 분포(강박/약박)"와 "음정 분포"를 가중치로 사용
   ⑥ 릭: 음형(contour)을 보존하도록 배치 — v0.11은 음마다 따로 옥타브를 맞춰 음형이 깨졌음
   ⑦ 표기: 마디선을 넘는 붙임줄, 박 단위 분할, 마디 내 임시표 지속 규칙 반영 */
'use strict';

const CHORD_TYPES = {
  'maj7': {iv:[0,4,7,11],   scale:[0,2,4,5,7,9,11],   sname:'이오니안(메이저)'},
  'm7':   {iv:[0,3,7,10],   scale:[0,2,3,5,7,9,10],   sname:'도리안'},
  '7':    {iv:[0,4,7,10],   scale:[0,2,4,5,7,9,10],   sname:'믹솔리디안'},
  'm7b5': {iv:[0,3,6,10],   scale:[0,1,3,5,6,8,10],   sname:'로크리안'},
  'dim7': {iv:[0,3,6,9],    scale:[0,2,3,5,6,8,9,11], sname:'디미니시(온음-반음)'},
  '6':    {iv:[0,4,7,9],    scale:[0,2,4,5,7,9,11],   sname:'메이저'},
  'm6':   {iv:[0,3,7,9],    scale:[0,2,3,5,7,9,11],   sname:'멜로딕 마이너'},
  '9':    {iv:[0,4,7,10],   scale:[0,2,4,5,7,9,10],   sname:'믹솔리디안'},
  '7b9':  {iv:[0,4,7,10],   scale:[0,1,4,5,7,8,10],   sname:'하모닉 마이너 5모드(♭9·♭13)'},
  '7#9':  {iv:[0,4,7,10],   scale:[0,1,3,4,6,8,10],   sname:'얼터드(♭9·♯9·♭13)'},
  'm9':   {iv:[0,3,7,10,14],scale:[0,2,3,5,7,9,10],   sname:'도리안'},
  /* v0.37 리얼북 코드집용 */
  '7sus4':  {iv:[0,5,7,10],  scale:[0,2,5,7,9,10],     sname:'믹솔리디안 sus4(3음 없음)'},
  'mmaj7':  {iv:[0,3,7,11],  scale:[0,2,3,5,7,9,11],   sname:'멜로딕 마이너'},
  '7#11':   {iv:[0,4,7,10],  scale:[0,2,4,6,7,9,10],   sname:'리디안 ♭7'},
  'maj7#11':{iv:[0,4,7,11],  scale:[0,2,4,6,7,9,11],   sname:'리디안(♯11)'}
};
/* v0.21 반주 스타일(feel) — 곡 분류·템포로 자동 판별. 반주 리듬과 솔로 성격(코드톤 비중·리듬 밀도)에 함께 쓰인다 */
const LATIN_IDS=['spain','a-night-in-tunisia','caravan','st-thomas','afro-blue','at-the-mambo-inn','oye-como-va','sway','tequila'];
const SHUFFLE_IDS=['hallelujah-i-love-her-so','kansas-city'];
const SWING_IDS=['footprints'];
const FEEL_LABEL={swing:'스윙',ballad:'발라드',bossa:'보사노바',latin:'라틴',shuffle:'블루스 셔플',funk:'펑크'};
function autoFeel(id){
  const s=(typeof SONGDB!=='undefined')?SONGDB[id]:null;if(!s)return 'swing';
  if(SWING_IDS.includes(id))return 'swing';
  if(LATIN_IDS.includes(id))return 'latin';
  if(SHUFFLE_IDS.includes(id))return 'shuffle';
  const c=s.c;
  if(c==='라틴'||c==='보사노바')return 'bossa';
  if(c==='발라드')return 'ballad';
  if(c==='블루스')return s.bpm<=110?'shuffle':'swing';
  if(c==='리듬앤블루스')return 'shuffle';
  if(c==='펑키'||c==='팝')return 'funk';
  return 'swing';
}
/* v0.22 연습 주제 — 한 프레이즈(기본: 코러스 전체)를 한 가지 소재로만 연주하는 학습 모드.
   코드톤=정박은 코드톤, 약박은 경과음·반음 연결(v0.36 DP 라인) · 스케일=코드별 모드 스케일(도리안·믹솔리디안 등)만 · 크로매틱=반음 접근 강조 · 얼터드=도미넌트는 얼터드 스케일 */
const TOPIC_LABEL={ct:'코드톤 라인',penta:'펜타토닉',scale:'스케일',dom:'활용 스케일',chrom:'크로매틱',alt:'얼터드',gt:'가이드톤 라인'};
const ALT_SCALE=[0,1,3,4,6,8,10];   /* 얼터드 도미넌트 스케일: 1 b9 #9 3 b5 #5 b7 */
/* v0.23 연습 소재 확장 — 펜타토닉(코드 성질별) · 활용 스케일(프레이즈마다 변형 선택) */
const PENTA={maj:[0,2,4,7,9],min:[0,3,5,7,10],dom:[0,2,4,7,10],domalt:[0,2,4,7,10],hdim:[0,3,5,10],dim:[0,2,3,5,6,8,9,11]};
const SCALE_VARIANTS={
  maj:[[0,2,4,5,7,9,11],[0,2,4,6,7,9,11]],
  min:[[0,2,3,5,7,9,10],[0,2,3,5,6,7,9,10],[0,2,3,5,7,9,11]],
  dom:[[0,2,4,5,7,9,10],[0,2,4,6,7,9,10],[0,1,4,5,7,8,10],[0,1,4,5,7,10]],
  domalt:[[0,1,4,5,7,8,10],[0,2,4,6,7,9,10],[0,1,4,5,7,10]],
  hdim:[[0,1,3,5,6,8,10],[0,2,3,5,6,8,10]],
  dim:[[0,2,3,5,6,8,9,11]]};
const VARIANT_NAME={maj:['이오니안','리디안'],min:['도리안','도리안+블루노트','멜로딕 마이너'],dom:['믹솔리디안','리디안 ♭7','얼터드','하모닉 마이너 5모드'],domalt:['얼터드','리디안 ♭7','하모닉 마이너 5모드'],hdim:['로크리안','로크리안 ♮2'],dim:['디미니시(온음-반음)']};
/* v0.22 앱 작성 테마 — 원곡 멜로디가 아닌, 앱이 코드 진행에서 새로 만드는 가이드 멜로디(코드톤만).
   곡 id로 시드를 고정해 같은 곡이면 항상 같은 테마. 조 변환 시 함께 이조된다 */
const THEME_CACHE={};
function composeTheme(progId,keyPc){
  const ck=progId+'|'+keyPc;
  if(THEME_CACHE[ck])return THEME_CACHE[ck];
  const prog=SONGDB[progId],bars=barChords(prog,keyPc),BPB=prog.bpb||4,TPB=BPB*6;
  const n=Math.min(4,bars.length);
  let h=0;for(const ch of progId)h=(h*31+ch.charCodeAt(0))>>>0;
  const rng=mulberry32(h+7);
  const RHY4=[[6,6,6,6],[6,3,3,6,6],[6,6,12],[12,6,6],[3,3,6,6,6]];
  const RHY3=[[6,6,6],[9,9],[6,12]];
  const notes=[];let prev=null,t=0;
  for(let b=0;b<n;b++){
    const c=bars[b][0],iv=CHORD_TYPES[c.type].iv;
    const rhy=(BPB===3?RHY3:RHY4)[Math.floor(rng()*(BPB===3?RHY3:RHY4).length)];
    for(const d0 of rhy){
      if(t>=n*TPB)break;
      const d=Math.min(d0,n*TPB-t);
      const cands=[];for(let m=62;m<=79;m++)if(iv.includes(mod12(m-c.root)))cands.push(m);
      if(!cands.length)continue;
      let m;
      if(prev===null)m=cands[Math.floor(cands.length/2)];
      else{
        const step=[1,2,-1,-2,3,-3][Math.floor(rng()*6)];
        m=nearest(cands,prev+step);
        if(m===prev&&cands.length>1)m=nearest(cands.filter(x=>x!==prev),prev);
      }
      notes.push({t,d,midi:m});prev=m;t+=d;
    }
  }
  const th={notes,bar:0,bars:n};
  THEME_CACHE[ck]=th;return th;
}

/* 솔로 성격: heavyCT=강박·긴 음에서 코드톤 외 메인 음 감점, ctW=약박 코드톤 가중, chrom=크로매틱 가중,
   T/E/QH=리듬 토큰 가중(3연음·8분·4분/2분) — 스트레이트 계열은 3연음을 거의 쓰지 않는다 */
const FEEL_PROFILE={
  swing:  {heavyCT:1,   ctW:1,   chrom:1,    T:1,    E:1,   QH:1},
  ballad: {heavyCT:0.15,ctW:1.8, chrom:0.45, T:0.5,  E:0.9, QH:1.25},
  bossa:  {heavyCT:0.2, ctW:1.5, chrom:0.5,  T:0.08, E:0.9, QH:1.2},
  latin:  {heavyCT:0.35,ctW:1.4, chrom:0.6,  T:0.08, E:1,   QH:1.1},
  shuffle:{heavyCT:0.15,ctW:1.6, chrom:0.55, T:0.7,  E:0.9, QH:1.2},
  funk:   {heavyCT:0.35,ctW:1.5, chrom:0.5,  T:0.05, E:1,   QH:1.1}
};
/* v0.20 마디의 '메인 음' — 코드톤 + 코드에 맞는 펜타토닉(강박·긴 음은 여기서 고른다) */
const PENTA_REL={maj:[0,2,4,7,9],min:[0,2,3,5,7,10],dom:[0,2,4,7,9,10],domalt:[0,4,7,10],hdim:[0,3,5,6,10],dim:[0,3,6,9]};
const TYPE_CLS={'maj7':'maj','6':'maj','m7':'min','m9':'min','m6':'min','7':'dom','9':'dom','7b9':'domalt','7#9':'domalt','m7b5':'hdim','dim7':'dim','7sus4':'dom','mmaj7':'min','7#11':'dom','maj7#11':'maj'};

/* 진행: o = 조의 으뜸음에서 반음 거리, t = 코드 종류. 한 마디에 코드 1~2개. (v0.11과 동일) */
const PROGS = {
  autumnLeaves:{name:'♪ Autumn Leaves (Gm)', fixedKey:7, form:{phrase:8,sections:'AABA'}, bars:[
    [{o:5,t:'m7'}],[{o:10,t:'9'}],[{o:3,t:'maj7'}],[{o:8,t:'maj7'}],
    [{o:2,t:'m7b5'}],[{o:7,t:'7b9'}],[{o:0,t:'m6'}],[{o:0,t:'m6'}],
    [{o:5,t:'m7'}],[{o:10,t:'9'}],[{o:3,t:'maj7'}],[{o:8,t:'maj7'}],
    [{o:2,t:'m7b5'}],[{o:7,t:'7b9'}],[{o:0,t:'m6'}],[{o:0,t:'m6'}],
    [{o:2,t:'m7b5'}],[{o:7,t:'7b9'}],[{o:0,t:'m6'}],[{o:0,t:'m6'}],
    [{o:5,t:'m7'}],[{o:10,t:'7'}],[{o:3,t:'maj7'}],[{o:8,t:'maj7'}],
    [{o:2,t:'m7b5'}],[{o:7,t:'7b9'}],[{o:0,t:'m7'},{o:6,t:'7'}],[{o:5,t:'m7'},{o:4,t:'7'}],
    [{o:3,t:'7'}],[{o:2,t:'7#9'}],[{o:0,t:'m6'}],[{o:0,t:'m6'}]]},
  allOfMe:{name:'♪ All of Me (C)', fixedKey:0, form:{phrase:8,sections:'ABAC'}, bars:[
    [{o:0,t:'maj7'}],[{o:0,t:'maj7'}],[{o:4,t:'7'}],[{o:4,t:'7'}],
    [{o:9,t:'7'}],[{o:9,t:'7'}],[{o:2,t:'m7'}],[{o:2,t:'m7'}],
    [{o:4,t:'7'}],[{o:4,t:'7'}],[{o:9,t:'m7'}],[{o:9,t:'m7'}],
    [{o:2,t:'7'}],[{o:2,t:'7'}],[{o:2,t:'m7'}],[{o:7,t:'7'}],
    [{o:0,t:'maj7'}],[{o:0,t:'maj7'}],[{o:4,t:'7'}],[{o:4,t:'7'}],
    [{o:9,t:'7'}],[{o:9,t:'7'}],[{o:2,t:'m7'}],[{o:2,t:'m7'}],
    [{o:5,t:'6'}],[{o:5,t:'m6'}],[{o:0,t:'maj7'},{o:4,t:'m7'}],[{o:9,t:'7'}],
    [{o:2,t:'m7'}],[{o:7,t:'7'}],[{o:0,t:'6'}],[{o:0,t:'6'}]]},
  p251: {name:'메이저 Ⅱ-Ⅴ-Ⅰ', form:{phrase:8,sections:'A'}, bars:[
    [{o:2,t:'m7'},{o:7,t:'7'}],[{o:0,t:'maj7'}],[{o:2,t:'m7'},{o:7,t:'7'}],[{o:0,t:'maj7'}],
    [{o:9,t:'m7'},{o:2,t:'7'}],[{o:7,t:'m7'},{o:0,t:'7'}],[{o:5,t:'maj7'}],[{o:5,t:'maj7'}]]},
  blues:{name:'블루스 12마디', form:{phrase:4,sections:'AAB'}, bars:[
    [{o:0,t:'7'}],[{o:5,t:'7'}],[{o:0,t:'7'}],[{o:0,t:'7'}],
    [{o:5,t:'7'}],[{o:5,t:'7'}],[{o:0,t:'7'}],[{o:0,t:'7'}],
    [{o:2,t:'m7'}],[{o:7,t:'7'}],[{o:0,t:'7'}],[{o:0,t:'7'}]]},
  autumn:{name:'마이너 Ⅱ-Ⅴ 연쇄', form:{phrase:8,sections:'A'}, bars:[
    [{o:5,t:'m7'}],[{o:10,t:'7'}],[{o:3,t:'maj7'}],[{o:8,t:'maj7'}],
    [{o:9,t:'m7b5'}],[{o:7,t:'7'}],[{o:0,t:'m7'}],[{o:0,t:'m7'}]]}
};
const KEY_ROOTS = [['C',0],['F',5],['B♭',10],['E♭',3],['G',7],['D',2],['A',9]];
const DIFFS = [
  {name:'1 · 입문', desc:'4분·2분음표 · 코드톤만 — 코드가 바뀔 때 가장 가까운 3음·7음으로 옮겨 가는 "가이드톤 라인" 연습'},
  {name:'2 · 중급', desc:'8분음표 라인 · 엇박 진입 — 스케일음으로 걷다가 다음 코드의 가이드톤에 반음·온음 어프로치로 착지'},
  {name:'3 · 심화', desc:'비밥 밀도 · 3연음 — 인클로저, 크로매틱 통과음, 얼터드 텐션(♭9·♭13), 실측 공통 셀'}
];
const INSTRUMENTS = [
  {id:'brass', name:'금관', desc:'트럼펫·트롬본 계열 — B3 이하 최소화, 5도 초과 도약 차단, 프레이즈 최대 3마디'},
  {id:'wind',  name:'목관', desc:'색소폰·클라리넷·플루트 — 프레이즈 최대 2마디 + 1박 이상 호흡. 음역·도약 규칙은 금관과 동일'},
  {id:'free',  name:'기타·건반', desc:'기타·피아노 등 — 연주 제약이 적어 전 음역을 자유롭게 사용'}
];

/* ── 기본 어휘(교본 공통 어법) ──
   특정 녹음의 전사가 아니라 재즈 교육에서 일반화된 음형. s=코드 뿌리 기준 시작 음도, iv=음정 열(반음). */
const CURATED_CELLS=[
  {cls:'dom',s:0,iv:[2,2,3],name:'1-2-3-5 (콜트레인 셀)'},
  {cls:'maj',s:0,iv:[2,2,3],name:'1-2-3-5 (콜트레인 셀)'},
  {cls:'min',s:0,iv:[2,1,4],name:'1-2-♭3-5 (마이너 셀)'},
  {cls:'dom',s:4,iv:[3,3,4],name:'3-5-♭7-9 (3 to 9 아르페지오)'},
  {cls:'domalt',s:4,iv:[3,3,3],name:'3-5-♭7-♭9 (♭9 아르페지오)'},
  {cls:'maj',s:4,iv:[3,4,3],name:'3-5-7-9 (상부 구조)'},
  {cls:'min',s:3,iv:[4,3,4],name:'♭3-5-♭7-9 (상부 구조)'},
  {cls:'dom',s:0,iv:[-1,-1,-2],name:'1-7-♭7-6 (비밥 도미넌트 하행)',minDiff:3},
  {cls:'dom',s:10,iv:[-1,-1,-1],name:'♭7-6-♭6-5 (크로매틱 하행)',minDiff:3},
  {cls:'hdim',s:0,iv:[3,3,4],name:'1-♭3-♭5-♭7 (하프디미니시 아르페지오)'},
  {cls:'hdim',s:10,iv:[-4,-3,-3],name:'♭7-♭5-♭3-1 (하행 아르페지오)'},
  {cls:'maj',s:7,iv:[-3,-2,-2],name:'5-3-2-1 (하행 셀)'},
  /* 코드를 건너는 셀(4음 + 다음 코드 다운비트 착지) */
  {cls:'min',to:'dom',tr:5,s:0,iv:[3,4,3,-1],name:'Ⅱ: 1-♭3-5-♭7 → Ⅴ의 3음'},
  {cls:'dom',to:'maj',tr:5,s:4,iv:[3,3,3,-1],name:'Ⅴ: 3-5-♭7-♭9 → Ⅰ의 5음',minDiff:3},
  {cls:'domalt',to:'min',tr:5,s:4,iv:[3,3,3,-1],name:'Ⅴ: 3-5-♭7-♭9 → ⅰ의 5음'},
  {cls:'dom',to:'maj',tr:5,s:7,iv:[-2,-1,-2,-2],name:'Ⅴ: 5-4-3-2 → Ⅰ의 1음'}
];

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function pickW(rng,cands){
  let s=0;for(const c of cands)s+=c.w;
  if(!(s>0))return cands.length?cands[0].v:null;
  let r=rng()*s;
  for(const c of cands){r-=c.w;if(r<=0)return c.v}
  return cands[cands.length-1].v;
}
function nearest(arr,x){return arr.reduce((a,c)=>Math.abs(c-x)<Math.abs(a-x)?c:a,arr[0])}
function barChords(prog,keyPc){const off=(prog.key!==undefined&&keyPc!==undefined&&!isNaN(keyPc))?keyPc-prog.key:0;return prog.bars.map(bar=>bar.map(c=>'o' in c?{root:((keyPc+c.o)%12+12)%12,type:c.t}:{root:(((c.root+off)%12)+12)%12,type:c.type}))}
const mod12=x=>((x%12)+12)%12;
/* v0.38 한 마디 코드 여러 개 — 각 코드가 시작하는 박. 2개면 마디 절반(3/4는 3박째, 5/4는 4박째), 그 이상은 박 균등(4/4에 4개 = 한 박씩) */
function chordBeats(n,bpb){bpb=bpb||4;if(n<=1)return [0];if(n===2)return [0,Math.ceil(bpb/2)];return [...Array(n)].map((_,i)=>Math.round(i*bpb/n))}
function chordIdxAt(chords,beat,bpb){const st=chordBeats(chords.length,bpb);let k=0;for(let i=0;i<st.length;i++)if(beat>=st[i]-1e-9)k=i;return k}
function chordAtBeat(chords,beat,bpb){return chords[chordIdxAt(chords,beat,bpb)]}

function chordToneMidis(rootPc,type,lo,hi){
  const out=[];
  for(let m=lo-(lo%12)-12;m<=hi+12;m+=12)for(const iv of CHORD_TYPES[type].iv){
    const m2=m+rootPc+iv;if(m2>=lo&&m2<=hi&&!out.includes(m2))out.push(m2);
  }
  return out.sort((a,b)=>a-b);
}

/* ── ① 화성 분석 ───────────────────────────────────────────────
   마디 → 코드 구간(segment). 각 구간에 기능·스케일·코드톤·가이드톤·텐션을 배정한다. */
const CHORD_NAME=['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
const SUF={maj7:'maj7',m7:'m7',m9:'m9','7':'7',m7b5:'m7♭5',dim7:'dim7','6':'6',m6:'m6','9':'9','7b9':'7♭9','7#9':'7♯9','7sus4':'7sus4',mmaj7:'m(maj7)','7#11':'7♯11','maj7#11':'maj7♯11'};
const CHORD_NAME_S=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
let SPELL_SHARP=false;
/* 곡이 단조로 끝나는지(마지막 코드가 으뜸음 마이너) */
function songIsMinor(prog){
  const last=prog.bars[prog.bars.length-1],c=last[last.length-1];
  const rel='o' in c?mod12(c.o):mod12(c.root-(prog.key||0)),t='o' in c?c.t:c.type;
  return rel===0&&/^m(6|7|9)$/.test(t);
}
/* 조 철자 결정: 장조 기준(단조는 나란한조) G·D·A·E·B는 ♯, 위로 옮겨 도착한 C♯·F♯도 ♯ */
function setSpelling(prog,keyPc,dir){
  const maj=mod12(keyPc+(songIsMinor(prog)?3:0));
  SPELL_SHARP=[7,2,9,4,11].includes(maj)||([1,6].includes(maj)&&dir>0);
}
function pcName(pc){return (SPELL_SHARP?CHORD_NAME_S:CHORD_NAME)[mod12(pc)]}
function chordSymbol(rootPc,type){return pcName(rootPc)+SUF[type]}
/* 생성된 솔로를 통째로 이조 — 코드·음표가 같은 음정만큼 이동. 음표는 악기 음역에 맞는 옥타브 선택 */
function transposeSolo(solo,semis,inst,forceShift){
  const RG={brass:[59,82],wind:[59,82],free:[52,86]}[inst||'free']||[52,86];
  let mn=1e9,mx=-1e9;
  solo.bars.forEach(b=>b.notes.forEach(n=>{if(n.midi!==null){mn=Math.min(mn,n.midi);mx=Math.max(mx,n.midi)}}));
  let best=0;
  if(forceShift!==undefined)best=forceShift;
  else if(semis){
    const d=mod12(semis);let bc=1e9;
    for(const sh of (semis>0?[d,d-12]:[d-12,d])){
      const over=Math.max(0,mx+sh-RG[1])+Math.max(0,RG[0]-(mn+sh));
      const c=over*10+Math.abs(sh)+(Math.sign(sh)!==Math.sign(semis)?0.5:0);
      if(c<bc){bc=c;best=sh}
    }
  }
  const out=JSON.parse(JSON.stringify(solo));
  out.bars.forEach(b=>{b.chords=b.chords.map(c=>({root:mod12(c.root+semis),type:c.type}));b.notes.forEach(n=>{if(n.midi!==null)n.midi+=best})});
  out.keyPc=mod12(solo.keyPc+semis);out.shift=best;out.semis=semis;
  const segs=analyzeHarmony(out.bars.map(b=>b.chords),out.keyPc,out.bpb||4);
  out.harm=segs.map(sg=>({bar:sg.bar,t0:sg.t0,label:sg.label,fn:sg.fn,sname:sg.sname}));
  return out;
}
function analyzeHarmony(bars,keyPc,bpb){
  bpb=bpb||4;const TPB=bpb*6;
  const segs=[];
  bars.forEach((bar,b)=>{const off=b*TPB,st=chordBeats(bar.length,bpb);
    bar.forEach((c,i)=>segs.push({bar:b,t0:off+st[i]*6,root:c.root,type:c.type}));
  });
  const merged=[];
  for(const s of segs){
    const L=merged[merged.length-1];
    if(L&&L.root===s.root&&L.type===s.type){L.dur+=s.dur}else merged.push({...s});
  }
  merged.forEach((s,i)=>{
    const nx=merged[(i+1)%merged.length],pv=merged[(i-1+merged.length)%merged.length];
    const cls0=TYPE_CLS[s.type];
    const toNext=mod12(nx.root-s.root);
    let cls=cls0,scale=CHORD_TYPES[s.type].scale.slice(),fn='',tens=[],sname=CHORD_TYPES[s.type].sname;
    if(s.type==='7sus4'){fn=toNext===5?'Ⅴsus4':'sus4 도미넌트';tens=[2,9]}   /* v0.37 고유 스케일 유지 */
    else if(s.type==='7#11'){fn=toNext===11?'트라이톤 대리(♭Ⅱ7)':'리디안 도미넌트';tens=[2,6,9]}
    else if(cls0==='dom'){
      if(toNext===5&&(TYPE_CLS[nx.type]==='min'||TYPE_CLS[nx.type]==='hdim')){
        cls='domalt';scale=[0,1,4,5,7,8,10];tens=[1,8];fn='Ⅴ→단조';sname='하모닉 마이너 5모드(♭9·♭13)';
      }else if(toNext===5){
        fn='Ⅴ→'+(TYPE_CLS[nx.type]==='maj'?'장조':'다음 코드');tens=[2,9];sname='믹솔리디안';
      }else if(toNext===11){
        scale=[0,2,4,6,7,9,10];tens=[2,6,9];fn='트라이톤 대리(♭Ⅱ7)';sname='리디안 ♭7';
      }else{
        fn='블루스/정지 도미넌트';tens=[2,9];sname='믹솔리디안 + 블루노트(♭3)';s.blue=true;
      }
    }else if(cls0==='domalt'){
      tens=s.type==='7#9'?[1,3,8]:[1,8];fn=toNext===5?'Ⅴ→해결':'얼터드 도미넌트';
    }else if(cls0==='maj'){
      const resolved=mod12(s.root-pv.root)===5&&TYPE_CLS[pv.type]&&TYPE_CLS[pv.type].startsWith('dom');
      if(!resolved&&s.type==='maj7'&&mod12(s.root-pv.root)===5&&TYPE_CLS[pv.type]==='maj'){
        scale=[0,2,4,6,7,9,11];fn='Ⅳ(리디안)';sname='리디안(♯11)';tens=[2,6,9];
      }else{fn=resolved?'Ⅰ(해결)':'장조 토닉';tens=[2,9];}
    }else if(cls0==='min'){
      if(s.type==='mmaj7'){fn='ⅰ(마이너 메이저7)';tens=[2,9]}
      else if(toNext===5&&TYPE_CLS[nx.type]&&TYPE_CLS[nx.type].startsWith('dom')){fn='Ⅱ';scale=[0,2,3,5,7,9,10];sname='도리안';tens=[2,5]}
      else if(s.type==='m6'||mod12(s.root-keyPc)===0){fn='ⅰ(토닉 마이너)';scale=[0,2,3,5,7,9,11];sname='멜로딕 마이너';tens=[2,9]}
      else{fn='마이너';tens=[2,5]}
    }else if(cls0==='hdim'){fn=toNext===5?'ⅱø(단조 Ⅱ)':'하프디미니시';tens=[5]}
    else if(cls0==='dim'){fn='경과 디미니시';tens=[2,5,8,11]}
    s.cls=cls;s.scale=scale;s.fn=fn;s.tens=tens;s.sname=sname;
    s.ct=CHORD_TYPES[s.type].iv.slice();
    s.guide=s.ct.filter(iv=>iv===3||iv===4||iv===10||iv===11||(s.type==='6'&&iv===9)||(s.type==='m6'&&iv===9)||(s.type==='7sus4'&&iv===5));
    s.label=chordSymbol(s.root,s.type)+(fn?' · '+fn:'')+' · '+sname;
  });
  return merged;
}

/* ── 리듬 토큰(박 단위) ──
   Q=박 위 4분 · E=8분 2개 · Uh=앞음 지속+엇박 진입(당김) · Ur=쉼+엇박 진입 · T=8분 3연음 · H=지속 · R=쉼 */
const TOK=['R','H','Q','E','Ur','Uh','T','Tr'];
const NOTE_TOK={Q:1,Qs:1,E:1,Ur:1,Uh:1,T:1};
const ALLOWED=[null,{Q:1,H:1,R:1},{Q:1,Qs:1,H:1,R:1,E:1,Ur:1,Uh:1},{Q:1,Qs:1,H:1,R:1,E:1,Ur:1,Uh:1,T:1}];
/* v0.33 Qs = 정박 8분 + 8분 쉼(짧게 끊는 음). 앞이 끊긴 토큰 뒤에는 이어짐(H·Uh)이 올 수 없다 */
const CUT_TOK={R:1,T:1,Qs:1};

function sampleQuart(rng,q,lo,hi){ /* 사분위 [Q1,Q2,Q3] → 대략적 분포 샘플 */
  const r=rng();let v;
  if(r<0.25)v=q[0]-(q[1]-q[0])*rng()*0.8;
  else if(r<0.5)v=q[0]+(q[1]-q[0])*rng();
  else if(r<0.75)v=q[1]+(q[2]-q[1])*rng();
  else v=q[2]+(q[2]-q[1])*rng()*0.8;
  return Math.max(lo,Math.min(hi,v));
}

/* v0.27 분류는 명시적 어법 메타데이터/확인된 id만 사용한다.
   c는 넓은 카탈로그 분류(예: Giant Steps도 모달)이므로 모달 판정에 쓰지 않는다. */
const RHYTHM_IDS=['oleo','i-got-rhythm','anthropology','rhythm-a-ning'];
const MODAL_IDS=['so-what','impressions','maiden-voyage','milestones','little-sunflower','chameleon','take-five','my-favorite-things'];
function classifySong(id,prog){
  if(['standard','blues','rhythm','modal'].includes(prog.songType))return prog.songType;
  if(RHYTHM_IDS.includes(id))return 'rhythm';
  if(id==='blues12'||id==='blues'||(prog.c==='블루스'&&prog.bars.length===12))return 'blues';
  if(MODAL_IDS.includes(id))return 'modal';
  return 'standard';
}
/* v0.39 노래 프레이즈 리듬 셀(박 단위 토큰) — 4분·2분·당김음 위주. 같은 셀을 되풀이해 동기처럼 들리게 한다 */
const SONG_CELLS={
  4:[['Q','H','Q','Q'],['Q','Q','Q','H'],['Ur','H','Q','Q'],['Q','H','H','Q'],['E','Q','H','R'],['Q','Ur','H','Q'],['Q','H','Q','R'],['Ur','H','H','Q']],
  3:[['Q','H','Q'],['Q','Q','Q'],['Ur','H','Q'],['Q','H','H'],['E','Q','Q'],['Q','Ur','H']],
  2:[['Q','H'],['Q','Q'],['Ur','H'],['E','Q'],['Q','Ur']]
};
const LYRIC_DEFAULT=0.3;   /* 노래↔비밥 조절바 기본값(노래 프레이즈 비율) */
const HL_LABEL={line:'8분 라인',perc:'리듬 반복(한 음)',pivot:'피벗 패턴',hemiola:'3음 시퀀스(헤미올라)',trip:'셋잇단 런'};
/* 직접 작성한 교육용 리듬 윤곽 — WJD 전사/파생 템플릿이 아니다. */
const RHY_TPL=[
  ['Q','E','E','Q','Q','E','E','H'],
  ['Uh','E','E','Q','E','E','H'],
  ['E','E','Q','Ur','E','E','Q','H'],
  ['Q','T','E','E','Q','H'],
  ['E','E','E','E','Q','Q','H'],
  ['Q','Q','E','E','E','E','H'],
  ['Uh','Q','E','E','Q','E','E','H'],
  ['Q','E','E','Q','R','R','E','E','Q','H'],
  ['E','Q','Q','H','R','E','E','Q','H'],
  ['Q','E','Ur','E','E','Q','Q','H']];
function rhythmToken(k,prev,first,diff,fp,rng,density){
  if(!ALLOWED[diff][k])k='Q';
  if(k==='T'&&rng()>Math.min(1,fp.T/fp.QH))k='E';
  if(k==='E'&&rng()>Math.min(1,fp.E/fp.QH))k='Q';
  if((k==='E'||k==='T')&&density<1&&rng()>density)k='Q';
  if(first&&k==='Uh')k=diff>=2?'Ur':'Q';
  if(first&&!NOTE_TOK[k])k='Q';
  if(k==='H'&&CUT_TOK[prev])k='Q';
  if(k==='Uh'&&CUT_TOK[prev])k=diff>=2?'Ur':'Q';
  return k;
}
function fitRhythmTemplate(src,need,diff,fp,rng,density){
  const out=[];
  for(let j=0;j<need;j++){
    /* 종지 H는 잘라 버리지 않고 마지막 박에 보존. 긴 프레이즈는 몸체를 반복한다. */
    const k=j===need-1&&need>1?'H':src[j%Math.max(1,src.length-1)];
    out.push(rhythmToken(k,out[j-1]||'R',j===0,diff,fp,rng,density));
  }
  if(need>1){if(CUT_TOK[out[need-2]])out[need-2]='Q';out[need-1]='H'}
  return out;
}
function rhythmBeatRow(bp){return 1+((bp-1)%4)} /* 실측 표는 1~4박만 제공 */
function sectionIndex(t,phrase,bpb){return Math.floor(t/(phrase*bpb*6))}

/* ── 메인 생성기 ── */
function generateSolo(progId,keyPc,diff,seed,inst,opts){
  opts=opts||{};
  const useLicks=opts.useLicks!==false;
  const useGroups=opts.groups!==false;
  inst=inst||'free';
  const SD=(typeof STYLE_DATA!=='undefined')?STYLE_DATA:null;
  const styleId=(opts.style&&SD&&SD.profiles[opts.style])?opts.style:'all';
  const PF=SD?SD.profiles[styleId]:null;
  const topic=(opts.topic&&TOPIC_LABEL[opts.topic])?opts.topic:'auto';
  const feel=FEEL_PROFILE[opts.feel]?opts.feel:autoFeel(progId);
  const FP=Object.assign({},FEEL_PROFILE[feel]);
  {const sp=(typeof SONGDB!=='undefined')?SONGDB[progId]:null;
   if(sp&&(sp.c==='비밥'||sp.c==='리듬앤블루스')){FP.heavyCT=Math.min(FP.heavyCT,0.2);FP.ctW=Math.max(FP.ctW,1.5);FP.chrom=Math.min(FP.chrom,0.6)}}

  const RG={brass:[59,82],wind:[59,82],free:[52,86]}[inst];
  const LO=RG[0],HI=RG[1];
  const ARC=(opts.arc&&opts.arc.n>1)?opts.arc:{i:0,n:1};   /* v0.27 코러스 곡선: 1코러스 성긴·낮게 → 마지막 코러스 촘촘·높게 후 이완 */
  const rng=mulberry32(seed===undefined?Date.now():seed);
  const prog=(typeof SONGDB!=='undefined'&&SONGDB[progId])?SONGDB[progId]:PROGS[progId];
  const bars=barChords(prog,keyPc);
  /* v0.27 곡 유형별 어법 — 블루스(블루노트 어휘)·모달(펜타토닉 중심)·리듬체인지(브리지 도미넌트 강조) */
  const songType=classifySong(progId,prog);
  if(songType==='blues'){FP.heavyCT*=0.6;FP.chrom=Math.min(1.4,FP.chrom*1.3)}   /* 블루스: 강박 덜 엄격, 블루노트 여유 */
  if(songType==='rhythm'){FP.ctW*=1.25;FP.heavyCT*=0.85}                        /* 리듬체인지: 코드톤 주도 라인 */
  if(songType==='modal'){FP.heavyCT*=0.85}
  const BPB=prog.bpb||4,TPB=BPB*6;
  const NB=bars.length,TOT=NB*TPB;
  const form=prog.form||{phrase:8,sections:'A'};
  const P=form.phrase,sec=form.sections,nPh=Math.ceil(NB/P);
  const roles=[];{const seen={};for(let p=0;p<nPh;p++){const L=sec[p]||'A';roles.push(L==='B'?'contrast':(L==='C'?'resolution':(seen[L]?'answer':'statement')));seen[L]=true}}
  const segs=analyzeHarmony(bars,keyPc,BPB);
  const segAt=t=>{t=Math.min(t,TOT-1);for(let i=segs.length-1;i>=0;i--)if(segs[i].t0<=t)return i;return 0};
  const tagsAt=[...Array(NB)].map(()=>[]);
  const tag=(b,s)=>{if(b>=0&&b<NB&&!tagsAt[b].includes(s))tagsAt[b].push(s)};
  if(songType!=='standard')tag(0,'어법: '+(songType==='blues'?'블루스':songType==='modal'?'모달':'리듬체인지'));
  const lickUse={};
  const stats={targets:0,guideHits:0,enc:0,appr:0,chrom:0,cells:0,motif:0,headQuote:0};

  /* 음역군(금관·목관, v0.3 규칙 유지 · 끌 수 있음) */
  const groupOf=m=>m>=60&&m<=71?'A':(m>=72&&m<=83?'B':null);
  const plans=[];
  if(inst!=='free'&&useGroups){
    let last=rng()<0.5?'A':'B';
    for(let b=0;b<NB;b+=8){
      const ph=Math.floor(b/P),role=roles[ph]||'statement';
      const first=last;let second=rng()<0.5?first:(first==='A'?'B':'A');
      if(role==='contrast'&&second==='A'&&rng()<0.7)second='B';
      if((role==='resolution'||b+8>=NB)&&second==='B'&&rng()<0.5)second='A';
      plans.push({first,second});last=second;
      tag(b,'음역군 '+first);if(second!==first)tag(b+4,'음역군 전환 '+first+'→'+second);
    }
  }
  const allow=(m,t)=>m>=LO&&m<=HI;
  /* 음역군 적합도(1=적합 · 0.08=다른 군) — v0.19까지는 '금지'라서 군 전환 때 후보가 0개가 되어
     빈 마디가 수십 마디 이어지는 버그가 있었다. 이제 감점으로 유도한다 */
  const groupFit=(m,t)=>{
    if(inst==='free'||!useGroups)return 1;
    const b=Math.min(NB-1,Math.floor(t/TPB)),pl=plans[Math.floor(b/8)];
    const g=groupOf(m),act=b%8<4?pl.first:pl.second;
    return (g===act||((b%8===4||b%8===5)&&g===pl.first))?1:(ARC.n>1?0.7:0.08);
  };
  const centerAt=t=>{
    if(inst==='free'||!useGroups)return inst==='free'?70:71;
    const b=Math.min(NB-1,Math.floor(t/TPB)),pl=plans[Math.floor(b/8)];
    const c=(b%8<4?pl.first:pl.second)==='A'?66:76;
    return ARC.n>1?71+(c-71)*0.2:c;
  };
  const MAXLEAP=inst==='free'?12:7;

  /* ── ④ 프레이즈 계획 ── */
  const phLenQ=PF?PF.stats.phLen:[4.2,7.1,13.1],gapQ=PF?PF.stats.gap:[1.2,2,3.1];
  const capBeats=inst==='wind'?8:(inst==='brass'?12:16);
  const lenScale=[0,0.75,0.9,1][diff];
  const phraseCap=ARC.n>1&&ARC.i===0?Math.max(3,Math.floor(capBeats*0.72)):capBeats;
  const densityAt=bt=>ARC.n<=1?1:(ARC.i>=ARC.n-1&&bt>=totalBeats-BPB*2?0.5:0.55+0.65*ARC.i/(ARC.n-1));
  const phrases=[];
  let beat=rng()<0.6?0:(diff===1?2:1);
  const totalBeats=NB*BPB;
  while(beat<totalBeats-1){
    let L=Math.round(sampleQuart(rng,phLenQ.map(x=>x*lenScale),diff===1?3:3,Math.min(capBeats,diff===1?7:capBeats)));
    if(diff===1){beat=Math.ceil(beat/2)*2;}
    let end=beat+L; /* 마지막 음이 시작되는 박(포함) */
    /* 형식 경계(8마디·블루스 4마디)에 가까우면 그 직전에 종지하도록 맞춘다 */
    const secBeats=P*BPB;
    const nextB=Math.ceil((beat+1)/secBeats)*secBeats;
    if(nextB<totalBeats&&end>=nextB-3&&end<=nextB+3){end=nextB-2+(rng()<0.4?1:0);if(end-beat<2)end=beat+2}
    end=Math.min(end,beat+phraseCap-1,totalBeats-1);
    if(end<=beat)break;
    phrases.push({s:beat,e:end});
    let g=sampleQuart(rng,gapQ,diff===1?2:1,6);
    if(inst==='wind')g=Math.max(g,1.2);
    const slow=feel==='ballad'||feel==='bossa'||feel==='latin';
    g=Math.min(g,slow?BPB-1:BPB+1);   /* 프레이즈 사이 쉼 — 느린 계열(발라드·보사·라틴)은 더 촘촘히 */
    beat=end+1+Math.round(g);
    /* 곡 첫 박 근처로 새 섹션을 시작하도록 — 섹션 경계 1박 전(픽업)이나 경계에서 */
    const nb2=Math.ceil(beat/secBeats)*secBeats;
    if(nb2-beat<=2&&nb2-beat>0&&rng()<0.6)beat=nb2-(diff>=2&&rng()<0.5?1:0);
  }
  /* 마지막 프레이즈는 마지막 마디 1박에서 길게 끝나도록 */
  if(phrases.length){
    const lp=phrases[phrases.length-1];
    lp.e=Math.max(lp.s+1,totalBeats-BPB);lp.final=true;
    if(lp.e-lp.s>=phraseCap){
      const end=lp.e,start=Math.max(lp.s,end-phraseCap+1);
      lp.e=start-3;lp.final=false;
      if(lp.e<=lp.s)phrases.pop();
      phrases.push({s:start,e:end,final:true});
    }
  }

  /* v0.39 노래 프레이즈 선택 — opts.lyric(0~1)이 노래 프레이즈 비율. 섹션 첫머리·곡 끝·첫 코러스에 더 자주,
     낮은 비율에서는 노래 프레이즈가 연달아 붙지 않게 해 화려한 라인과 번갈아 나오게 한다 */
  const LYR=opts.lyric==null?LYRIC_DEFAULT:Math.max(0,Math.min(1,+opts.lyric));
  {
    let p=topic==='auto'?LYR:0;
    if(p>0&&p<1){let mul=feel==='ballad'?1.5:(feel==='bossa'||feel==='latin')?1.15:1;
      if(PF&&STYLE_DATA.profiles.all)mul*=Math.min(1.6,Math.max(0.6,Math.pow((1-PF.stats.eighth)/(1-STYLE_DATA.profiles.all.stats.eighth),2)));   /* 8분 라인이 적은 연주자일수록 노래 프레이즈가 잦다 */
      if(songType==='blues')mul*=0.8;if((opts.bpm||prog.bpm||140)>=230)mul*=0.75;p=Math.min(0.95,p*mul)}
    const N=phrases.length;let K=p>=1?N:Math.round(p*N);if(p>0&&K===0&&rng()<p*N)K=1;
    if(K>0){
      const secB=P*BPB;
      const sc=phrases.map((ph,i)=>{let v=rng()*0.6;if(ph.s%secB<=1)v+=0.35;if(ph.final)v+=0.4;if(i===0)v+=0.3;
        const r=roles[sectionIndex(ph.s*6,P,BPB)]||'statement';if(r==='resolution')v+=0.15;if(r==='contrast')v-=0.15;
        if(ARC.n>1)v+=0.2*(1-ARC.i/(ARC.n-1));return v});
      for(let k=0;k<K;k++){let bi=-1;for(let i=0;i<N;i++)if(!phrases[i].song&&(bi<0||sc[i]>sc[bi]))bi=i;if(bi<0)break;
        phrases[bi].song=true;if(p<0.6){if(bi>0)sc[bi-1]-=0.35;if(bi+1<N)sc[bi+1]-=0.35}}
    }
    /* v0.39 블루스 스케일 프레이즈 — 블루스 곡은 자주, 스윙·라틴 곡도 가끔(조성 안의 화음 구간에서만 — 음 선택 때 판정) */
    if(topic==='auto'&&diff>=2&&opts.blues!==false){const pb=songType==='blues'?0.35:(feel==='ballad'?0.06:0.14);phrases.forEach(ph=>{if(!ph.song&&rng()<pb)ph.blues=true})}
  }
  const songRhythm=need=>{
    const al=ALLOWED[diff],L=need>=BPB+2?BPB:2;
    const lib=(SONG_CELLS[L]||SONG_CELLS[2]).filter(c=>c.every(k=>al[k]));
    const toks=[],cellOf=[];let cur=null,ci=0,id=-1;
    while(toks.length<need){
      if(cur===null||rng()>0.7){id=Math.floor(rng()*lib.length);cur=lib[id]}
      cur.forEach((k,q)=>{if(toks.length<need){toks.push(k);cellOf.push({c:ci,id,q})}});ci++;
    }
    if(!NOTE_TOK[toks[0]])toks[0]='Q';
    if(toks[toks.length-1]==='R')toks[toks.length-1]='Q';
    return {toks,cellOf};
  };

  /* 직접 작성한 템플릿과 실측 마르코프 전이는 별개 경로로 유지한다. */
  /* ── ③ 리듬 생성(박 단위 마르코프 + 프레이즈 템플릿) ── */
  const RH=PF?PF.rhy:null;
  const transRow=(bp,prev)=>{
    if(!RH)return {Q:1,E:2,H:0.6,R:0.4,Uh:0.6,Ur:0.4,T:0.2};
    const rows=RH[String(rhythmBeatRow(bp))]||RH['1'];
    const row=rows[prev]||rows.E,o={};
    TOK.forEach((t,i)=>{const k=t==='Tr'?'T':t;o[k]=(o[k]||0)+row[i]*(t==='Tr'?0.5:1)});
    return o;
  };
  /* v0.33 리듬 v2 — WJD 박 토큰 2차 전이(전체) × 프로필 1차 전이 기울기. 난이도 2·3에서 기본 */
  const R2=SD&&SD.rhy2&&diff>=2&&opts.rhythmV2!==false?SD.rhy2:null;
  const r2Bi=R2?(R2.bi[styleId]||R2.bi.all):null;
  const transRow2=(bp,p2,p1,isFirst)=>{
    const b=String(rhythmBeatRow(bp)),T2=R2.tok,o={};
    if(isFirst){const f=R2.first[b];T2.forEach((t,i)=>o[t]=f[i]);return o}
    const tri=R2.tri[b+p2+'|'+p1],all=R2.bi.all[b+p1],pr=r2Bi[b+p1];
    const base=tri||all||pr;
    if(!base){T2.forEach(t=>o[t]=t==='E'?2:1);return o}
    T2.forEach((t,i)=>{
      let w=base[i];
      if(pr&&all&&all[i]>0)w*=Math.min(2,Math.max(0.5,pr[i]/all[i]));   /* 연주자 기울기 */
      o[t]=w;
    });
    return o;
  };
  const events=[]; /* {t,d,midi,trip,ph,strong,first,last} */
  const tripRep=new Set();   /* v0.34 앞 박 셋잇단 음형을 되풀이할 박 */
  const hlBlocks=new Set();let hlSeq=0;   /* v0.35 하이라이트 장치를 쓴 4마디 블록 */
  const tripTilt=PF&&STYLE_DATA.profiles.all?Math.min(1.8,Math.max(0.3,PF.stats.trip/STYLE_DATA.profiles.all.stats.trip)):1;   /* 셋잇단을 즐겨 쓰는 연주자일수록 쌍이 잦다 */
  let motif=null;
  phrases.forEach((ph,pi)=>{
    const toks=[];
    const secIdx=sectionIndex(ph.s*6,P,BPB),role=roles[secIdx]||'statement';
    if(ph.song){const r=songRhythm(ph.e-ph.s+1);toks.push(...r.toks);ph.cellOf=r.cellOf;tag(Math.floor(ph.s/BPB),'노래 프레이즈')}
    const recall=!ph.song&&motif&&role==='answer'&&ph.s%(P*BPB)<BPB&&rng()<0.65;
    /* v0.27 프레이즈 리듬 템플릿 선택 */
    let tpl=null;
    const need=ph.e-ph.s+1;
    if(diff>=2&&!R2&&!recall&&!ph.song&&need>=4&&rng()<0.55){
      tpl=fitRhythmTemplate(RHY_TPL[Math.floor(rng()*RHY_TPL.length)],need,diff,FP,rng,densityAt(ph.s));
      tag(Math.floor(ph.s/BPB),'리듬 템플릿');
    }
    /* v0.34 8분 라인 — 가끔 1~2마디를 8분음표로 쭉 이어 가는 구간(비밥 라인). 마지막 박은 착지용으로 비워 둔다 */
    let lineS=-1,lineE=-1,hl=null;
    const eighthTilt=PF&&STYLE_DATA.profiles.all?Math.min(1.8,Math.max(0.4,Math.pow(PF.stats.eighth/STYLE_DATA.profiles.all.stats.eighth,6))):1;   /* 8분 비율이 높은 연주자일수록 라인이 잦다 */
    /* v0.35 하이라이트 장치 — 4마디 블록마다 최대 하나. line(8분 라인)·perc(한 음 리듬 반복)·pivot(피벗 패턴)·hemiola(3음 시퀀스)·trip(셋잇단 런) */
    {
      const blk=Math.floor(ph.s/(BPB*4));
      if(R2&&!recall&&!ph.song&&!ph.blues&&need>=6&&diff>=2&&topic==='auto'&&!hlBlocks.has(blk)&&rng()<(diff===2?0.5:0.6)){
        const pool=[{v:'line',w:1.3*eighthTilt},{v:'perc',w:0.8},{v:'pivot',w:0.9},{v:'hemiola',w:0.9}];
        if(diff>=3)pool.push({v:'trip',w:0.8*tripTilt});
        const kind=pickW(rng,pool),s0=ph.s+1;   /* 첫 박은 실측 분포(엇박 진입이 많다)에 맡긴다 */
        let len=0,cells=0;
        if(kind==='line')len=need>=10&&rng()<0.6?BPB*2:BPB;
        else if(kind==='perc')len=need>=10&&rng()<0.5?BPB*2:BPB;
        else if(kind==='pivot')len=4;
        else if(kind==='hemiola'){cells=Math.min(4,Math.floor(((ph.e-s0)*2-1)/3));len=Math.ceil((cells*3+1)/2)}
        else if(kind==='trip')len=rng()<0.5?2:3;
        if(len>0&&s0+len<=ph.e&&(kind!=='hemiola'||cells>=2)){
          hl={kind,s:s0,e:s0+len,cells,id:++hlSeq,chromatic:kind==='hemiola'&&diff>=3&&rng()<0.25,dir:rng()<0.65?1:-1};
          hlBlocks.add(blk);
          if(kind==='line'){lineS=s0;lineE=s0+len}
          tag(Math.floor(s0/BPB),HL_LABEL[kind]);
        }
      }
    }
    let prev='R',prev2='R',tripNext=false;
    for(let bt=ph.s;bt<=ph.e&&!ph.song;bt++){
      const bp=(bt%BPB)+1,isFirst=bt===ph.s,isLast=bt===ph.e;
      if(recall&&bt-ph.s<motif.toks.length){
        const k=rhythmToken(motif.toks[bt-ph.s],prev,isFirst,diff,FP,rng,densityAt(bt));
        toks.push(k);prev2=prev;prev=k;continue;
      }
      let k;
      if(hl&&bt>=hl.s&&bt<hl.e){
        if(hl.kind==='line'||hl.kind==='pivot'||hl.kind==='hemiola')k='E';
        else if(hl.kind==='trip')k='T';
        else{   /* perc: 당김음 섞인 온셋 위주, 이어짐(H)은 없다 */
          const pw=[{v:'E',w:1},{v:'Ur',w:1.2},{v:'Qs',w:1.3},{v:'Q',w:0.5},{v:'Uh',w:CUT_TOK[prev]?0:1.1}].filter(x=>x.w>0&&ALLOWED[diff][x.v]);
          k=pickW(rng,pw);
        }
        toks.push(k);prev2=prev;prev=k;tripNext=false;continue;
      }
      if(tripNext&&!isLast){k='T';tripNext=false;tripRep.add(bt);toks.push(k);prev2=prev;prev=k;continue}
      tripNext=false;
      if(tpl){k=tpl[bt-ph.s]||'Q'}
      else{
      const row=R2?transRow2(bp,prev2,prev,isFirst):transRow(bp,prev),al=ALLOWED[diff];
      const c=[];
      for(const k2 in row){
        if(!al[k2])continue;
        let w=row[k2];
        const density=densityAt(bt);
        if(k2==='T')w*=FP.T*density*density;else if(k2==='E')w*=FP.E*density*density;else if(k2==='Q'||k2==='Qs'||k2==='H')w*=FP.QH/density;
        if(isFirst&&!NOTE_TOK[k2])continue;
        if(isFirst&&k2==='Uh')continue;
        if(!isFirst&&k2==='R')w*=0.25;
        if(isLast&&!(k2==='Q'||k2==='Qs'||k2==='E'||k2==='Uh'||(k2==='Ur'&&diff>=2)))continue;
        if((k2==='H'||k2==='Uh')&&CUT_TOK[prev])continue;
        if(diff===2&&k2==='E')w*=0.8;
        if(diff===2&&k2==='T')w=0;
        if(topic==='ct'){if(k2==='E')w*=2.5;else if(k2==='H')w*=0.5;else if(k2==='T')w*=0.6}   /* v0.36 코드톤 주제: 정박·엇박 구조가 들리도록 8분 위주 */
        if(diff===1&&k2==='H'&&bp%2===1)w*=0.5;
        if(role==='contrast'&&(k2==='E'||k2==='T'))w*=1.15;
        if(role==='resolution'&&(k2==='H'||k2==='Q'))w*=1.2;
        c.push({v:k2,w});
      }
      k=c.length?pickW(rng,c):'Q';
      }
      /* v0.34 셋잇단 쌍 — 셋잇단 뒤에 한 박 더 셋잇단(같은 음형 반복 → 6연음 느낌) */
      if(k==='T'&&R2&&diff>=3&&bt+1<ph.e&&!(bt+1>=lineS&&bt+1<lineE)&&rng()<0.35*tripTilt)tripNext=true;
      toks.push(k);prev2=prev;prev=k;
    }
    if(!motif&&ph.e-ph.s>=3)motif={toks:toks.slice(0,Math.min(6,toks.length)),pi};
    if(recall){ph.recall=true;tag(Math.floor(ph.s/BPB),'모티프 회상(리듬)')}
    /* 토큰 → 음 이벤트 */
    const phEv=[];
    toks.forEach((k,j)=>{
      const t=(ph.s+j)*6;
      const lastEv=phEv[phEv.length-1];
      if(k==='Q')phEv.push({t,d:6});
      else if(k==='Qs')phEv.push({t,d:3});
      else if(k==='E'){phEv.push({t,d:3});phEv.push({t:t+3,d:3})}
      else if(k==='Ur'){phEv.push({t:t+3,d:3})}
      else if(k==='Uh'){if(lastEv&&lastEv.t+lastEv.d===t&&!lastEv.trip)lastEv.d+=3;phEv.push({t:t+3,d:3})}
      else if(k==='T'){const rp=tripRep.has(ph.s+j);phEv.push({t,d:2,trip:1,rep:rp?1:0,repK:0});phEv.push({t:t+2,d:2,trip:1,rep:rp?1:0,repK:1});phEv.push({t:t+4,d:2,trip:1,rep:rp?1:0,repK:2})}
      else if(k==='H'){if(lastEv&&lastEv.t+lastEv.d===t&&!lastEv.trip)lastEv.d+=6}
    });
    if(!phEv.length)return;
    if(hl){let k=0;phEv.forEach(ev=>{if(ev.t>=hl.s*6&&ev.t<hl.e*6){ev.hl=hl;ev.hlK=k++;if(hl.chromatic)ev.hlx=true}})}
    if(ph.song)phEv.forEach((ev,k)=>{ev.song=true;ev.songK=k;ev.sc=ph.cellOf[Math.max(0,Math.min(ph.cellOf.length-1,Math.floor(ev.t/6)-ph.s))]});
    if(ph.blues)phEv.forEach((ev,k)=>{ev.blu=true;ev.bluK=k});
    /* 프레이즈 끝음 — 길게(1~2박 더) */
    const le=phEv[phEv.length-1];
    if(!le.trip){
      if(ph.final)le.d+=Math.max(0,TOT-(le.t+le.d));
      else if(ph.song)le.d=Math.max(le.d,12);   /* 노래 프레이즈 끝음은 길게 — 숨은 다음 쉼표에서 */
      else if(R2){   /* v0.33 실측 끝음 길이(8분 단위): 짧게 끊는 끝이 대부분 */
        const L=pickW(rng,R2.lastLen.map((w,i)=>({v:i+1,w:i<4?w:w*0.5})));
        le.d=Math.max(le.d,Math.min(L*3,12));
        if(le.d<3)le.d=3;
      }else le.d+=rng()<0.6?6:(rng()<0.5?3:0);
    }
    phEv.forEach((e,k)=>{e.ph=pi;e.strong=e.t%6===0;e.first=k===0;e.last=k===phEv.length-1;e.midi=null;events.push(e)});
    if(phEv[0].t%6!==0)tag(Math.floor(phEv[0].t/TPB),'픽업 진입');
  });
  /* 겹침 제거 */
  events.sort((a,b)=>a.t-b.t);
  for(let i=0;i<events.length-1;i++)if(events[i].t+events[i].d>events[i+1].t)events[i].d=Math.max(1,events[i+1].t-events[i].t);
  for(const e of events)if(e.t+e.d>TOT)e.d=TOT-e.t;
  /* v0.20: 2마디 이상 완전 쉼 구간 금지 — 프레이즈 끝 쉼+시작 쉼이 붙어 긴 공백이 생기면
     한가운데(다음 마디 첫박)에 강박 음을 하나 삽입한다. 곡 맨 끝 쉼은 그대로 둔다 */
  {
    let lastEnd=0;const ins=[];
    for(const e of events){
      if(e.t-lastEnd>=BPB*12-2)ins.push({t:Math.round((lastEnd+BPB*6)/6)*6,d:6});
      if(e.t+e.d>lastEnd)lastEnd=e.t+e.d;
    }
    for(const sv of ins){sv.strong=true;sv.trip=false;sv.midi=null;
      sv.ph=phrases.findIndex(q=>q.s*6<=sv.t&&sv.t<(q.e+1)*6);if(sv.ph<0)sv.ph=Math.max(0,phrases.findIndex(q=>q.s*6<=sv.t));
      sv.first=true;sv.last=false;sv.d=Math.min(sv.d,6);events.push(sv)}
    if(ins.length){events.sort((a,b)=>a.t-b.t);
      for(let i=0;i<events.length-1;i++)if(events[i].t+events[i].d>events[i+1].t)events[i].d=Math.max(1,events[i+1].t-events[i].t);
      for(const e of events)if(e.t+e.d>TOT)e.d=TOT-e.t;}
  }

  /* ── v0.40 한 마디 릭(리듬 포함) — Ⅴ7 한 마디 → 다음 마디 Ⅰ 착지 자리에 릭 사전(engine/licks.js)의 리듬을 넣는다.
     음높이는 음 선택 단계(planLick)에서 앞 음·음역에 맞춰 옥타브만 고른다. 실패하면 그 리듬 그대로 일반 음 선택. */
  const lickPlan=[];
  if(typeof CURATED_LICKS!=='undefined'&&opts.useLicks!==false&&opts.barLicks!==false&&BPB===4&&(topic==='auto'||topic==='alt')&&diff>=2){
    const rate=topic==='alt'?0.6:(LICK_RATE[diff]||0),perCh=[0];
    for(let b=0;b<NB-1&&rate>0;b++){
      const t0=b*TPB,t1=t0+TPB,s0=segAt(t0);
      if(segAt(t1-1)!==s0||segs[s0].t0!==t0)continue;
      const sg=segs[s0],nxI=segAt(t1),nx=segs[nxI];
      if(!nx||nx.t0!==t1||mod12(nx.root-sg.root)!==5)continue;
      const pool=CURATED_LICKS.filter(L=>!(L.minDiff&&diff<L.minDiff)&&L.cls.includes(sg.cls)&&L.to.includes(nx.cls==='domalt'?'dom':nx.cls)&&L.tr===5);
      if(!pool.length)continue;
      const inBar=events.filter(e=>e.t>=t0&&e.t<t1);
      if(!inBar.length)continue;
      const P=inBar[0].ph,ph=phrases[P];
      if(!ph||ph.song||ph.blues||ph.quote||inBar.some(e=>e.ph!==P||e.song||e.blu||e.hl||e.quote))continue;
      if(!events.some(e=>e.ph===P&&e.t<t0))continue;   /* 프레이즈가 이 마디 앞에서 이미 시작돼 있어야(첫 음 표시 유지) */
      /* 착지음: 다음 마디 첫 박에 같은 프레이즈 음이 있으면 그 음, 없으면(프레이즈가 여기서 끝나면) 새로 만든다 */
      let tgt=events.find(e=>e.t===t1),newT=null;
      if(tgt){if(tgt.ph!==P||tgt.song||tgt.blu||tgt.hl||tgt.quote)continue}
      else{
        const nxE=events.filter(e=>e.t>t1).reduce((a,e)=>a===null||e.t<a.t?e:a,null);
        const room=(nxE?nxE.t:TOT)-t1;if(room<6)continue;
        newT={t:t1,d:Math.min(12,room),ph:P,strong:true,first:false,last:!(nxE&&nxE.ph===P),midi:null};
      }
      if(perCh[0]>=LICK_MAX_PER_CHORUS)continue;
      if(rng()>=rate)continue;
      const L=pool[Math.floor(rng()*pool.length)];
      for(let i=events.length-1;i>=0;i--)if(events[i].t>=t0&&events[i].t<t1)events.splice(i,1);
      const id=lickPlan.length;
      L.n.forEach(([dt,d],k)=>events.push({t:t0+dt,d,ph:P,strong:(t0+dt)%6===0,trip:d===2?1:undefined,first:false,last:false,midi:null,lick:id,lickK:k}));
      if(newT){events.push(newT);tgt=newT}
      tgt.lickT=id;lickPlan.push({L,bar:b,root:sg.root});perCh[0]++;
    }
    if(lickPlan.length){events.sort((a,b)=>a.t-b.t);for(let i=0;i<events.length-1;i++)if(events[i].t+events[i].d>events[i+1].t)events[i].d=Math.max(1,events[i+1].t-events[i].t)}
  }

  /* v0.21 헤드 인용 — 사용자가 직접 입력한 2~4마디를 원래 마디 위치에 넣는다(멜로디는 앱에 수록하지 않음).
     opts.quote={startBar, notes:[{t,d,midi,trip}]} · 원조(keyPc) 기준 음높이, 악기 음역에 맞게 옥타브만 이동 */
  let quoteInfo=null;
  if(opts.quote&&opts.quote.notes&&opts.quote.notes.length){
    const q=opts.quote,qs=Math.max(0,Math.min(NB-1,(q.startBar|0)))*TPB;
    const qn=q.notes.filter(n=>qs+n.t<TOT).map(n=>Object.assign({},n,{d:Math.min(n.d,TOT-(qs+n.t))}));
    const mids=qn.filter(n=>n.midi!==null).map(n=>n.midi);
    if(mids.length){
      const qe=qs+Math.max(...qn.map(n=>n.t+n.d));
      for(let i=events.length-1;i>=0;i--){const e=events[i];if(e.t<qe+3&&e.t+e.d>qs-3)events.splice(i,1)}
      const srt=mids.slice().sort((a,b)=>a-b),med=srt[srt.length>>1];
      let sh=0,bc=1e9;
      for(let o=-36;o<=36;o+=12){const over=mids.reduce((a,m)=>a+Math.max(0,LO-(m+o))+Math.max(0,m+o-HI),0);const c=over*10+Math.abs(med+o-70)*0.5;if(c<bc){bc=c;sh=o}}
      const qph=phrases.length;phrases.push({s:Math.floor(qs/6),e:Math.floor((qe-1)/6),quote:true});
      const notesQ=qn.filter(n=>n.midi!==null);
      notesQ.forEach((n,k)=>{
        let m=n.midi+sh;while(m<LO)m+=12;while(m>HI)m-=12;
        const ev={t:qs+n.t,d:n.d,midi:null,ph:qph,strong:(qs+n.t)%6===0,first:k===0,last:k===notesQ.length-1,quote:true,qm:m};
        if(n.trip)ev.trip=1;
        events.push(ev);
      });
      events.sort((a,b)=>a.t-b.t);
      for(let i=0;i<events.length-1;i++)if(!events[i].quote&&events[i].t+events[i].d>events[i+1].t)events[i].d=Math.max(1,events[i+1].t-events[i].t);
      quoteInfo={bar:qs/TPB,bars:Math.ceil((qe-qs)/TPB),notes:notesQ.length};
      for(let b=qs/TPB;b<Math.ceil(qe/TPB);b++)tag(b,'테마 인용');
    }
  }

  const phDev=phrases.map(ph=>ph.quote?'quote':(topic==='auto'?null:topic));
  /* v0.23 활용 스케일 — 프레이즈마다 변형(기본/리디안♭7·리디안/얼터드·블루노트/하모닉마이너5·멜로딕)을 시드로 고른다 */
  const phVar=phrases.map(()=>topic==='dom'?Math.floor(rng()*4):0);
  const clsOf=seg=>TYPE_CLS[seg.type]||'dom';
  const matScaleOf=(ph,seg)=>{const L=SCALE_VARIANTS[clsOf(seg)]||SCALE_VARIANTS.dom;return L[Math.min(phVar[ph],L.length-1)]};
  const matName=(ph,seg)=>{const L=VARIANT_NAME[clsOf(seg)]||[];return L[Math.min(phVar[ph],L.length-1)]||'변형 스케일'};
  const matOK=(seg,m,ph)=>{const dev=phDev[ph];if(!dev||dev==='chrom'||dev==='quote')return true;
    if(dev==='ct')return isCT(seg,m)||inScale(seg,m);
    if(dev==='gt')return isGuide(seg,m);
    if(dev==='scale')return inScale(seg,m);
    const rel=mod12(m-seg.root);
    if(dev==='penta')return (PENTA[clsOf(seg)]||PENTA.dom).includes(rel);
    if(dev==='dom')return matScaleOf(ph,seg).includes(rel);
    return true};

  /* ── ②⑤ 음 선택 ── */
  const ivP=PF?PF.iv:null;
  const ivW=d=>{if(d<-12||d>12)return 0.0005;return ivP?ivP[d+12]+0.002:Math.exp(-Math.abs(d)/2.5)};
  const pcW=(seg,rel,strong)=>{
    if(!PF)return 1;
    const tab=PF.pc[seg.cls]||PF.pc[TYPE_CLS[seg.type]];
    return (tab[strong?'on':'off'][rel]||0.001)+0.004;
  };
  const inScale=(seg,m)=>seg.scale.includes(mod12(m-seg.root));
  const isCT=(seg,m)=>seg.ct.includes(mod12(m-seg.root));
  const isTens=(seg,m)=>seg.tens.includes(mod12(m-seg.root));
  const isGuide=(seg,m)=>seg.guide.includes(mod12(m-seg.root));
  /* v0.29 안정음(뿌리·3음·5음) — 프레이즈 첫 음과 마디 첫 박 착지에 우선. 실제 연주 악보에서 마디 첫 음은 3·1·5음이 대부분 */
  const isStable=(seg,m)=>{const r=mod12(m-seg.root);return seg.ct.includes(r)&&(r===0||r===3||r===4||r===6||r===7||r===8)};
  const STABLE=opts.stableStart!==false;
  let firstStrict=true;
  const isMain=(seg,m)=>{const r=mod12(m-seg.root);return seg.ct.includes(r)||(PENTA_REL[seg.cls]||[]).includes(r)};
  const PERSONA=opts.persona!==false&&!!PF&&styleId!=='all';   /* v0.28 연주자 개성 강조: 프로필 편차를 한 단계 증폭 */
  const chromF=PF?(PERSONA?Math.min(2.4,Math.max(0.35,Math.pow(PF.stats.chrom/0.2,1.6))):Math.min(1.6,Math.max(0.6,PF.stats.chrom/0.2))):1;
  const ctLoose=PERSONA?Math.exp(7*(0.66-PF.stats.ctOn)):1;   /* 강박에 코드톤이 아닌 메인 음(9·6음 등)을 얼마나 허용하나 */
  const cellRate=PF?(0.18+0.5*(PF.stats.eighth-0.68)):0.2;

  const forced=new Map(); /* 이벤트 인덱스 → {m,kind} */
  events.forEach((e,i)=>{if(e.quote)forced.set(i,{m:e.qm,kind:'quote'})});
  let prevM=null,prev2M=null,lastDir=-1,gapFill=0;
  const recentM=[];   /* v0.34 최근 음 {m,ph} — 반전 도약 조건 */
  const contour={};

  const arcOffset=t=>{
    if(ARC.n<=1)return 0;
    if(ARC.i>=ARC.n-1&&t>=TOT-BPB*12)return -6;
    return -3+9*ARC.i/Math.max(1,ARC.n-1);
  };
  const pitchGoal=t=>(contour.goal?contour.goal(t):centerAt(t))+arcOffset(t);
  /* 앞 코드의 7음 → 새 코드의 3음 반음 해결(가능한 음역/도약 안에서만). */
  const resolvesGuide=(seg,m,ref,from)=>ref!==null&&from&&from!==seg&&
    [10,11].includes(mod12(ref-from.root))&&[3,4].includes(mod12(m-seg.root))&&Math.abs(m-ref)===1;
  function pitchCands(i,e,seg,mode){
    const out=[];
    for(let m=LO;m<=HI;m++){
      if(!allow(m,e.t))continue;
      const rel=mod12(m-seg.root);
      const ct=isCT(seg,m),sc=inScale(seg,m),tn=isTens(seg,m);
      const dev=phDev[e.ph];
      if(!matOK(seg,m,e.ph))continue;
      if(STABLE&&firstStrict&&e.first&&!dev&&!isStable(seg,m))continue;   /* 프레이즈 첫 음: 7음·어프로치로 시작하지 않는다 */
      if(dev==='alt'&&seg.cls==='dom'&&!ct&&!ALT_SCALE.includes(rel))continue;
      let w;
      const mn=isMain(seg,m);
      const heavy=e.strong||e.d>=6;   /* 강박 또는 1박 이상 지속 = 마디의 '메인 음' */
      if(diff===1){if(!ct)continue;w=pcW(seg,rel,true)}
      else if(diff===2){
        if(heavy){if(!mn)continue;w=pcW(seg,rel,true)*(ct?1.6:0.7)}
        else{if(!sc&&!ct)continue;w=pcW(seg,rel,false)*(mn?1.25:1)}
        if(seg.type==='maj7'&&rel===5)w*=0.1; /* 장7 위 4음(어보이드) */
      }else{
        if(!sc&&!ct){
          if(heavy||prevM===null||Math.abs(m-prevM)!==1)continue; /* 크로매틱은 약박·짧은 음·반음 진행만 */
          const nxE=events[i+1];
          if(e.last||e.first||!nxE||nxE.ph!==e.ph||nxE.t!==e.t+e.d||nxE.trip!==e.trip)continue;   /* v0.35 바로 이어지는 음이 있어야 해결 가능 */
          const dir=Math.sign(m-prevM),nx=m+dir;
          if(!isMain(seg,nx))continue;                             /* 반드시 메인 음으로 해결 */
          w=pcW(seg,rel,false)*0.9*chromF;
        }else if(heavy){if(!mn&&!tn)continue;w=pcW(seg,rel,true)*(ct?1.5:(mn?0.8:0.25))}
        else w=pcW(seg,rel,false)*(mn?1.2:1);
        if(seg.type==='maj7'&&rel===5)w*=0.1;
      }
      if(diff>=2){
        if(heavy&&!ct)w*=FP.heavyCT;          /* 장르별: 강박·긴 음은 코드톤으로 */
        if(heavy&&!ct&&PERSONA)w*=ctLoose;
        if(gapFill>0&&prevM!==null){const dd=m-prevM;if(dd<0&&dd>=-4)w*=3;else if(dd>=0)w*=0.3}   /* 도약 뒤 반대 방향 순차로 메우기 */
        if(!heavy&&ct)w*=FP.ctW;
        if(!sc&&!ct)w*=FP.chrom*(dev==='chrom'?5:1);
        if(dev==='ct'&&!heavy&&!ct)w*=0.3;
        if(dev==='chrom'&&sc&&!ct)w*=0.6;
      }
      if(songType==='blues'){const kr=mod12(m-keyPc);
        if(!heavy&&(kr===3||kr===6||kr===10))w*=2.6;          /* 약박 블루노트(b3·b5·b7) 강조 */
        else if(heavy&&(kr===3||kr===6||kr===10))w*=0.55;}    /* 강박에도 블루노트 허용(억제 완화) */
      if(songType==='modal'){const pr=PENTA[seg.cls]||PENTA.dom;
        if(pr.includes(rel)&&!heavy)w*=1.6;                   /* 모달: 펜타토닉 중심 */
        if(!sc&&!ct)w*=0.4;}
      if(songType==='rhythm'&&ct)w*=(roles[sectionIndex(e.t,P,BPB)]==='contrast'?1.7:1.2);  /* 브리지(contrast)=도미넌트 순환 코드톤 주도 */
      w*=groupFit(m,e.t);
      if(prevM!==null){
        const d=m-prevM;
        if(Math.abs(d)>MAXLEAP)continue;
        w*=Math.pow(ivW(d),0.9);
        if(d!==0&&Math.sign(d)===lastDir&&Math.abs(d)<=3)w*=1.2; /* 라인의 방향 지속 */
        if(d===0)w*=diff===1?0.18:0.3;                          /* 같은 음 반복 억제(WJD 실측 4%) */
        if(prev2M!==null&&m===prev2M&&d!==0&&diff>=2)w*=0.6;     /* 지그재그(A-B-A) 억제 */
        if(Math.abs(d)>=5&&e.first)w*=0.6;
      }
      if(e.d>=6){
        const s2=segs[segAt(Math.min(TOT-1,e.t+e.d-1))];
        if(s2!==seg&&!isMain(s2,m))continue;
      }
      /* 음형 목표(프레이즈 아치/하행) */
      const g=pitchGoal(e.t);
      if(dev==='gt'&&i>0&&resolvesGuide(seg,m,prevM,segs[segAt(events[i-1].t)]))w*=12;
      const dg=m-g;w*=Math.exp(-(dg*dg)/(2*(diff===1?4.5:6)*(diff===1?4.5:6)));
      if(mode==='end'){if(!ct&&!(tn&&seg.cls!=='domalt'))continue;w*=(rel===0||isGuide(seg,m)||rel===7)?1.5:1}
      if(w>0)out.push({v:m,w});
    }
    return out;
  }
  function chooseTarget(seg,t,ref,ph,from){
    const c=[];
    for(let m=LO;m<=HI;m++){
      if(!allow(m,t)||!matOK(seg,m,ph)||!isCT(seg,m)&&!(diff===3&&isTens(seg,m)&&seg.cls==='domalt'))continue;
      const d=ref===null?0:m-ref;
      if(Math.abs(d)>Math.min(MAXLEAP,diff===1?5:6))continue;
      let w=pcW(seg,mod12(m-seg.root),true)*groupFit(m,t);
      if(isGuide(seg,m))w*=3.2;
      if(STABLE&&!phDev[ph]&&t%TPB===0&&isCT(seg,m)){const r3=mod12(m-seg.root);if(!isStable(seg,m))w*=0.4;else if(r3===3||r3===4)w*=2.4}   /* 마디 첫 박 착지는 7음보다 3음(·1·5음) */
      if(Math.abs(d)===1)w*=2.6;else if(Math.abs(d)===2)w*=1.8;else if(d===0)w*=diff===1?0.35:0.15;
      if(phDev[ph]==='gt'&&resolvesGuide(seg,m,ref,from))w*=12;
      const g=pitchGoal(t);w*=Math.exp(-((m-g)*(m-g))/72);
      c.push({v:m,w});
    }
    return c.length?pickW(rng,c):null;
  }
  const okNote=(m,t,ref)=>m!==null&&allow(m,t)&&(ref===null||Math.abs(m-ref)<=MAXLEAP);
  /* 셀 배치(실측·교본) — 음형을 통째로 보존 */
  function tryCell(i){
    if(!useLicks||diff<2||!SD)return false;
    const e=events[i];
    if(phDev[e.ph])return false;
    if(e.trip||e.t%6!==0)return false;
    if(rng()>Math.min(0.75,0.45+cellRate))return false;
    const run=[0,1,2,3].map(k=>events[i+k]);
    if(run.some((x,k)=>!x||x.trip||x.ph!==e.ph||x.t!==e.t+3*k||x.d!==3||forced.has(i+k)))return false;
    const s0=segAt(e.t);if(segAt(e.t+11)!==s0)return false;
    const seg=segs[s0];
    const nxtE=events[i+4],seg2Idx=segAt(e.t+12),seg2=segs[seg2Idx];
    const canPair=nxtE&&nxtE.ph===e.ph&&nxtE.t===e.t+12&&seg2Idx!==s0&&!forced.has(i+4);
    let pool=[];
    for(const c of SD.cells){
      if(c.minDiff&&diff<c.minDiff)continue;
      const okCls=c.cls===seg.cls||(c.cls==='dom'&&seg.cls==='domalt'&&!c.to);
      if(!okCls)continue;
      if(c.to){
        if(!canPair)continue;
        const toCls=seg2.cls==='domalt'?'domalt':seg2.cls;
        if(!(c.to===toCls||(c.to==='dom'&&toCls==='domalt')))continue;
        if(mod12(seg2.root-seg.root)!==c.tr)continue;
      }
      if(diff===2&&c.iv.slice(0,3).some((v,k)=>{const p=c.s+c.iv.slice(0,k+1).reduce((a,b)=>a+b,0);return !seg.scale.includes(mod12(p))&&!seg.ct.includes(mod12(p))}))continue;
      pool.push({v:c,w:(c.src==='WJD'?Math.log(1+c.np)*(c.to?1.6:1):1.6)*(c.to?2:1)});
    }
    if(!pool.length)return false;
    const c=pickW(rng,pool);
    const base=seg.root+c.s;
    const ref=prevM===null?centerAt(e.t):prevM;
    let best=null;
    for(let o=-3;o<=3;o++){
      const st=mod12(base)+12*(Math.floor(ref/12)+o);
      if(prevM!==null&&Math.abs(st-prevM)>Math.min(MAXLEAP,5))continue;
      const ms=[st];for(const v of c.iv)ms.push(ms[ms.length-1]+v);
      if(ms.some((m,k)=>!allow(m,e.t+3*k)))continue;
      if(c.to&&!(isCT(seg2,ms[4])||isTens(seg2,ms[4])))continue;
      const sc=Math.abs(st-ref)+(ms.every((m,k)=>groupFit(m,e.t+3*k)===1)?0:6);if(!best||sc<best.sc)best={ms,sc};
    }
    if(!best)return false;
    best.ms.forEach((m,k)=>forced.set(i+k,{m,kind:k===4?'target':'cell'}));
    const nm=(c.src==='WJD'?'실측 셀: ':'교본 어휘: ')+c.name+(c.src==='WJD'?' ('+c.np+'명 공통)':'');
    tag(Math.floor(e.t/TPB),nm);lickUse[c.id||c.name]=(lickUse[c.id||c.name]||0)+1;stats.cells++;
    return true;
  }
  /* 다음 코드 다운비트 타깃 + 어프로치 역산 */
  function planApproach(i){
    const e=events[i];const dev=phDev[e.ph];
    let j=-1;
    for(let k=i+1;k<=i+3&&k<events.length;k++){
      if(events[k].ph!==e.ph)break;
      if(segAt(events[k].t)!==segAt(events[k-1].t)&&events[k].t===segs[segAt(events[k].t)].t0){j=k;break}
    }
    if(j<0||forced.has(j)||motifLock.has(j))return;
    const seg2=segs[segAt(events[j].t)];
    const T=chooseTarget(seg2,events[j].t,prevM,events[j].ph,segs[segAt(e.t)]);
    if(T===null)return;
    forced.set(j,{m:T,kind:'target'});stats.targets++;
    const gap=j-i;
    const ap1=events[j-1],ap2=events[j-2];
    const segA=segs[segAt(ap1?ap1.t:0)];
    const opts=[];
    if(diff>=2&&gap>=2&&!forced.has(j-1)&&!ap1.trip){
      opts.push({v:'chrB',w:1.4*FP.chrom},{v:'chrA',w:(diff===3?0.9:0.3)*FP.chrom},{v:'stepA',w:1.2},{v:'stepB',w:0.8});
      if(diff===3&&gap>=3&&!forced.has(j-2)&&!ap2.trip&&ap2.ph===e.ph)opts.push({v:'enc',w:1.6*(dev==='chrom'?2:1)},{v:'encC',w:0.8*FP.chrom*(dev==='chrom'?2:1)});
      if(diff===2&&gap>=3&&!forced.has(j-2)&&ap2.ph===e.ph)opts.push({v:'enc',w:0.6});
    }
    if(dev&&dev!=='chrom')for(let k=opts.length-1;k>=0;k--)if(opts[k].v==='chrB'||opts[k].v==='chrA')opts.splice(k,1);
    if(dev==='ct')opts.length=0;   /* 코드톤 주제: 접근음·인클로저도 코드톤이 아니면 쓰지 않는다 */
    if(!opts.length)return;
    const kind=pickW(rng,opts);
    const scaleUp=m=>{for(let x=m+1;x<=m+3;x++)if(inScale(seg2,x)||isCT(seg2,x))return x;return m+2};
    const scaleDn=m=>{for(let x=m-1;x>=m-3;x--)if(inScale(seg2,x)||isCT(seg2,x))return x;return m-2};
    const refA=gap>=3?null:prevM;
    let seq=null;
    if(kind==='chrB')seq=[T-1];
    else if(kind==='chrA')seq=[T+1];
    else if(kind==='stepA')seq=[scaleUp(T)];
    else if(kind==='stepB')seq=[scaleDn(T)];
    else if(kind==='enc')seq=[scaleUp(T),T-1];
    else if(kind==='encC')seq=[T+1,T-1];
    /* 중급: 어프로치음이 앞 코드에서 너무 어긋나면(비스케일·강박) 스케일 어프로치로 */
    if(diff===2&&seq.length===1&&ap1.strong&&!inScale(segA,seq[0])&&!isCT(segA,seq[0]))seq=[scaleUp(T)];
    /* 어프로치음이 강박·긴 음 자리에 오면 그 코드의 메인 음일 때만 허용 */
    for(let k=0;k<seq.length;k++){
      const ev=events[j-seq.length+k],sA=segs[segAt(ev.t)];
      if(!matOK(sA,seq[k],ev.ph)||((ev.strong||ev.d>=6)&&!isMain(sA,seq[k])))return;
    }
    const startIdx=j-seq.length;
    for(let k=0;k<seq.length;k++)if(motifLock.has(startIdx+k))return;
    let ref=startIdx-1===i?prevM:null;
    for(let k=0;k<seq.length;k++){
      const ev=events[startIdx+k];
      if(!okNote(seq[k],ev.t,k===0?ref:seq[k-1]))return;
    }
    if(!okNote(T,events[j].t,seq[seq.length-1]))return;
    seq.forEach((m,k)=>forced.set(startIdx+k,{m,kind:k===seq.length-1&&seq.length===2?'enc2':(seq.length===2?'enc1':'appr')}));
    if(seq.length===2){stats.enc++;tag(Math.floor(events[j].t/TPB),'인클로저')}
    else if(Math.abs(seq[0]-T)===1){stats.appr++;tag(Math.floor(events[j].t/TPB),'반음 어프로치')}
    else tag(Math.floor(events[j].t/TPB),'스케일 어프로치');
  }


  /* v0.28 모티프 발전 — 프레이즈 첫머리 3~5음을 '앞 프레이즈의 모티프' 또는 '사용자 헤드의 조각'에서 가져와
     시퀀스(스케일 위 이동)·반진행(뒤집기)·반복(코드 맞춤)으로 변형해 놓는다. 사람 연주자의 "말 걸고 받아치기"를 흉내.
     음높이는 새 코드의 스케일/코드톤으로 끌어당기고(±1반음), 모든 규칙(음역·도약·메인 음)을 통과하지 못하면 포기한다. */
  const phNotes=[],motifLock=new Set(),motifLog=[];
  const motifRate=(opts.motif===false||diff===1)?0:(opts.motifRate!==undefined?opts.motifRate:(diff===2?0.6:0.8));
  const headFrags=(opts.headMotifs||[]).filter(f=>f&&Array.isArray(f.off)&&Array.isArray(f.d)&&f.off.length>=3&&f.off.length===f.d.length&&f.d.every(x=>x>0));
  const headRate=opts.headRate!==undefined?opts.headRate:0.5;   /* 헤드 조각이 있을 때 모티프 출처로 쓰는 비율 */
  /* v0.35 하이라이트 장치의 음높이 — 장치 첫 음에서 구간 전체를 정한다 */
  const scaleStep=(seg,m,n)=>{let x=m,d=Math.sign(n);for(let c=0;c<Math.abs(n);c++){let y=x+d;while(y>=LO-2&&y<=HI+2&&!(inScale(seg,y)||isCT(seg,y)))y+=d;x=y}return x};
  const fitTone=(seg,m,t)=>{for(let d=0;d<=4;d++)for(const x of [m-d,m+d])if(allow(x,t)&&(inScale(seg,x)||isCT(seg,x)))return x;return null};
  /* ── v0.36 코드톤 라인 계획(DP) ──
     두호 님 정의: 정박(다운비트)에는 코드톤(1·3·5·7), 엇박(업비트)은 그 사이를 잇는 경과음.
     스케일로 가다 정박이 어긋나면 반음 경과음을 넣어 다시 코드톤을 정박에 맞춘다(비밥 스케일 원리).
     코드가 바뀌는 첫 정박에는 새 코드의 가이드톤(3·7음)으로 착지. 구간 전체를 동적 계획법으로 한 번에 정한다. */
  function planCTPath(idx,o){
    o=o||{};
    const n=idx.length;if(n<1)return null;
    const P=[];for(let m=LO;m<=HI;m++)P.push(m);
    const info=idx.map((k,q)=>{
      const e=events[k],sg=segs[segAt(e.t)];
      const crossSeg=segAt(e.t+e.d-1)!==segAt(e.t)?segs[segAt(e.t+e.d-1)]:null;
      const strong=(e.t%6===0)||e.d>=6||!!crossSeg;
      const prevE=q>0?events[idx[q-1]]:null;
      const change=strong&&(q===0?(o.changeAtFirst!==false&&sg.t0===e.t):segAt(prevE.t)!==segAt(e.t));
      const nx=q+1<n?events[idx[q+1]]:null;
      const contig=nx&&nx.t===e.t+e.d;
      return {e,sg,crossSeg,strong,change,contig,goal:pitchGoal(e.t),last:q===n-1};
    });
    const allowed=(q,m)=>{
      const I=info[q],sg=I.sg;
      if(!allow(m,I.e.t))return false;
      if(I.strong){
        if(!isCT(sg,m))return false;
        if(I.crossSeg&&!isCT(I.crossSeg,m))return false;
        if(q===0&&o.stableFirst&&!isStable(sg,m))return false;
        return true;
      }
      if(I.last)return isCT(sg,m);
      if(inScale(sg,m)||isCT(sg,m))return true;
      return I.contig&&I.e.d<=3;   /* 반음 경과음: 다음 음으로 바로 반음 해결해야 하므로 짧고 이어질 때만 */
    };
    const chrom=(q,m)=>!inScale(info[q].sg,m)&&!isCT(info[q].sg,m);
    const jit=info.map(()=>P.map(()=>rng()*1.1));
    /* 상태 = (음, 진행 방향 -1/0/+1) */
    const INF=1e9,D=[-1,0,1];
    let cost=P.map(()=>D.map(()=>INF)),back=[];
    for(let a=0;a<P.length;a++){
      const m=P[a];if(!allowed(0,m))continue;
      let c=jit[0][a]+Math.abs(m-info[0].goal)*0.18;
      if(info[0].change&&!isGuide(info[0].sg,m))c+=o.guideHard?40:6;
      if(o.prev!==null&&o.prev!==undefined){const d=Math.abs(m-o.prev);if(d>MAXLEAP)continue;c+=d===0?3:d<=2?0:d<=4?1:3}
      cost[a][1]=c;
    }
    for(let q=1;q<n;q++){
      const nc=P.map(()=>D.map(()=>INF)),bk=P.map(()=>D.map(()=>null));
      const I=info[q],gap=I.e.t-(info[q-1].e.t+info[q-1].e.d);
      for(let b=0;b<P.length;b++){
        const m=P[b];if(!allowed(q,m))continue;
        let base=jit[q][b]+Math.abs(m-I.goal)*0.18;
        if(I.change&&!isGuide(I.sg,m))base+=o.guideHard?40:6;
        if(I.strong&&isGuide(I.sg,m))base-=0.4;
        for(let a=0;a<P.length;a++)for(let di=0;di<3;di++){
          const pc=cost[a][di];if(pc>=INF)continue;
          const pm=P[a],iv=m-pm,ab=Math.abs(iv);
          if(ab>MAXLEAP)continue;
          if(chrom(q-1,pm)&&(ab!==1||gap>0))continue;          /* 반음 경과음은 바로 반음으로 해결 */
          if(chrom(q,m)&&ab>2)continue;                         /* 반음 경과음으로는 순차로 들어간다 */
          let t=gap>=6?(ab===0?0.5:ab<=7?0.4:2):(ab===0?6:ab<=2?0:ab<=4?1.3:3.5);
          const nd=Math.sign(iv),dprev=D[di];
          if(gap<6&&nd!==0&&dprev!==0&&nd!==dprev)t+=ab<=2?0.6:0.2;   /* 방향 전환은 약간 비용(라인 유지) */
          if(chrom(q,m))t+=1.6;   /* 반음 경과음은 정렬에 필요할 때 위주로 */
          const v=pc+base+t,ndi=nd+1;
          if(v<nc[b][ndi]){nc[b][ndi]=v;bk[b][ndi]=[a,di]}
        }
      }
      cost=nc;back.push(bk);
    }
    let best=null;
    for(let b=0;b<P.length;b++)for(let di=0;di<3;di++)if(cost[b][di]<INF&&(!best||cost[b][di]<best.c))best={c:cost[b][di],b,di};
    if(!best)return null;
    const ms=new Array(n);let b=best.b,di=best.di;
    for(let q=n-1;q>=0;q--){ms[q]=P[b];if(q>0){const bb=back[q-1][b][di];b=bb[0];di=bb[1]}}
    return ms;
  }
  /* ── v0.39 노래 프레이즈 음 계획(동적 계획법) ──
     긴 음(점4분 이상·끝음) = 3·7음 우선, 9·13 텐션 허용(근음·5음은 비용) · 정박 짧은 음 = 코드톤/텐션 · 약박 = 스케일
     대부분 순차, 4도 이상 도약 뒤에는 반대 방향으로 메운다 · 프레이즈 전체는 아치(또는 하행·상행) 윤곽
     같은 리듬 셀이 되풀이되면 앞 셀의 음형을 옮겨 다음 화음에 맞춘다(동기 시퀀스) */
  const failSong=ph=>{const L=tagsAt[Math.floor(phrases[ph].s/BPB)],q=L?L.indexOf('노래 프레이즈'):-1;if(q>=0)L.splice(q,1);events.forEach(e=>{if(e.ph===ph)e.song=false})};
  /* v0.40 한 마디 릭 음높이 — 릭 사전의 음정 관계를 그대로, 옥타브만 앞 음·음역·음형 중심에 맞춘다 */
  function planLick(i){
    const e=events[i],P=lickPlan[e.lick];if(!P)return;
    const span=[];for(let k=i;k<events.length&&events[k].lick===e.lick;k++)span.push(k);
    const ti=events.findIndex(x=>x.lickT===e.lick);
    const ok=span.length===P.L.n.length&&ti>span[span.length-1];
    let best=null;
    if(ok)for(let o=-4;o<=4;o++){
      const base=mod12(P.root)+60+12*o,ms=P.L.n.map(x=>base+x[2]),mt=base+P.L.t;
      if(ms.some((m,q)=>!allow(m,events[span[q]].t))||!allow(mt,events[ti].t))continue;
      if(prevM!==null&&Math.abs(ms[0]-prevM)>MAXLEAP)continue;
      if(ms.some((m,q)=>q>0&&Math.abs(m-ms[q-1])>MAXLEAP)||Math.abs(mt-ms[ms.length-1])>MAXLEAP)continue;
      const sc=Math.abs((ms[0]+mt)/2-pitchGoal(e.t))+(prevM===null?0:0.5*Math.abs(ms[0]-prevM));
      if(!best||sc<best.sc)best={ms,mt,sc};
    }
    if(!best){span.concat(ti>=0?[ti]:[]).forEach(k=>{delete events[k].lick;delete events[k].lickT});return}
    span.forEach((k,q)=>{forced.set(k,{m:best.ms[q],kind:'lick'});motifLock.add(k);events[k].keep=true});
    forced.set(ti,{m:best.mt,kind:'lick'});motifLock.add(ti);events[ti].keep=true;
    tag(P.bar,'릭: '+P.L.name);stats.licks=(stats.licks||0)+1;lickUse[P.L.id]=(lickUse[P.L.id]||0)+1;
  }
  function planSong(i){
    const ph=events[i].ph,span=[];for(let k=i;k<events.length&&events[k].ph===ph;k++)if(events[k].song&&!events[k].quote)span.push(k);
    const n=span.length;if(n<2)return failSong(ph);
    const t0=events[span[0]].t,t1=events[span[n-1]].t+events[span[n-1]].d;
    const c0=Math.round(pitchGoal(t0)),A=3+Math.floor(rng()*3),shape=pickW(rng,[{v:'arch',w:3},{v:'desc',w:1.4},{v:'asc',w:0.8}]);
    const goal=t=>{const x=Math.max(0,Math.min(1,(t-t0)/Math.max(1,t1-t0)));return shape==='arch'?c0-A/2+A*Math.sin(Math.PI*x):shape==='desc'?c0+A/2-A*x:c0-A/2+A*x};
    const INF=1e9,fin=phrases[ph].final;
    const cl=(s,x)=>isGuide(s,x)?'g':isCT(s,x)?'c':(isTens(s,x)&&inScale(s,x))?'t':inScale(s,x)?'s':null;
    const nc=(q,m)=>{
      const e=events[span[q]];if(!allow(m,e.t))return INF;
      const sg=segs[segAt(e.t)],s2=segs[segAt(Math.min(TOT-1,e.t+e.d-1))],k1=cl(sg,m);if(!k1)return INF;
      const long=e.d>=9||q===n-1,strong=e.t%6===0||e.d>=6;let c;
      /* 코드가 바뀌는 순간에 닿는 음은 3·7음(가이드톤)으로 — 노래 선율의 뼈대 */
      if(e.t===sg.t0&&e.t>0){if(long&&k1==='s')return INF;c=k1==='g'?0:k1==='c'?1.0:k1==='t'?1.2:2.4}
      else if(long){if(k1==='s')return INF;c=k1==='g'?0:k1==='t'?0.25:(mod12(m-sg.root)===0?(q===n-1&&fin?0.1:1.6):0.8)}
      else if(strong)c=k1==='g'?0:k1==='c'?0.3:k1==='t'?0.5:1.2;
      else c=0.3;
      if(s2!==sg){const k2=cl(s2,m);if(!k2||k2==='s')return INF;c+=0.3}
      return c+0.22*Math.abs(m-goal(e.t));
    };
    const tc=(a,b,st)=>{const d=b-a,ad=Math.abs(d);if(ad>MAXLEAP)return [INF,0];
      let c=ad===0?2.4:ad<=2?0:ad<=4?0.5:1.4;
      if(st!==0&&(ad===0||Math.sign(d)===st))c+=2.5;   /* 도약 뒤에는 반대 방향으로 메운다 */
      return [c,ad>=5?Math.sign(d):0]};
    const cands=span.map((k,q)=>{const o=[];for(let m=Math.max(LO,c0-10);m<=Math.min(HI,c0+10);m++)if(nc(q,m)<INF)o.push(m);return o});
    if(cands.some(c=>!c.length))return failSong(ph);
    let L=new Map();
    cands[0].forEach(m=>{if(prevM!==null&&Math.abs(m-prevM)>MAXLEAP)return;L.set(m+'|0',{c:nc(0,m)+(prevM===null?0:0.1*Math.abs(m-prevM)+(m===prevM?1.2:0)),m,st:0,bk:null})});
    if(!L.size)return failSong(ph);
    for(let q=1;q<n;q++){const N2=new Map();
      for(const s0 of L.values())for(const m of cands[q]){const [t,st]=tc(s0.m,m,s0.st);if(t>=INF)continue;const c=s0.c+t+nc(q,m),key=m+'|'+st,o=N2.get(key);if(!o||c<o.c)N2.set(key,{c,m,st,bk:s0})}
      if(!N2.size)return failSong(ph);L=N2}
    let best=null;for(const s0 of L.values())if(!best||s0.c<best.c)best=s0;
    let ms=new Array(n);for(let q=n-1,s0=best;q>=0;q--,s0=s0.bk)ms[q]=s0.m;
    const dp=ms.slice();
    /* 동기 시퀀스: 바로 앞 셀과 같은 리듬 셀이면 음형을 옮겨 맞춘다 */
    const cellQ={};span.forEach((k,q)=>{const sc=events[k].sc;if(sc)(cellQ[sc.c]=cellQ[sc.c]||{id:sc.id,qs:[]}).qs.push(q)});
    const cs=Object.keys(cellQ).map(Number).sort((a,b)=>a-b);let seqN=0;
    for(let j=1;j<cs.length;j++){
      const Ac=cellQ[cs[j-1]],Bc=cellQ[cs[j]];
      if(Ac.id!==Bc.id||Ac.qs.length!==Bc.qs.length||cs[j]!==cs[j-1]+1||rng()>0.75)continue;
      let bs=null;
      for(let sh=-5;sh<=5;sh++){
        let cost=sh===0?1:0.15*Math.abs(sh),ok=true;const out=[];
        for(let r=0;r<Bc.qs.length;r++){
          const q=Bc.qs[r];let m=ms[Ac.qs[r]]+sh,c=nc(q,m);
          if(c>=INF){let bm=null;for(const d of [1,-1,2,-2]){const c2=nc(q,m+d);if(c2<INF){bm=m+d;c=c2+0.6;break}}if(bm===null){ok=false;break}m=bm}
          out.push(m);cost+=c;
        }
        if(!ok)continue;
        const pq=Bc.qs[0]-1,nq=Bc.qs[Bc.qs.length-1]+1,chain=[pq>=0?ms[pq]:null,...out,nq<n?ms[nq]:null];
        if(chain.some((m,x)=>x>0&&m!==null&&chain[x-1]!==null&&Math.abs(m-chain[x-1])>MAXLEAP))continue;
        if(!bs||cost<bs.cost)bs={cost,out};
      }
      if(bs){Bc.qs.forEach((q,r)=>ms[q]=bs.out[r]);seqN++}
    }
    if(ms.some((m,q)=>q>0&&Math.abs(m-ms[q-1])>MAXLEAP))ms=dp;
    else if(seqN)tag(Math.floor(t0/TPB),'동기 반복(시퀀스)');
    span.forEach((k,q)=>{forced.set(k,{m:ms[q],kind:'song'});motifLock.add(k);events[k].keep=true});
    stats.song=(stats.song||0)+1;
  }
  /* ── v0.39 블루스 스케일 프레이즈 — 조(으뜸음) 기준 1·♭3·4·♭5·5·♭7(+3·6 경과).
     ♭5는 약박 경과음으로만(반음으로 4·5음 해결), ♭3→3 꺾기 허용, 긴 음은 코드에 어울리는 음(1·♭3·♭7 또는 코드톤) */
  function planBlues(i){
    const ph=events[i].ph,span=[];for(let k=i;k<events.length&&events[k].ph===ph;k++)if(events[k].blu&&!events[k].quote)span.push(k);
    const n=span.length,off=()=>{events.forEach(e=>{if(e.ph===ph)e.blu=false})};
    if(n<3)return off();
    const K=keyPc,minorKey=songIsMinor(prog);
    const fits=sg=>{if(songType==='blues')return true;const r=mod12(sg.root-K),c=TYPE_CLS[sg.type]||'dom';
      if(minorKey)return (r===0&&c==='min')||(r===5&&c==='min')||(r===7&&(c==='dom'||c==='domalt'))||(r===2&&c==='hdim')||(r===10&&c==='dom')||(r===8&&c==='maj');
      return ((r===0||r===5)&&(c==='maj'||c==='dom'))||(r===7&&(c==='dom'||c==='domalt'))||((r===2||r===9||r===4)&&c==='min')};
    if(span.some(k=>!fits(segs[segAt(events[k].t)])))return off();
    const BL=[0,3,5,6,7,10],INF=1e9;
    const t0=events[span[0]].t,t1=events[span[n-1]].t+events[span[n-1]].d,c0=Math.round(pitchGoal(t0));
    const goal=t=>c0+3-6*Math.max(0,Math.min(1,(t-t0)/Math.max(1,t1-t0)));   /* 블루스 라인은 내려오는 쪽 */
    const nc=(q,m,pr)=>{
      const e=events[span[q]];if(!allow(m,e.t))return INF;
      const r=mod12(m-K),sg=segs[segAt(e.t)],long=e.d>=6||q===n-1,strong=e.t%6===0;let c;
      if(r===6){if(long||strong)return INF;c=0.5}
      else if(BL.includes(r))c=(r===0||r===7||r===10)?0:r===3?0.3:0.5;
      else if(r===4)c=pr!==null&&mod12(pr-K)===3&&m-pr===1?0.2:1.6;
      else if(r===9)c=long?1.2:0.8;
      else return INF;
      if(long&&!isCT(sg,m)&&!(r===3||r===10))c+=1.4;
      return c+0.2*Math.abs(m-goal(e.t));
    };
    const tc=(a,b)=>{const ad=Math.abs(b-a);if(ad>MAXLEAP)return INF;
      if(mod12(a-K)===6&&!(ad===1&&(mod12(b-K)===7||mod12(b-K)===5)))return INF;
      return ad===0?1.0:ad<=2?0:ad<=4?0.3:ad<=5?0.9:1.6};
    let L=new Map();
    for(let m=Math.max(LO,c0-9);m<=Math.min(HI,c0+9);m++){if(prevM!==null&&Math.abs(m-prevM)>MAXLEAP)continue;const c=nc(0,m,prevM);if(c<INF)L.set(m,{c,m,bk:null})}
    for(let q=1;q<n&&L.size;q++){const N2=new Map();
      for(let m=Math.max(LO,c0-9);m<=Math.min(HI,c0+9);m++)for(const s0 of L.values()){const t=tc(s0.m,m);if(t>=INF)continue;const c0b=nc(q,m,s0.m);if(c0b>=INF)continue;const c=s0.c+t+c0b,o=N2.get(m);if(!o||c<o.c)N2.set(m,{c,m,bk:s0})}
      L=N2}
    if(!L.size)return off();
    let best=null;for(const s0 of L.values())if(!best||s0.c<best.c)best=s0;
    const ms=new Array(n);for(let q=n-1,s0=best;q>=0;q--,s0=s0.bk)ms[q]=s0.m;
    span.forEach((k,q)=>{forced.set(k,{m:ms[q],kind:'blues'});motifLock.add(k);events[k].keep=true});
    for(let b=Math.floor(t0/TPB);b<=Math.floor((t1-1)/TPB);b++)tag(b,'블루스 스케일');stats.blues=(stats.blues||0)+1;
  }
  function planDevice(i){
    const H=events[i].hl,span=[];
    for(let k=i;k<events.length&&events[k].hl===H;k++)span.push(k);
    if(H.kind==='line'){   /* v0.36 8분 라인은 코드톤 라인 계획으로: 정박 코드톤 · 엇박 경과음 · 반음 정렬 */
      if(span.some(k=>motifLock.has(k)))return;
      const ms=planCTPath(span,{prev:prevM,changeAtFirst:true});
      if(ms){span.forEach((k,q)=>{forced.set(k,{m:ms[q],kind:'ctl'});motifLock.add(k)});stats.hl=(stats.hl||0)+1}
      return;
    }
    const fail=()=>{const b=Math.floor(H.s/BPB),L=tagsAt[b];   /* v0.38 이름표는 장치 시작 박의 마디에 붙어 있다 */const q=L?L.indexOf(HL_LABEL[H.kind]):-1;if(q>=0)L.splice(q,1);return};
    if(span.length<3||span.some(k=>motifLock.has(k)||(forced.has(k)&&!/^(target|pass)$/.test(forced.get(k).kind))))return fail();
    const tgt={};span.forEach(k=>{const f=forced.get(k);if(f&&f.kind==='target')tgt[k]=f.m;forced.delete(k)});   /* 접근음은 장치가 덮어쓰되, 코드 전환 타깃(가이드톤)은 지킨다 */
    const e0=events[i],seg0=segs[segAt(e0.t)],goal=Math.round(pitchGoal(e0.t));
    const setF=(k,m)=>{forced.set(k,{m,kind:'dev'});motifLock.add(k)};
    let ms=[];
    if(H.kind==='perc'){
      let cur=null;const c=[];
      for(let m=LO;m<=HI;m++)if(isCT(seg0,m)&&isStable(seg0,m)&&Math.abs(m-goal)<=5&&(prevM===null||Math.abs(m-prevM)<=MAXLEAP))c.push({v:m,w:Math.exp(-Math.abs(m-goal)/2)});
      if(!c.length)return fail();cur=pickW(rng,c);
      for(const k of span){const sg=segs[segAt(events[k].t)];if(tgt[k]!==undefined&&Math.abs(tgt[k]-cur)<=4)cur=tgt[k];else if(!(isCT(sg,cur)||inScale(sg,cur))){const ct=chordToneMidis(sg.root,sg.type,LO,HI).filter(x=>Math.abs(x-cur)<=3);if(ct.length)cur=nearest(ct,cur)}ms.push(cur)}
    }else if(H.kind==='pivot'){
      const c=[];
      for(let m=LO+2;m<=HI-5;m++)if(isCT(seg0,m)&&Math.abs(m-goal)<=5&&(prevM===null||Math.abs(m-prevM)<=MAXLEAP))c.push({v:m,w:Math.exp(-Math.abs(m-goal)/2)*(mod12(m-seg0.root)===0?0.7:1)});
      if(!c.length)return fail();
      const P=pickW(rng,c),u1=scaleStep(seg0,P,1),u2=scaleStep(seg0,P,2);
      const pat=[P,u1,u2,P,u2,P,u1-1,u1];
      span.forEach((k,q)=>{const sg=segs[segAt(events[k].t)];let m=pat[q%8];if(q%8!==6&&!(inScale(sg,m)||isCT(sg,m)))m=fitTone(sg,m,events[k].t);ms.push(m)});
      /* v0.38 한 마디에 코드가 여럿이면 중간 코드에서 축음(P)이 바뀔 수 있다 — 축음이 흔들리면 피벗이라 부를 수 없으니 장치를 접는다 */
      if(ms.some((m,q)=>(q%8===0||q%8===3||q%8===5)&&m!==P)||ms.some((m,q)=>q%8===1&&m===P))return fail();
    }else if(H.kind==='hemiola'){
      const start=fitTone(seg0,goal-(H.dir>0?3:-1),e0.t);if(start===null)return fail();
      const n=H.cells*3;let cs=start;
      for(let c=0;c<H.cells;c++){
        const k0=span[c*3];if(k0===undefined)break;
        const sg=segs[segAt(events[k0].t)];
        if(c>0)cs=H.chromatic&&c<H.cells-1?cs+H.dir:scaleStep(sg,cs,H.dir);
        if(H.chromatic&&c===H.cells-1&&!(inScale(sg,cs)||isCT(sg,cs)))cs=fitTone(sg,cs,events[k0].t);
        for(let q=0;q<3;q++){const k=span[c*3+q];if(k===undefined)break;const sgq=segs[segAt(events[k].t)];let m=H.chromatic&&c<H.cells-1?cs+q*2*H.dir:scaleStep(sgq,cs,q*H.dir);
          if(!H.chromatic&&!(inScale(sgq,m)||isCT(sgq,m)))m=fitTone(sgq,m,events[k].t);ms.push(m)}
      }
      /* 착지: 다음 음은 코드톤으로 */
      const kl=span[n];if(kl!==undefined){const sg=segs[segAt(events[kl].t)];const last=ms[ms.length-1];const ct=chordToneMidis(sg.root,sg.type,LO,HI).filter(x=>Math.abs(x-last)<=4&&x!==last);if(ct.length)ms.push(nearest(ct,last+H.dir))}
    }else if(H.kind==='trip'){
      let m=fitTone(seg0,goal-(H.dir>0?4:-4),e0.t);if(m===null)return fail();let dir=H.dir;
      for(const k of span){const sg=segs[segAt(events[k].t)];if(!(inScale(sg,m)||isCT(sg,m)))m=fitTone(sg,m,events[k].t);ms.push(m);let nx=scaleStep(sg,m,dir);if(nx<LO||nx>HI){dir=-dir;nx=scaleStep(sg,m,dir)}m=nx}
    }
    if(ms.length<3||ms.some(m=>m===null||!allow(m,0)))return fail();
    if(H.kind!=='perc')for(const k in tgt){const q=span.indexOf(+k);if(q>=0&&q<ms.length){if(Math.abs(ms[q]-tgt[k])<=2)ms[q]=tgt[k];else return fail()}}
    for(let q=1;q<ms.length;q++)if(Math.abs(ms[q]-ms[q-1])>MAXLEAP)return fail();
    if(prevM!==null&&Math.abs(ms[0]-prevM)>MAXLEAP)return fail();
    ms.forEach((m,q)=>setF(span[q],m));
    stats.hl=(stats.hl||0)+1;
  }
  function tryMotif(i){
    if(!motifRate||rng()>motifRate)return false;
    const e0=events[i];
    if(phDev[e0.ph])return false;
    /* 출처 결정 */
    let off=null,dd=null,from='self',srcStart=null;
    if(headFrags.length&&rng()<headRate){const f=headFrags[Math.floor(rng()*headFrags.length)];off=f.off.slice();dd=f.d.slice();from='head'}
    else{
      const cand=[];for(let ph=0;ph<e0.ph;ph++)if(phNotes[ph]&&phNotes[ph].length>=4)cand.push(ph);
      if(!cand.length)return false;
      const ph0=cand[rng()<0.6?0:cand.length-1],a=phNotes[ph0];
      const K0=(rng()<0.5)?4:3;let K=0;
      for(let k=1;k<K0;k++){if(a[k].trip||a[k-1].trip||a[k-1].t+a[k-1].d!==a[k].t)break;K=k+1}
      if(K<3)return false;
      off=a.slice(0,K).map(n=>n.midi-a[0].midi);dd=a.slice(0,K).map(n=>n.d);srcStart=a[0].midi;
      if(a[K-1].trip)return false;
    }
    const K=off.length;
    /* 대상 이벤트가 같은 프레이즈의 연속 음이고, 잠긴 곳·인용·잇단·프레이즈 끝음이 없어야 한다 */
    for(let k=0;k<K;k++){const x=events[i+k];if(!x||x.ph!==e0.ph||x.trip||x.quote||x.last||forced.has(i+k)||motifLock.has(i+k))return false;
      if(k>0&&events[i+k-1].t+events[i+k-1].d!==x.t)return false}
    /* 리듬: 총 길이가 같으면 모티프 리듬을 그대로 입힌다. 아니면 헤드는 포기, 자기 모티프는 윤곽만 */
    const own=events[i+K-1].t+events[i+K-1].d-e0.t,srcSum=dd.reduce((a,b)=>a+b,0);
    let rhy=false;
    if(own===srcSum){
      let t=e0.t;
      const ok=dd.every(d=>{const r=(t%6===0)||(d===3||d===6||d===9);t+=d;return r&&d>=3});
      if(ok)rhy=true;
    }
    if(!rhy&&from==='head')return false;
    if(!rhy&&rng()<0.4)return false;      /* 윤곽만 닮은 모티프는 덜 쓴다 */
    const t0=e0.t;
    const times=[],durs=[];
    {let t=t0;for(let k=0;k<K;k++){times.push(t);const d=rhy?dd[k]:events[i+k].d;durs.push(d);t+=d}}
    /* 변형 */
    const kinds=[{v:'rep',w:0.9},{v:'up',w:1.2},{v:'down',w:1.2},{v:'inv',w:0.6}];
    const kind=pickW(rng,kinds);
    const sgn=kind==='inv'?-1:1;
    const sh=kind==='up'?pickW(rng,[{v:2,w:3},{v:3,w:1.5},{v:4,w:1}]):kind==='down'?-pickW(rng,[{v:2,w:3},{v:3,w:1.5},{v:4,w:1}]):0;
    const segAtT=t=>segs[segAt(t)];
    /* 시작음: 모티프의 출발음 기준(자기 모티프) 또는 현재 윤곽 목표(헤드)에서 가까운 코드톤 */
    const baseStart=from==='self'?srcStart+sh:Math.round(pitchGoal(t0))+sh;
    const seg0=segAtT(t0);
    const startC=[];
    for(let m=LO;m<=HI;m++){
      if(!allow(m,t0)||!isCT(seg0,m)||(STABLE&&!isStable(seg0,m))||Math.abs(m-baseStart)>4)continue;
      if(prevM!==null&&Math.abs(m-prevM)>MAXLEAP)continue;
      startC.push({v:m,w:Math.exp(-Math.abs(m-baseStart)/1.5)*(isGuide(seg0,m)?1.6:1)});
    }
    if(!startC.length)return false;
    const start=pickW(rng,startC);
    const ms=[start];
    for(let k=1;k<K;k++){
      const sg=segAtT(times[k]),tgt=start+sgn*off[k];
      const heavy=(times[k]%6===0)||durs[k]>=6;
      let best=null;
      for(let m=tgt-1;m<=tgt+1;m++){
        if(m<LO||m>HI||!allow(m,times[k])||!matOK(sg,m,e0.ph))continue;
        if(Math.abs(m-ms[k-1])>MAXLEAP)continue;
        const okp=heavy?(opts.ctAlign!==false?isCT(sg,m):isMain(sg,m)):(inScale(sg,m)||isCT(sg,m));   /* v0.37 정박은 코드톤 */
        if(!okp)continue;
        const sc=Math.abs(m-tgt)*2+(isCT(sg,m)?-0.5:0);
        if(!best||sc<best.sc)best={m,sc};
      }
      if(!best)return false;
      ms.push(best.m);
    }
    if(new Set(ms).size<2)return false;
    /* 적용 */
    for(let k=0;k<K;k++){
      const x=events[i+k];
      if(rhy){x.t=times[k];x.d=durs[k];x.strong=(x.t%6===0)}
      forced.set(i+k,{m:ms[k],kind:'motif'});motifLock.add(i+k);
    }
    const nm=from==='head'?'헤드 차용':'모티프 발전';
    const kn={rep:'반복',up:'시퀀스↑',down:'시퀀스↓',inv:'반진행'}[kind];
    tag(Math.floor(t0/TPB),nm+': '+kn);
    stats.motif++;if(from==='head')stats.headQuote++;
    motifLog.push({bar:Math.floor(t0/TPB),t:t0,from,kind,len:K,rhythm:rhy,off:off.slice(),dur:durs.slice(),start:ms[0],ms:ms.slice()});
    return true;
  }

  let curPh=-1,tryMotifPending=false;
  for(let i=0;i<events.length;i++){
    const e=events[i];
    const seg=segs[segAt(e.t)];
    if(e.ph!==curPh){ /* 새 프레이즈: 음형 목표 설정 */
      curPh=e.ph;
      const ph=phrases[e.ph],t0=ph.s*6,t1=(ph.e+1)*6;
      const c=centerAt(t0),span=ARC.n>1?3:(inst==='free'||!useGroups?7:4);
      const shape=pickW(rng,[{v:'desc',w:4},{v:'arch',w:3},{v:'asc',w:1.2},{v:'valley',w:1}]);
      const hi=c+span,lo=c-span;
      contour.goal=t=>{
        const x=Math.max(0,Math.min(1,(t-t0)/Math.max(1,t1-t0)));
        if(shape==='desc')return hi-(hi-lo)*x;
        if(shape==='asc')return lo+(hi-lo)*x;
        if(shape==='arch')return lo+(hi-lo)*Math.sin(Math.PI*x);
        return hi-(hi-lo)*Math.sin(Math.PI*x);
      };
      contour.shape=shape;
      tryMotifPending=true;
      if(ph.s%BPB===0||e.first){
        tag(Math.floor(e.t/TPB),'프레이즈 시작');
        const dv=phDev[e.ph];
        if(dv&&dv!=='quote')tag(Math.floor(e.t/TPB),'주제: '+(dv==='scale'?('스케일 — '+(seg.sname||'')):dv==='dom'?('활용 스케일 — '+matName(e.ph,seg)):TOPIC_LABEL[dv]));
      }
    }
    if(e.song&&e.songK===0)planSong(i);
    if(e.blu&&e.bluK===0)planBlues(i);
    if(e.lick!==undefined&&e.lickK===0)planLick(i);
    if(tryMotifPending){tryMotifPending=false;if(e.first)tryMotif(i)}
    if(e.hl&&e.hlK===0)planDevice(i);
    if(e.first&&phDev[e.ph]==='ct'){
      const span=[];for(let k=i;k<events.length&&events[k].ph===e.ph;k++)if(!events[k].quote)span.push(k);
      const ms=planCTPath(span,{prev:prevM,stableFirst:true,guideHard:true});
      if(ms){span.forEach((k,q)=>{forced.set(k,{m:ms[q],kind:'ctl'});motifLock.add(k)});stats.ctPlan=(stats.ctPlan||0)+1}
    }
    /* v0.34 셋잇단 반복: 바로 앞 박 셋잇단 3음을 그대로(새 코드의 스케일·코드톤일 때만) */
    if(e.rep&&e.repK===0&&rng()<0.8){
      const src=[events[i-3],events[i-2],events[i-1]],dst=[e,events[i+1],events[i+2]];
      if(src.every(x=>x&&x.trip&&x.midi!==null)&&dst.every(x=>x&&x.trip&&x.rep)&&dst.every((x,q)=>!forced.has(i+q))){
        const sg=segs[segAt(e.t)],sgS=segs[segAt(src[0].t)];
        if(Math.abs(src[2].midi-src[0].midi)<=MAXLEAP&&src.every(x=>(inScale(sg,x.midi)||isCT(sg,x.midi))&&(inScale(sgS,x.midi)||isCT(sgS,x.midi))&&allow(x.midi,e.t)&&matOK(sg,x.midi,e.ph))){
          src.forEach((x,q)=>{forced.set(i+q,{m:x.midi,kind:'trep'});motifLock.add(i+q);x.trepSrc=true});
          tag(Math.floor(e.t/TPB),'셋잇단 반복(6연음 느낌)');
        }
      }
    }
    /* v0.34 하행 뒤 반전 도약 — 순차 하행 3음 다음 약박(엇박 8분)에서 6도~옥타브 위 코드톤으로 뛰어오른 뒤 다시 내려온다 */
    if(diff>=2&&!forced.has(i)&&!e.trip&&!e.first&&!e.last&&!e.quote&&!phDev[e.ph]&&e.t%6===3&&prevM!==null&&recentM.length>=3){
      const r=recentM.slice(-3);
      const stepDown=r[0].ph===e.ph&&r[2].ph===e.ph&&r[0].m-r[1].m>=1&&r[0].m-r[1].m<=2&&r[1].m-r[2].m>=1&&r[1].m-r[2].m<=2;
      if(stepDown&&rng()<(diff===3?0.45:0.25)){
        const c=[];
        for(let x=prevM+8;x<=Math.min(HI,prevM+12);x++)if(isCT(seg,x)&&allow(x,e.t)&&matOK(seg,x,e.ph))c.push({v:x,w:isGuide(seg,x)?2:1});
        if(c.length){forced.set(i,{m:pickW(rng,c),kind:'disp'});e.disp=true}
      }
    }
    let m=null,f=forced.get(i);
    if(f&&(f.kind==='quote'||(f.kind==='disp'&&allow(f.m,e.t))||(f.kind==='dev'&&okNote(f.m,e.t,prevM))||(f.kind==='ctl'&&allow(f.m,e.t))||((f.kind==='song'||f.kind==='blues'||f.kind==='lick')&&okNote(f.m,e.t,prevM))||(okNote(f.m,e.t,prevM)&&matOK(seg,f.m,e.ph))))m=f.m;
    else{
      if(f){
        /* v0.38 장치 음이 도약·음역 검사에서 밀려나면 음형이 깨진다 — 그 장치의 이름표도 뗀다(악보 표시와 실제 음형이 어긋나지 않게) */
        if(f.kind==='dev'&&e.hl&&!e.hl.broken){e.hl.broken=true;const L=tagsAt[Math.floor(e.hl.s/BPB)],q=L?L.indexOf(HL_LABEL[e.hl.kind]):-1;if(q>=0)L.splice(q,1)}
        forced.delete(i);
      }
      if(!e.first&&!e.last&&tryCell(i)){const f2=forced.get(i);if(okNote(f2.m,e.t,prevM))m=f2.m}
      if(m===null){
        const mode=(e.last||(e.first&&e.d>=6))?'end':null;
        let c=pitchCands(i,e,seg,mode);
        if(!c.length)c=pitchCands(i,e,seg,null);
        if(!c.length&&e.first){firstStrict=false;c=pitchCands(i,e,seg,null);firstStrict=true}
        if(!c.length){
          const ref=prevM===null?centerAt(e.t):prevM;
          let ct=chordToneMidis(seg.root,seg.type,LO,HI).filter(x=>matOK(seg,x,e.ph)&&okNote(x,e.t,prevM));
          if(!ct.length){const mm=[];for(let x=LO;x<=HI;x++)if(isMain(seg,x)&&matOK(seg,x,e.ph)&&okNote(x,e.t,prevM))mm.push(x);ct=mm}
          if(!ct.length&&phDev[e.ph]!=='gt')ct=chordToneMidis(seg.root,seg.type,LO,HI).filter(x=>matOK(seg,x,e.ph)); /* 가이드톤 불가능 시 쉼, 제약을 깨지 않는다 */
          if(ct.length){
            const s2=segs[segAt(Math.min(TOT-1,e.t+e.d-1))];
            const ok2=s2===seg?ct:ct.filter(x=>isMain(s2,x));
            m=nearest(ok2.length?ok2:ct,ref);
          }
        }else m=pickW(rng,c);
      }
    }
    if(m!==null&&diff===3&&(!phDev[e.ph]||phDev[e.ph]==='chrom')&&!e.quote&&!inScale(seg,m)&&!isCT(seg,m)&&!forced.has(i)){
      stats.chrom++;tag(Math.floor(e.t/TPB),'크로매틱 통과음');
      const nx=events[i+1];
      if(nx&&nx.ph===e.ph&&!forced.has(i+1)&&prevM!==null){const r=m+Math.sign(m-prevM);if(okNote(r,nx.t,m)&&(!(nx.strong||nx.d>=6)||isMain(segs[segAt(nx.t)],r)))forced.set(i+1,{m:r,kind:'pass'})}
    }
    e.midi=m;
    if(m!==null&&!e.quote)(phNotes[e.ph]||(phNotes[e.ph]=[])).push({t:e.t,d:e.d,midi:m,trip:!!e.trip});
    if(f&&f.kind==='target'&&m!==null){
      if(isGuide(seg,m)){stats.guideHits++;tag(Math.floor(e.t/TPB),'가이드톤 타깃')}
      else tag(Math.floor(e.t/TPB),'코드톤 착지');
    }
    if(m!==null){if(prevM!==null&&m!==prevM)lastDir=Math.sign(m-prevM);prev2M=prevM;prevM=m}
    if(m!==null){
      if(e.disp&&f&&f.kind==='disp'&&m===f.m){gapFill=2;stats.disp=(stats.disp||0)+1;tag(Math.floor(e.t/TPB),'반전 도약')}
      else{e.disp=false;if(gapFill>0)gapFill--}
      recentM.push({m,ph:e.ph});if(recentM.length>4)recentM.shift();
    }
    planApproach(i);
  }
  /* 안전망: 5도 초과 도약(관악기) → 가까운 코드톤으로 교정, 안 되면 쉼표 */
  for(let pass=0;pass<2;pass++){
    let pv=null,pi=-1,ppv=null;
    for(let i=0;i<events.length;i++){
      const e=events[i];if(e.midi===null)continue;
      if(e.quote){
        if(pv!==null&&Math.abs(e.midi-pv)>MAXLEAP&&pi>=0&&!events[pi].quote&&!(events[pi-1]&&events[pi-1].quote&&false)){
          const pe=events[pi],sg=segs[segAt(pe.t)],mm=[];
          for(let x=LO;x<=HI;x++)if(isMain(sg,x)&&matOK(sg,x,pe.ph)&&Math.abs(x-e.midi)<=MAXLEAP&&(ppv===null||Math.abs(x-ppv)<=MAXLEAP))mm.push(x);
          if(mm.length)pe.midi=nearest(mm,e.midi);
        }
        ppv=pv;pv=e.midi;pi=i;continue;
      }
      if(pv!==null&&Math.abs(e.midi-pv)>MAXLEAP&&!(e.disp&&e.midi-pv>0&&e.midi-pv<=12)&&!(events[pi]&&events[pi].quote&&false)){
        const seg=segs[segAt(e.t)];
        const c=chordToneMidis(seg.root,seg.type,LO,HI).filter(x=>matOK(seg,x,e.ph)&&okNote(x,e.t,pv));
        if(c.length)e.midi=nearest(c,e.midi);else{const mm=[];for(let x=LO;x<=HI;x++)if(isMain(seg,x)&&matOK(seg,x,e.ph)&&Math.abs(x-pv)<=MAXLEAP)mm.push(x);e.midi=mm.length?nearest(mm,e.midi):(phDev[e.ph]==='gt'?null:pv)}
      }
      if(e.midi!==null){ppv=pv;pv=e.midi;pi=i}
    }
  }
  /* v0.20: 코드 경계를 넘는 지속음(6틱+)이 다음 코드에서 메인 음이 아니면 가까운 메인 음으로 스냅
     (길이 연장이 선택 뒤에 일어나 선택 시점 검사를 통과한 케이스 일괄 교정) */
  {
    let pv=null;
    for(let i=0;i<events.length;i++){
      const e=events[i];if(e.midi===null)continue;
      const seg=segs[segAt(e.t)],s2=segs[segAt(Math.min(TOT-1,e.t+e.d-1))];
      if(!e.quote&&!e.keep&&s2!==seg&&e.d>=6&&!isMain(s2,e.midi)){
        const cand=[];
        let nx=null;for(let j=i+1;j<events.length;j++)if(events[j].midi!==null){nx=events[j].midi;break}
        for(let x=Math.max(LO,e.midi-4);x<=Math.min(HI,e.midi+4);x++)
          if(isMain(s2,x)&&isMain(seg,x)&&(matOK(s2,x,e.ph)&&matOK(seg,x,e.ph))&&(pv===null||Math.abs(x-pv)<=MAXLEAP)&&(nx===null||Math.abs(x-nx)<=MAXLEAP))cand.push(x);
        if(cand.length)e.midi=nearest(cand,e.midi); /* 양쪽 코드 모두 메인 음인 곳으로만 — 아니면 그대로 둔다 */
      }
      if(e.midi!==null)pv=e.midi;
    }
  }

  /* 가이드톤 주제의 최종 불변식: 모든 생성 경로/교정 후에도 3·7음과 도약 한도 유지.
     공통 가이드톤이 없는 코드 경계에서는 지속을 끊어 쉰다. 사용자 인용은 보존한다. */
  if(topic==='gt'){
    let pv=null,from=null;
    for(const e of events){
      const sg=segs[segAt(e.t)];
      if(e.quote){pv=e.midi;from=sg;continue}
      const c=[];
      for(let x=LO;x<=HI;x++)if(isGuide(sg,x)&&okNote(x,e.t,pv))c.push(x);
      const res=c.filter(x=>resolvesGuide(sg,x,pv,from));
      if(res.length)e.midi=nearest(res,pv);
      else if(e.midi===null||!c.includes(e.midi))e.midi=c.length?nearest(c,e.midi===null?(pv===null?pitchGoal(e.t):pv):e.midi):null;
      if(e.midi!==null){
        for(const s of segs)if(s.t0>e.t&&s.t0<e.t+e.d&&!isGuide(s,e.midi)){e.d=s.t0-e.t;break}
        pv=e.midi;from=segs[segAt(e.t+e.d-1)];
      }
    }
  }

  /* v0.35 크로매틱 정리 — 스케일 밖 음은 바로 이어지는 음으로 반음 해결될 때만 남긴다(인용·반음 시퀀스 장치 제외). 아니면 가까운 스케일 음으로 */
  {
    const snd=[];events.forEach((e,i)=>{if(e.midi!==null)snd.push(i)});
    for(let q=0;q<snd.length;q++){
      const i=snd[q],e=events[i];if(e.quote||e.hlx||e.keep)continue;
      const seg=segs[segAt(e.t)];
      if(inScale(seg,e.midi)||isCT(seg,e.midi))continue;
      const nx=q+1<snd.length?events[snd[q+1]]:null,pv=q>0?events[snd[q-1]]:null;
      const resolves=nx&&nx.ph===e.ph&&nx.t===e.t+e.d&&Math.abs(nx.midi-e.midi)===1;
      if(resolves&&!(e.strong&&e.d>=6))continue;
      const c=[];
      for(let x=e.midi-3;x<=e.midi+3;x++){
        if(x===e.midi||!allow(x,e.t)||!(inScale(seg,x)||isCT(seg,x)))continue;
        if(pv&&Math.abs(x-pv.midi)>MAXLEAP)continue;if(nx&&Math.abs(nx.midi-x)>MAXLEAP)continue;
        if((e.strong||e.d>=6)&&!isMain(seg,x))continue;
        c.push(x);
      }
      if(c.length){e.midi=nearest(c,e.midi);stats.chromFix=(stats.chromFix||0)+1}
    }
  }
  /* v0.37 코드톤 정렬 — 코드톤 라인 원칙을 모든 솔로에 적용(두호 님 피드백).
     프레이즈마다 원래 음에서 크게 벗어나지 않는 범위(±5반음)에서 동적 계획법으로 다시 맞춘다:
     · 정박(박 머리·긴 음·코드 경계를 넘는 음) = 코드톤 · 약박 = 스케일/코드톤
     · 반음 경과음은 바로 다음 음으로 반음 해결될 때만 · 코드가 바뀌는 정박은 3·7음 우선
     인용(헤드)·하이라이트 장치·셋잇단 반복(원본 포함)·반전 도약·코드톤 라인·모티프 음은 고정(모티프는 생성 때 정박 코드톤으로 맞춘다). */
  if(opts.ctAlign!==false&&topic!=='gt'){
    const PIN=new Set(['quote','dev','trep','disp','ctl','motif']);
    const snd=[];events.forEach((e,i)=>{if(e.midi!==null)snd.push(i)});
    let lastFixed=null,q0=0;
    while(q0<snd.length){
      let q1=q0;while(q1+1<snd.length&&events[snd[q1+1]].ph===events[snd[q0]].ph)q1++;
      const idx=snd.slice(q0,q1+1),n=idx.length;
      const info=idx.map((i,q)=>{
        const e=events[i],f=forced.get(i),sg=segs[segAt(e.t)];
        const s2=segs[segAt(Math.min(TOT-1,e.t+e.d-1))],cross=s2!==sg?s2:null;
        const strong=e.t%6===0||e.d>=6||!!cross;
        const pe=q>0?events[idx[q-1]]:null;
        const change=strong&&(q===0?sg.t0===e.t:segAt(pe.t)!==segAt(e.t));
        const nx=q+1<n?events[idx[q+1]]:null;
        const pin=e.quote||e.hlx||e.trepSrc||(e.keep&&f&&f.m===e.midi)||(f&&PIN.has(f.kind)&&f.m===e.midi);
        const motif=f&&f.kind==='motif';
        const cands=[];
        if(pin)cands.push(e.midi);
        else for(let x=Math.max(LO,e.midi-5);x<=Math.min(HI,e.midi+5);x++)if(allow(x,e.t))cands.push(x);
        return {e,sg,cross,strong,change,contig:!!nx&&nx.t===e.t+e.d,pin,motif,cands,last:q===n-1,gap:pe?e.t-(pe.t+pe.d):99};
      });
      const ok=(I,m)=>{
        if(I.pin)return true;
        if(I.strong||I.last){if(!isCT(I.sg,m))return false;if(I.cross&&!isCT(I.cross,m))return false;return true}
        if(inScale(I.sg,m)||isCT(I.sg,m))return true;
        return I.contig&&I.e.d<=3;
      };
      const chromQ=(I,m)=>!I.pin&&!inScale(I.sg,m)&&!isCT(I.sg,m);
      const leapOK=(Ia,a,Ib,b)=>{const d=Math.abs(b-a);if(d<=MAXLEAP)return true;if(Ia.pin&&Ib.pin)return true;return !!Ib.e.disp&&b-a>0&&b-a<=12&&Ib.pin};
      const INF=1e9;
      let cost=info[0].cands.map(m=>{
        const I=info[0];if(!ok(I,m))return INF;
        if(lastFixed!==null&&!I.pin&&Math.abs(m-lastFixed)>MAXLEAP)return INF;
        let c=Math.abs(m-I.e.midi)*(I.motif?2.5:1);
        if(I.change&&!isGuide(I.sg,m))c+=4;
        return c;
      });
      const back=[];
      for(let q=1;q<n;q++){
        const I=info[q],P=info[q-1],nc=[],bk=[];
        I.cands.forEach((m,b)=>{
          let best=INF,arg=-1;
          if(ok(I,m)){
            const base=Math.abs(m-I.e.midi)*(I.motif?2.5:1)+(I.change&&!isGuide(I.sg,m)?4:0);
            P.cands.forEach((pm,a)=>{
              const pc=cost[a];if(pc>=INF)return;
              if(!leapOK(P,pm,I,m))return;
              const ab=Math.abs(m-pm);
              if(chromQ(P,pm)&&(ab!==1||I.gap>0))return;   /* 반음 경과음은 바로 반음으로 해결 */
              let t=0;if(ab===0&&I.gap<6&&!(I.pin&&P.pin))t+=2;
              const v=pc+base+t;if(v<best){best=v;arg=a}
            });
          }
          nc.push(best);bk.push(arg);
        });
        cost=nc;back.push(bk);
      }
      if(q1+1<snd.length){
        const ne=events[snd[q1+1]];
        const L=info[n-1];if(!L.pin)cost=cost.map((c,b)=>Math.abs(L.cands[b]-ne.midi)>MAXLEAP?INF:c);   /* 다음 프레이즈 첫 음(원래 음)까지 도약 한도 — 다음 프레이즈가 늘 풀 수 있게 */
      }
      let bi=-1,bc=INF;cost.forEach((c,b)=>{if(c<bc){bc=c;bi=b}});
      if(bi>=0){
        const ms=new Array(n);
        for(let q=n-1;q>=0;q--){ms[q]=info[q].cands[bi];if(q>0)bi=back[q-1][bi]}
        ms.forEach((m,q)=>{const e=info[q].e;if(e.midi!==m){e.midi=m;stats.ctAlign=(stats.ctAlign||0)+1}});
      }else stats.ctAlignFail=(stats.ctAlignFail||0)+1;
      lastFixed=events[idx[n-1]].midi;q0=q1+1;
    }
  }
  /* ── ⑦ 마디 분할 · 붙임줄 · 표기용 길이 정리 ── */
  const pieces=[];
  const legal=(s,rem,isRest,TPB)=>{ /* 마디 안 위치 s에서 쓸 수 있는 최대 길이(박자 무관) */
    const p=s%TPB,lim=Math.min(rem,TPB-p);
    const opts=[TPB,Math.round(TPB*3/4),Math.round(TPB/2),Math.round(TPB*3/8),9,6,3,2,1]
      .filter((d,i,a)=>Number.isInteger(d)&&d>0&&a.indexOf(d)===i);
    for(const d of opts){
      if(d>lim)continue;
      const end=p+d;
      if(p%6===3){ if(d>9)continue; }
      else{
        if(end%6!==0&&d!==3&&d!==9)continue;
        if(d===TPB&&p!==0)continue;
        if(p>=TPB/2&&d>TPB/2)continue;
      }
      return d;
    }
    return 1;
  };
  let cursor=0;
  const pushRest=(s,e2)=>{let t=s;while(t<e2){const d=legal(t,e2-t,true,TPB);pieces.push({t,d,midi:null});t+=d}};
  for(const e of events){
    if(e.t>cursor)pushRest(cursor,e.t);
    if(e.trip){pieces.push({t:e.t,d:e.d,midi:e.midi,trip:true,ev:e});cursor=e.t+e.d;continue}
    let t=e.t,end=e.t+e.d,first=true;
    while(t<end){
      const d=legal(t,end-t,false,TPB);
      pieces.push({t,d,midi:e.midi,tie:t+d<end&&e.midi!==null,ev:e,cont:!first});
      if(!first&&Math.floor(t/TPB)!==Math.floor((t-1)/TPB)&&e.midi!==null)tag(Math.floor(t/TPB),'붙임줄 당김음');
      t+=d;first=false;
    }
    cursor=end;
  }
  if(cursor<TOT)pushRest(cursor,TOT);
  /* 3연음 그룹 보정: 그룹(박 단위)은 반드시 3개 */
  /* v0.34 후처리로 앞 음이 바뀌어 도약이 7반음 이하가 되면 반전 도약 표시를 지운다 */
  {let pv=null;for(const e of events){if(e.midi===null)continue;if(e.disp&&(pv===null||e.midi-pv<=7||e.midi-pv>12))e.disp=false;pv=e.midi}}
  const result=bars.map((bar,b)=>({chords:bar,notes:[],tags:tagsAt[b]}));
  for(const p of pieces){
    const b=Math.floor(p.t/TPB);
    const n={t:p.t-b*TPB,d:p.d,midi:p.midi};
    if(p.trip)n.trip=true;if(p.tie)n.tie=true;
    if(p.ev&&!p.cont){if(p.ev.first)n.phStart=true;if(p.ev.last)n.phEnd=true;if(p.ev.disp)n.disp=true}
    result[b].notes.push(n);
  }
  result.forEach((bar,b)=>{
    if(bar.notes.some(n=>n.trip))tag(b,'3연음');
    if(inst==='wind'&&phrases.some(ph=>Math.floor(ph.e/BPB)===b&&!ph.final))tag(b,'호흡 쉼표');
    if(!bar.notes.some(n=>n.midi!==null))tag(b,'쉼(호흡)');
  });
  phrases.forEach(ph=>tag(Math.floor(ph.e/BPB),'프레이즈 종지'));
  return {progId,keyPc,diff,style:styleId,bpb:BPB,bars:result,ts:Date.now(),harm:segs.map(s=>({bar:s.bar,t0:s.t0,label:s.label,fn:s.fn,sname:s.sname})),
    stats,feel,topic,quote:quoteInfo,motifs:motifLog,form:{phrase:P,sections:sec.slice(0,nPh).split(''),licks:lickUse,phrases:phrases.length}};
}

/* ── ABC 악보 코드 변환 ── */
const LETTERS=['C','D','E','F','G','A','B'];
const NAT_PC=[0,2,4,5,7,9,11];
const ROOT_LETTER_F=[0,1,1,2,2,3,3,4,5,5,6,6],ROOT_LETTER_S=[0,0,1,1,2,3,3,4,4,5,5,6];
function rootLetter(pc){return (SPELL_SHARP?ROOT_LETTER_S:ROOT_LETTER_F)[mod12(pc)]}
function letterAdvance(deg){return Math.round(deg*7/12)}
function abcName(li,oct){
  if(oct>=6)return LETTERS[li].toLowerCase()+"'".repeat(oct-6);
  return LETTERS[li]+",".repeat(Math.max(0,5-oct));
}
/* midi → {acc, name(임시표 제외)} — 코드 뿌리 글자 기준 철자 */
function spellParts(midi,rootPc,scale){
  const pc=mod12(midi);
  const rootLi=rootLetter(rootPc);
  const deg=mod12(pc-rootPc);
  let li=-1;
  if(scale.includes(deg))li=(rootLi+letterAdvance(deg))%7;
  else{
    /* 스케일 밖 음: 상행 어프로치는 아래 글자+♯, 그 외 위 글자+♭ 보다 단순하게 — 이웃 스케일음 기준 */
    for(const dd of [1,-1]){
      const deg2=mod12(deg+dd);
      if(scale.includes(deg2)){li=(rootLi+letterAdvance(deg2))%7;break}
    }
  }
  if(li<0)li=rootLetter(pc);
  let diffPc=pc-NAT_PC[li];if(diffPc>6)diffPc-=12;if(diffPc<-6)diffPc+=12;
  if(Math.abs(diffPc)>1){li=rootLetter(pc);diffPc=pc-NAT_PC[li];if(diffPc>6)diffPc-=12;if(diffPc<-6)diffPc+=12}
  const acc=diffPc===1?'^':(diffPc===-1?'_':'');
  const oct=Math.round((midi-NAT_PC[li]-diffPc)/12);
  return {acc,name:abcName(li,oct),letter:LETTERS[li]};
}
function spell(midi,rootPc,scale){const s=spellParts(midi,rootPc,scale);return s.acc+s.name}
function abcDur(ticks,trip){
  if(trip)return ticks===4?'2':(ticks===2?'':ticks+'/3');
  const v=ticks/3;
  return Number.isInteger(v)?String(v):ticks+'/3';
}
function toAbc(solo,tempo,transpose,octShift){
  transpose=transpose||0;octShift=octShift||0;
  const rows=[];
  for(let b=0;b<solo.bars.length;b+=4){
    const chunk=solo.bars.slice(b,b+4).map(bar=>{
      const split=bar.notes.some(n=>n.ci!==undefined);   /* v0.29 연습 악보: 코드 기호를 그 코드가 시작하는 음 위에 */
      let s=split?'':' ';
      const cst=chordBeats(bar.chords.length,solo.bpb||4).map(x=>x*6);let cDone=0;   /* v0.38 코드 기호를 그 코드가 시작하는 자리의 음 위에 */
      let tripPos=0,cc=0;
      const exact={},letter={};   /* 마디 안 임시표 지속(ABC·기보 공통 규칙) */
      bar.notes.forEach((n,k)=>{
        if(n.ci!==undefined)cc=n.ci;
        const ch=split?bar.chords[cc]:chordAtBeat(bar.chords,n.t/6,solo.bpb||4);
        const scale=CHORD_TYPES[ch.type].scale;
        if(n.t%6===0&&k>0&&!n.trip&&!(bar.notes[k-1]&&bar.notes[k-1].trip))s+=' ';
        if(split&&n.ci!==undefined)s+='"'+chordSymbol(ch.root+transpose,ch.type)+'"';
        if(!split)while(cDone<cst.length&&cst[cDone]<n.t+n.d){const c2=bar.chords[cDone];s+='"'+chordSymbol(c2.root+transpose,c2.type)+'"';cDone++}
        if(n.trip&&tripPos%3===0)s+='(3';
        if(n.midi===null)s+='z'+abcDur(n.d,!!n.trip);
        else{
          const p=spellParts(n.midi+transpose+octShift,ch.root+transpose,scale);
          const want=p.acc;
          const cur1=exact[p.name]!==undefined?exact[p.name]:'',cur2=letter[p.letter]!==undefined?letter[p.letter]:'';
          let accOut='';
          if(want!==cur1||want!==cur2)accOut=want===''?'=':want;
          exact[p.name]=want;letter[p.letter]=want;
          s+=accOut+p.name+abcDur(n.d,!!n.trip)+(n.tie?'-':'');
        }
        tripPos=n.trip?tripPos+1:0;
      });
      return s;
    });
    rows.push(chunk.join('|')+'|');
  }
  return 'X:1\nT:'+((typeof cur!=='undefined'&&cur.sheetTitle)||'Solo')+'\nM:'+(solo.bpb||4)+'/4\nL:1/8\nQ:1/4='+tempo+'\nK:C\n'+rows.join('\n');
}

/* 편집 반영 — 편집된 음은 붙임줄을 끊는다 */
function applyEdits(solo,edits){
  for(const k in edits){
    const p=k.split(':'),b=+p[0],i=+p[1];
    const bar=solo.bars[b];
    if(!bar||!bar.notes[i])continue;
    if(edits[k].rest)bar.notes[i].midi=null;
    else bar.notes[i].midi=edits[k].midi;
  }
  /* 붙임줄 정합성: 다음 음이 같은 음이 아니면 tie 해제 */
  const flat=[];solo.bars.forEach(bar=>bar.notes.forEach(n=>flat.push(n)));
  for(let i=0;i<flat.length;i++)if(flat[i].tie&&(!flat[i+1]||flat[i+1].midi!==flat[i].midi||flat[i].midi===null))flat[i].tie=false;
  return solo;
}
