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
  'm9':   {iv:[0,3,7,10,14],scale:[0,2,3,5,7,9,10],   sname:'도리안'}
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
   코드톤=코드톤만 · 스케일=코드별 모드 스케일(도리안·믹솔리디안 등)만 · 크로매틱=반음 접근 강조 · 얼터드=도미넌트는 얼터드 스케일 */
const TOPIC_LABEL={ct:'코드톤',penta:'펜타토닉',scale:'스케일',dom:'활용 스케일',chrom:'크로매틱',alt:'얼터드',gt:'가이드톤 라인'};
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
const TYPE_CLS={'maj7':'maj','6':'maj','m7':'min','m9':'min','m6':'min','7':'dom','9':'dom','7b9':'domalt','7#9':'domalt','m7b5':'hdim','dim7':'dim'};

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
const SUF={maj7:'maj7',m7:'m7',m9:'m9','7':'7',m7b5:'m7♭5',dim7:'dim7','6':'6',m6:'m6','9':'9','7b9':'7♭9','7#9':'7♯9'};
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
  bpb=bpb||4;const TPB=bpb*6,splt=bpb===5?18:12;
  const segs=[];
  bars.forEach((bar,b)=>{const off=b*TPB;
    if(bar.length===1)segs.push({bar:b,t0:off,root:bar[0].root,type:bar[0].type});
    else{segs.push({bar:b,t0:off,root:bar[0].root,type:bar[0].type});segs.push({bar:b,t0:off+splt,root:bar[1].root,type:bar[1].type});}
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
    if(cls0==='dom'){
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
      if(toNext===5&&TYPE_CLS[nx.type]&&TYPE_CLS[nx.type].startsWith('dom')){fn='Ⅱ';scale=[0,2,3,5,7,9,10];sname='도리안';tens=[2,5]}
      else if(s.type==='m6'||mod12(s.root-keyPc)===0){fn='ⅰ(토닉 마이너)';scale=[0,2,3,5,7,9,11];sname='멜로딕 마이너';tens=[2,9]}
      else{fn='마이너';tens=[2,5]}
    }else if(cls0==='hdim'){fn=toNext===5?'ⅱø(단조 Ⅱ)':'하프디미니시';tens=[5]}
    else if(cls0==='dim'){fn='경과 디미니시';tens=[2,5,8,11]}
    s.cls=cls;s.scale=scale;s.fn=fn;s.tens=tens;s.sname=sname;
    s.ct=CHORD_TYPES[s.type].iv.slice();
    s.guide=s.ct.filter(iv=>iv===3||iv===4||iv===10||iv===11||(s.type==='6'&&iv===9)||(s.type==='m6'&&iv===9));
    s.label=chordSymbol(s.root,s.type)+(fn?' · '+fn:'')+' · '+sname;
  });
  return merged;
}

/* ── 리듬 토큰(박 단위) ──
   Q=박 위 4분 · E=8분 2개 · Uh=앞음 지속+엇박 진입(당김) · Ur=쉼+엇박 진입 · T=8분 3연음 · H=지속 · R=쉼 */
const TOK=['R','H','Q','E','Ur','Uh','T','Tr'];
const NOTE_TOK={Q:1,E:1,Ur:1,Uh:1,T:1};
const ALLOWED=[null,{Q:1,H:1,R:1},{Q:1,H:1,R:1,E:1,Ur:1,Uh:1},{Q:1,H:1,R:1,E:1,Ur:1,Uh:1,T:1}];

