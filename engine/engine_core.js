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
  /* v0.37 코드집용 */
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
  {id:'brass', name:'금관', desc:'트럼펫·트롬본 계열 — B3 이하 최소화, 5도 초과 도약 차단, 프레이즈 최대 3~4마디'},
  {id:'wind',  name:'목관', desc:'색소폰·클라리넷·플루트 — 프레이즈 최대 3~4마디 + 1박 이상 호흡. 음역·도약 규칙은 금관과 동일'},
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
/* CELLS66> v0.66.3 재즈 교육 공통 어휘 — tools/licks_src.js 에서 만든다(여기서 직접 고치지 말 것). v:66 = '선율 다듬기'를 끄면 쓰지 않는다 */
CURATED_CELLS.push(
  {"v":66,"cls":"min","to":"dom","tr":5,"s":3,"iv":[-1,-2,-2,-1],"w":2.4,"name":"Ⅱ: ♭3-2-1-♭7 → Ⅴ의 3음 (7→3 해결)"},
  {"v":66,"cls":"min","to":"dom","tr":5,"s":7,"iv":[-4,-3,-2,-1],"w":2.4,"name":"Ⅱ: 5-♭3-1-♭7 → Ⅴ의 3음 (7→3 해결)"},
  {"v":66,"cls":"hdim","to":"dom","tr":5,"s":0,"iv":[3,3,4,-1],"w":2.4,"name":"Ⅱø: 1-♭3-♭5-♭7 → Ⅴ의 3음"},
  {"v":66,"cls":"hdim","to":"dom","tr":5,"s":6,"iv":[-3,-3,-2,-1],"w":2.4,"name":"Ⅱø: ♭5-♭3-1-♭7 → Ⅴ의 3음"},
  {"v":66,"cls":"dom","to":"maj","tr":5,"s":4,"iv":[-2,-2,-2,-1],"w":2.4,"name":"Ⅴ: 3-2-1-♭7 → Ⅰ의 3음 (7→3 해결)"},
  {"v":66,"cls":"dom","to":"maj","tr":5,"s":7,"iv":[-3,-4,-2,-1],"w":2.4,"name":"Ⅴ: 5-3-1-♭7 → Ⅰ의 3음 (7→3 해결)"},
  {"v":66,"cls":"dom","to":"maj","tr":5,"s":1,"iv":[-1,-2,-2,1],"minDiff":3,"name":"Ⅴ: ♭9-1-♭7-♭13 → Ⅰ의 3음 (인클로저)"},
  {"v":66,"cls":"dom","to":"maj","tr":5,"s":4,"iv":[-3,-3,-4,-1],"minDiff":3,"name":"Ⅴ: 3-♭9-♭7-♭5 → Ⅰ의 1음 (트라이톤 대리)"},
  {"v":66,"cls":"domalt","to":"min","tr":5,"s":4,"iv":[-3,-1,-2,-2],"w":2.4,"name":"Ⅴ: 3-♭9-1-♭7 → ⅰ의 ♭3음 (7→3 해결)"},
  {"v":66,"cls":"domalt","to":"min","tr":5,"s":1,"iv":[-1,-2,-3,1],"name":"Ⅴ: ♭9-1-♭7-5 → ⅰ의 ♭3음 (인클로저)"},
  {"v":66,"cls":"dom","to":"min","tr":5,"s":4,"iv":[-3,-1,-2,-2],"w":2.4,"name":"Ⅴ: 3-♭9-1-♭7 → ⅰ의 ♭3음 (7→3 해결)"},
  {"v":66,"cls":"dom","to":"dom","tr":5,"s":4,"iv":[-2,-2,-2,-1],"w":2.4,"name":"3-2-1-♭7 → 다음 7코드의 3음 (7→3 해결)"},
  {"v":66,"cls":"maj","to":"dom","tr":9,"s":7,"iv":[-3,-2,-2,1],"name":"Ⅰ: 5-3-2-1 → Ⅵ7의 3음 (반음 위로)"},
  {"v":66,"cls":"maj","to":"dom","tr":9,"s":4,"iv":[3,2,3,1],"name":"Ⅰ: 3-5-6-1 → Ⅵ7의 3음 (반음 위로)"},
  {"v":66,"cls":"dom","to":"maj","tr":11,"s":4,"iv":[3,3,4,1],"name":"♭Ⅱ7: 3-5-♭7-9 → Ⅰ의 3음 (트라이톤 대리 해결)"},
  {"v":66,"cls":"dom","to":"maj","tr":11,"s":10,"iv":[-3,-3,-4,-1],"name":"♭Ⅱ7: ♭7-5-3-1 → Ⅰ의 1음 (반음 아래로)"},
  {"v":66,"cls":"maj","to":"maj","tr":5,"s":4,"iv":[-2,-2,-1,-2],"name":"Ⅰ: 3-2-1-7 → Ⅳ의 3음"},
  {"v":66,"cls":"maj","to":"min","tr":2,"s":4,"iv":[3,2,-2,-2],"name":"Ⅰ: 3-5-6-5 → Ⅱ의 ♭3음"},
  {"v":66,"cls":"min","to":"min","tr":5,"s":3,"iv":[-1,-2,-2,-2],"name":"♭3-2-1-♭7 → 다음 마이너의 ♭3음 (7→3 해결)"},
  {"v":66,"cls":"dom","s":10,"iv":[2,4,3],"name":"♭7-1-3-5 (♭7에서 오르는 아르페지오)"},
  {"v":66,"cls":"min","s":10,"iv":[2,3,4],"name":"♭7-1-♭3-5 (♭7에서 오르는 아르페지오)"},
  {"v":66,"cls":"maj","s":11,"iv":[1,4,3],"name":"7-1-3-5 (이끎음에서 오르는 아르페지오)"},
  {"v":66,"cls":"maj","s":2,"iv":[-3,-4,-3],"name":"9-7-5-3 (상부 구조 하행)"},
  {"v":66,"cls":"min","s":2,"iv":[-4,-3,-4],"name":"9-♭7-5-♭3 (상부 구조 하행)"},
  {"v":66,"cls":"min","s":7,"iv":[-2,-2,-3],"name":"5-4-♭3-1 (하행 셀)"},
  {"v":66,"cls":"maj","s":4,"iv":[-2,-2,-3],"name":"3-2-1-6 (펜타토닉 하행)"},
  {"v":66,"cls":"maj","s":9,"iv":[-1,-1,-3],"minDiff":3,"name":"6-♯5-5-3 (비밥 메이저 하행)"},
  {"v":66,"cls":"domalt","s":1,"iv":[-3,-3,-3],"name":"♭9-♭7-5-3 (감7 하행 아르페지오)"},
  {"v":66,"cls":"min","s":0,"iv":[3,2,2],"name":"1-♭3-4-5 (마이너 펜타)"}
);
/* <CELLS66 */

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
    if(L&&L.root===s.root&&L.type===s.type){}else merged.push({...s});   /* 같은 코드가 이어지면 한 구간 */
  }
  merged.forEach((s,i)=>{s.dur=(i+1<merged.length?merged[i+1].t0:bars.length*TPB)-s.t0});   /* v0.62 구간 길이(틱) — 예전 L.dur+=s.dur는 정의 안 된 값을 더해 NaN이었다(쓰는 곳은 없었음, GPT 검토 지적 확인) */
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
const CUT_TOK={R:1,T:1,Qs:1,T2c:1};   /* v0.61 T2c = 2박 셋잇단의 둘째 박 자리 */

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
/* v0.66.5 노래 프레이즈 리듬(선율 다듬기 켰을 때만) — 긴 음 + 8분 채움. 「4 4 2~」만 이어지지 않게
   2분음표 뒤 8분 스케일, (8분 쉼) 8 8 8 8 점4분 → 붙임줄 같은 노래하듯 숨 쉬는 리듬. NATURAL.song.rich 비율로 섞는다 */
const SONG_CELLS66={
  4:[['Q','H','E','E'],['Ur','E','E','H'],['E','E','Q','H'],['Q','Uh','H','E'],['Ur','Uh','H','E'],['E','Q','Uh','H'],['Q','H','Ur','E'],['E','E','E','Uh'],['Ur','E','Q','H'],['Q','E','E','H']],
  3:[['Q','H','E'],['Ur','E','Uh'],['E','E','Q'],['E','Q','Uh'],['Ur','E','E'],['Q','E','Uh']],
  2:[['Q','E'],['Ur','E'],['E','Uh'],['E','Q'],['Ur','Uh']]
};
const LYRIC_DEFAULT=0.3;   /* 노래↔비밥 조절바 기본값(노래 프레이즈 비율) */
/* v0.43 당김음 — 4박 엇박에서 다음 마디로 물고 들어가는 음·한 박 당겨 시작하는 프레이즈를 늘린다(난이도 2 이상)
   pull: 마디 첫 박에 시작할 프레이즈를 앞 마디 4박으로 당길 확률 · lastBeat: 마지막 박 엇박 진입(Ur·Uh) 가중 ·
   firstUr: 그 당긴 프레이즈 첫 박의 엇박 진입 가중 · holdOver: 엇박 다음 마디 첫 박을 이어 붙이는(H) 가중 */
const ANTIC={pull:0.3,lastBeat:1.6,firstUr:2.5,holdOver:2.0,merge:0.35};   /* merge: 4박 엇박 8분 + 다음 마디 첫 박 음을 한 음으로 묶을 확률 */
/* v0.43 첫 코러스 빌드업 — 앞부분(A)은 지금처럼 성기게, B(또는 곡 절반)부터 둘째 코러스 수준으로 바로 끌어올린다
   from: B에서 시작하는 수준(둘째 코러스=1) · reach: 남은 구간 중 1에 닿는 비율 */
const BUILD_FIRST={from:0.6,reach:0.5};
const UST_W=1.6;   /* v0.48 하이라이트 장치 중 어퍼 스트럭처를 고를 무게(8분 라인 1.3 · 피벗 0.9 …) */
/* v0.59 리듬 구성(사용자 피드백 11/13: 셋잇단 줄이고 8분 연속을 늘림) — 셋잇단·8분 토큰 가중, 셋잇단 쌍(6연음 느낌)·셋잇단 런·8분 라인 장치 무게 */
const RHY_MIX={trip:1,tripPair:0.35,tripRun:0.8,eighth:1.25,line:1.6};   /* v0.63 셋잇단을 너무 줄였다는 피드백 — 0.6·0.2·0.45 → 1·0.35·0.8(연달아 2묶음 규칙은 그대로) */
/* v0.59 쉬어 가는 섹션 — 3코러스 이상일 때 둘째~끝에서 둘째 코러스에 확률 p로 한 섹션(A 우선)을 첫 코러스 A처럼 성기게.
   density: 그 섹션의 리듬 밀도 · songBonus: 노래 프레이즈로 고를 가산점 · salt: 본 난수열과 따로 쓰는 난수 씨앗 */
/* v0.60 쉼·리듬 섞기(사용자 피드백 11/13: 2박 쉼이 많아 하다 말다 하는 느낌, 8분·4분이 섞이는 구간 필요)
   gapShortP: 프레이즈 사이를 1박 숨으로 줄일 확률 · gapMax: 프레이즈 사이 쉼 상한(박) — longGapP 확률로만 그보다 길게 · pullHalf: 셋째 박에서 시작하는 프레이즈를 둘째 박(또는 넷째 박 픽업)으로 당길 확률
   inR: 프레이즈 안 쉼표(4분 쉼) 가중 · mixPh: 「8분·4분 섞기」 프레이즈 확률 · straight: 셋잇단이 어색한 곧은 8분 계열(셋잇단 장치·릭 제외) */
const REST_MIX={gapShortP:0.45,gapMax:2.5,longGapP:0.15,pullHalf:0.7,inR:0.15,mixPh:0.3,straight:['bossa','latin','funk']};
/* v0.61 난이도 5단계(사용자 요청 11/13 — 3단계부터 중급) — 앱 단계(opts.level 1~5) → 엔진 난이도(diff 1~3) + 세부 조정.
   E: 8분 가중 배수 · hl: 하이라이트 장치 확률 배수 · licks/ust: false면 끔 · trip: 8분 셋잇단 가중 배수 · t2: 프레이즈마다 2박 셋잇단(4분 셋잇단)을 넣을 확률.
   opts.level이 없으면 diff 1·2·3 → 단계 1·3·5(v0.60까지의 1·2·3과 같은 느낌) */
const LEVELS={1:{diff:1,label:'입문'},2:{diff:2,label:'초급',E:0.6,hl:0,licks:false,ust:false,t2:0},3:{diff:2,label:'중급',t2:0.04},
  4:{diff:3,label:'중상급',trip:0.7,t2:0.06},5:{diff:3,label:'심화',t2:0.07}};   /* v0.63 2박 셋잇단이 너무 잦다는 피드백 — 0.12·0.16·0.18 → 0.04·0.06·0.07 */
const LEVEL_OF_DIFF={1:1,2:3,3:5};
const TRIP_MAX_RUN=2;   /* v0.61 셋잇단 묶음(8분 셋잇단 한 박 · 2박 셋잇단)은 연달아 2개까지(사용자 규칙) */
/* v0.62 장르 리듬 묶음(FEEL_CELLS) — 한 마디(4박) 토큰 묶음. 곧은 8분 계열·발라드·셔플에서 프레이즈 리듬을 이 말투로 짠다.
   Q 4분 · E 8분 둘 · Qs 짧게 끊은 8분 · Ur 쉼+엇박 · Uh 앞음 지속+엇박(당김) · H 지속 · R 쉼 · T 8분 셋잇단
   latin: 트레실로(3+3+2)·찰스턴·앞당김 / bossa: 긴 음+당김 / funk: 짧게 끊는 음+엇박 / shuffle: 블루스 리프형 / ballad: 긴 음+짧은 꾸밈.
   p: 프레이즈가 이 묶음을 쓸 확률 · riff: 그중 한 묶음을 되풀이해 「리프 반복(콜 앤 리스펀스)」으로 만들 확률 */
const FEEL_CELLS={
  latin:{p:0.45,riff:0.4,cells:[['Q','Uh','H','Q'],['Q','Uh','H','R'],['E','Ur','Qs','E'],['Qs','Ur','E','Q'],['Ur','Uh','H','Q'],['E','E','Ur','Uh']]},
  bossa:{p:0.45,riff:0.25,cells:[['Q','Uh','H','Uh'],['Q','H','Ur','E'],['Ur','E','Uh','H'],['E','Q','Uh','H'],['Q','Uh','H','Q']]},
  funk:{p:0.5,riff:0.45,cells:[['Qs','Ur','Qs','E'],['E','Qs','Ur','Qs'],['Qs','Qs','Ur','Ur'],['Ur','Qs','E','Qs'],['E','E','Qs','Ur']]},
  shuffle:{p:0.35,riff:0.45,cells:[['Q','Q','Qs','R'],['Ur','Uh','H','R'],['E','Q','Uh','H'],['Qs','Ur','Q','R'],['T','Q','Qs','R']]},
  ballad:{p:0.35,riff:0,cells:[['Q','H','Ur','E'],['Q','H','H','E'],['Ur','E','Q','H'],['E','E','Q','H'],['T','Q','H','H'],['H','H','Ur','E']]},
  swing:{p:0,riff:0.08,cells:[['Q','Uh','H','R'],['Ur','Uh','H','R'],['E','Q','Uh','H']]}   /* 스윙은 실측 리듬 그대로 — 블루스 곡에서만 가끔 리프 */
};
/* v0.63 촘촘한 묶음 — 밀도(코러스 곡선)가 FEEL_DENSE_AT 이상이면 이쪽을 쓰고 확률은 FEEL_DENSE_P배(뒤 코러스는 실측 비밥 리듬 비중을 늘림) */
const FEEL_DENSE={latin:[['E','E','Ur','E'],['E','Qs','E','E'],['E','E','E','Uh'],['Ur','E','E','Qs']],bossa:[['E','E','Uh','E'],['E','Ur','E','Q'],['Q','E','E','Uh']],
  funk:[['E','Qs','E','Qs'],['E','E','Qs','E'],['Qs','E','Ur','E']],shuffle:[['E','E','Q','Uh'],['T','E','Qs','E'],['E','Uh','E','Q']],ballad:[['E','E','T','Q'],['T','E','E','H'],['E','T','E','Q']],swing:[['E','E','Q','Uh']]};
const FEEL_DENSE_AT=0.95,FEEL_DENSE_P=0.6;
/* v0.66 장르 리듬 보강(선율 다듬기가 켜졌을 때 FEEL_CELLS·FEEL_DENSE 대신 쓴다) — 16분음표 없이 지금 격자 안에서 할 수 있는 만큼만.
   latin(칼립소 포함): 트레실로(1·2&·4)에 더해 싱키요(1·2·2&·3&·4)·아바네라(1·2&·3·4)·엇박 넷 — 스윙 통계로 짠 리듬을 곧게 연주하던 비중을 줄인다(p 0.45 → 0.6)
   ballad: 「긴 음 + 셋잇단 꾸밈」 대비 — 긴 음 끝에 셋잇단 픽업, 셋잇단 두 묶음으로 달려 긴 음에 앉기(8분만 이어지면 느린 연습처럼 들린다). T: 발라드 셋잇단 가중(예전 0.5) */
const FEEL_CELLS_N={
  latin:{p:0.6,riff:0.4,cells:[['Q','Uh','H','Q'],['Q','Uh','H','R'],['E','Ur','Qs','E'],['Qs','Ur','E','Q'],['Ur','Uh','H','Q'],['E','E','Ur','Uh'],['Q','E','Ur','Q'],['Q','Ur','Q','Q'],['Ur','Ur','Ur','Uh'],['Q','Qs','Ur','Q']]},
  ballad:{p:0.45,riff:0,cells:[['Q','H','Ur','E'],['Q','H','H','E'],['Ur','E','Q','H'],['E','E','Q','H'],['T','Q','H','H'],['H','H','Ur','E'],['Q','H','H','T'],['Q','H','T','Q'],['Ur','H','T','Q']]}};
const FEEL_DENSE_N={latin:[['E','E','Ur','E'],['E','Qs','E','E'],['E','E','E','Uh'],['Ur','E','E','Qs'],['Q','E','Ur','E']],ballad:[['E','E','T','Q'],['T','E','E','H'],['E','T','E','Q'],['T','T','Q','H'],['E','T','T','Q']]};
const BALLAD_T=0.95;
/* v0.62 스케일 색(외부 검토 「스케일 변형 고정」) — 단계 3 이상·자동 주제에서 해결하는 도미넌트(Ⅴ→장조)·한 마디 이상 장조 토닉의 스케일을
   코러스 곡선(뒤로 갈수록)·섹션 역할(B=대조)에 따라 가끔 바꾼다. p = base + arc×곡선 위치 + contrast(대조 섹션)
   도미넌트: 얼터드(alt) 또는 리디안 ♭7(lyd7) — 난이도 2(단계 3)는 리디안 ♭7만 · 장조: 리디안 */
const SCALE_COLOR={base:0.08,arc:0.32,contrast:0.15,altShare:0.6,majShare:0.5};
/* v0.64 문장 흐름(사용자 피드백 11/14: 「너와 나는 … 맞다. 함께 세상을 … 아. 바꿀 컨텐츠를」처럼 끊겨 들림)
   cap: 프레이즈 최대 길이(박) — 목관 8박(2마디)이 문장을 잘게 끊던 주원인 · sparseCap: 성긴 곳(첫 코러스 앞부분·쉬어 가는 섹션) 최대 길이 · lenLo/lenHi: 밀도(코러스 곡선)에 따라 프레이즈 길이 배수(성긴 곳 → 촘촘한 곳)
   denseGapP: 촘촘한 곳에서 프레이즈 사이를 1박 숨으로 줄일 확률 · crossP: 촘촘한 곳에서 섹션 경계 앞에서 굳이 끊지 않고 넘어갈 확률 · inR: 촘촘한 곳 프레이즈 안 4분 쉼 가중 */
const PHRASE_FLOW={cap:{wind:14,brass:14,free:16},sparseCap:8,lenLo:0.85,lenHi:1.35,denseGapP:0.6,crossP:0.5,inR:0.08};
/* v0.65 모티프 발전(사용자 피드백 11/14: 「모티프만 계속 새로 나오고 빌드업·디테일한 구조가 안 생김」)
   한 섹션의 첫 프레이즈 동기를 그 섹션의 「주제」로 삼아 쓸 때마다 단계를 올린다: 0 진술·대답(반복·시퀀스) → 1 시퀀스·쪼개기 → 2 쪼개기 위주 → maxUse번 쓰면 놓아 주고 긴 라인으로.
   sparseRate: 성긴 곳(첫 코러스 앞부분 등) 확률 배수 · shapeOnly: 리듬이 안 맞아 윤곽만 닮은 모티프를 버릴 확률
   stageW: 단계별 변형 무게(frag = 동기 끝 2~3음을 음 높이를 옮겨 두 번 — 쪼개기) · denseRate: 촘촘한 곳(뒤 코러스)에서 모티프를 다시 꺼낼 확률 배수 */
const MOTIF_DEV={maxUse:3,denseRate:0.55,sparseRate:1.4,shapeOnly:0.2,gapTicks:6,stageW:[{rep:0.6,up:1.2,down:1.2,inv:0.4},{rep:0.2,up:1.5,down:1.5,inv:0.6,frag:1},{up:0.6,down:0.6,inv:0.3,frag:1.5}]};
const RELAX={p:0.5,density:0.58,songBonus:0.35,salt:0x5f3759df};
/* v0.66 자연스러움 보완(연주자·교수 관점 검토 11/14) — 조정값을 한곳에 모았다. opts.natural===false면 전부 끄고 v0.65와 같은 결과를 낸다(같은 시드로 번갈아 들어 보기용).
   근거: 내장 WJD 분포와 생성 결과를 같은 기준으로 재 보니 ① 코러스 이음매 도약(7반음 초과 38%) ② 두 음 왕복·엇갈린 도약 ③ 정박 3·7음 쏠림(실측의 2.5~3배)
        ④ 스케일 밖 음 6%(실측 21%) ⑤ 모양 없는 셋잇단(꺾임 27%, 상행 아르페지오 2%) ⑥ Ⅴ7 위에서 해결 직전에 끊기는 프레이즈(30%)가 두드러졌다.
   seam   코러스 이음매 — 앞 코러스 끝음을 이어받아(opts.carry) 첫 음을 도약 한도 안에서 고른다
   osc    두 음 왕복·지그재그 억제(2차 동적 계획 viterbi2) — aba: 이웃음 왕복(A-B-A) · abaLeap: 3도 이상 도약 왕복 · zig: 4도 이상 엇갈린 연속 도약 ·
          stack: 같은 방향 4도 이상 연속 · recover: 도약 뒤 같은 방향으로 계속 감 · fill: 도약 뒤 반대 방향 순차(보너스) · flow: 같은 방향 순차 진행(보너스) · turn: 방향을 꺾는 비용 ·
          cyc3: 세 음 앞과 같은 음(세 음 주기 A-B-C-A-B-C…가 이어질수록 쌓인다 — 리프 한 번 되풀이는 괜찮고 서너 번은 막는다) · anchor: 처음 고른 음에서 반음당 벗어나는 비용
          runStep·runThird: 음을 처음 고를 때 순차·3도를 같은 방향으로 이어 갈 가중 · zigzag: 연달아 꺾을 때 가중(1보다 작게)
          (실측 공통 셀 141개는 77%가 한 방향 4음 — 내려가거나 올라가는 줄기가 비밥 어휘의 뼈대다. v0.65는 음마다 꺾이는 비율이 57%로 무작위(50%)보다도 높았다)
   beat   약한 정박(4/4의 2·4박)·끝음에 텐션(9·13, 마이너 11)을 허용하는 단계와 비용 · passLv: 2·4박 순차 경과음까지 허용하는 단계(앞뒤가 같은 방향 순차일 때만). 1·3박·코드 전환 첫 박은 그대로 코드톤
   chrom  단계별 「반음 어프로치·경과음 욕심」 — 엇박 자리마다 이 확률로, 다음 정박 코드톤에 반음으로 붙는 음에 보너스(bonus)
   trip   셋잇단 음형 계획 — p: 계획할 확률 · w: 모양 무게(상행 아르페지오·턴·순차 하행/상행·하행 아르페지오)
   land   Ⅴ7 위에서 끝나는 프레이즈를 해결 화음 첫 박에 착지시킬 확률(p) · 그중 4박 엇박 끝음을 당김음으로 늘려 넘길 비율(antic)
   ceil   음역 천장 — 여러 코러스일 때 처음엔 HI−reserve(반음)까지만 쓰고 전체의 open 지점에서 다 연다. steep: 천장 위 반음마다 곱하는 감점 · ballad: 발라드는 코러스 곡선(음높이)을 이 값으로 나눠 완만하게
   theme  1코러스 첫 동기를 뒤 코러스 섹션 첫머리에서 다시 꺼낼 확률(p) · 마지막 코러스 끝 섹션(last) — 「처음 한 말로 맺기」
   outside 바깥 소리 장치(반음 헤미올라·얼터드 색)를 쓸 최소 곡선 위치와 장르 */
const NATURAL={seam:true,
  climb:{p:{3:0.4,4:0.55,5:0.65},first:0.5,last:1.1,minTop:77,minRise:9,hold:[12,18,24],asc:[4,5,6],desc:[4,5,6,7],tries:16,shapes:{e8:1,q4:0.6,leap:0.6},leapHold:[9,12,18]},   /* v0.66.6 고음 끌기: 코러스마다 확률(단계별) · 첫/마지막 코러스 배수 · 고음 하한(F5) · 최소 상승 폭 · 끄는 길이(틱) · 오르는/내리는 8분 수 */
  flow:{lv:4,minD:0.8,longP:0.3,longLen:[11,17],shortLen:[1,3],shortAfterLong:0.55,cap:20,crossP:0.7,gapLong:[2,4],gapShort:[1,2],inLong:0.2,inAll:0.5,denseGapP:0.35,rE:0.72,rQ:1.35,rUh:1.5,rH:1.25},   /* v0.67 예시 솔로: 긴 문장(12박↑)과 짧은 한마디를 섞고 긴 문장 뒤엔 2~4박 숨 — 단계 4·5, 성긴 곳(밀도<0.8) 제외 */
  dtime:{p:{4:0.5,5:0.7},maxBpm:96,maxStep:4},   /* v0.67.2 발라드 더블 타임 런: 코러스마다 확률(단계 4·5) · 이 템포 이하(발라드는 늘) · 16분 사이 최대 반음 수 */
  six:{cap:{3:0,4:2,5:3},capSlow:{3:1,4:3,5:4},slowBpm:132,maxBpm:200,p:0.35,offbeat:0.6},   /* v0.67 16분 꾸밈음: 코러스당 최대 개수(단계별 · 느린 곡) · 이 템포 넘으면 안 씀 · 후보마다 확률 · 엇박 자리 가중 */
  song:{lyr:{1:1,2:1,3:0.85,4:0.6,5:0.5},rich:{2:0.25,3:0.6,4:0.85,5:0.9}},   /* v0.66.5 lyr: 단계별 노래 프레이즈 비율 배수(비밥 100 = 엔진 0.3에서 시작) · rich: 노래 프레이즈 셀 중 8분 채움 셀 비율 */
  osc:{aba:1.0,abaLeap:2.2,zig:1.2,stack:0.8,recover:0.7,fill:0.3,flow:0.25,turn:0.3,cyc3:0.7,anchor:1,runStep:1.7,runThird:1.35,zigzag:0.5},
  beat:{tensLv:4,tensCost:0.6,passLv:5,passCost:0.9,endTensLv:4},
  chrom:{3:0.05,4:0.16,5:0.28,bonus:1.5},
  /* v0.66.2 (단계 4·5만) guide: 코드가 바뀌는 첫 박을 3·7음으로 끌어당기는 힘 — target·third: 타깃을 고를 때 가이드톤·마디 첫 박 3음 가중(예전 3.2·2.4), change: 정렬에서 가이드톤이 아닐 때 비용(예전 4).
     여전히 코드톤이지만 근음·5음도 서게 한다(v0.66.1: 전환 첫 박의 79%가 3·7음, 정박 3음 비중이 실측의 두 배)
     bebop: line — 8분 줄기 장치(코드톤 라인 계획: 정박 코드톤 + 반음 경과음 정렬) 무게 배율 · hl — 촘촘한 구간에서 장치를 넣을 확률 배율 · pass — 그 계획 안의 반음 경과음 비용(예전 1.6) */
  guide:{4:{target:2.5,third:2.0,change:2.8},5:{target:1.9,third:1.6,change:1.8}},
  bebop:{line:{4:1.25,5:1.5},hl:{4:1.2,5:1.4},pass:{4:1.3,5:1.0}},
  trip:{p:0.85,w:{arpUp:3.2,turn:2.2,runDn:1.8,runUp:1.0,arpDn:0.9}},
  land:{p:0.75,antic:0.4},
  ceil:{reserve:{wind:5,brass:5,free:7},open:0.8,steep:0.5,ballad:2},
  theme:{p:0.35,last:0.8},
  outside:{minArc:0.34,feels:['swing','shuffle']},
  /* v0.66.3 릭 — half: 두 박씩 바뀌는 Ⅱ–Ⅴ 마디에도 · start: 프레이즈 첫 마디에도 · chain: 앞 릭 착지음에서 다음 릭을 이어 붙일 확률
     cap/capLong: 코러스당 최대(24마디 이상 형식은 capLong) · rate/rateC: 기존 확률에 곱하는 값 · again/carry: 같은 릭을 이 코러스/앞 코러스에서 이미 썼을 때 무게 · cellAgain: 같은 셀을 또 쓸 때마다 곱하는 값 */
  lick:{half:true,start:true,chain:0.85,capShort:1,shortForm:12,cap:2,capLong:3,longForm:24,rate:{2:1.5,3:1.5},rateC:2,golden:1.6,feel:{ballad:0.5},again:0.12,carry:0.2,cellAgain:0.6,alts:true,late:true,waltz:true},
  /* v0.66.1 두 음 리프(연주자 피드백 11/14: 두 음 반복·한 음 리듬은 나쁜 기법이 아니다 — 특히 빠른 곡에서 흔하다)
     w: 장치 무게 · blues/straight: 블루스·셔플 / 곧은 8분 계열 배율 · fastBpm·fast: 빠른 템포 배율(한 음 리듬에도 적용) · even: 한 마디짜리를 곧은 8분으로 할 확률
     aba·abab: 블루스 프레이즈 안에서 두 음 주고받기 비용(A-B-A / A-B-A-B) — v0.66은 1.2 / 없음이라 6음 넘는 두 음 리프가 0%가 됐다 */
  riff2:{w:1.0,blues:3.5,straight:1.6,fastBpm:180,fast:2.5,even:0.5,aba:0.2,abab:0.45,percBlues:2}};
/* v0.66 2차 비터비 — 상태 = (앞 음, 지금 음). 세 음을 봐야 아는 어색함(A-B-A-B 왕복, 엇갈린 도약, 도약 뒤 처리)에 비용을 매길 수 있다.
   cands[q] = q번째 음의 후보(미디 번호 배열) · node(q,m) = 그 음 자체의 비용 · pair(q,a,b) = q-1→q 전이 비용 · tri(q,a,b,c) = q-2→q-1→q 세 음 비용
   quad(q,z,a,b,c) = (선택) q-3까지 본 비용 — z는 (a,b)에 이르는 가장 좋은 길의 앞 음. 두 음 왕복만 막으면 최저 비용 경로가 세 음 주기(A-B-C-A-B-C…)로 옮겨 가기 때문에 둔다
   비용이 1e9 이상이면 금지. 반환 = 음 배열(풀 수 없으면 null). 난수를 쓰지 않는 순수 함수 */
function viterbi2(cands,node,pair,tri,quad){
  const n=cands.length,INF=1e9;if(!n)return [];
  const nc=cands.map((c,q)=>c.map(m=>node(q,m)));
  if(n===1){let b=-1;nc[0].forEach((c,i)=>{if(c<INF&&(b<0||c<nc[0][b]))b=i});return b<0?null:[cands[0][b]]}
  let cost=cands[0].map((a,ia)=>cands[1].map((b,ib)=>{const x=nc[0][ia],y=nc[1][ib];if(x>=INF||y>=INF)return INF;const p=pair(1,a,b);return p>=INF?INF:x+y+p}));
  const back=[];
  for(let q=2;q<n;q++){
    const A=cands[q-2],B=cands[q-1],C=cands[q];
    const nx=B.map(()=>C.map(()=>INF)),bk=B.map(()=>C.map(()=>-1));
    for(let ib=0;ib<B.length;ib++)for(let ic=0;ic<C.length;ic++){
      const y=nc[q][ic];if(y>=INF)continue;
      const p=pair(q,B[ib],C[ic]);if(p>=INF)continue;
      let best=INF,arg=-1;
      for(let ia=0;ia<A.length;ia++){const pc=cost[ia][ib];if(pc>=INF)continue;let t=tri(q,A[ia],B[ib],C[ic]);if(t>=INF)continue;
        if(quad&&q>=3){const iz=back[q-3][ia][ib];if(iz>=0)t+=quad(q,cands[q-3][iz],A[ia],B[ib],C[ic])}   /* 세 음 앞(가장 좋은 앞길 기준) — 세 음 주기 반복을 본다 */
        const v=pc+t;if(v<best){best=v;arg=ia}}
      if(arg>=0){nx[ib][ic]=best+y+p;bk[ib][ic]=arg}
    }
    cost=nx;back.push(bk);
  }
  let bi=-1,bj=-1,bc=INF;
  cost.forEach((row,i)=>row.forEach((c,j)=>{if(c<bc){bc=c;bi=i;bj=j}}));
  if(bi<0)return null;
  const ms=new Array(n);ms[n-1]=cands[n-1][bj];ms[n-2]=cands[n-2][bi];
  for(let q=n-1;q>=2;q--){const ia=back[q-2][bi][bj];ms[q-2]=cands[q-2][ia];bj=bi;bi=ia}
  return ms;
}
/* v0.66 세 음 모양 비용(공통) — a→b→c가 쉼 없이 이어질 때. O = NATURAL.osc */
function shapeCost3(O,a,b,c){
  const d1=b-a,d2=c-b,a1=Math.abs(d1),a2=Math.abs(d2);let t=0;
  if(c===a&&c!==b)t+=a1>=3?O.abaLeap:O.aba;                                   /* 왕복 */
  else if(a1>=5&&a2>=5)t+=Math.sign(d1)!==Math.sign(d2)?O.zig:O.stack;        /* 4도 이상 연속 도약 */
  if(a1>=5&&a2>0){if(Math.sign(d2)===Math.sign(d1))t+=O.recover;else if(a2<=2)t-=O.fill}   /* 도약 뒤: 반대 방향 순차로 메운다 */
  if(a1>=1&&a1<=2&&a2>=1&&a2<=2&&Math.sign(d1)===Math.sign(d2))t-=O.flow;     /* 순차 진행은 같은 방향으로 잇는다 */
  if(d1&&d2&&Math.sign(d1)!==Math.sign(d2))t+=O.turn;                          /* 방향을 꺾을 때마다 조금 */
  return t;
}
const BLUES_STD=0.04;   /* v0.48 블루스 형식이 아닌 스윙·발라드 곡에서 프레이즈가 블루스 스케일일 확률(예전 0.14·0.06) */
const HL_LABEL={line:'8분 라인',perc:'리듬 반복(한 음)',pivot:'피벗 패턴',hemiola:'3음 시퀀스(헤미올라)',trip:'셋잇단 런',ust:'어퍼 스트럭처',riff2:'두 음 리프'};
/* v0.48 어퍼 스트럭처 트라이어드 — 코드 위에 텐션(9·11·13·변화음)으로 쌓은 장·단3화음을 펼쳐 친다(기타 연주자 제안: 소리가 풍성해진다).
   그 코드 스케일 안의 음만 쓰고 텐션이 하나 이상. 장3음이 있는 코드에는 11(피할 음), ♭9가 없는 코드에는 ♭9를 쓰지 않는다.
   예) C7#11 위 D(9·#11·13) · C7alt 위 A♭(♭13·R·#9)·G♭(#11·♭7·♭9) · Cmaj7 위 G(5·7·9) · Cm7 위 B♭(♭7·9·11)·Dm(9·11·13) */