function sampleQuart(rng,q,lo,hi){ /* 사분위 [Q1,Q2,Q3] → 대략적 분포 샘플 */
  const r=rng();let v;
  if(r<0.25)v=q[0]-(q[1]-q[0])*rng()*0.8;
  else if(r<0.5)v=q[0]+(q[1]-q[0])*rng();
  else if(r<0.75)v=q[1]+(q[2]-q[1])*rng();
  else v=q[2]+(q[2]-q[1])*rng()*0.8;
  return Math.max(lo,Math.min(hi,v));
}

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
  const rng=mulberry32(seed||Date.now());
  const prog=(typeof SONGDB!=='undefined'&&SONGDB[progId])?SONGDB[progId]:PROGS[progId];
  const bars=barChords(prog,keyPc);
  /* v0.27 곡 유형별 어법 — 블루스(블루노트 어휘)·모달(펜타토닉 중심)·리듬체인지(브리지 도미넌트 강조) */
  const songType=(()=>{
    if(prog.c==='블루스')return 'blues';
    const tot=Math.max(1,bars.reduce((a,b)=>a+b.length,0));let dom=0;
    bars.forEach(b=>b.forEach(x=>{if(x.t==='7'||x.t==='9'||x.t==='7b9'||x.t==='7#9')dom++}));
    const dr=dom/tot;
    if(/rhythm/i.test(progId)||dr>0.45)return 'rhythm';
    if(dr<0.12)return 'modal';
    return 'standard';})();
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
  const stats={targets:0,guideHits:0,enc:0,appr:0,chrom:0,cells:0};

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
    return (g===act||((b%8===4||b%8===5)&&g===pl.first))?1:0.08;
  };
  const centerAt=t=>{
    if(inst==='free'||!useGroups)return inst==='free'?70:71;
    const b=Math.min(NB-1,Math.floor(t/TPB)),pl=plans[Math.floor(b/8)];
    return (b%8<4?pl.first:pl.second)==='A'?66:76;
  };
  const MAXLEAP=inst==='free'?12:7;

  /* ── ④ 프레이즈 계획 ── */
  const phLenQ=PF?PF.stats.phLen:[4.2,7.1,13.1],gapQ=PF?PF.stats.gap:[1.2,2,3.1];
  const capBeats=inst==='wind'?8:(inst==='brass'?12:16);
  const lenScale=[0,0.75,0.9,1][diff]*(ARC.n>1?(ARC.i===0?0.82:(ARC.i>=ARC.n-1?1.18:1)):1);
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
    if(end>totalBeats-1)end=totalBeats-1;
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
    lp.e=Math.max(lp.s+1,totalBeats-4);lp.final=true;
    if(lp.e-lp.s>capBeats+4){phrases.push({s:lp.e-Math.min(capBeats,6),e:lp.e,final:true});lp.e=lp.e-Math.min(capBeats,6)-2;lp.final=false;if(lp.e<=lp.s)phrases.splice(phrases.length-2,1)}
  }

  /* v0.27 프레이즈 리듬 템플릿 — 엇박 진입·당김·중간 쉼·긴 종지음 같은 프레이즈 단위 윤곽을 통째로 쓴다(확률 55%, 난이도 2+) */
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
  /* ── ③ 리듬 생성(박 단위 마르코프 + 프레이즈 템플릿) ── */
  const RH=PF?PF.rhy:null;
  const transRow=(bp,prev)=>{
    if(!RH)return {Q:1,E:2,H:0.6,R:0.4,Uh:0.6,Ur:0.4,T:0.2};
    const row=RH[String(bp)][prev]||RH[String(bp)]['E'],o={};
    TOK.forEach((t,i)=>{const k=t==='Tr'?'T':t;o[k]=(o[k]||0)+row[i]*(t==='Tr'?0.5:1)});
    return o;
  };
  const events=[]; /* {t,d,midi,trip,ph,strong,first,last} */
  let motif=null;
  phrases.forEach((ph,pi)=>{
    const toks=[];
    const secIdx=Math.floor(ph.s/(P*4)),role=roles[secIdx]||'statement';
    const recall=motif&&role==='answer'&&ph.s%(P*4)<4&&rng()<0.65;
    /* v0.27 프레이즈 리듬 템플릿 선택 */
    let tpl=null;
    const need=ph.e-ph.s+1;
    if(diff>=2&&!recall&&need>=4&&rng()<0.55){
      const cs=RHY_TPL.filter(t2=>t2.length>=need);
      if(cs.length){tpl=cs[Math.floor(rng()*cs.length)].slice(0,need);tag(Math.floor(ph.s/4),'리듬 템플릿')}
    }
    let prev='R';
    for(let bt=ph.s;bt<=ph.e;bt++){
      const bp=(bt%4)+1,isFirst=bt===ph.s,isLast=bt===ph.e;
      if(recall&&bt-ph.s<motif.toks.length){toks.push(motif.toks[bt-ph.s]);prev=toks[toks.length-1];continue}
      let k;
      if(tpl){k=tpl[bt-ph.s]||'Q'}
      else{
      const row=transRow(bp,prev),al=ALLOWED[diff];
      const c=[];
      for(const k2 in row){
        if(!al[k2])continue;
        let w=row[k2];
        if(k2==='T')w*=FP.T;else if(k2==='E')w*=FP.E;else if(k2==='Q'||k2==='H')w*=FP.QH;
        if(isFirst&&!NOTE_TOK[k2])continue;
        if(isFirst&&k2==='Uh')continue;
        if(!isFirst&&k2==='R')w*=0.25;
        if(isLast&&!(k2==='Q'||k2==='E'||k2==='Uh'||(k2==='Ur'&&diff>=2)))continue;
        if((k2==='H'||k2==='Uh')&&prev==='T')continue;
        if(k2==='H'&&prev==='R')continue;
        if(k2==='Uh'&&prev==='R')continue;
        if(diff===2&&k2==='E')w*=0.8;
        if(diff===1&&k2==='H'&&bp%2===1)w*=0.5;
        if(role==='contrast'&&(k2==='E'||k2==='T'))w*=1.15;
        if(role==='resolution'&&(k2==='H'||k2==='Q'))w*=1.2;
        c.push({v:k2,w});
      }
      k=c.length?pickW(rng,c):'Q';
      }
      toks.push(k);prev=k;
    }
    if(!motif&&ph.e-ph.s>=3)motif={toks:toks.slice(0,Math.min(6,toks.length)),pi};
    if(recall){ph.recall=true;tag(Math.floor(ph.s/4),'모티프 회상(리듬)')}
    /* 토큰 → 음 이벤트 */
    const phEv=[];
    toks.forEach((k,j)=>{
      const t=(ph.s+j)*6;
      const lastEv=phEv[phEv.length-1];
      if(k==='Q')phEv.push({t,d:6});
      else if(k==='E'){phEv.push({t,d:3});phEv.push({t:t+3,d:3})}
      else if(k==='Ur'){phEv.push({t:t+3,d:3})}
      else if(k==='Uh'){if(lastEv&&lastEv.t+lastEv.d===t&&!lastEv.trip)lastEv.d+=3;phEv.push({t:t+3,d:3})}
      else if(k==='T'){phEv.push({t,d:2,trip:1});phEv.push({t:t+2,d:2,trip:1});phEv.push({t:t+4,d:2,trip:1})}
      else if(k==='H'){if(lastEv&&lastEv.t+lastEv.d===t&&!lastEv.trip)lastEv.d+=6}
    });
    if(!phEv.length)return;
    /* 프레이즈 끝음 — 길게(1~2박 더) */
    const le=phEv[phEv.length-1];
    if(!le.trip){
      const ext=ph.final?Math.max(0,TOT-(le.t+le.d)):(rng()<0.6?6:(rng()<0.5?3:0));
      le.d+=ext;
    }
    phEv.forEach((e,k)=>{e.ph=pi;e.strong=e.t%6===0;e.first=k===0;e.last=k===phEv.length-1;e.midi=null;events.push(e)});
    if(phEv[0].t%6!==0)tag(Math.floor(phEv[0].t/24),'픽업 진입');
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
  const phVar=phrases.map(()=>topic==='dom'?(songType==='modal'?0:Math.floor(rng()*4)):0);
  const clsOf=seg=>TYPE_CLS[seg.type]||'dom';
  const matScaleOf=(ph,seg)=>{const L=SCALE_VARIANTS[clsOf(seg)]||SCALE_VARIANTS.dom;return L[Math.min(phVar[ph],L.length-1)]};
  const matName=(ph,seg)=>{const L=VARIANT_NAME[clsOf(seg)]||[];return L[Math.min(phVar[ph],L.length-1)]||'변형 스케일'};
  const matOK=(seg,m,ph)=>{const dev=phDev[ph];if(!dev||dev==='chrom'||dev==='quote')return true;
    if(dev==='ct')return isCT(seg,m);
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
  const isMain=(seg,m)=>{const r=mod12(m-seg.root);return seg.ct.includes(r)||(PENTA_REL[seg.cls]||[]).includes(r)};
  const chromF=PF?Math.min(1.6,Math.max(0.6,PF.stats.chrom/0.2)):1;
  const cellRate=PF?(0.18+0.5*(PF.stats.eighth-0.68)):0.2;

  const forced=new Map(); /* 이벤트 인덱스 → {m,kind} */
  events.forEach((e,i)=>{if(e.quote)forced.set(i,{m:e.qm,kind:'quote'})});
  let prevM=null,prev2M=null,lastDir=-1;
  const contour={};

  function pitchCands(i,e,seg,mode){
    const out=[];
    for(let m=LO;m<=HI;m++){
      if(!allow(m,e.t))continue;
      const rel=mod12(m-seg.root);
      const ct=isCT(seg,m),sc=inScale(seg,m),tn=isTens(seg,m);
      const dev=phDev[e.ph];
      if(!matOK(seg,m,e.ph))continue;
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
          const dir=Math.sign(m-prevM),nx=m+dir;
          if(!isMain(seg,nx))continue;                             /* 반드시 메인 음으로 해결 */
          w=pcW(seg,rel,false)*0.9*chromF;
        }else if(heavy){if(!mn&&!tn)continue;w=pcW(seg,rel,true)*(ct?1.5:(mn?0.8:0.25))}
        else w=pcW(seg,rel,false)*(mn?1.2:1);
        if(seg.type==='maj7'&&rel===5)w*=0.1;
      }
      if(diff>=2){
        if(heavy&&!ct)w*=FP.heavyCT;          /* 장르별: 강박·긴 음은 코드톤으로 */
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
      if(songType==='rhythm'&&ct)w*=(roles[e.ph]==='contrast'?1.7:1.2);  /* 브리지(contrast)=도미넌트 순환 코드톤 주도 */
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
let arcOff=ARC.n>1?(-2+8*ARC.i/Math.max(1,ARC.n-1)):0;      /* 코러스 곡선: 음역이 코러스마다 올라갔다 */
      if(ARC.n>1&&ARC.i>=ARC.n-1&&phrases[e.ph]&&phrases[e.ph].final)arcOff=-6;  /* 마지막 프레이즈에서 이완 */
      const g=contour.goal?contour.goal(e.t)+arcOff:centerAt(e.t)+arcOff;
      const dg=m-g;w*=Math.exp(-(dg*dg)/(2*(diff===1?4.5:6)*(diff===1?4.5:6)));
      if(mode==='end'){if(!ct&&!(tn&&seg.cls!=='domalt'))continue;w*=(rel===0||isGuide(seg,m)||rel===7)?1.5:1}
      if(w>0)out.push({v:m,w});
    }
    return out;
  }
  function chooseTarget(seg,t,ref){
    const c=[];
    for(let m=LO;m<=HI;m++){
      if(!allow(m,t)||!isCT(seg,m)&&!(diff===3&&isTens(seg,m)&&seg.cls==='domalt'))continue;
      const d=ref===null?0:m-ref;
      if(Math.abs(d)>Math.min(MAXLEAP,diff===1?5:6))continue;
      let w=pcW(seg,mod12(m-seg.root),true)*groupFit(m,t);
      if(isGuide(seg,m))w*=3.2;
      if(Math.abs(d)===1)w*=2.6;else if(Math.abs(d)===2)w*=1.8;else if(d===0)w*=diff===1?0.35:0.15;
      const g=contour.goal?contour.goal(t):centerAt(t);w*=Math.exp(-((m-g)*(m-g))/72);
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
    if(j<0||forced.has(j))return;
    const seg2=segs[segAt(events[j].t)];
    const T=chooseTarget(seg2,events[j].t,prevM);
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
      if((ev.strong||ev.d>=6)&&!isMain(sA,seq[k]))return;
    }
    const startIdx=j-seq.length;
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

  let curPh=-1;
  for(let i=0;i<events.length;i++){
    const e=events[i];
    const seg=segs[segAt(e.t)];
    if(e.ph!==curPh){ /* 새 프레이즈: 음형 목표 설정 */
      curPh=e.ph;
      const ph=phrases[e.ph],t0=ph.s*6,t1=(ph.e+1)*6;
      const c=centerAt(t0),span=inst==='free'||!useGroups?7:4;
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
      if(ph.s%4===0||e.first){
        tag(Math.floor(e.t/TPB),'프레이즈 시작');
        const dv=phDev[e.ph];
        if(dv&&dv!=='quote')tag(Math.floor(e.t/TPB),'주제: '+(dv==='scale'?('스케일 — '+(seg.sname||'')):dv==='dom'?('활용 스케일 — '+matName(e.ph,seg)):TOPIC_LABEL[dv]));
      }
    }
    let m=null,f=forced.get(i);
    if(f&&(f.kind==='quote'||okNote(f.m,e.t,prevM)))m=f.m;
    else{
      if(f)forced.delete(i);
      if(!e.first&&!e.last&&tryCell(i)){const f2=forced.get(i);if(okNote(f2.m,e.t,prevM))m=f2.m}
      if(m===null){
        const mode=(e.last||(e.first&&e.d>=6))?'end':null;
        let c=pitchCands(i,e,seg,mode);
        if(!c.length)c=pitchCands(i,e,seg,null);
        if(!c.length){
          const ref=prevM===null?centerAt(e.t):prevM;
          let ct=chordToneMidis(seg.root,seg.type,LO,HI).filter(x=>okNote(x,e.t,prevM));
          if(!ct.length){const mm=[];for(let x=LO;x<=HI;x++)if(isMain(seg,x)&&matOK(seg,x,e.ph)&&okNote(x,e.t,prevM))mm.push(x);ct=mm}
          if(!ct.length)ct=chordToneMidis(seg.root,seg.type,LO,HI); /* 최후: 한도 무시하고 가장 가까운 코드톤 */
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
    if(f&&f.kind==='target'&&m!==null){
      if(isGuide(seg,m)){stats.guideHits++;tag(Math.floor(e.t/TPB),'가이드톤 타깃')}
      else tag(Math.floor(e.t/TPB),'코드톤 착지');
    }
    if(m!==null){if(prevM!==null&&m!==prevM)lastDir=Math.sign(m-prevM);prev2M=prevM;prevM=m}
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
          for(let x=LO;x<=HI;x++)if(isMain(sg,x)&&Math.abs(x-e.midi)<=MAXLEAP&&(ppv===null||Math.abs(x-ppv)<=MAXLEAP))mm.push(x);
          if(mm.length)pe.midi=nearest(mm,e.midi);
        }
        ppv=pv;pv=e.midi;pi=i;continue;
      }
      if(pv!==null&&Math.abs(e.midi-pv)>MAXLEAP&&!(events[pi]&&events[pi].quote&&false)){
        const seg=segs[segAt(e.t)];
        const c=chordToneMidis(seg.root,seg.type,LO,HI).filter(x=>okNote(x,e.t,pv));
        if(c.length)e.midi=nearest(c,e.midi);else{const mm=[];for(let x=LO;x<=HI;x++)if(isMain(seg,x)&&matOK(seg,x,e.ph)&&Math.abs(x-pv)<=MAXLEAP)mm.push(x);e.midi=mm.length?nearest(mm,e.midi):pv}
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
      if(!e.quote&&s2!==seg&&e.d>=6&&!isMain(s2,e.midi)){
        const cand=[];
        let nx=null;for(let j=i+1;j<events.length;j++)if(events[j].midi!==null){nx=events[j].midi;break}
        for(let x=Math.max(LO,e.midi-4);x<=Math.min(HI,e.midi+4);x++)
          if(isMain(s2,x)&&isMain(seg,x)&&(matOK(s2,x,e.ph)&&matOK(seg,x,e.ph))&&(pv===null||Math.abs(x-pv)<=MAXLEAP)&&(nx===null||Math.abs(x-nx)<=MAXLEAP))cand.push(x);
        if(cand.length)e.midi=nearest(cand,e.midi); /* 양쪽 코드 모두 메인 음인 곳으로만 — 아니면 그대로 둔다 */
      }
      if(e.midi!==null)pv=e.midi;
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
      if(!first&&Math.floor(t/TPB)!==Math.floor((t-1)/TPB)&&e.midi!==null)tag(Math.floor(t/24),'붙임줄 당김음');
      t+=d;first=false;
    }
    cursor=end;
  }
  if(cursor<TOT)pushRest(cursor,TOT);
  /* 3연음 그룹 보정: 그룹(박 단위)은 반드시 3개 */
  const result=bars.map((bar,b)=>({chords:bar,notes:[],tags:tagsAt[b]}));
  for(const p of pieces){
    const b=Math.floor(p.t/TPB);
    const n={t:p.t-b*TPB,d:p.d,midi:p.midi};
    if(p.trip)n.trip=true;if(p.tie)n.tie=true;
    if(p.ev&&!p.cont){if(p.ev.first)n.phStart=true;if(p.ev.last)n.phEnd=true}
    result[b].notes.push(n);
  }
  result.forEach((bar,b)=>{
    if(bar.notes.some(n=>n.trip))tag(b,'3연음');
    if(inst==='wind'&&phrases.some(ph=>Math.floor(ph.e/4)===b&&!ph.final))tag(b,'호흡 쉼표');
    if(!bar.notes.some(n=>n.midi!==null))tag(b,'쉼(호흡)');
  });
  phrases.forEach(ph=>tag(Math.floor(ph.e/4),'프레이즈 종지'));
  return {progId,keyPc,diff,style:styleId,bpb:BPB,bars:result,ts:Date.now(),harm:segs.map(s=>({bar:s.bar,t0:s.t0,label:s.label,fn:s.fn,sname:s.sname})),
    stats,feel,topic,quote:quoteInfo,form:{phrase:P,sections:sec.slice(0,nPh).split(''),licks:lickUse,phrases:phrases.length}};
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
      let s=bar.chords.map(ch=>'"'+chordSymbol(ch.root+transpose,ch.type)+'"').join(' ')+' ';
      let tripPos=0;
      const exact={},letter={};   /* 마디 안 임시표 지속(ABC·기보 공통 규칙) */
      bar.notes.forEach((n,k)=>{
        const ch=bar.chords[(n.t>=12&&bar.chords.length>1)?1:0];
        const scale=CHORD_TYPES[ch.type].scale;
        if(n.t%6===0&&k>0&&!n.trip&&!(bar.notes[k-1]&&bar.notes[k-1].trip))s+=' ';
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