const UST_PC=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'],UST_DEG={0:'R',1:'♭9',2:'9',3:'♯9',4:'3',5:'11',6:'♯11',7:'5',8:'♭13',9:'13',10:'♭7',11:'7'};
function ustChoices(type){
  const T=CHORD_TYPES[type];if(!T)return [];
  const ok=new Set([...T.iv,...T.scale].map(x=>((x%12)+12)%12)),ct=new Set(T.iv.map(x=>((x%12)+12)%12));
  const maj3=ct.has(4),b9ok=type==='7b9'||type==='7#9',out=[];
  for(let r=1;r<12;r++)for(const [mi,q] of [[0,[0,4,7]],[1,[0,3,7]]]){
    const pcs=q.map(x=>(r+x)%12);
    if(!pcs.every(p=>ok.has(p))||(maj3&&pcs.includes(5))||(!b9ok&&pcs.includes(1)))continue;
    const ten=pcs.filter(p=>!ct.has(p)).length;if(ten<1)continue;
    out.push({r,minor:!!mi,pcs,ten});
  }
  return out;
}
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
  const LV=LEVELS[opts.level]&&LEVELS[opts.level].diff===diff?LEVELS[opts.level]:LEVELS[LEVEL_OF_DIFF[diff]]||{};   /* v0.61 단계 세부 조정 */
  const LVN=LEVELS[opts.level]&&LEVELS[opts.level].diff===diff?+opts.level:LEVEL_OF_DIFF[diff]||1;   /* v0.66 단계 번호(1~5) */
  const NAT=opts.natural===false?null:NATURAL;   /* v0.66 자연스러움 보완 — null이면 v0.65 동작 */
  const CARRY=NAT&&NAT.seam&&opts.carry&&typeof opts.carry.m==='number'?opts.carry:null;   /* 앞 코러스에서 이어받은 것: {m 끝음, dir 마지막 방향, theme 첫 동기} */
  /* v0.66.2 단계 4·5 조정값 — 정박의 3·7음 쏠림 완화(GUIDE)와 비밥 경과음 비용(BEBOP_PASS). 꺼져 있거나 단계 1~3이면 예전 값 */
  const GUIDE=NAT&&NAT.guide[LVN]?NAT.guide[LVN]:{target:3.2,third:2.4,change:4};
  const BEBOP_PASS=NAT&&NAT.bebop.pass[LVN]&&(opts.topic||'auto')==='auto'?NAT.bebop.pass[LVN]:1.6;
  const useLicks=opts.useLicks!==false&&LV.licks!==false;
  const useGroups=opts.groups!==false;
  inst=inst||'free';
  const SD=(typeof STYLE_DATA!=='undefined')?STYLE_DATA:null;
  const styleId=(opts.style&&SD&&SD.profiles[opts.style])?opts.style:'all';
  const PF=SD?SD.profiles[styleId]:null;
  const topic=(opts.topic&&TOPIC_LABEL[opts.topic])?opts.topic:'auto';
  const feel=FEEL_PROFILE[opts.feel]?opts.feel:autoFeel(progId);
  const FP=Object.assign({},FEEL_PROFILE[feel]);
  if(NAT&&feel==='ballad')FP.T=BALLAD_T;   /* v0.66 발라드는 셋잇단이 자연스러운 잔걸음 */
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
  /* v0.43 첫 코러스 빌드업 지점: 첫 B 섹션(곡의 1/4~3/4 사이일 때), 없으면 절반 */
  const buildT=(()=>{const iB=String(sec).search(/[^A]/),tb=iB>0?iB*P*TPB:-1;return (tb>=TOT*0.25&&tb<=TOT*0.75)?tb:Math.round(NB/2)*TPB})();
  const arcI=t=>{if(ARC.n<=1)return 0;if(ARC.i>0)return ARC.i;if(t<buildT)return 0;
    return Math.min(1,BUILD_FIRST.from+(1-BUILD_FIRST.from)*(t-buildT)/Math.max(TPB,(TOT-buildT)*BUILD_FIRST.reach))};
  const roles=[];{const seen={};for(let p=0;p<nPh;p++){const L=sec[p]||'A';roles.push(L==='B'?'contrast':(L==='C'?'resolution':(seen[L]?'answer':'statement')));seen[L]=true}}
  const segs=analyzeHarmony(bars,keyPc,BPB);
  const segAt=t=>{t=Math.min(t,TOT-1);for(let i=segs.length-1;i>=0;i--)if(segs[i].t0<=t)return i;return 0};
  const tagsAt=[...Array(NB)].map(()=>[]);
  const tag=(b,s)=>{if(b>=0&&b<NB&&!tagsAt[b].includes(s))tagsAt[b].push(s)};
  if(songType!=='standard')tag(0,'어법: '+(songType==='blues'?'블루스':songType==='modal'?'모달':'리듬체인지'));
  const lickUse={};
  const lk=k=>{if(opts.debug){const o=stats.lk||(stats.lk={});o[k]=(o[k]||0)+1}};   /* v0.66.3 릭 자리 진단(디버그 때만) */
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
  const capBeats=PHRASE_FLOW.cap[inst]||16;   /* v0.64 목관 8 → 14박 */
  const lenScale=[0,0.75,0.9,1][diff];
  const relaxSec=(()=>{if(ARC.n<3||ARC.i<1||ARC.i>=ARC.n-1)return -1;   /* v0.59 쉬어 가는 섹션(RELAX) — 따로 만든 난수로 골라 본 난수열은 그대로 */
    const r=mulberry32(((seed===undefined?0:seed)^RELAX.salt)>>>0);if(r()>=RELAX.p)return -1;
    const cand=[];for(let q=1;q<nPh;q++)if((sec[q]||'A')==='A')cand.push(q);const pool=cand.length?cand:[...Array(nPh).keys()].slice(1);return pool.length?pool[Math.floor(r()*pool.length)]:-1})();   /* v0.64 코러스 첫 섹션은 빼고(앞 코러스를 물고 화려하게 시작) */
  const relaxAt=bt=>relaxSec>=0&&Math.floor(bt/(P*BPB))===relaxSec;
  if(relaxSec>=0)tag(relaxSec*P,'쉬어 가는 섹션');
  const capAt=bt=>ARC.n>1&&(arcI(bt*6)<0.5||relaxAt(bt))?Math.min(PHRASE_FLOW.sparseCap,Math.max(3,Math.floor(capBeats*0.72))):capBeats;   /* v0.64 성긴 곳은 2마디까지(모티프 제시) */   /* v0.43 첫 코러스 앞부분만 짧게 · v0.59 쉬어 가는 섹션도 */
  /* v0.63 코러스 밀도 — 첫 코러스는 성기게(0.55) 시작해 뒤 절반에서 1.0까지 쌓아 올리고, 둘째 코러스부터는 그 기세를 물고 1.0→1.2로(사용자 피드백: 「2코러스는 1코러스 빌드업과 물려 화려하게」).
     예전 식(0.55+0.65×i/(n−1))은 3코러스 이상에서 둘째 코러스가 0.875에 머물러 화려함이 약했다 */
  const densityAt=bt=>ARC.n<=1?1:relaxAt(bt)?RELAX.density:(ARC.i>=ARC.n-1&&bt>=totalBeats-BPB*2?0.5:ARC.i===0?0.55+0.45*arcI(bt*6):1+0.2*ARC.i/(ARC.n-1));
  /* v0.66 바깥 소리(반음 헤미올라·얼터드 색)를 써도 되는 자리 — 칼립소·보사·펑크·발라드의 첫 코러스에서 튀던 것. bt = 코러스 안 박 */
  const outsideOK=bt=>!NAT||(NAT.outside.feels.includes(feel)&&(ARC.i+Math.min(1,bt/(NB*BPB)))/ARC.n>=NAT.outside.minArc);
  const phrases=[];
  let beat=rng()<0.6||ARC.i>0?0:(diff===1?2:1);   /* v0.64 둘째 코러스부터는 첫 박에서 바로(앞 코러스 끝에서 물고 들어옴) */
  const totalBeats=NB*BPB;
  const FLW=NAT&&LVN>=NATURAL.flow.lv?NAT.flow:null;let lastKind=null;   /* v0.67 */
  while(beat<totalBeats-1){
    const dHere=densityAt(beat),grow=PHRASE_FLOW.lenLo+(PHRASE_FLOW.lenHi-PHRASE_FLOW.lenLo)*Math.max(0,Math.min(1,(dHere-0.55)/0.65));   /* v0.64 촘촘한 곳일수록 긴 문장 */
    let L=Math.round(sampleQuart(rng,phLenQ.map(x=>x*lenScale*(diff===1?1:grow)),diff===1?3:3,Math.min(capBeats,diff===1?7:capBeats)));
    if(diff===1){beat=Math.ceil(beat/2)*2;}
    let kind=null;   /* v0.67 긴 문장 · 짧은 한마디 */
    if(FLW&&dHere>=FLW.minD&&!relaxAt(beat)){const rr=rng();if(lastKind==='long'){if(rr<FLW.shortAfterLong)kind='short'}else if(rr<FLW.longP)kind='long';
      if(kind){const R=kind==='long'?FLW.longLen:FLW.shortLen;L=R[0]+Math.floor(rng()*(R[1]-R[0]+1))}}
    let end=beat+L; /* 마지막 음이 시작되는 박(포함) */
    /* 형식 경계(8마디·블루스 4마디)에 가까우면 그 직전에 종지하도록 맞춘다 */
    const secBeats=P*BPB;
    const nextB=Math.ceil((beat+1)/secBeats)*secBeats;
    if(nextB<totalBeats&&end>=nextB-3&&end<=nextB+3&&!(kind==='long'&&rng()<FLW.crossP)&&!(diff>=2&&dHere>=0.95&&rng()<PHRASE_FLOW.crossP)){end=nextB-2+(rng()<0.4?1:0);if(end-beat<2)end=beat+2}   /* v0.64 촘촘한 곳은 섹션 경계를 넘어 이어 가기도 */
    end=Math.min(end,beat+(kind==='long'?FLW.cap:capAt(beat))-1,totalBeats-1);
    if(end<=beat&&kind!=='short')break;if(end<beat)break;
    phrases.push({s:beat,e:end,long:kind==='long'});
    let g=sampleQuart(rng,gapQ,diff===1?2:1,6);
    if(inst==='wind')g=Math.max(g,1.2);
    const slow=feel==='ballad'||feel==='bossa'||feel==='latin';
    g=Math.min(g,slow?BPB-1:BPB+1);   /* 프레이즈 사이 쉼 — 느린 계열(발라드·보사·라틴)은 더 촘촘히 */
    {const r=rng(),sparse=densityAt(end)<0.8,dense=densityAt(end)>=0.95;if(!sparse&&r<(dense?(FLW?FLW.denseGapP:PHRASE_FLOW.denseGapP):REST_MIX.gapShortP))g=Math.min(g,1.4);else if(r<1-REST_MIX.longGapP*(sparse?2:1))g=Math.min(g,REST_MIX.gapMax)}   /* v0.60 짧은 숨(1박)을 자주, 긴 쉼은 가끔만 · v0.63 첫 코러스 앞부분(성긴 곳)은 숨을 넉넉히 */
    if(kind){const R=kind==='long'?FLW.gapLong:FLW.gapShort;g=R[0]+rng()*(R[1]-R[0])}   /* v0.67 긴 문장 뒤엔 넉넉히 숨 */
    lastKind=kind;
    beat=end+1+Math.round(g);
    /* 곡 첫 박 근처로 새 섹션을 시작하도록 — 섹션 경계 1박 전(픽업)이나 경계에서 */
    const nb2=Math.ceil(beat/secBeats)*secBeats;
    if(nb2-beat<=2&&nb2-beat>0&&rng()<0.6)beat=nb2-(diff>=2&&rng()<0.5?1:0);
    /* v0.43 마디 첫 박에서 시작할 프레이즈를 앞 마디 4박(엇박 진입)으로 당겨 시작 */
    else if(diff>=2&&beat%BPB===0&&beat-1>end+1&&rng()<ANTIC.pull)beat-=1;
    /* v0.60 마디 앞 2박을 통째로 쉬고 셋째 박에서 시작하는 일을 줄인다 — 둘째 박으로 당기거나(쉼이 1박 넘게 남을 때) 넷째 박 픽업으로 */
    if(diff>=2&&BPB===4&&beat%BPB===2&&rng()<REST_MIX.pullHalf)beat=beat-1>end+1?beat-1:beat+1;   /* 난이도 1은 짝수 박 시작 유지 */
  }
  /* 마지막 프레이즈는 마지막 마디 1박에서 길게 끝나도록 */
  if(phrases.length){
    const lp=phrases[phrases.length-1];
    /* v0.64 마지막 코러스가 아니면 끝 마디에서 길게 맺지 않고 셋째 박까지 이어 다음 코러스로 물고 들어간다(코러스마다 끝나는 느낌이던 것) */
    const link=ARC.n>1&&ARC.i<ARC.n-1&&diff>=2;   /* 난이도 1은 예전처럼 길게 맺음 */
    lp.e=Math.max(lp.s+1,link?totalBeats-2:totalBeats-BPB);lp.final=!link;if(link)lp.link=true;
    if(lp.e-lp.s>=capAt(lp.e)){
      const end=lp.e,start=Math.max(lp.s,end-capAt(lp.e)+1);
      lp.e=start-3;lp.final=false;lp.link=false;
      if(lp.e<=lp.s)phrases.pop();
      phrases.push({s:start,e:end,final:!link,link});
    }
  }

  /* v0.39 노래 프레이즈 선택 — opts.lyric(0~1)이 노래 프레이즈 비율. 섹션 첫머리·곡 끝·첫 코러스에 더 자주,
     낮은 비율에서는 노래 프레이즈가 연달아 붙지 않게 해 화려한 라인과 번갈아 나오게 한다 */
  const LYR=opts.lyric==null?LYRIC_DEFAULT:Math.max(0,Math.min(1,+opts.lyric));
  {
    let p=topic==='auto'?LYR*(NAT?NAT.song.lyr[LVN]||1:1):0;   /* v0.66.5 중상급·심화에서는 노래 프레이즈를 덜 */
    if(p>0&&p<1){let mul=feel==='ballad'?1.5:(feel==='bossa'||feel==='latin')?1.15:1;
      if(PF&&STYLE_DATA.profiles.all)mul*=Math.min(1.6,Math.max(0.6,Math.pow((1-PF.stats.eighth)/(1-STYLE_DATA.profiles.all.stats.eighth),2)));   /* 8분 라인이 적은 연주자일수록 노래 프레이즈가 잦다 */
      if(songType==='blues')mul*=0.8;if((opts.bpm||prog.bpm||140)>=230)mul*=0.75;p=Math.min(0.95,p*mul)}
    const N=phrases.length;let K=p>=1?N:Math.round(p*N);if(p>0&&K===0&&rng()<p*N)K=1;
    if(K>0){
      const secB=P*BPB;
      const sc=phrases.map((ph,i)=>{let v=rng()*0.6;if(ph.s%secB<=1)v+=0.35;if(ph.final)v+=0.4;if(i===0)v+=ARC.i>0?-0.6:0.3;   /* v0.64 둘째 코러스부터 첫 프레이즈는 노래 프레이즈를 피한다(앞 코러스 빌드업을 물고 이어 가게) */
        if(densityAt(ph.s)>=0.95)v-=0.25;   /* v0.64 촘촘한 곳은 라인 위주 */
        const r=roles[sectionIndex(ph.s*6,P,BPB)]||'statement';if(r==='resolution')v+=0.15;if(r==='contrast')v-=0.15;
        if(ARC.n>1)v+=0.2*(1-ARC.i/(ARC.n-1));if(relaxAt(ph.s))v+=RELAX.songBonus;return v});
      for(let k=0;k<K;k++){let bi=-1;for(let i=0;i<N;i++)if(!phrases[i].song&&(bi<0||sc[i]>sc[bi]))bi=i;if(bi<0)break;
        phrases[bi].song=true;if(p<0.6){if(bi>0)sc[bi-1]-=0.35;if(bi+1<N)sc[bi+1]-=0.35}}
    }
    /* v0.39 블루스 스케일 프레이즈 — 블루스 곡은 자주, 스윙·라틴 곡도 가끔(조성 안의 화음 구간에서만 — 음 선택 때 판정) */
    if(topic==='auto'&&diff>=2&&opts.blues!==false){const pb=songType==='blues'?0.35:(feel==='swing'||feel==='ballad')?BLUES_STD:0.1;   /* v0.48 스탠더드 스윙·발라드는 블루스 스케일을 아주 가끔만 */phrases.forEach(ph=>{if(!ph.song&&rng()<pb)ph.blues=true})}
  }
  const songRhythm=need=>{
    const al=ALLOWED[diff],L=need>=BPB+2?BPB:2;
    const lib=(SONG_CELLS[L]||SONG_CELLS[2]).filter(c=>c.every(k=>al[k]));
    const rich=NAT&&diff>=2?NAT.song.rich[LVN]||0:0,lib66=rich?(SONG_CELLS66[L]||SONG_CELLS66[2]).filter(c=>c.every(k=>al[k])):[];   /* v0.66.5 */
    const toks=[],cellOf=[];let cur=null,ci=0,id=-1;
    while(toks.length<need){
      if(cur===null||rng()>0.7){if(lib66.length&&rng()<rich){const j=Math.floor(rng()*lib66.length);id=100+j;cur=lib66[j]}else{id=Math.floor(rng()*lib.length);cur=lib[id]}}
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
  let motif=null,firstToks=null;
  const THEME=NAT&&CARRY&&CARRY.theme&&Array.isArray(CARRY.theme.off)&&CARRY.theme.off.length>=3&&opts.motif!==false&&diff>=2?CARRY.theme:null;   /* v0.66 1코러스 첫 동기 */
  const themeUsed={};   /* 섹션마다 주제 회상은 한 번 */
  const themeP=secI=>ARC.i>=ARC.n-1?(secI>=nPh-1?NAT.theme.last:NAT.theme.p*0.4):NAT.theme.p;   /* 마지막 코러스: 끝 섹션은 자주(「처음 한 말로 맺기」), 그 앞은 드물게(절정을 식히지 않게) */
  phrases.forEach((ph,pi)=>{
    const toks=[];
    const secIdx=sectionIndex(ph.s*6,P,BPB),role=roles[secIdx]||'statement';
    if(ph.song){const r=songRhythm(ph.e-ph.s+1);toks.push(...r.toks);ph.cellOf=r.cellOf;tag(Math.floor(ph.s/BPB),'노래 프레이즈')}
    /* v0.66 주제 회상(리듬) — 1코러스 첫 프레이즈의 리듬을 뒤 코러스 섹션 첫머리에 다시 쓴다. 음높이는 tryMotif가 같은 윤곽으로 맞춘다 */
    const themeHere=!!(THEME&&THEME.toks&&!ph.song&&!ph.blues&&topic==='auto'&&ph.s%(P*BPB)<BPB&&!themeUsed[secIdx]&&ph.e-ph.s+1>=THEME.toks.length&&rng()<themeP(secIdx));
    if(themeHere){themeUsed[secIdx]=true;ph.theme=true}
    const recall=themeHere||(!ph.song&&motif&&role==='answer'&&ph.s%(P*BPB)<BPB&&rng()<0.65);
    const recallToks=themeHere?THEME.toks:(motif?motif.toks:null);
    /* v0.27 프레이즈 리듬 템플릿 선택 */
    let tpl=null;
    const need=ph.e-ph.s+1;
    if(diff>=2&&!R2&&!recall&&!ph.song&&need>=4&&rng()<0.55){
      tpl=fitRhythmTemplate(RHY_TPL[Math.floor(rng()*RHY_TPL.length)],need,diff,FP,rng,densityAt(ph.s));
      tag(Math.floor(ph.s/BPB),'리듬 템플릿');
    }
    /* v0.62 장르 리듬 묶음·리프 — 곧은 8분·발라드·셔플(스윙은 블루스 곡에서 리프만). 실측 리듬 대신 그 장르 말투로 */
    if(!tpl&&diff>=2&&!recall&&!ph.song&&!ph.blues&&topic==='auto'&&need>=BPB&&FEEL_CELLS[feel]){
      const FC=NAT&&FEEL_CELLS_N[feel]?FEEL_CELLS_N[feel]:FEEL_CELLS[feel],al=ALLOWED[diff],dense=densityAt(ph.s)>=FEEL_DENSE_AT,cells=(dense?(NAT&&FEEL_DENSE_N[feel]?FEEL_DENSE_N[feel]:FEEL_DENSE[feel]):FC.cells).filter(c=>c.every(k=>al[k]||k==='H'||k==='R')),dP=dense?FEEL_DENSE_P:1,wantRiff=need>=BPB*2&&(feel!=='swing'||songType==='blues')&&rng()<FC.riff*dP;
      if(cells.length&&(wantRiff||rng()<FC.p*dP)){
        const one=cells[Math.floor(rng()*cells.length)];
        tpl=[];let c=one;for(let j=0;j<need;j++){const bp0=wantRiff?j%BPB:(ph.s+j)%BPB;if(!wantRiff&&bp0===0&&j)c=cells[Math.floor(rng()*cells.length)];tpl.push(c[bp0])}   /* 리프는 프레이즈 시작부터 한 묶음(4박)을 되풀이, 아니면 마디 박 위치에 맞춰 마디마다 새 묶음 */
        /* 묶음 사이 이음 규칙: 첫 박은 음, 끊긴 뒤 지속 금지, 마지막 박은 4분·8분 */
        if(!NOTE_TOK[tpl[0]]||tpl[0]==='Uh')tpl[0]=tpl[0]==='Uh'||tpl[0]==='R'?'Ur':'Q';
        for(let j=1;j<tpl.length;j++)if((tpl[j]==='H'||tpl[j]==='Uh')&&CUT_TOK[tpl[j-1]])tpl[j]=tpl[j]==='H'?'Q':'Ur';
        if(!['Q','Qs','E','Uh','Ur'].includes(tpl[tpl.length-1]))tpl[tpl.length-1]='Q';
        if(wantRiff){ph.riff=true;tag(Math.floor(ph.s/BPB),'리프 반복(콜 앤 리스펀스)')}else tag(Math.floor(ph.s/BPB),'장르 리듬: '+FEEL_LABEL[feel]);
      }
    }
    /* v0.34 8분 라인 — 가끔 1~2마디를 8분음표로 쭉 이어 가는 구간(비밥 라인). 마지막 박은 착지용으로 비워 둔다 */
    let lineS=-1,lineE=-1,hl=null;
    const eighthTilt=PF&&STYLE_DATA.profiles.all?Math.min(1.8,Math.max(0.4,Math.pow(PF.stats.eighth/STYLE_DATA.profiles.all.stats.eighth,6))):1;   /* 8분 비율이 높은 연주자일수록 라인이 잦다 */
    /* v0.35 하이라이트 장치 — 4마디 블록마다 최대 하나. line(8분 라인)·perc(한 음 리듬 반복)·pivot(피벗 패턴)·hemiola(3음 시퀀스)·trip(셋잇단 런) */
    {
      const blk=Math.floor(ph.s/(BPB*4));
      if(R2&&!tpl&&!recall&&!ph.song&&!ph.blues&&!relaxAt(ph.s)&&need>=6&&diff>=2&&topic==='auto'&&!hlBlocks.has(blk)&&rng()<(diff===2?0.5:0.6)*(LV.hl===undefined?1:LV.hl)*(NAT&&NAT.bebop.hl[LVN]&&densityAt(ph.s)>=0.95?NAT.bebop.hl[LVN]:1)){
        const pool=[{v:'line',w:RHY_MIX.line*eighthTilt},{v:'perc',w:0.8},{v:'pivot',w:0.9},{v:'hemiola',w:0.9},{v:'ust',w:opts.ust===false||LV.ust===false?0:UST_W}];
        if(NAT){   /* v0.66 장치도 장르를 가린다 — 발라드의 「한 음 리듬 반복」(느린 템포에선 멈춘 음처럼 들림)·헤미올라·피벗은 줄이고, 곧은 8분 계열은 한 음 리듬을 더 */
          const fw=feel==='ballad'?{perc:0,pivot:0.4,hemiola:0.3}:REST_MIX.straight.includes(feel)?{perc:2}:null;
          if(fw)pool.forEach(x=>{if(fw[x.v]!==undefined)x.w*=fw[x.v]});
          /* v0.66.1 「두 음 리프」 — 두 음을 리듬에 실어 되풀이하는 것은 흔하고 좋은 어법이다(특히 블루스·빠른 곡). 우연히 생기는 왕복은 막되, 일부러 쓰는 장치로 되살린다.
             한 음 리듬·두 음 리프 모두 빠른 템포(180 이상)에서 더 자주. 발라드에서는 쓰지 않는다 */
          if(NAT.bebop.line[LVN]&&!REST_MIX.straight.includes(feel)&&feel!=='ballad')pool[0].w*=NAT.bebop.line[LVN];   /* v0.66.2 단계 4·5: 코드톤 라인 계획으로 짜는 8분 줄기(비밥 줄기)를 더 자주 */
          const R2F=NAT.riff2,fast=(opts.bpm||prog.bpm||140)>=R2F.fastBpm?R2F.fast:1;
          if(feel!=='ballad'){
            pool.push({v:'riff2',w:R2F.w*fast*(songType==='blues'||feel==='shuffle'?R2F.blues:REST_MIX.straight.includes(feel)?R2F.straight:1)});
            pool.forEach(x=>{if(x.v==='perc')x.w*=fast*(songType==='blues'||feel==='shuffle'?R2F.percBlues:1)});
          }
        }
        if(diff>=3&&!REST_MIX.straight.includes(feel))pool.push({v:'trip',w:RHY_MIX.tripRun*tripTilt});   /* v0.60 곧은 8분 계열(보사·라틴·펑크)은 셋잇단 런 없음 */
        const kind=pickW(rng,pool),s0=ph.s+1;   /* 첫 박은 실측 분포(엇박 진입이 많다)에 맡긴다 */
        let len=0,cells=0;
        if(kind==='line')len=need>=10&&rng()<0.6?BPB*2:BPB;
        else if(kind==='perc')len=need>=10&&rng()<0.5?BPB*2:BPB;
        else if(kind==='riff2')len=need>=10&&rng()<0.45?BPB*2:BPB;
        else if(kind==='pivot')len=4;
        else if(kind==='ust')len=BPB;
        else if(kind==='hemiola'){cells=Math.min(4,Math.floor(((ph.e-s0)*2-1)/3));len=Math.ceil((cells*3+1)/2)}
        else if(kind==='trip')len=Math.min(TRIP_MAX_RUN,rng()<0.5?2:3);   /* v0.61 연달아 2묶음까지 */
        if(len>0&&s0+len<=ph.e&&(kind!=='hemiola'||cells>=2)){
          hl={kind,s:s0,e:s0+len,cells,id:++hlSeq,chromatic:kind==='hemiola'&&diff>=3&&rng()<0.25&&outsideOK(ph.s),dir:rng()<0.65?1:-1};   /* v0.66 반음 헤미올라(바깥 소리)는 스윙 계열·솔로 앞 1/3을 지난 뒤에만 */
          if(kind==='riff2')hl.even=len<=BPB&&rng()<NAT.riff2.even;   /* 한 마디짜리는 절반쯤 곧은 8분(트레몰로 꼴), 나머지는 당김음 섞인 리프 리듬 */
          hlBlocks.add(blk);
          if(kind==='line'){lineS=s0;lineE=s0+len}
          tag(Math.floor(s0/BPB),HL_LABEL[kind]);
        }
      }
    }
    /* v0.60 「8분·4분 섞기」 — 8분 두 박 뒤엔 4분, 4분 뒤엔 8분이 잘 오게(스윙의 기본 말투). 셋잇단·긴 음·쉼은 줄인다 */
    const mixQ=!tpl&&!recall&&!ph.song&&!ph.blues&&diff>=2&&topic==='auto'&&need>=4&&rng()<REST_MIX.mixPh*Math.max(0,Math.min(1,(1.15-densityAt(ph.s))/0.6));   /* v0.63 성긴 곳(첫 코러스 앞부분) 위주 — 뒤 코러스는 8분 라인 */
    if(mixQ)tag(Math.floor(ph.s/BPB),'8분·4분 섞기');
    let prev='R',prev2='R',tripNext=false;
    for(let bt=ph.s;bt<=ph.e&&!ph.song;bt++){
      const bp=(bt%BPB)+1,isFirst=bt===ph.s,isLast=bt===ph.e;
      if(recall&&bt-ph.s<recallToks.length){
        const k=rhythmToken(recallToks[bt-ph.s],prev,isFirst,diff,FP,rng,themeHere?1:densityAt(bt));
        toks.push(k);prev2=prev;prev=k;continue;
      }
      let k;
      if(hl&&bt>=hl.s&&bt<hl.e){
        if(hl.kind==='line'||hl.kind==='pivot'||hl.kind==='hemiola'||hl.kind==='ust'||(hl.kind==='riff2'&&hl.even))k='E';
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
        if(k2==='T')w*=FP.T*density*density*RHY_MIX.trip*(LV.trip||1);else if(k2==='E')w*=FP.E*density*density*RHY_MIX.eighth*(LV.E||1);else if(k2==='Q'||k2==='Qs'||k2==='H')w*=FP.QH/density;
        if(isFirst&&!NOTE_TOK[k2])continue;
        if(k2==='T'&&prev==='T'&&prev2==='T')continue;   /* v0.61 셋잇단 3연속 금지 */
        if(isFirst&&k2==='Uh')continue;
        if(!isFirst&&k2==='R')w*=densityAt(bt)>=0.95?PHRASE_FLOW.inR:REST_MIX.inR;   /* v0.64 촘촘한 곳은 프레이즈 안 쉼을 더 줄임 */
        if(FLW){if(k2==='E')w*=FLW.rE;else if(k2==='Q')w*=FLW.rQ;else if(k2==='Uh')w*=FLW.rUh;else if(k2==='H')w*=FLW.rH;if(!isFirst&&(k2==='R'||k2==='Ur'||k2==='Qs'))w*=ph.long?FLW.inLong:FLW.inAll}   /* Qs(8분+8분 쉼)도 문장을 끊는다 */   /* v0.67 예시 솔로: 8분 줄이고 4분·당김 붙임줄 늘림 · 긴 문장 안에서는 쉬지 않게 */
        if(mixQ&&!(hl&&bt>=hl.s&&bt<hl.e)){if(k2==='Q'||k2==='Qs')w*=prev==='E'&&prev2==='E'?3:prev==='E'?1.6:0.8;else if(k2==='E')w*=prev==='Q'||prev==='Qs'?2:1;else if(k2==='T')w*=0.3;else if(k2==='H'||k2==='R')w*=0.4}
        if(isLast&&!(k2==='Q'||k2==='Qs'||k2==='E'||k2==='Uh'||(k2==='Ur'&&diff>=2)))continue;
        if((k2==='H'||k2==='Uh')&&CUT_TOK[prev])continue;
        if(diff===2&&k2==='E')w*=0.8;
        if(diff===2&&k2==='T')w=0;
        if(topic==='ct'){if(k2==='E')w*=2.5;else if(k2==='H')w*=0.5;else if(k2==='T')w*=0.6}   /* v0.36 코드톤 주제: 정박·엇박 구조가 들리도록 8분 위주 */
        if(diff===1&&k2==='H'&&bp%2===1)w*=0.5;
        if(role==='contrast'&&(k2==='E'||k2==='T'))w*=1.15;
        if(role==='resolution'&&(k2==='H'||k2==='Q'))w*=1.2;
        if(diff>=2){   /* v0.43 당김음: 마지막 박 엇박 진입 → 다음 마디 첫 박으로 이어 붙임 */
          if(bp===BPB&&!isLast&&(k2==='Ur'||k2==='Uh'))w*=isFirst?ANTIC.firstUr:ANTIC.lastBeat;
          if(bp===1&&!isFirst&&k2==='H'&&(prev==='Ur'||prev==='Uh'||prev==='E'))w*=ANTIC.holdOver;
        }
        c.push({v:k2,w});
      }
      k=c.length?pickW(rng,c):'Q';
      }
      /* v0.34 셋잇단 쌍 — 셋잇단 뒤에 한 박 더 셋잇단(같은 음형 반복 → 6연음 느낌) */
      if(k==='T'&&prev!=='T'&&R2&&diff>=3&&!REST_MIX.straight.includes(feel)&&bt+1<ph.e&&!(bt+1>=lineS&&bt+1<lineE)&&rng()<RHY_MIX.tripPair*tripTilt)tripNext=true;
      toks.push(k);prev2=prev;prev=k;
    }
    if(!motif&&ph.e-ph.s>=3)motif={toks:toks.slice(0,Math.min(6,toks.length)),pi};
    if(pi===0&&ph.e-ph.s>=2)firstToks=toks.slice(0,Math.min(6,toks.length));   /* v0.66 다음 코러스에 넘겨줄 주제 리듬 */
    if(recall){ph.recall=true;tag(Math.floor(ph.s/BPB),themeHere?'주제 회상(리듬)':'모티프 회상(리듬)')}
    /* v0.61 2박 셋잇단(4분 셋잇단 — 두 박을 셋으로) — 1·3박에서 시작, 프레이즈 첫 박·끝 박·장치 구간·쉼 자리는 피한다 */
    const inHl=bt=>!!(hl&&bt>=hl.s&&bt<hl.e);
    if((LV.t2||0)>0&&BPB===4&&!ph.song&&!ph.blues&&!recall&&toks.length>=4&&rng()<LV.t2){
      const cand=[];for(let j=1;j+2<toks.length;j++){const bt=ph.s+j;if(bt%2!==0||inHl(bt)||inHl(bt+1))continue;if(!NOTE_TOK[toks[j]]||toks[j]==='T'||toks[j]==='Ur'||toks[j+1]==='T'||toks[j+1]==='R')continue;cand.push(j)}
      if(cand.length){const j=cand[Math.floor(rng()*cand.length)];toks[j]='T2';toks[j+1]='T2c';tag(Math.floor((ph.s+j)/BPB),'2박 셋잇단')}
    }
    /* v0.61 셋잇단 묶음은 연달아 TRIP_MAX_RUN개까지 — 넘치면 장치 밖 것을 8분(또는 4분 둘)로 */
    {let run=[];const flush=()=>{if(run.length>TRIP_MAX_RUN){let keep=run.filter(j=>inHl(ph.s+j)).length;for(const j of run){if(inHl(ph.s+j))continue;if(keep<TRIP_MAX_RUN){keep++;continue}if(toks[j]==='T')toks[j]='E';else{toks[j]='Q';toks[j+1]='Q'}}}run=[]};
     for(let j=0;j<toks.length;j++){const k=toks[j];if(k==='T'||k==='T2')run.push(j);else if(k!=='T2c')flush()}flush()}
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
      else if(k==='T2'){phEv.push({t,d:4,trip:1,t2:1,repK:0});phEv.push({t:t+4,d:4,trip:1,t2:1,repK:1});phEv.push({t:t+8,d:4,trip:1,t2:1,repK:2})}   /* v0.61 2박 셋잇단 */
    });
    if(!phEv.length)return;
    if(hl){let k=0;phEv.forEach(ev=>{if(ev.t>=hl.s*6&&ev.t<hl.e*6){ev.hl=hl;ev.hlK=k++;if(hl.chromatic)ev.hlx=true}})}
    if(ph.song)phEv.forEach((ev,k)=>{ev.song=true;ev.songK=k;ev.sc=ph.cellOf[Math.max(0,Math.min(ph.cellOf.length-1,Math.floor(ev.t/6)-ph.s))]});
    if(ph.blues)phEv.forEach((ev,k)=>{ev.blu=true;ev.bluK=k});
    if(ph.riff)phEv.forEach(ev=>{ev.riff=true;ev.riffR=Math.floor((ev.t/6-ph.s)/BPB)});   /* v0.62 리프: 몇 번째 되풀이인지(프레이즈 시작부터 4박 단위) */
    /* 프레이즈 끝음 — 길게(1~2박 더) */
    const le=phEv[phEv.length-1];
    if(!le.trip){
      if(ph.final)le.d+=Math.max(0,TOT-(le.t+le.d));
      else if(ph.song)le.d=Math.max(le.d,12);   /* 노래 프레이즈 끝음은 길게 — 숨은 다음 쉼표에서 */
      else if(R2){   /* v0.33 실측 끝음 길이(8분 단위): 짧게 끊는 끝이 대부분 */
        const L=pickW(rng,R2.lastLen.map((w,i)=>({v:i+1,w:i<4?w:w*0.5})));
        le.d=Math.max(le.d,Math.min(L*3,12));
        if(le.d<3)le.d=3;
      }else{const add=rng()<0.6?6:(rng()<0.5?3:0);le.d+=diff===1&&add===3?6:add}   /* v0.64 난이도 1은 4분 단위로만(8분 늘림이 마디를 넘으면 8분 조각이 생김) */
    }
    /* v0.43 당김음 — 4박 엇박 8분 바로 뒤 다음 마디 첫 박 음을 묶어, 엇박에서 다음 마디로 물고 들어가게(리듬 출처와 무관하게) */
    if(diff>=2&&!ph.song&&!ph.blues)for(let q=0;q<phEv.length-2;q++){
      const a=phEv[q],b=phEv[q+1];
      if(a.t%TPB===TPB-3&&a.d===3&&!a.trip&&!a.hl&&b.t===a.t+3&&!b.trip&&!b.hl&&b.d<=6&&rng()<ANTIC.merge){a.d+=b.d;a.antic=1;phEv.splice(q+1,1)}
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

  /* v0.66 해결 착지 — Ⅴ7 위에서 끝나는 프레이즈가 해결 화음 한 박 앞에서 끊기면 「말을 하다 만」 느낌이 난다(측정: Ⅴ7 위에서 끝난 프레이즈의 30%).
     자리가 있으면 해결 화음 첫 박에 착지음을 하나 더 두거나(음높이는 뒤에서 가이드톤 타깃 + 어프로치로 정해진다), 4박 엇박 끝음을 다음 마디로 늘려 당김음으로 넘긴다.
     본 난수열을 건드리지 않게 따로 만든 난수를 쓴다 */
  if(NAT&&diff>=2&&(topic==='auto'||topic==='chrom'||topic==='alt')){
    const r=mulberry32(((seed===undefined?0:seed)^0x1b873593)>>>0);
    const lastOf=[];events.forEach(e=>{if(e.last)lastOf.push(e)});
    lastOf.forEach(le=>{
      const ph=phrases[le.ph],u=r(),v=r();
      if(!ph||ph.final||ph.link||ph.song||ph.riff||ph.quote||le.trip||le.hl)return;
      const si=segAt(le.t),sg=segs[si],nx=segs[si+1];
      if(!nx||!(sg.cls==='dom'||sg.cls==='domalt'))return;
      const mv=mod12(nx.root-sg.root);if(mv!==5&&mv!==11)return;          /* 4도 위(Ⅴ→Ⅰ) 또는 반음 아래(♭Ⅱ7→Ⅰ)로 해결하는 자리 */
      const T1=nx.t0,endT=le.t+le.d;
      if(T1>=TOT||le.t>=T1||endT>T1||T1-endT>6)return;                     /* 끝음이 해결 한 박 안쪽에서 끝날 때만 */
      const nxE=events.reduce((a,e)=>e.t>le.t&&(a===null||e.t<a.t)?e:a,null);
      const room=(nxE?nxE.t:TOT)-T1,need=inst==='wind'?9:6;                /* 착지음(8분 이상) 뒤 숨 쉴 자리 — 목관은 1박, 그 밖은 8분 */
      if(room<need||u>=NAT.land.p)return;
      if(le.t===T1-3&&le.d===3&&room>=12&&v<NAT.land.antic){le.d=3+(room>=18?12:6);le.land=1;tag(Math.floor(T1/TPB),'해결 당김음');stats.land=(stats.land||0)+1;return}
      if(endT<T1&&T1-endT<=3)le.d=T1-le.t;                                  /* 8분 쉼만 남으면 이어 붙인다 */
      le.last=false;
      events.push({t:T1,d:room>=24?12:room>=12?6:3,ph:le.ph,strong:true,first:false,last:true,midi:null,land:1});
      ph.e=Math.max(ph.e,Math.floor(T1/6));
      tag(Math.floor(T1/TPB),'해결 착지');stats.land=(stats.land||0)+1;
    });
    events.sort((a,b)=>a.t-b.t);
  }

  /* ── v0.40 한 마디 릭(리듬 포함) — Ⅴ7 한 마디 → 다음 마디 Ⅰ 착지 자리에 릭 사전(engine/licks.js)의 리듬을 넣는다.
     음높이는 음 선택 단계(planLick)에서 앞 음·음역에 맞춰 옥타브만 고른다. 실패하면 그 리듬 그대로 일반 음 선택. */
  const lickPlan=[];
  if(typeof CURATED_LICKS!=='undefined'&&opts.useLicks!==false&&opts.barLicks!==false&&(BPB===4||(BPB===3&&NAT&&NAT.lick.waltz))&&(topic==='auto'||topic==='alt')&&diff>=2){   /* v0.66.4 3/4 박자 릭(m:3) */
    const rate=topic==='alt'?0.6:(LICK_RATE[diff]||0),perCh=[0];
    /* v0.66.4 릭 빈도(설정 화면): 0 = 끔 · 0.5 적게 · 1 보통 · 1.7 많이 — 확률에 곱하고, '많이'는 코러스당 최대를 하나 늘린다 */
    const LAMT=NAT&&opts.lickAmt!==undefined&&opts.lickAmt!==null?Math.max(0,+opts.lickAmt):1;
    const rateC=topic==='alt'?0:(typeof CHORD_LICK_RATE!=='undefined'&&CHORD_LICK_RATE[diff])||0;
    for(let b=0;b<NB&&(rate>0||rateC>0)&&LAMT>0;b++){
      const t0=b*TPB,t1=t0+TPB,s0=segAt(t0);
      /* v0.66.3 짧은 Ⅱ–Ⅴ 마디(두 박씩, 뿌리가 4도 위로)도 릭 자리로 본다 — half 릭을 쓰고 음은 앞 코드(Ⅱ) 뿌리 기준 */
      let sgV=null;
      if(segAt(t1-1)!==s0||segs[s0].t0!==t0){
        /* v0.66.4 여러 마디 이어지는 코드의 뒷마디도 릭 자리(스탠더드의 두 마디짜리 Ⅱ·Ⅴ, 모달 곡) */
        if(!(NAT&&NAT.lick.late&&segAt(t1-1)===s0)){
          const s1=NAT&&NAT.lick.half&&BPB===4?segAt(t0+12):-1;
          if(s1<0||segs[s0].t0!==t0||s1===s0||segs[s1].t0!==t0+12||segAt(t1-1)!==s1||mod12(segs[s1].root-segs[s0].root)!==5)continue;
          sgV=segs[s1];
        }
      }
      const sg=segs[s0],nxI=b<NB-1?segAt(t1):-1,nx=nxI>=0?segs[nxI]:null;
      const nxC=nx?(nx.cls==='domalt'?'dom':nx.cls):null;
      /* v0.66.3 Ⅴ7→Ⅰ7(블루스)도 해결 자리로 본다 — 예전 릭은 착지음이 Ⅰ의 1·3·5음일 때만 */
      const toOK=L=>L.to.includes(nxC)||!!(NAT&&!L.v&&nxC==='dom'&&L.to.includes('maj')&&[0,4,7].includes(mod12(L.t-5)));
      lk('seg');
      let res=!!(nx&&nx.t0===t1&&mod12(nx.root-(sgV||sg).root)===5);if(sgV&&!res)continue;   /* Ⅴ→Ⅰ 자리면 해결 릭, 아니면 v0.49 코드 릭 */
      let pool=CURATED_LICKS.filter(L=>(NAT||!L.v)&&(L.m||4)===BPB&&!L.half===!sgV&&(!sgV||L.cls2.includes(sgV.cls==='domalt'?'dom':sgV.cls))&&!(L.dm&&(sgV||sg).cls==='dom'&&diff<L.dm)&&!(topic==='alt'&&L.v&&!L.alt)&&!(L.minDiff&&diff<L.minDiff)&&L.cls.includes(sg.cls)&&!(REST_MIX.straight.includes(feel)&&L.n.some(x=>x[1]===2))&&(!L.nx||res)&&
        (res?(L.to&&toOK(L)&&L.tr===5):
          (!L.to&&L.n.every(x=>sg.scale.includes(mod12(x[2]))||(sg.ct||[]).includes(mod12(x[2]))))));   /* 코드 릭은 그 코드 스케일 안 음만(예: 6음은 도리안 마이너에서만) */
      /* v0.66.3 뿌리가 4도 위로 가지만 맞는 해결 릭이 없는 자리(ⅰ→ⅳ, Ⅰ→Ⅳ …)는 코드 릭 자리로 쓴다 */
      if(NAT&&res&&!sgV&&!pool.length){res=false;
        pool=CURATED_LICKS.filter(L=>!L.half&&(L.m||4)===BPB&&!L.to&&!L.nx&&!(L.minDiff&&diff<L.minDiff)&&L.cls.includes(sg.cls)&&!(REST_MIX.straight.includes(feel)&&L.n.some(x=>x[1]===2))&&
          L.n.every(x=>sg.scale.includes(mod12(x[2]))||(sg.ct||[]).includes(mod12(x[2]))))}
      if(!pool.length)continue;
      lk('pool');
      const inBar=events.filter(e=>e.t>=t0&&e.t<t1);
      if(!inBar.length)continue;
      const P=inBar[0].ph,ph=phrases[P];
      if(!ph||ph.song||ph.blues||ph.quote||inBar.some(e=>e.ph!==P||e.song||e.blu||e.hl||e.quote))continue;
      lk('phr');
      /* 프레이즈가 이 마디 앞에서 이미 시작돼 있어야(첫 음 표시 유지).
         v0.66.3 프레이즈가 이 마디 첫 박(또는 첫 박 뒤 8분)에서 시작해도 넣는다 — 릭의 첫 음이 프레이즈 첫 음 표시를 물려받는다 */
      const startsHere=!events.some(e=>e.ph===P&&e.t<t0);
      if(startsHere&&!(NAT&&NAT.lick.start&&inBar[0].t-t0<=3))continue;
      lk('started');
      /* 착지음: 다음 마디 첫 박에 같은 프레이즈 음이 있으면 그 음, 없으면(프레이즈가 여기서 끝나면) 새로 만든다 */
      let tgt=null,newT=null;
      /* v0.60 착지 마디로 이어지는 음(L.nx) — 착지음 뒤 그 자리에 같은 프레이즈 음만 있거나 비어 있어야 */
      const nxEnd=L0=>L0.nx?t1+Math.max(...L0.nx.map(x=>x[0]+x[1])):t1;
      if(res&&pool.some(L0=>L0.nx)){const bad=L0=>L0.nx&&(t1+TPB>TOT||events.some(e=>e.t>t1&&e.t<nxEnd(L0)&&e.ph!==P)||events.some(e=>e.t<nxEnd(L0)&&e.t+e.d>nxEnd(L0)&&e.ph!==P));
        for(let q=pool.length-1;q>=0;q--)if(bad(pool[q]))pool.splice(q,1);if(!pool.length)continue}
      if(res){
        tgt=events.find(e=>e.t===t1);
        if(tgt){if(tgt.ph!==P||tgt.song||tgt.blu||tgt.hl||tgt.quote||tgt.trip)continue}   /* v0.61 셋잇단 음에는 착지하지 않는다 */
        else{
          const nxE=events.filter(e=>e.t>t1).reduce((a,e)=>a===null||e.t<a.t?e:a,null);
          const room=(nxE?nxE.t:TOT)-t1;if(room<6)continue;
          newT={t:t1,d:Math.min(12,room),ph:P,strong:true,first:false,last:!(nxE&&nxE.ph===P),midi:null};
        }
      }else{
        /* 코드 릭은 마디를 꽉 채우므로 다음 마디 첫 박에 다른 프레이즈가 바로 붙어 있으면 건너뛴다 */
        const nx1=events.find(e=>e.t===t1);if(nx1&&nx1.ph!==P)continue;
      }
      lk('tgt');
      /* v0.66.3 ① 프레이즈가 이 마디에서 시작하면 릭도 같은 자리에서 시작해야 한다
         ② 앞 마디 릭이 이 마디 첫 박에 착지했으면 그 착지음에서 시작하는 릭만 이어 붙인다(Ⅱ→Ⅴ→Ⅰ 두 마디 릭) — 한 덩어리로 세고 세 마디째로는 잇지 않는다
         ③ 앞 릭의 이어지는 음(nx)이 있는 마디는 건너뛴다 */
      let chain=-1;
      if(NAT){
        if(inBar.some(e=>e.lickN!==undefined))continue;
        if(startsHere)for(let q=pool.length-1;q>=0;q--)if(pool[q].n[0][0]!==inBar[0].t-t0)pool.splice(q,1);
        const h=inBar.find(e=>e.lickT!==undefined);
        if(h){
          const A=lickPlan[h.lickT];
          if(!NAT.lick.chain||h.t!==t0||inBar.length<2||!res||!A||A.chained)continue;
          const pcA=mod12(A.root+A.L.t);
          for(let q=pool.length-1;q>=0;q--){const L0=pool[q];if(L0.n[0][0]!==0||mod12(sg.root+L0.n[0][2])!==pcA)pool.splice(q,1)}
          chain=h.lickT;
        }
        if(chain<0&&lickPlan.some(p=>p.bar===b-1))continue;   /* 이어 붙이는 경우가 아니면 릭을 두 마디 연달아 넣지 않는다 */
        if(!pool.length)continue;
      }
      if(chain<0&&perCh[0]>=(NAT?(NB>=NAT.lick.longForm?NAT.lick.capLong:NB<NAT.lick.shortForm?NAT.lick.capShort:NAT.lick.cap)+(LAMT>1.4?1:0):LICK_MAX_PER_CHORUS))continue;
      lk('cap');
      /* v0.63 셋잇단 연달아 2묶음 규칙 — 릭 앞뒤에 붙은 셋잇단 묶음까지 세어 넘치면 그 릭은 뺀다 */
      {const grp=(t,dir)=>{let n=0,x=t;for(;;){const g=events.filter(e=>e.trip&&(dir<0?e.t<x&&e.t>=x-6:e.t>=x&&e.t<x+6));
           if(!(g.length<3||(dir<0?g[g.length-1].t+g[g.length-1].d!==x:g[0].t!==x))){n++;x+=dir*6;continue}
           /* v0.66 2박 셋잇단도 한 묶음으로 센다 — 예전엔 2박 셋잇단 바로 뒤에 셋잇단 릭이 붙어 3묶음이 되는 일이 있었다(전수 시험 1,260회 중 3회) */
           const g2=NAT?events.filter(e=>e.trip&&e.d===4&&(dir<0?e.t<x&&e.t>=x-12:e.t>=x&&e.t<x+12)):[];
           if(g2.length===3&&(dir<0?g2[2].t+g2[2].d===x:g2[0].t===x)){n++;x+=dir*12;continue}
           break}return n};
       const lead=L0=>{let n=0;for(let b0=0;b0<TPB;b0+=6){if(L0.n.filter(x=>x[1]===2&&x[0]>=b0&&x[0]<b0+6).length===3)n++;else break}return n};
       const tail=L0=>{let n=0;for(let b0=TPB-6;b0>=0;b0-=6){if(L0.n.filter(x=>x[1]===2&&x[0]>=b0&&x[0]<b0+6).length===3)n++;else break}return n};
       const before=grp(t0,-1),after=res?0:grp(t1,1);
       for(let q=pool.length-1;q>=0;q--){const L0=pool[q];if(!L0.n.some(x=>x[1]===2))continue;if(before+lead(L0)>TRIP_MAX_RUN||tail(L0)+after>TRIP_MAX_RUN)pool.splice(q,1)}
       if(!pool.length)continue}
      lk('trip');
      /* v0.66.3 Ⅱ–Ⅴ–Ⅰ이 한 프레이즈 안에 통째로 들어 있는 자리(다음 마디에 릭을 이어 붙일 수 있는 자리)는 더 자주 쓴다 */
      let golden=false;
      if(NAT&&res&&!sgV&&chain<0&&b<NB-2){
        const e2=events.filter(e=>e.t>=t1&&e.t<t1+TPB),n2=segAt(t1+TPB);
        golden=segAt(t1+TPB-1)===nxI&&segs[n2].t0===t1+TPB&&mod12(segs[n2].root-nx.root)===5&&e2.length>=2&&e2[0].t===t1&&!e2.some(e=>e.ph!==P||e.song||e.blu||e.hl||e.quote);
        if(golden)lk('golden');
      }
      const fl=NAT?(NAT.lick.feel[feel]||1)*LAMT:1;
      if(rng()>=(chain>=0?NAT.lick.chain:res?rate*(NAT?(NAT.lick.rate[diff]||1)*(golden?NAT.lick.golden:1):1)*fl:rateC*(NAT?NAT.lick.rateC:1)*fl))continue;
      lk('rate');
      const L=pickW(rng,pool.map(L0=>({v:L0,w:(L0.w||1)*(NAT?(lickPlan.some(p=>p.L.id===L0.id)?NAT.lick.again:1)*(CARRY&&CARRY.licks&&CARRY.licks[L0.id]?NAT.lick.carry:1):1)})));   /* v0.60 릭마다 무게(w) — 없으면 1 */
      const wasLast=inBar.some(e=>e.last);
      for(let i=events.length-1;i>=0;i--)if(events[i].t>=t0&&events[i].t<t1)events.splice(i,1);
      const id=lickPlan.length;
      L.n.forEach(([dt,d],k)=>events.push({t:t0+dt,d,ph:P,strong:(t0+dt)%6===0,trip:d===2?1:undefined,first:startsHere&&k===0,last:!res&&wasLast&&k===L.n.length-1,midi:null,lick:id,lickK:k}));
      if(newT){events.push(newT);tgt=newT}
      if(tgt)tgt.lickT=id;
      if(L.nx&&tgt){const ne=nxEnd(L);for(let i=events.length-1;i>=0;i--)if(events[i]!==tgt&&events[i].t>t1&&events[i].t<ne)events.splice(i,1);
        tgt.d=L.nx[0][0];const nxLast=!events.some(e=>e.ph===P&&e.t>=ne);
        L.nx.forEach(([dt,d],k)=>events.push({t:t1+dt,d,ph:P,strong:(t1+dt)%6===0,first:false,last:nxLast&&k===L.nx.length-1,midi:null,lickN:id,lickNK:k}));tgt.last=false}
      /* 이어 붙인 릭의 첫 음 = 앞 릭의 착지음. 앞 릭을 다른 릭으로 바꿔 놓더라도 착지음은 같아야 한다 */
      if(chain>=0){const f=events.find(e=>e.lick===id&&e.lickK===0);if(f)f.lickT=chain;const A=lickPlan[chain];A.alts=A.alts.filter(x=>mod12(x.t)===mod12(A.L.t))}
      /* 음역·도약에 걸려 못 놓을 때 대신 쓸, 리듬이 같은 다른 릭 */
      const sameShape=(a,c)=>a.n.length===c.n.length&&a.n.every((x,k)=>x[0]===c.n[k][0]&&x[1]===c.n[k][1])&&(a.t===null||a.t===undefined)===(c.t===null||c.t===undefined)&&!a.nx&&!c.nx;
      lickPlan.push({L,bar:b,root:sg.root,chained:chain>=0,alts:NAT&&NAT.lick.alts?pool.filter(L0=>L0!==L&&sameShape(L0,L)):[]});if(chain<0)perCh[0]++;
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
  /* v0.62 스케일 색(SCALE_COLOR) — 해결하는 도미넌트·긴 장조 토닉의 스케일을 코러스 곡선·섹션 역할에 따라 가끔 바꾼다(따로 만든 난수 — 본 난수열은 그대로) */
  if(topic==='auto'&&diff>=2){
    const r=mulberry32(((seed===undefined?0:seed)^0x2c1b3c6d)>>>0);
    segs.forEach((sg,k)=>{
      const nx=segs[k+1];if(!nx)return;
      const pos=ARC.n>1?arcI(sg.t0)/(ARC.n-1):0,role=roles[sectionIndex(sg.t0,P,BPB)]||'statement';
      const p=SCALE_COLOR.base+SCALE_COLOR.arc*pos+(role==='contrast'?SCALE_COLOR.contrast:0);
      const u=r(),v=r();if(u>=p)return;
      if(sg.cls==='dom'&&!sg.blue&&mod12(nx.root-sg.root)===5&&TYPE_CLS[nx.type]==='maj'&&sg.type==='7'){
        if(diff>=3&&v<SCALE_COLOR.altShare&&outsideOK(sg.t0/6)){sg.scale=[0,1,3,4,6,8,10];sg.tens=[1,3,8];sg.sname='얼터드';sg.cls='domalt'}   /* v0.66 얼터드는 바깥 소리 자리에서만, 아니면 리디안 ♭7 */
        else{sg.scale=[0,2,4,6,7,9,10];sg.tens=[2,6,9];sg.sname='리디안 ♭7'}
        sg.color=true;sg.label=chordSymbol(sg.root,sg.type)+(sg.fn?' · '+sg.fn:'')+' · '+sg.sname+'(색)';tag(sg.bar,'스케일 색: '+sg.sname);
      }else if(sg.cls==='maj'&&sg.type==='maj7'&&sg.dur>=TPB&&v<SCALE_COLOR.majShare&&sg.scale.includes(5)){
        sg.scale=[0,2,4,6,7,9,11];sg.tens=[2,6,9];sg.sname='리디안';sg.color=true;sg.label=chordSymbol(sg.root,sg.type)+(sg.fn?' · '+sg.fn:'')+' · 리디안(색)';tag(sg.bar,'스케일 색: 리디안');
      }
    });
  }
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
  let prevM=CARRY?CARRY.m:null,prev2M=null,lastDir=CARRY&&CARRY.dir?CARRY.dir:-1,gapFill=0;   /* v0.66 앞 코러스 끝음을 이어받는다 — 이음매 도약 한도·음형 연속 */
  let lastTurn=false;   /* v0.66 바로 앞에서 방향을 꺾었는가 — 연달아 꺾는 지그재그 억제 */
  const recentM=[];   /* v0.34 최근 음 {m,ph} — 반전 도약 조건 */
  const contour={};

  const arcOffset=t=>{
    if(ARC.n<=1)return 0;
    if(ARC.i>=ARC.n-1&&t>=TOT-BPB*12)return -6;
    return (-3+9*arcI(t)/Math.max(1,ARC.n-1))/(NAT&&feel==='ballad'?NAT.ceil.ballad:1);   /* v0.66 발라드는 음높이 곡선을 완만하게 — 둘째 코러스 내내 꼭대기에 머물던 것 */
  };
  const pitchGoal=t=>(contour.goal?contour.goal(t):centerAt(t))+arcOffset(t);
  /* v0.66 음역 천장 — 여러 코러스일 때 높은 음역을 아껴 두었다가 뒤로 갈수록 연다(빌드업이 음역으로도 들리게). 한 코러스면 영향 없음 */
  const ceilAt=t=>{
    if(!NAT||ARC.n<=1)return HI;
    const pos=(ARC.i+Math.max(0,Math.min(1,t/TOT)))/ARC.n,R=NAT.ceil.reserve[inst]||5;
    return HI-Math.round(R*Math.max(0,1-pos/NAT.ceil.open));
  };
  const ceilW=(m,t)=>{if(!NAT)return 1;const c=ceilAt(t);return m>c?Math.pow(NAT.ceil.steep,m-c):1};
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
      w*=groupFit(m,e.t)*ceilW(m,e.t);
      if(prevM!==null){
        const d=m-prevM;
        if(Math.abs(d)>MAXLEAP)continue;
        w*=Math.pow(ivW(d),0.9);
        if(d!==0&&Math.sign(d)===lastDir&&Math.abs(d)<=3)w*=1.2; /* 라인의 방향 지속 */
        if(NAT&&diff>=2&&prev2M!==null&&d!==0){   /* v0.66 음형 관성 — 순차는 같은 방향으로 더 잇고(스케일 런), 3도도 이어 쌓고(아르페지오), 4도 이상 도약 뒤에는 반대 방향 순차로 메운다 */
          const pd=prevM-prev2M,ap=Math.abs(pd),ad=Math.abs(d),same=Math.sign(pd)===Math.sign(d);
          if(ap>=1&&ap<=2&&ad<=2&&same)w*=NAT.osc.runStep;
          else if(ap>=3&&ap<=4&&ad>=3&&ad<=4&&same)w*=NAT.osc.runThird;
          else if(ap>=5){if(!same&&ad<=2)w*=2.2;else if(same)w*=0.55}
          if(lastTurn&&!same&&ap<5)w*=NAT.osc.zigzag;   /* 방금 꺾었는데 또 꺾는 것(지그재그) */
        }
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
      let w=pcW(seg,mod12(m-seg.root),true)*groupFit(m,t)*ceilW(m,t);
      if(isGuide(seg,m))w*=GUIDE.target;
      if(STABLE&&!phDev[ph]&&t%TPB===0&&isCT(seg,m)){const r3=mod12(m-seg.root);if(!isStable(seg,m))w*=0.4;else if(r3===3||r3===4)w*=GUIDE.third}   /* 마디 첫 박 착지는 7음보다 3음(·1·5음) */
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
    if(e.riff&&e.riffR>0)return false;   /* v0.62 리프 되풀이 */
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
      if(c.v&&!NAT)continue;   /* v0.66.3 새 어휘는 '선율 다듬기'가 켜져 있을 때만 */
      const okCls=c.cls===seg.cls||(c.cls==='dom'&&seg.cls==='domalt'&&!c.to&&!c.v);
      if(!okCls)continue;
      if(c.to){
        if(!canPair)continue;
        const toCls=seg2.cls==='domalt'?'domalt':seg2.cls;
        if(!(c.to===toCls||(c.to==='dom'&&toCls==='domalt')))continue;
        if(mod12(seg2.root-seg.root)!==c.tr)continue;
      }
      if(diff===2&&c.iv.slice(0,3).some((v,k)=>{const p=c.s+c.iv.slice(0,k+1).reduce((a,b)=>a+b,0);return !seg.scale.includes(mod12(p))&&!seg.ct.includes(mod12(p))}))continue;
      pool.push({v:c,w:(c.src==='WJD'?Math.log(1+c.np)*(c.to?1.6:1):(c.w||1.6))*(c.to?2:1)*(NAT&&lickUse[c.id||c.name]?Math.pow(NAT.lick.cellAgain,lickUse[c.id||c.name]):1)});
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
    if(j<0||forced.has(j)||motifLock.has(j)||(events[j].riff&&events[j].riffR>0))return;   /* v0.62 리프 되풀이 자리는 건드리지 않는다 */
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
  const motifUse={};   /* v0.65 주제(프레이즈 번호) → 쓴 횟수 */
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
          if(chrom(q,m))t+=BEBOP_PASS;   /* 반음 경과음은 정렬에 필요할 때 위주로 (v0.66.2 단계 4·5는 조금 더 자유롭게 — 비밥 스케일의 경과음) */
          if(NAT&&q>=2&&gap<6){const pb=back[q-2][a][di];if(pb&&P[pb[0]]===m&&m!==pm)t+=ab>=3?NAT.osc.abaLeap:NAT.osc.aba*1.5}   /* v0.66 두 음 왕복(A-B-A) 비용 — 가장 좋은 앞길의 두 음 앞을 본다 */
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
    const noT=P.L.t===null||P.L.t===undefined;   /* v0.49 코드 릭 — 착지음 없음 */
    const ti=noT?-1:events.findIndex(x=>x.lickT===e.lick);
    const nxI=P.L.nx?events.map((x,k)=>x.lickN===e.lick?k:-1).filter(k=>k>=0):[];   /* v0.60 착지 뒤 이어지는 음 */
    const ok=span.length===P.L.n.length&&(noT||ti>span[span.length-1])&&(!P.L.nx||(nxI.length===P.L.nx.length&&nxI[0]>ti));
    const fx=NAT&&e.lickT!==undefined&&forced.has(i)?forced.get(i).m:null;   /* v0.66.3 이어 붙인 릭 — 첫 음은 앞 릭이 정한 착지음 그대로 */
    let best=null;
    const fit=LL=>{let best=null;for(let o=-4;o<=4;o++){
      const base=mod12(P.root)+60+12*o,ms=LL.n.map(x=>base+x[2]),mt=noT?null:base+LL.t,mx=nxI.map((k,q)=>base+LL.nx[q][2]);
      if(ms.some((m,q)=>!allow(m,events[span[q]].t))||(!noT&&!allow(mt,events[ti].t)))continue;
      if(mx.some((m,q)=>!allow(m,events[nxI[q]].t)||Math.abs(m-(q?mx[q-1]:mt))>MAXLEAP))continue;
      if(prevM!==null&&Math.abs(ms[0]-prevM)>MAXLEAP)continue;
      if(ms.some((m,q)=>q>0&&Math.abs(m-ms[q-1])>MAXLEAP)||(!noT&&Math.abs(mt-ms[ms.length-1])>MAXLEAP))continue;
      if(fx!==null&&ms[0]!==fx)continue;
      const sc=Math.abs((ms[0]+(noT?ms[ms.length-1]:mt))/2-pitchGoal(e.t))+(prevM===null?0:0.5*Math.abs(ms[0]-prevM));
      if(!best||sc<best.sc)best={ms,mt,mx,sc};
    }return best};
    /* v0.66.3 음역·도약에 걸려 못 놓으면 리듬이 같은 다른 릭으로 바꿔 본다 */
    if(ok){best=fit(P.L);
      if(!best&&P.alts&&P.alts.length){
        /* 덜 쓴 릭부터, 같은 횟수면 마디마다 다른 순서로 — 늘 같은 대체 릭만 걸리지 않게 */
        const used=x=>(lickUse[x.id]||0)+(CARRY&&CARRY.licks&&CARRY.licks[x.id]?1:0),k=P.bar%P.alts.length;
        const alts=P.alts.slice(k).concat(P.alts.slice(0,k)).sort((x,y)=>used(x)-used(y));
        for(const A of alts){best=fit(A);if(best){P.L=A;break}}
      }}
    if(!best){span.concat(ti>=0?[ti]:[],nxI).forEach(k=>{delete events[k].lick;delete events[k].lickT;delete events[k].lickN});return}
    nxI.forEach((k,q)=>{forced.set(k,{m:best.mx[q],kind:'lick'});motifLock.add(k);events[k].keep=true});
    span.forEach((k,q)=>{forced.set(k,{m:best.ms[q],kind:'lick'});motifLock.add(k);events[k].keep=true});
    if(!noT){forced.set(ti,{m:best.mt,kind:'lick'});motifLock.add(ti);events[ti].keep=true}
    tag(P.bar,'릭: '+P.L.name);stats.licks=(stats.licks||0)+1;lickUse[P.L.id]=(lickUse[P.L.id]||0)+1;
    if(P.chained)stats.lickChain=(stats.lickChain||0)+1;
  }
  /* v0.66 셋잇단 음형 — 한 음씩 따로 고르면 모양 없는 꺾임이 된다(측정: 꺾임 27%, 상행 아르페지오 2%). 실제 어법의 모양으로 세 음을 한꺼번에 정한다:
     상행 아르페지오(코드톤을 3도씩 쌓아 올림 — 비밥의 대표 셋잇단) · 턴(윗이웃음·반음 아랫이웃음 꾸밈) · 순차 하행/상행 · 하행 아르페지오.
     첫 음은 정박이므로 코드톤. 코드 전환 타깃이 이미 잡혀 있으면 그 음에서 시작한다. 8분 셋잇단·2박 셋잇단 공통 */
  function planTriplet(i){
    const e=events[i],g=[e,events[i+1],events[i+2]];
    if(phDev[e.ph])return false;
    const f0=forced.get(i),fixA=f0&&f0.kind==='target'?f0.m:null;
    if(g.some((x,k)=>!x||!x.trip||x.ph!==e.ph||x.d!==e.d||x.t!==e.t+k*e.d||(forced.has(i+k)&&!(k===0&&fixA!==null))||(motifLock.has(i+k)&&!(k===0&&fixA!==null))||x.hl||x.quote||x.song||x.blu||x.lick!==undefined||x.riff))return false;
    if(rng()>=NAT.trip.p)return false;
    const seg=segs[segAt(e.t)],ref=prevM===null?Math.round(pitchGoal(e.t)):prevM,goal=pitchGoal(e.t);
    const tone=m=>inScale(seg,m)||isCT(seg,m);
    const stepUp=m=>{for(let x=m+1;x<=m+3;x++)if(tone(x))return x;return null},stepDn=m=>{for(let x=m-1;x>=m-3;x--)if(tone(x))return x;return null};
    const thirdUp=m=>{const a=stepUp(m);return a===null?null:stepUp(a)},thirdDn=m=>{const a=stepDn(m);return a===null?null:stepDn(a)};
    const W=NAT.trip.w,out=[];
    for(let a=Math.max(LO,ref-MAXLEAP);a<=Math.min(HI,ref+MAXLEAP);a++){
      if(fixA!==null?a!==fixA:(!isCT(seg,a)||!allow(a,e.t)||!matOK(seg,a,e.ph)))continue;
      const near=Math.exp(-Math.abs(a-ref)/3)*(a===ref?0.25:1);
      const add=(kind,b,c,bias)=>{
        if(b===null||c===null||!allow(b,e.t)||!allow(c,e.t)||Math.abs(b-a)>MAXLEAP||Math.abs(c-b)>MAXLEAP)return;
        const dg=(a+c)/2-goal;
        out.push({v:[a,b,c],w:W[kind]*near*bias*Math.exp(-(dg*dg)/98)*ceilW(Math.max(a,b,c),e.t)*groupFit(Math.max(a,c),e.t)});
      };
      const b1=thirdUp(a),c1=b1===null?null:thirdUp(b1);
      add('arpUp',b1,c1,a<=ref?1.4:0.6);                                   /* 내려오던 라인이 아래에서 치고 올라간다 */
      const u=stepUp(a);add('turn',u,a,1);                                  /* 턴: 음-윗이웃음-음 */
      if(diff>=3&&!tone(a-1))add('turn',a-1,a,0.45*FP.chrom);               /* 반음 아랫이웃음 꾸밈 */
      const d1=stepDn(a),d2=d1===null?null:stepDn(d1);add('runDn',d1,d2,a>=ref?1.3:0.7);
      const u2=u===null?null:stepUp(u);add('runUp',u,u2,a<=ref?1.2:0.7);
      const e1=thirdDn(a),e2=e1===null?null:thirdDn(e1);add('arpDn',e1,e2,a>=ref?1.2:0.6);
    }
    if(!out.length)return false;
    const ms=pickW(rng,out);
    ms.forEach((m,k)=>{if(k===0&&fixA!==null)return;forced.set(i+k,{m,kind:'trip3'});motifLock.add(i+k)});
    stats.trip3=(stats.trip3||0)+1;
    return true;
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
    let ms;
    if(NAT){   /* v0.66 세 음을 보는 계획 — 「E♭-F-E♭-F-E♭-F」처럼 이웃한 두 음만 오가던 것을 막고, 3도 진행을 조금 싸게 */
      const O=NAT.osc;
      ms=viterbi2(cands,
        (q,m)=>nc(q,m)+(q===0&&prevM!==null?(Math.abs(m-prevM)>MAXLEAP?INF:0.1*Math.abs(m-prevM)+(m===prevM?1.2:0)):0)+0.5*Math.max(0,m-ceilAt(events[span[q]].t)),
        (q,a,b)=>{const ad=Math.abs(b-a);return ad>MAXLEAP?INF:ad===0?2.4:ad<=2?0:ad<=4?0.35:1.1},
        (q,a,b,c)=>{const d1=b-a,d2=c-b;let t=0;
          if(Math.abs(d1)>=5&&(d2===0||Math.sign(d2)===Math.sign(d1)))t+=2.5;   /* 도약 뒤에는 반대 방향으로 메운다 */
          if(c===a&&c!==b)t+=Math.abs(d1)>=3?O.abaLeap:O.aba*1.3;
          return t},
        (q,z,a,b,c)=>c===z&&!(a===b&&b===c)?O.cyc3:0);
      if(!ms)return failSong(ph);
    }else{
    let L=new Map();
    cands[0].forEach(m=>{if(prevM!==null&&Math.abs(m-prevM)>MAXLEAP)return;L.set(m+'|0',{c:nc(0,m)+(prevM===null?0:0.1*Math.abs(m-prevM)+(m===prevM?1.2:0)),m,st:0,bk:null})});
    if(!L.size)return failSong(ph);
    for(let q=1;q<n;q++){const N2=new Map();
      for(const s0 of L.values())for(const m of cands[q]){const [t,st]=tc(s0.m,m,s0.st);if(t>=INF)continue;const c=s0.c+t+nc(q,m),key=m+'|'+st,o=N2.get(key);if(!o||c<o.c)N2.set(key,{c,m,st,bk:s0})}
      if(!N2.size)return failSong(ph);L=N2}
    let best=null;for(const s0 of L.values())if(!best||s0.c<best.c)best=s0;
    ms=new Array(n);for(let q=n-1,s0=best;q>=0;q--,s0=s0.bk)ms[q]=s0.m;
    }
    const dp=ms.slice();
    /* 동기 시퀀스: 바로 앞 셀과 같은 리듬 셀이면 음형을 옮겨 맞춘다 */
    const cellQ={};span.forEach((k,q)=>{const sc=events[k].sc;if(sc)(cellQ[sc.c]=cellQ[sc.c]||{id:sc.id,qs:[]}).qs.push(q)});
    const cs=Object.keys(cellQ).map(Number).sort((a,b)=>a-b);let seqN=0,prevSh=null;
    for(let j=1;j<cs.length;j++){
      const Ac=cellQ[cs[j-1]],Bc=cellQ[cs[j]];
      if(Ac.id!==Bc.id||Ac.qs.length!==Bc.qs.length||cs[j]!==cs[j-1]+1||rng()>0.75){prevSh=null;continue}
      let bs=null;
      for(let sh=-5;sh<=5;sh++){
        if(NAT&&sh===0&&prevSh===0)continue;   /* v0.66 같은 음형을 그대로 세 번 되풀이하지 않는다(두 번까지 — 셋째는 옮긴다) */
        let cost=sh===0?1:0.15*Math.abs(sh),ok=true;const out=[];
        for(let r=0;r<Bc.qs.length;r++){
          const q=Bc.qs[r];let m=ms[Ac.qs[r]]+sh,c=nc(q,m);
          if(c>=INF){let bm=null;for(const d of [1,-1,2,-2]){const c2=nc(q,m+d);if(c2<INF){bm=m+d;c=c2+0.6;break}}if(bm===null){ok=false;break}m=bm}
          out.push(m);cost+=c;
        }
        if(!ok)continue;
        const pq=Bc.qs[0]-1,nq=Bc.qs[Bc.qs.length-1]+1,chain=[pq>=0?ms[pq]:null,...out,nq<n?ms[nq]:null];
        if(chain.some((m,x)=>x>0&&m!==null&&chain[x-1]!==null&&Math.abs(m-chain[x-1])>MAXLEAP))continue;
        if(NAT){   /* v0.66 옮겨 맞추다 한 음으로 뭉개지면(같은 음 세 번) 동기가 아니라 멈춘 소리가 된다 — 원래 셀에 없던 같은 음 반복에 비용 */
          for(let r=1;r<out.length;r++)if(out[r]===out[r-1]&&ms[Ac.qs[r]]!==ms[Ac.qs[r-1]])cost+=2;
          if(chain[0]!==null&&chain[0]===out[0])cost+=1.2;
        }
        if(!bs||cost<bs.cost)bs={cost,out,sh};
      }
      if(bs){Bc.qs.forEach((q,r)=>ms[q]=bs.out[r]);seqN++;prevSh=bs.sh}else prevSh=null;
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
    const bShape=rng()<0.5?'desc':(rng()<0.5?'asc':'arch');   /* v0.62 늘 하행이던 블루스 라인 — 상행(울부짖듯)·아치도(외부 검토 지적) */
    const goal=t=>{const x=Math.max(0,Math.min(1,(t-t0)/Math.max(1,t1-t0)));return bShape==='desc'?c0+3-6*x:bShape==='asc'?c0-3+6*x:c0-2+5*Math.sin(Math.PI*x)};   /* 블루스 라인은 내려오는 쪽 */
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
    let ms;
    if(NAT){   /* v0.66 세 음을 보는 계획 — 「E-D-E-D-E-D…」「♭3-3-♭3-3…」처럼 두 음만 2~3마디 오가던 것(기억 없는 계획의 최저 비용 경로)을 막는다 */
      const O=NAT.osc,lo=Math.max(LO,c0-9),hi=Math.min(HI,c0+9);
      const bend=(pr,m)=>mod12(m-K)===4?(pr!==null&&mod12(pr-K)===3&&m-pr===1?0.2:1.6):0;   /* 장3음은 ♭3에서 반음 꺾어 올릴 때만 싸다 */
      const base=(q,m)=>{const c=nc(q,m,m-1);return c>=INF?INF:c-bend(m-1,m)+0.5*Math.max(0,m-ceilAt(events[span[q]].t))};   /* 앞 음에 달린 항(장3음 꺾기)을 뺀 음 자체 비용 */
      const cands=span.map((k,q)=>{const o=[];for(let m=lo;m<=hi;m++)if(base(q,m)<INF)o.push(m);return o});
      if(cands.some(c=>!c.length))return off();
      ms=viterbi2(cands,
        (q,m)=>base(q,m)+(q===0?(prevM!==null&&Math.abs(m-prevM)>MAXLEAP?INF:bend(prevM,m)):0),
        (q,a,b)=>{const t=tc(a,b);return t>=INF?INF:t+bend(a,b)},
        (q,a,b,c)=>c===a&&c!==b?NAT.riff2.aba:0,                                  /* v0.66.1 블루스의 두 음 주고받기는 싸게(리프의 기본) */
        (q,z,a,b,c)=>(c===z&&!(a===b&&b===c)?O.cyc3*1.3:0)+(c===a&&b===z&&a!==b?NAT.riff2.abab:0));   /* 네 음(A-B-A-B)까지는 리프, 그보다 길게 이어질수록 비용이 쌓인다. 세 음 리프는 두 번까지 */
      if(!ms)return off();
    }else{
    let L=new Map();
    for(let m=Math.max(LO,c0-9);m<=Math.min(HI,c0+9);m++){if(prevM!==null&&Math.abs(m-prevM)>MAXLEAP)continue;const c=nc(0,m,prevM);if(c<INF)L.set(m,{c,m,bk:null})}
    for(let q=1;q<n&&L.size;q++){const N2=new Map();
      for(let m=Math.max(LO,c0-9);m<=Math.min(HI,c0+9);m++)for(const s0 of L.values()){const t=tc(s0.m,m);if(t>=INF)continue;const c0b=nc(q,m,s0.m);if(c0b>=INF)continue;const c=s0.c+t+c0b,o=N2.get(m);if(!o||c<o.c)N2.set(m,{c,m,bk:s0})}
      L=N2}
    if(!L.size)return off();
    let best=null;for(const s0 of L.values())if(!best||s0.c<best.c)best=s0;
    ms=new Array(n);for(let q=n-1,s0=best;q>=0;q--,s0=s0.bk)ms[q]=s0.m;
    }
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
    const fail=()=>{const b=Math.floor(H.s/BPB),L=tagsAt[b];   /* v0.38 이름표는 장치 시작 박의 마디에 붙어 있다 */const q=L?L.findIndex(x=>x===HL_LABEL[H.kind]||(H.label&&x===H.label)):-1;if(q>=0)L.splice(q,1);return};
    if(span.length<3||span.some(k=>motifLock.has(k)||(forced.has(k)&&!/^(target|pass)$/.test(forced.get(k).kind))))return fail();
    const tgt={};span.forEach(k=>{const f=forced.get(k);if(f&&f.kind==='target')tgt[k]=f.m;forced.delete(k)});   /* 접근음은 장치가 덮어쓰되, 코드 전환 타깃(가이드톤)은 지킨다 */
    const e0=events[i],seg0=segs[segAt(e0.t)],goal=Math.round(pitchGoal(e0.t));
    const setF=(k,m)=>{forced.set(k,{m,kind:'dev'});motifLock.add(k)};
    let ms=[];
    if(H.kind==='perc'){
      let cur=null;const c=[];
      for(let m=LO;m<=HI;m++)if(isCT(seg0,m)&&isStable(seg0,m)&&Math.abs(m-goal)<=5&&(prevM===null||Math.abs(m-prevM)<=MAXLEAP))c.push({v:m,w:Math.exp(-Math.abs(m-goal)/2)});
      if(!c.length)return fail();cur=pickW(rng,c);
      for(const k of span){const sg=segs[segAt(events[k].t)];if(isCT(sg,cur)){}   /* v0.59 새 코드의 코드톤이면 그 음을 그대로 — 착지 규칙도 만족 */
        else if(tgt[k]!==undefined&&Math.abs(tgt[k]-cur)<=4)cur=tgt[k];else if(!inScale(sg,cur)){const ct=chordToneMidis(sg.root,sg.type,LO,HI).filter(x=>Math.abs(x-cur)<=3);if(ct.length)cur=nearest(ct,cur)}ms.push(cur)}
      /* v0.59 한 음이 4번 넘게 이어지지 못하면 「리듬 반복(한 음)」이라 부를 수 없으니 장치를 접는다 */
      {let run=1,best=1;for(let q=1;q<ms.length;q++){run=ms[q]===ms[q-1]?run+1:1;best=Math.max(best,run)}if(ms.length>=4&&best<4)return fail()}
    }else if(H.kind==='riff2'){
      /* v0.66.1 두 음 리프 — 버팀음 x(안정 코드톤)와 짝음 y를 번갈아. 짝: 단3도(블루스 리프의 기본) · 온음 이웃 · 장3도 · 도미넌트의 ♭3→3 꺾기.
         코드가 바뀌면 두 음을 각각 새 코드의 스케일음으로 옮기고, 가이드톤 타깃이 가까우면 그 음으로 맞춘다 */
      const tone=(sg,m)=>inScale(sg,m)||isCT(sg,m),c=[];
      for(let x=LO;x<=HI;x++){
        if(!isCT(seg0,x)||!isStable(seg0,x)||Math.abs(x-goal)>5||(prevM!==null&&Math.abs(x-prevM)>MAXLEAP))continue;
        const near=Math.exp(-Math.abs(x-goal)/2.5);
        [[-3,1.5],[3,1.2],[-2,1.2],[2,1.0],[-4,0.5],[4,0.5]].forEach(([d,w])=>{const y=x+d;if(y>=LO&&y<=HI&&tone(seg0,y))c.push({v:[x,y],w:w*near})});
        if(seg0.cls==='dom'&&mod12(x-seg0.root)===4&&x-1>=LO)c.push({v:[x,x-1],w:1.1*near*FP.chrom});
      }
      if(!c.length)return fail();
      let pr=pickW(rng,c).slice();const lead=rng()<0.5?0:1;
      span.forEach((k,q)=>{
        const sg=segs[segAt(events[k].t)];
        pr=pr.map(m=>{if(tone(sg,m))return m;for(const d of [1,-1,2,-2]){const x=m+d;if(x>=LO&&x<=HI&&tone(sg,x))return x}return m});
        if(tgt[k]!==undefined){const j=(q+lead)%2;if(Math.abs(tgt[k]-pr[j])<=3&&tgt[k]!==pr[1-j])pr[j]=tgt[k]}
        ms.push(pr[(q+lead)%2]);
      });
      /* 두 음이 한 음으로 뭉개졌거나 번갈음이 깨졌으면 접는다 */
      {let alt=0;for(let q=1;q<ms.length;q++)if(ms[q]!==ms[q-1])alt++;if(alt<ms.length-2||new Set(ms).size>4)return fail()}
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
    }else if(H.kind==='ust'){   /* v0.48 어퍼 스트럭처: 3화음을 위로(또는 아래로) 펼쳤다 되돌아오고, 마지막 음은 코드톤으로 해결 */
      const ch=ustChoices(seg0.type);if(!ch.length)return fail();
      const u=pickW(rng,ch.map(c=>({v:c,w:Math.pow(c.ten,1.5)*(c.minor?0.8:1)})));
      const pcs=u.pcs.map(p=>(seg0.root+p)%12),pool=[];for(let m=LO;m<=HI;m++)if(pcs.includes(mod12(m)))pool.push(m);
      if(pool.length<5)return fail();
      const want=goal-(H.dir>0?4:-1);let i0=0;pool.forEach((m,q)=>{if(Math.abs(m-want)<Math.abs(pool[i0]-want))i0=q});
      i0=Math.max(0,Math.min(pool.length-4,i0));
      const pat=H.dir>0?[0,1,2,3,2,1,0]:[3,2,1,0,1,2,3];
      for(let q=0;q<span.length;q++){
        const k=span[q],sg=segs[segAt(events[k].t)];
        if(q<pat.length&&sg===seg0)ms.push(pool[i0+pat[q]]);
        else{const last=ms[ms.length-1],ctm=chordToneMidis(sg.root,sg.type,LO,HI).filter(x=>Math.abs(x-last)<=4&&x!==last);if(!ctm.length)break;ms.push(nearest(ctm,last));break}   /* 해결 */
      }
      if(ms.length>=4){const b=Math.floor(e0.t/TPB),L=tagsAt[b]||(tagsAt[b]=[]),q=L.indexOf(HL_LABEL.ust),nm=HL_LABEL.ust+' '+UST_PC[(seg0.root+u.r)%12]+(u.minor?'m':'')+'('+u.pcs.map(p=>UST_DEG[p]).join('·')+')';
        if(q>=0)L[q]=nm;H.label=nm;stats.ust=(stats.ust||0)+1}
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
    const e0=events[i];
    /* v0.66 주제 회상 — 1코러스 첫 동기(carry.theme)를 뒤 코러스의 섹션 첫머리에서 다시 꺼낸다. 마지막 코러스 끝 섹션에서는 더 자주(「처음 한 말로 맺기」).
       코러스를 따로 만들던 탓에 코러스끼리 아무 관계가 없던 것을 잇는다. 모티프 확률 관문보다 먼저 정한다 */
    let theme=null;
    if(THEME&&motifRate&&!phDev[e0.ph]&&!headFrags.length){
      const secI=sectionIndex(e0.t,P,BPB),ph0=phrases[e0.ph],atHead=ph0&&ph0.s%(P*BPB)<BPB;
      if(ph0&&ph0.theme)theme=THEME;                                         /* 리듬 단계에서 이미 주제 회상으로 정한 프레이즈 */
      else if(atHead&&!themeUsed[secI]&&!ph0.song&&rng()<themeP(secI)*0.5){theme=THEME;themeUsed[secI]=true}   /* 리듬은 못 맞췄어도 윤곽만이라도 */
    }
    if(!theme&&(!motifRate||rng()>Math.min(1,motifRate*(densityAt(e0.t/6)>=0.95?MOTIF_DEV.denseRate:MOTIF_DEV.sparseRate))))return false;   /* v0.65 성긴 곳(주제 제시·발전)은 더, 촘촘한 곳(뒤 코러스)은 덜 */
    if(phDev[e0.ph])return false;
    /* 출처 결정 */
    let off=null,dd=null,from='self',srcStart=null,srcPh=-1,stage=0,kind0=null;
    if(theme){off=theme.off.slice();dd=theme.d.slice();from='theme';kind0=pickW(rng,[{v:'rep',w:2.2},{v:'up',w:0.7},{v:'down',w:0.7}])}
    else if(headFrags.length&&rng()<headRate){const f=headFrags[Math.floor(rng()*headFrags.length)];off=f.off.slice();dd=f.d.slice();from='head'}
    else{
      const cand=[];for(let ph=0;ph<e0.ph;ph++)if(phNotes[ph]&&phNotes[ph].length>=4)cand.push(ph);
      if(!cand.length)return false;
      /* v0.65 주제 = 지금 섹션의 첫 프레이즈(없으면 예전처럼 코러스 첫 프레이즈 또는 바로 앞) — 같은 주제를 쓸수록 발전 단계가 오른다 */
      const sec0=sectionIndex(e0.t,P,BPB),inSec=cand.filter(ph=>sectionIndex(phrases[ph].s*6,P,BPB)===sec0);
      const ph0=inSec.length?inSec[0]:cand[rng()<0.6?0:cand.length-1],a=phNotes[ph0];
      srcPh=ph0;stage=motifUse[ph0]||0;if(stage>=MOTIF_DEV.maxUse)return false;   /* 다 썼으면 놓아 주고 자유로운 라인으로 */
      const K0=(rng()<0.5)?4:3;let K=0;
      for(let k=1;k<K0&&k<a.length;k++){if(a[k].trip||a[k-1].trip||a[k].t-(a[k-1].t+a[k-1].d)>MOTIF_DEV.gapTicks)break;K=k+1}   /* v0.65 사이에 짧은 쉼(1박 이하)이 있어도 한 동기 */
      if(K<3)return false;
      if(a[K-1].trip)return false;
      const W=MOTIF_DEV.stageW[Math.min(stage,MOTIF_DEV.stageW.length-1)];
      kind0=pickW(rng,Object.keys(W).map(k=>({v:k,w:W[k]})));
      if(kind0==='frag'){   /* 쪼개기: 동기 끝 F음을 두 번 — 둘째는 2~3반음 옮겨(시퀀스) */
        const F=rng()<0.7?2:3,fa=a.slice(K-F,K),fs=(rng()<0.5?1:-1)*(rng()<0.6?2:3);
        const fo=fa.map(n=>n.midi-fa[0].midi);off=fo.concat(fo.map(x=>x+fs));dd=fa.map(n=>n.d).concat(fa.map(n=>n.d));srcStart=fa[0].midi;
      }else{off=a.slice(0,K).map(n=>n.midi-a[0].midi);dd=a.slice(0,K).map(n=>n.d);srcStart=a[0].midi}
    }
    const attempt=(off,dd)=>{
    const K=off.length;
    /* 대상 이벤트가 같은 프레이즈의 연속 음이고, 잠긴 곳·인용·잇단·프레이즈 끝음이 없어야 한다 */
    let contig=true;
    for(let k=0;k<K;k++){const x=events[i+k];if(!x||x.ph!==e0.ph||x.trip||x.quote||x.last||forced.has(i+k)||motifLock.has(i+k))return false;
      if(k>0&&events[i+k-1].t+events[i+k-1].d!==x.t){if(from==='head'||x.t-(events[i+k-1].t+events[i+k-1].d)>MOTIF_DEV.gapTicks)return false;contig=false}}   /* v0.65 자기 모티프는 짧은 쉼을 사이에 둬도 됨 */
    /* 리듬: 총 길이가 같으면 모티프 리듬을 그대로 입힌다. 아니면 헤드는 포기, 자기 모티프는 윤곽만 */
    const own=events[i+K-1].t+events[i+K-1].d-e0.t,srcSum=dd.reduce((a,b)=>a+b,0);
    let rhy=false;
    if(own===srcSum&&contig&&dd.length===K){
      let t=e0.t;
      const ok=dd.every(d=>{const r=(t%6===0)||(d===3||d===6||d===9);t+=d;return r&&d>=3});
      if(ok)rhy=true;
    }
    /* v0.47 헤드 조각은 리듬 길이가 안 맞아도 음 윤곽(음정 모양)은 빌려 쓴다 — 예전에는 포기해서 헤드 차용이 거의 안 들렸다 */
    if(!rhy&&from==='self'&&rng()<MOTIF_DEV.shapeOnly)return false;      /* 윤곽만 닮은 자기 모티프는 덜 쓴다(v0.65 0.4 → 0.2 — 발전이 너무 드물었다) */
    const t0=e0.t;
    const times=[],durs=[];
    {let t=t0;for(let k=0;k<K;k++){if(!rhy)t=events[i+k].t;times.push(t);const d=rhy?dd[k]:events[i+k].d;durs.push(d);t+=d}}   /* v0.65 리듬을 안 입히면 실제 자리 그대로 */
    /* 변형 */
    const kinds=[{v:'rep',w:0.9},{v:'up',w:1.2},{v:'down',w:1.2},{v:'inv',w:0.6}];
    const kind=kind0||pickW(rng,kinds);   /* v0.65 자기 모티프는 발전 단계에서 고른 변형 */
    const sgn=kind==='inv'?-1:1;   /* frag: 시퀀스가 off에 들어 있어 옮김 없음 */
    const sh=kind==='up'?pickW(rng,[{v:2,w:3},{v:3,w:1.5},{v:4,w:1}]):kind==='down'?-pickW(rng,[{v:2,w:3},{v:3,w:1.5},{v:4,w:1}]):0;
    const segAtT=t=>segs[segAt(t)];
    /* 시작음: 모티프의 출발음 기준(자기 모티프) 또는 현재 윤곽 목표(헤드)에서 가까운 코드톤 */
    const baseStart=from==='self'?srcStart+sh:(from==='theme'&&typeof theme.m0==='number'&&Math.abs(theme.m0-pitchGoal(t0))<=7?theme.m0:Math.round(pitchGoal(t0)))+sh;   /* v0.66 주제 회상은 되도록 처음 그 음높이에서 */
    const seg0=segAtT(t0);
    const startC=[];
    for(let m=LO;m<=HI;m++){
      const asWas=from==='theme'&&m===baseStart&&(isCT(seg0,m)||(isTens(seg0,m)&&inScale(seg0,m)));   /* v0.66 주제 회상: 처음 그 음이 지금 코드에서도 코드톤·텐션이면 그대로 */
      if(!allow(m,t0)||(!asWas&&(!isCT(seg0,m)||(STABLE&&!isStable(seg0,m))))||Math.abs(m-baseStart)>(from==='theme'?6:4))continue;
      if(prevM!==null&&Math.abs(m-prevM)>MAXLEAP)continue;
      startC.push({v:m,w:from==='theme'?Math.exp(-Math.abs(m-baseStart)/0.6):Math.exp(-Math.abs(m-baseStart)/1.5)*(isGuide(seg0,m)?1.6:1)});
    }
    if(!startC.length)return false;
    const start=pickW(rng,startC);
    const ms=[start];
    for(let k=1;k<K;k++){
      const sg=segAtT(times[k]),tgt=start+sgn*off[k];
      const heavy=(times[k]%6===0)||durs[k]>=6;
      let best=null;
      for(let m=tgt-(from==='theme'?2:1);m<=tgt+(from==='theme'?2:1);m++){   /* v0.66 주제 회상은 ±2반음까지 */
        if(m<LO||m>HI||!allow(m,times[k])||!matOK(sg,m,e0.ph))continue;
        if(Math.abs(m-ms[k-1])>MAXLEAP)continue;
        const okp=heavy?((opts.ctAlign!==false?isCT(sg,m):isMain(sg,m))||(from==='theme'&&isTens(sg,m)&&inScale(sg,m))):(inScale(sg,m)||isCT(sg,m));   /* v0.37 정박은 코드톤 · v0.66 주제 회상은 텐션도(처음 낼 때 그랬듯) */
        if(!okp)continue;
        const sc=Math.abs(m-tgt)*2+(isCT(sg,m)?-0.5:0)+(NAT&&m===ms[k-1]&&off[k]!==off[k-1]?3:0);   /* v0.66 원래 동기에 없던 같은 음 반복은 피한다 */
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
    const nm=from==='head'?'헤드 차용':from==='theme'?'주제 회상(1코러스 첫 동기)':'모티프 발전';
    if(from==='theme')stats.theme=(stats.theme||0)+1;
    const kn={rep:'반복',up:'시퀀스↑',down:'시퀀스↓',inv:'반진행',frag:'쪼개기'}[kind];
    if(srcPh>=0)motifUse[srcPh]=stage+1;   /* v0.65 발전 단계 올림 */
    tag(Math.floor(t0/TPB),nm+': '+kn);
    stats.motif++;if(from==='head')stats.headQuote++;
    motifLog.push({bar:Math.floor(t0/TPB),t:t0,from,kind,len:K,rhythm:rhy,off:off.slice(),dur:durs.slice(),start:ms[0],ms:ms.slice()});
    return true;
    };
    if(from!=='theme')return attempt(off,dd);
    for(let K2=off.length;K2>=3;K2--)if(attempt(off.slice(0,K2),dd.slice(0,K2)))return true;   /* v0.66 주제는 앞머리 3음만 맞아도 회상으로 들린다 */
    return false;
  }
  let curPh=-1,tryMotifPending=false;
  for(let i=0;i<events.length;i++){
    const e=events[i];
    const seg=segs[segAt(e.t)];
    if(e.ph!==curPh){ /* 새 프레이즈: 음형 목표 설정 */
      curPh=e.ph;
      const ph=phrases[e.ph],t0=ph.s*6,t1=(ph.e+1)*6;
      const c=centerAt(t0),span=ARC.n>1?(NAT?(inst==='free'?6:5):3):(inst==='free'||!useGroups?7:4);   /* v0.66 여러 코러스일 때 프레이즈 윤곽 폭 ±3 → ±5반음(좁은 음역에서 맴돌던 것) */
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
    /* v0.62 리프 반복 — 앞 마디 같은 자리의 음을 되풀이(블루스·라틴 리프처럼 코드가 바뀌어도 맞으면 그대로, 안 맞으면 반음·온음 안의 코드톤으로).
       마지막 되풀이의 끝 두 음은 「응답」으로 새로 고른다 */
    if(e.riff&&e.riffR>0&&!forced.has(i)&&!e.trip&&!e.quote){
      let src=null;for(let j=i-1;j>=0&&events[j].t>=e.t-TPB;j--)if(events[j].t===e.t-TPB&&events[j].ph===e.ph&&events[j].riff){src=events[j];break}
      const tail=events.slice(i+1).filter(x=>x.ph===e.ph).length<2&&e.riffR>=2;
      if(src&&src.midi!==null&&!tail){
        let m0=src.midi;
        const bluesKeep=(feel==='shuffle'||songType==='blues')&&[0,3,5,6,7,10].includes(mod12(m0-keyPc));   /* 블루스 리프는 조의 블루스 스케일 음이면 코드가 바뀌어도 그대로 */
        if(!(isCT(seg,m0)||inScale(seg,m0)||bluesKeep)){const c=chordToneMidis(seg.root,seg.type,LO,HI).filter(x=>Math.abs(x-m0)<=2);m0=c.length?nearest(c,m0):null}
        if(m0!==null&&okNote(m0,e.t,prevM)){forced.set(i,{m:m0,kind:'riff'});motifLock.add(i)}
      }
    }
    if(NAT&&e.trip&&e.repK===0&&!e.hl)planTriplet(i);   /* v0.66 셋잇단은 세 음을 한 모양으로 */
    let m=null,f=forced.get(i);
    if(f&&(f.kind==='quote'||(f.kind==='disp'&&allow(f.m,e.t))||(f.kind==='dev'&&okNote(f.m,e.t,prevM))||(f.kind==='ctl'&&allow(f.m,e.t))||((f.kind==='song'||f.kind==='blues'||f.kind==='lick')&&okNote(f.m,e.t,prevM))||(okNote(f.m,e.t,prevM)&&matOK(seg,f.m,e.ph))))m=f.m;
    else{
      if(f){
        /* v0.38 장치 음이 도약·음역 검사에서 밀려나면 음형이 깨진다 — 그 장치의 이름표도 뗀다(악보 표시와 실제 음형이 어긋나지 않게) */
        if(f.kind==='dev'&&e.hl&&!e.hl.broken){e.hl.broken=true;const L=tagsAt[Math.floor(e.hl.s/BPB)],q=L?L.findIndex(x=>x===HL_LABEL[e.hl.kind]||(e.hl.label&&x===e.hl.label)):-1;if(q>=0)L.splice(q,1)}
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
    if(opts.debug){const f9=forced.get(i);e.src=f9&&f9.m===m?f9.kind:'free';e.m0=m}
    if(m!==null&&!e.quote)(phNotes[e.ph]||(phNotes[e.ph]=[])).push({t:e.t,d:e.d,midi:m,trip:!!e.trip});
    if(f&&f.kind==='target'&&m!==null){
      if(isGuide(seg,m)){stats.guideHits++;tag(Math.floor(e.t/TPB),'가이드톤 타깃')}
      else tag(Math.floor(e.t/TPB),'코드톤 착지');
    }
    if(m!==null){if(prevM!==null&&m!==prevM){const nd=Math.sign(m-prevM);lastTurn=prev2M!==null&&prevM!==prev2M&&nd!==Math.sign(prevM-prev2M);lastDir=nd}prev2M=prevM;prevM=m}
    if(m!==null){
      if(e.disp&&f&&f.kind==='disp'&&m===f.m){gapFill=2;stats.disp=(stats.disp||0)+1;tag(Math.floor(e.t/TPB),'반전 도약')}
      else{e.disp=false;if(gapFill>0)gapFill--}
      recentM.push({m,ph:e.ph});if(recentM.length>4)recentM.shift();
    }
    planApproach(i);
  }
  /* 안전망: 5도 초과 도약(관악기) → 가까운 코드톤으로 교정, 안 되면 쉼표 */
  for(let pass=0;pass<2;pass++){
    let pv=CARRY?CARRY.m:null,pi=-1,ppv=null;   /* v0.66 코러스 첫 음도 앞 코러스 끝음 기준으로 도약 검사 */
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
    let pv=CARRY?CARRY.m:null;   /* v0.66 코러스 첫 음도 앞 코러스 끝음에서 도약 한도 안으로 */
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
    const PIN=new Set(['quote','dev','trep','disp','ctl','motif','trip3']);
    const snd=[];events.forEach((e,i)=>{if(e.midi!==null)snd.push(i)});
    let lastFixed=CARRY?CARRY.m:null,q0=0;
    const wishR=mulberry32(((seed===undefined?0:seed)^0x85ebca6b)>>>0),wishP=NAT?(NAT.chrom[LVN]||0)*Math.min(1.5,FP.chrom):0;   /* v0.66 반음 어프로치 욕심(따로 만든 난수) */
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
      /* v0.66 선율 다듬기(2차 동적 계획) — v0.37은 「원래 음에서 가장 가까운 코드톤」만 봐서 정박마다 3·7음으로 끌려가고(실측의 2.5~3배),
         두 음 왕복(A-B-A-B)·엇갈린 도약이 남았다. 이제 세 음의 모양(shapeCost3)까지 함께 본다. 규칙:
         · 버팀 자리(1·3박, 코드가 바뀌는 첫 정박, 2박 이상 긴 음, 정박에서 시작해 코드 경계를 넘는 음) = 코드톤 — 예전과 같다
         · 약한 정박(2·4박)·엇박에서 시작한 4분 이상 = 코드톤, 단계 4부터 텐션(9·13·마이너 11)도, 단계 5는 앞뒤가 같은 방향 순차인 경과음까지
         · 끝음 = 코드톤(단계 4부터 텐션도) · 당김음(엇박에서 시작해 다음 코드로 넘어가는 음) = 새 코드의 코드톤이면서 지금 코드의 스케일음
         · 엇박 짧은 음 = 스케일/코드톤, 반음은 바로 다음 음으로 반음 해결될 때만 — 「욕심」이 켜진 자리는 다음 정박 코드톤에 반음으로 붙는 음에 보너스 */
      let ms2=null;
      if(NAT&&diff>=2){
        const O=NAT.osc,B=NAT.beat,tensOK=LVN>=B.tensLv,passOK=LVN>=B.passLv,endTensOK=LVN>=B.endTensLv;
        const neNext=q1+1<snd.length?events[snd[q1+1]].midi:null;
        info.forEach(I=>{
          const e=I.e,bt=Math.floor((e.t%TPB)/6),on=e.t%6===0;
          const strongBeat=on&&(bt===0||(BPB===4&&bt===2)||(BPB>=5&&bt===Math.ceil(BPB/2)));
          I.antic=!on&&!!I.cross;                                              /* 당김음 */
          I.anchor=!I.antic&&(strongBeat||I.change||e.d>=12||!!I.cross);        /* 버팀 자리 */
          I.weak=!I.anchor&&!I.antic&&(on||e.d>=6);                             /* 약한 정박 */
          I.mat=!!phDev[e.ph]&&phDev[e.ph]!=='chrom'&&phDev[e.ph]!=='quote';
          I.on=on;I.wish=wishR()<wishP&&!I.mat;
        });
        const availT=(sg,m)=>isTens(sg,m)&&inScale(sg,m)&&!isCT(sg,m);
        /* 음 종류: 0 코드톤 · 1 텐션 · 2 정박 경과음 · 3 스케일음 · 4 반음 · -1 금지 */
        const kindOf=(q,m)=>{
          const I=info[q],sg=I.sg,ct=isCT(sg,m);
          if(I.mat&&m!==I.e.midi&&!matOK(sg,m,I.e.ph))return -1;              /* 연습 주제(펜타토닉·스케일 등)는 그 재료 안에서만 옮긴다 */
          if(I.antic)return isCT(I.cross,m)&&(ct||inScale(sg,m))?0:-1;
          if(I.anchor)return ct&&(!I.cross||isCT(I.cross,m))?0:-1;
          if(I.last)return ct?0:(endTensOK&&availT(sg,m)?1:-1);
          if(I.weak){if(ct)return 0;if(tensOK&&availT(sg,m))return 1;return passOK&&I.on&&I.e.d<=6&&q>0&&inScale(sg,m)?2:-1}
          if(ct||inScale(sg,m))return 3;
          return I.contig&&I.e.d<=3&&(!I.mat||m===I.e.midi)?4:-1;
        };
        const kc=info.map((I,q)=>{const o={};if(!I.pin)I.cands.forEach(m=>{o[m]=kindOf(q,m)});return o});
        ms2=viterbi2(info.map(I=>I.cands),
          (q,m)=>{
            const I=info[q];
            if(q===n-1&&!I.pin&&neNext!==null&&Math.abs(m-neNext)>MAXLEAP)return INF;
            if(I.pin)return 0;
            const k=kc[q][m];if(k<0)return INF;
            if(q===0&&lastFixed!==null&&Math.abs(m-lastFixed)>MAXLEAP)return INF;
            return O.anchor*Math.abs(m-I.e.midi)*(I.motif?2.5:1)+(I.change&&!isGuide(I.sg,m)?GUIDE.change:0)+(k===1?B.tensCost:k===2?B.passCost:0);
          },
          (q,a,b)=>{
            const I=info[q],P=info[q-1];
            if(!leapOK(P,a,I,b))return INF;
            const ab=Math.abs(b-a);
            if(!P.pin&&kc[q-1][a]===4&&(ab!==1||I.gap>0))return INF;           /* 반음은 바로 반음으로 해결 */
            return ab===0&&I.gap<6&&!(I.pin&&P.pin)?(I.mat?3.5:2):0;           /* 같은 음 반복 — 재료가 성긴 연습 주제(펜타토닉)에서는 더 비싸게 */
          },
          (q,a,b,c)=>{
            const I=info[q],P=info[q-1],PP=info[q-2],kb=P.pin?0:kc[q-1][b],contig=I.gap<=0&&P.gap<=0;
            if(kb===2){const d1=b-a,d2=c-b;if(!contig||!d1||!d2||Math.abs(d1)>2||Math.abs(d2)>2||Math.sign(d1)!==Math.sign(d2))return INF}   /* 정박 경과음은 앞뒤가 같은 방향 순차일 때만 */
            let t=0;
            if(I.gap<6&&P.gap<6&&!(I.pin&&P.pin&&PP.pin))t+=shapeCost3(O,a,b,c);
            if(kb===4&&P.wish&&contig&&I.on&&Math.abs(c-b)===1&&Math.abs(b-a)<=4&&(I.pin?isCT(I.sg,c):kc[q][c]===0))t-=NAT.chrom.bonus;
            return t;
          },
          (q,z,a,b,c)=>c===z&&!(a===b&&b===c)&&info[q].gap<6&&info[q-1].gap<6&&info[q-2].gap<6&&!(info[q].pin&&info[q-1].pin&&info[q-2].pin&&info[q-3].pin)?O.cyc3:0);
        if(ms2){ms2.forEach((m,q)=>{const e=info[q].e;if(e.midi!==m){e.midi=m;stats.ctAlign=(stats.ctAlign||0)+1}});lastFixed=events[idx[n-1]].midi;q0=q1+1;continue}
        stats.ctAlign2Fail=(stats.ctAlign2Fail||0)+1;   /* 풀 수 없으면 예전 방식으로 */
      }
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
  /* ── ⑥-b v0.47 첫 음 정리 — 코드 밖 음(악보 색 빨강)이 「들어가는 자리」에 오지 않게 ──
     테스터 피드백: 1·5·9·13마디처럼 프레이즈가 시작되는 자리를 코드 밖 음으로 열면 어색하게 들린다.
     ① 마디선을 넘어 붙임줄로 이어지는 음: 새 마디 첫 박에서 울리므로 새 코드의 코드톤으로(당겨 친 음 = 다음 코드 음)
     ② 4마디 단위 첫 박(1·5·9·13…)에 치는 음: 코드톤(없으면 스케일음)
     ③ 쉼(8분 이상) 뒤 들어가는 음·프레이즈 첫 음: 스케일음 이상(코드톤 우선). 블루스·릭 마디는 ③에서 빼고, 릭 마디는 전부 뺀다
     후보는 원래 음 ±1·±2·±3반음 중 가까운 것, 음역 안, 다음 음과 같은 음(반복)은 피한다 */
  if(topic!=='ct'){   /* 코드톤 라인 연습은 계획 단계에서 이미 코드톤으로 들어간다 — 손대지 않는다 */
    const chAt=t=>{const b=Math.min(NB-1,Math.floor(t/TPB));return chordAtBeat(bars[b],(t-b*TPB)/6,BPB)||bars[b][0]};
    const kind=(m,c)=>{const r=mod12(m-c.root),T=CHORD_TYPES[c.type];return T.iv.includes(r)?2:T.scale.includes(r)?1:0};
    const has=(b,re)=>(tagsAt[b]||[]).some(x=>re.test(x));
    const fix=(k,c,need,why)=>{
      const e=events[k],nx=events.slice(k+1).find(x=>x.midi!==null),pv=events.slice(0,k).reverse().find(x=>x.midi!==null)||(CARRY?{midi:CARRY.m}:undefined);
      let best=null,bs=1e9;
      for(const o of [1,-1,2,-2,3,-3]){
        const m=e.midi+o;if(m<LO||m>HI)continue;const kd=kind(m,c);if(kd<need)continue;
        const lp=x=>x&&Math.abs(x.midi-m)>MAXLEAP&&!(x===pv&&e.disp&&m>pv.midi&&m-pv.midi<=12);if(lp(pv)||lp(nx))continue;   /* 도약 한도 지킴 */
        let sc=Math.abs(o)*2+(kd===2?0:1.5)+(nx&&nx.midi===m?4:0);
        if(sc<bs){bs=sc;best=m}
      }
      if(best===null)return false;
      e.midi=best;stats.redFix=(stats.redFix||0)+1;stats['redFix_'+why]=(stats['redFix_'+why]||0)+1;return true;
    };
    events.forEach((e,k)=>{
      if(e.midi===null||e.trip)return;
      const b0=Math.floor(e.t/TPB),b1=Math.floor((e.t+e.d-1)/TPB);
      if(has(b0,/릭/))return;
      if(b1>b0&&!has(b1,/릭/)){   /* ① 마디선을 넘는 음 */
        const B=b1*TPB,c=chAt(B);
        if(kind(e.midi,c)===0&&(!has(b1,/블루스/)||b1%4===0)){fix(k,c,2,'tie')||fix(k,c,1,'tie');return}
      }
      if(e.t%TPB===0&&b0%4===0){const c=chAt(e.t);if(kind(e.midi,c)===0){fix(k,c,2,'db4')||fix(k,c,1,'db4');return}}   /* ② */
      const pv=events.slice(0,k).reverse().find(x=>x.midi!==null),entry=e.first||!pv||pv.t+pv.d<=e.t-3;   /* 쉼 뒤 들어가는 음 */
      if(entry&&!has(b0,/블루스/)){const c=chAt(e.t);if(kind(e.midi,c)===0)fix(k,c,1,'ph')}   /* ③ */
    });
  }
  /* ── ⑥-c v0.66.6 고음 끌기 — 코드톤(아르페지오)으로 1옥타브 남짓 올라가 고음(F5 이상)을 2분음표 이상 끌고,
     스케일·코드톤으로 내려와 프레이즈를 맺는다. 연주자 피드백: 높을수록 효과가 크다 → 쓸 수 있는 가장 높은 코드톤.
     코러스마다 많아야 한 번(첫 코러스는 덜, 마지막 코러스는 더) · 단계 3 이상 · 「선율 다듬기」 켰을 때만.
     릭·노래·블루스·리프·인용·셋잇단·하이라이트 음은 덮어쓰지 않는다. 프레이즈 끝(뒤에 쉼)에서만 — 내려온 뒤 숨 쉬게 */
  if(NAT&&NAT.climb&&diff>=2&&LVN>=3&&topic==='auto'&&(BPB===4||BPB===3)){
    const CL=NAT.climb;let pc=CL.p[LVN]||0;if(ARC.n>1)pc*=ARC.i===0?CL.first:ARC.i===ARC.n-1?CL.last:1;
    if(pc>0&&rng()<pc){
      const free=e=>!e.trip&&!e.song&&!e.blu&&!e.hl&&!e.quote&&!e.riff&&(e.lick===undefined||e.lick===null);
      const segOf=t=>segs[segAt(t)];
      const tone=(sg,m)=>{const r=mod12(m-sg.root);return sg.ct.includes(r)?2:(r===2&&sg.cls!=='dim'&&sg.cls!=='hdim')?1.5:sg.scale.includes(r)?1:0};
      const cands=[];
      for(let ph=0;ph<phrases.length;ph++){
        const notes=events.filter(e=>e.ph===ph&&e.midi!==null);if(notes.length<4)continue;
        const lst=notes[notes.length-1],Eend=lst.t+lst.d;if(Eend%3)continue;
        const nxt=events.find(e=>e.t>=Eend&&e.midi!==null);if(nxt&&nxt.t<Eend+3)continue;   /* 뒤에 쉼이 있어야 */
        for(const sh in CL.shapes)for(const n of CL.desc)for(const hl of (sh==='leap'?CL.leapHold:CL.hold))for(const k of (sh==='e8'?CL.asc:sh==='q4'?[2,3]:[1])){   /* v0.67 모양: e8 8분 아르페지오 상행 · q4 4분 아르페지오 상행 · leap 한 박 쉬고 도약해 정점(예시 솔로) */
          const st8=sh==='q4'?6:sh==='leap'?6:3,H=Eend-(3*n+6)-hl,W0=H-st8*k;
          if(H<0||H%6||!(H%TPB===0||(BPB===4&&H%TPB===12)))continue;   /* 끄는 음은 마디 첫 박 또는 셋째 박 */
          if(W0<notes[0].t)continue;
          const win=events.filter(e=>e.t+e.d>W0&&e.t<Eend);
          if(win.some(e=>e.ph!==ph||(e.midi!==null&&!free(e))))continue;
          const st=win.find(e=>e.t<W0);if(st&&(W0-st.t<3||(W0-st.t)%3))continue;
          cands.push({ph,Eend,H,W0,hl,n,k,nxt,sh,st8,w:(0.5+Eend/TOT+(hl>=18?0.3:0))*CL.shapes[sh]});
        }
      }
      const build=c=>{
        const before=events.filter(e=>e.midi!==null&&e.t<c.W0),pv=before.length?before[before.length-1].midi:(CARRY?CARRY.m:null);
        const tops=[];
        for(let m=HI;m>=CL.minTop;m--){let good=true;
          for(let t=c.H;t<c.H+c.hl;t+=6){const sg=segOf(t),need=(t%TPB===0&&t>c.H)?2:1.5;if(tone(sg,m)<need){good=false;break}}   /* 끄는 동안 바뀌는 코드에도 맞게(마디선 넘으면 코드톤) */
          if(good)tops.push(m)}
        if(!tops.length)return null;
        const top=tops[tops.length>1&&rng()<0.35?1:0];
        if(c.sh==='leap'){if(pv===null||top-pv<5||top-pv>12)return null}   /* 쉼 뒤 5~12반음 위로 도약 */
        const asc=[top];
        if(c.sh!=='leap')for(let j=c.k-1;j>=0;j--){const t=c.W0+c.st8*j,sg=segOf(t),hi=asc[0],opt=[];
          for(let m=hi-2;m>=Math.max(LO,hi-MAXLEAP);m--){if(tone(sg,m)<1.5)continue;const iv=hi-m;opt.push({m,w:iv>=3&&iv<=5?3:1})}
          if(!opt.length)return null;let r=rng()*opt.reduce((a,o)=>a+o.w,0),pk=opt[0];for(const o of opt){r-=o.w;if(r<=0){pk=o;break}}asc.unshift(pk.m)}
        asc.pop();   /* 마지막은 끄는 음(top) */
        if(c.sh!=='leap'){if(top-asc[0]<(c.sh==='q4'?7:CL.minRise))return null;
          if(pv!==null&&Math.abs(asc[0]-pv)>MAXLEAP)return null}
        const mkDesc=arp=>{const desc=[];let cur=top;
        for(let j=0;j<=c.n;j++){const t=c.H+c.hl+3*j,sg=segOf(t);let pick=null;
          if(arp){for(let m=cur-1;m>=cur-5;m--)if(tone(sg,m)>=2){pick=m;break}}
          if(pick===null){for(let m=cur-1;m>=cur-3;m--)if(tone(sg,m)>=1){pick=m;break}
            if(pick!==null&&t%6===0&&tone(sg,pick)<2){for(let m=pick-1;m>=cur-4;m--)if(tone(sg,m)>=2){pick=m;break}}}   /* 정박엔 코드톤 */
          if(pick===null)pick=cur-1;
          if(j===c.n&&tone(sg,pick)<2){for(const o of [-1,1,-2,2]){const m=pick+o;if(m!==cur&&tone(sg,m)>=2&&Math.abs(m-cur)<=MAXLEAP){pick=m;break}}}   /* 맺는 음은 코드톤 */
          if(pick<LO)return null;desc.push(pick);cur=pick}
        if(c.nxt&&Math.abs(c.nxt.midi-cur)>MAXLEAP)return null;return desc};
        const a1=rng()<0.45,desc=mkDesc(a1)||mkDesc(!a1);   /* 다음 프레이즈 첫 음까지 도약 한도 — 안 되면 다른 모양으로 */
        return desc?{asc,top,desc}:null;
      };
      stats.climbTry=(stats.climbTry||0)+1;if(!cands.length)stats.climbNoCand=(stats.climbNoCand||0)+1;
      for(let tr=0;tr<CL.tries&&cands.length;tr++){
        let r=rng()*cands.reduce((a,o)=>a+o.w,0),ci=0;for(;ci<cands.length-1;ci++){r-=cands[ci].w;if(r<=0)break}
        const c=cands.splice(ci,1)[0],P=build(c);if(!P)continue;
        const olds=events.filter(e=>e.ph===c.ph&&e.midi!==null),wasFirst=olds.length&&olds[0].t>=c.W0,st=events.find(e=>e.t<c.W0&&e.t+e.d>c.W0);
        if(st)st.d=c.W0-st.t;
        const keep=events.filter(e=>!(e.t>=c.W0&&e.t<c.Eend)),nw=[];
        if(c.sh!=='leap')P.asc.forEach((m,j)=>nw.push({t:c.W0+c.st8*j,d:c.st8,midi:m,ph:c.ph,climb:true}));
        nw.push({t:c.H,d:c.hl,midi:P.top,ph:c.ph,climb:true,disp:c.sh==='leap'&&P.top-(events.filter(e=>e.midi!==null&&e.t<c.W0).pop()||{midi:P.top}).midi>MAXLEAP});
        P.desc.forEach((m,j)=>nw.push({t:c.H+c.hl+3*j,d:j===c.n?6:3,midi:m,ph:c.ph,climb:true}));
        if(wasFirst)nw[0].first=true;nw[nw.length-1].last=true;
        const at=keep.findIndex(e=>e.t>=c.W0);keep.splice(at<0?keep.length:at,0,...nw);
        events.length=0;events.push(...keep);
        tag(Math.floor(c.W0/TPB),'고음 끌기');stats.climb=(stats.climb||0)+1;break;
      }
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
  /* ── ⑧ v0.67 16분 꾸밈음 — 8분 하나를 16분 둘로 쪼개 다음 음으로 반음 미끄러져 들어간다(13-♭13 → 5, ♯11-11 → ♭3 같은 꾸밈).
     연주자 예시 솔로에서 음의 약 5%가 이런 16분 두 음. 틱 격자는 그대로 두고 16분 = 1.5틱(0.5 단위)으로 적는다 —
     꾸밈음을 끄면(선율 다듬기 끔·단계 3 이하·빠른 곡) 예전과 한 음도 다르지 않다.
     조건: 셋잇단·붙임줄 아님, 8분(3틱) 바로 뒤에 같은 마디 8분 이상 음, 두 음 사이 2~3반음 → 첫 16분은 원래 음, 둘째는 다음 음 쪽으로 반음 */
  if(NAT&&NAT.six&&topic==='auto'&&(opts.bpm||prog.bpm||140)<=NAT.six.maxBpm){
    const SX=NAT.six,slow=(opts.bpm||prog.bpm||140)<=SX.slowBpm||feel==='ballad';let cap=(slow?SX.capSlow:SX.cap)[LVN]||0;
    const cands=[];
    if(cap>0)result.forEach((bar,b)=>{if((bar.tags||[]).some(x=>/릭|인용|블루스/.test(x)))return;
      for(let k=0;k+1<bar.notes.length;k++){const a=bar.notes[k],c=bar.notes[k+1];
        if(a.midi===null||c.midi===null||a.trip||c.trip||a.tie||a.d!==3||c.t!==a.t+3||c.d<3)continue;
        const iv=c.midi-a.midi;if(Math.abs(iv)<2||Math.abs(iv)>3)continue;
        const mid=a.midi+Math.sign(iv);if(mid<LO||mid>HI)continue;
        cands.push({b,k,mid,w:(a.t%6===3?SX.offbeat:1-SX.offbeat)+(iv<0?0.3:0)})}});   /* 내려가며 미끄러지는 쪽이 흔하다 */
    const used=new Set();
    while(cap>0&&cands.length){let r=rng()*cands.reduce((x,o)=>x+o.w,0),ci=0;for(;ci<cands.length-1;ci++){r-=cands[ci].w;if(r<=0)break}
      const o=cands.splice(ci,1)[0];if(used.has(o.b)||rng()>SX.p)continue;   /* 한 마디에 하나 */
      const bar=result[o.b],a=bar.notes[o.k];a.d=1.5;a.six=true;bar.notes.splice(o.k+1,0,{t:a.t+1.5,d:1.5,midi:o.mid,six:true});
      used.add(o.b);cap--;tag(o.b,'16분 꾸밈음');stats.six=(stats.six||0)+1}
  }
  /* ── ⑧-b v0.67.2 발라드 더블 타임 런 — 느린 곡에서 두 박(12틱)을 16분 여덟 개로 채운다. 첫 음은 원래 음, 다음 음 쪽으로 스케일을 밟고
     8분 자리(정박·엇박)에는 코드톤을 우선. 코러스마다 많아야 한 번. 릭·인용·블루스·노래·고음 끌기 마디 제외 */
  if(NAT&&NAT.dtime&&topic==='auto'&&BPB===4&&(feel==='ballad'||(opts.bpm||prog.bpm||140)<=NAT.dtime.maxBpm)&&rng()<(NAT.dtime.p[LVN]||0)){
    const DT=NAT.dtime,cands=[];
    result.forEach((bar,b)=>{if((bar.tags||[]).some(x=>/릭|인용|블루스|노래|고음 끌기|16분/.test(x)))return;
      for(const s0 of [0,12]){const inS=bar.notes.filter(n=>n.t<s0+12&&n.t+n.d>s0);
        if(!inS.length||inS.some(n=>n.midi===null||n.trip||n.t<s0||n.t+n.d>s0+12)||inS[0].t!==s0)continue;
        if(inS[inS.length-1].tie)continue;if(s0===0&&b>0){const pl=result[b-1].notes[result[b-1].notes.length-1];if(pl&&pl.tie)continue}
        const after=bar.notes.find(n=>n.t>=s0+12)||(s0===12&&b+1<NB?result[b+1].notes[0]:null);
        let any=null;for(let bb=b;bb<NB&&any===null;bb++){const q=result[bb].notes.find(n=>n.midi!==null&&(bb>b||n.t>=s0+12));if(q)any=q.midi}   /* 쉼 건너 다음 음(도약 한도) */
        cands.push({b,s0,a0:inS[0].midi,any,nx:after&&after.midi!==null&&after.t%TPB===(s0+12)%TPB?after.midi:null})}});
    for(let tr=0;tr<8&&cands.length;tr++){const c=cands.splice(Math.floor(rng()*cands.length),1)[0],T0=c.b*TPB+c.s0;
      let goal=c.nx!==null?c.nx:c.a0-(5+Math.floor(rng()*4));if(goal<LO+2)goal=Math.min(HI-1,c.a0+6);const ms=[c.a0];let ok=true,rev=0;   /* 아래가 막히면 위로 */
      for(let i=1;i<8;i++){const t=T0+i*1.5,sg=segs[segAt(Math.floor(t))],pv=ms[i-1],left=goal-pv,steps=8-i+(c.nx!==null?1:0),ideal=pv+left/steps;
        let best=null,bc=1e9;for(let m=pv-DT.maxStep;m<=pv+DT.maxStep;m++){if(m===pv||m<LO||m>HI)continue;const r=mod12(m-sg.root);if(!sg.scale.includes(r))continue;
          const turn=i>=2&&(m-pv)*(pv-ms[i-2])<0;if(turn&&rev>=1)continue;   /* 방향은 많아야 한 번 바꾼다(지그재그 금지) */
          const cost=Math.abs(m-ideal)+((i%2===0&&!sg.ct.includes(r))?0.8:0)+(turn?1.2:0);if(cost<bc){bc=cost;best=m}}
        if(best===null){ok=false;break}if(i>=2&&(best-ms[i-1])*(ms[i-1]-ms[i-2])<0)rev++;ms.push(best)}
      if(!ok||(c.nx!==null&&Math.abs(c.nx-ms[7])>2)||(c.any!==null&&Math.abs(c.any-ms[7])>MAXLEAP))continue;
      const bar=result[c.b];bar.notes=bar.notes.filter(n=>n.t<c.s0||n.t>=c.s0+12);
      ms.forEach((m,i)=>bar.notes.push({t:c.s0+i*1.5,d:1.5,midi:m,dt:true}));bar.notes.sort((x,y)=>x.t-y.t);
      tag(c.b,'더블 타임 런');stats.dtime=(stats.dtime||0)+1;break}
  }
  /* v0.66 다음 코러스로 넘겨줄 것 — 끝음·마지막 방향·첫 동기(주제). UI는 carryOf(앞 코러스 솔로)를 다음 코러스의 opts.carry로 준다 */
  let carryOut=null;
  if(NAT){
    const snd=events.filter(e=>e.midi!==null);
    const le=snd[snd.length-1]||null,pe=snd[snd.length-2]||null;
    let theme=CARRY&&CARRY.theme?CARRY.theme:null;
    if(!theme&&snd.length>=3&&topic==='auto'){   /* 첫 프레이즈의 첫 3~5음(셋잇단·인용 제외, 1박 넘는 쉼 앞까지) */
      const a=[];for(const e of snd){if(e.ph!==snd[0].ph||e.trip||e.quote||a.length>=5)break;if(a.length&&e.t-(a[a.length-1].t+a[a.length-1].d)>6)break;a.push(e)}
      if(a.length>=3&&new Set(a.map(e=>e.midi)).size>=2)theme={off:a.map(e=>e.midi-a[0].midi),d:a.map(e=>Math.min(12,e.d)),m0:a[0].midi,toks:firstToks};
    }
    carryOut={m:le?le.midi:(CARRY?CARRY.m:null),dir:le&&pe&&le.midi!==pe.midi?Math.sign(le.midi-pe.midi):0,theme,licks:Object.assign({},CARRY&&CARRY.licks,lickUse)};
  }
  return {progId,keyPc,diff,style:styleId,bpb:BPB,bars:result,ts:Date.now(),harm:segs.map(s=>({bar:s.bar,t0:s.t0,label:s.label,fn:s.fn,sname:s.sname})),
    stats,feel,topic,quote:quoteInfo,motifs:motifLog,carry:carryOut,dbg:opts.debug?events.map(e=>({t:e.t,d:e.d,midi:e.midi,m0:e.m0,src:e.src,ph:e.ph,trip:!!e.trip,song:!!e.song,blu:!!e.blu,hl:e.hl?e.hl.kind:null,first:!!e.first,last:!!e.last})):undefined,
    form:{phrase:P,sections:sec.slice(0,nPh).split(''),licks:lickUse,phrases:phrases.length}};
}
/* v0.66 앞 코러스 솔로 → 다음 코러스에 넘길 carry. 헤드·고정 마디를 끼운 뒤의 실제 끝음을 다시 읽는다(끼워 넣기로 끝음이 바뀔 수 있음) */
function carryOf(solo){
  if(!solo||!solo.carry)return null;
  let m=null,pm=null;
  solo.bars.forEach(b=>b.notes.forEach(n=>{if(n.midi!==null){if(m!==null&&n.midi!==m)pm=m;m=n.midi}}));
  if(m===null)return null;
  return {m,dir:pm===null?0:Math.sign(m-pm),theme:solo.head?null:(solo.carry.theme||null),licks:solo.carry.licks||null};   /* 헤드 코러스 밑에 깔린(들리지 않는) 솔로의 동기는 넘기지 않는다 */
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
  if(Number.isInteger(v))return String(v);
  if(!Number.isInteger(ticks)){const n=Math.round(ticks*2),g=n%3===0?3:1;return (n/g===1?'':String(n/g))+'/'+(6/g)}   /* v0.67 16분(1.5틱) = /2, 점8분(4.5틱) = 3/2 */
  return ticks+'/3';
}
function toAbc(solo,tempo,transpose,octShift,perLine){
  transpose=transpose||0;octShift=octShift||0;const PL=perLine>0?perLine:4;   /* v0.59 줄당 마디 수(좁은 화면은 2) */
  const rows=[];
  for(let b=0;b<solo.bars.length;b+=PL){
    const chunk=solo.bars.slice(b,b+PL).map(bar=>{
      const split=bar.notes.some(n=>n.ci!==undefined);   /* v0.29 연습 악보: 코드 기호를 그 코드가 시작하는 음 위에 */
      let s=split?'':' ';
      const cst=chordBeats(bar.chords.length,solo.bpb||4).map(x=>x*6);let cDone=0;   /* v0.38 코드 기호를 그 코드가 시작하는 자리의 음 위에 */
      let tripPos=0,cc=0;
      const exact={},letter={};   /* 마디 안 임시표 지속(ABC·기보 공통 규칙) */
      bar.notes.forEach((n,k)=>{
        if(n.ci!==undefined)cc=n.ci;
        const ch=split?bar.chords[cc]:chordAtBeat(bar.chords,n.t/6,solo.bpb||4);
        const scale=CHORD_TYPES[ch.type].scale;
        if(n.t%6===0&&k>0&&(!n.trip||tripPos%3===0))s+=' ';   /* v0.66 셋잇단 앞뒤에서도 박마다 기둥(빔)을 끊는다 — 예전엔 셋잇단이 낀 마디가 네 박 통째로 한 빔에 묶여 읽기 어려웠다 */
        if(split&&n.ci!==undefined)s+='"'+chordSymbol(ch.root+transpose,ch.type)+'"';
        /* v0.59 둘째 코드부터는 그 자리 이후에 시작하는 음 위에 — 앞 음이 길게 걸쳐 있으면 위아래로 겹쳐 쌓이던 문제 */
        if(!split)while(cDone<cst.length&&(cDone===0?cst[0]<n.t+n.d:cst[cDone]<=n.t)){const c2=bar.chords[cDone];s+='"'+chordSymbol(c2.root+transpose,c2.type)+'"';cDone++}
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
      if(!split)while(cDone<cst.length){const c2=bar.chords[cDone];s+=' "'+chordSymbol(c2.root+transpose,c2.type)+'"y';cDone++}   /* 마디 끝까지 이어지는 음 — 빈칸(y) 위에 */
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
