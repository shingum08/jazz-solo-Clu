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
  climb:{p:{3:0.6,4:0.85,5:0.95},first:0.5,last:1.1,minTop:77,minRise:9,hold:[12,18,24],asc:[4,5,6],desc:[4,5,6,7],tries:16},   /* v0.66.6 고음 끌기: 코러스마다 확률(단계별) · 첫/마지막 코러스 배수 · 고음 하한(F5) · 최소 상승 폭 · 끄는 길이(틱) · 오르는/내리는 8분 수 */
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
  while(beat<totalBeats-1){
    const dHere=densityAt(beat),grow=PHRASE_FLOW.lenLo+(PHRASE_FLOW.lenHi-PHRASE_FLOW.lenLo)*Math.max(0,Math.min(1,(dHere-0.55)/0.65));   /* v0.64 촘촘한 곳일수록 긴 문장 */
    let L=Math.round(sampleQuart(rng,phLenQ.map(x=>x*lenScale*(diff===1?1:grow)),diff===1?3:3,Math.min(capBeats,diff===1?7:capBeats)));
    if(diff===1){beat=Math.ceil(beat/2)*2;}
    let end=beat+L; /* 마지막 음이 시작되는 박(포함) */
    /* 형식 경계(8마디·블루스 4마디)에 가까우면 그 직전에 종지하도록 맞춘다 */
    const secBeats=P*BPB;
    const nextB=Math.ceil((beat+1)/secBeats)*secBeats;
    if(nextB<totalBeats&&end>=nextB-3&&end<=nextB+3&&!(diff>=2&&dHere>=0.95&&rng()<PHRASE_FLOW.crossP)){end=nextB-2+(rng()<0.4?1:0);if(end-beat<2)end=beat+2}   /* v0.64 촘촘한 곳은 섹션 경계를 넘어 이어 가기도 */
    end=Math.min(end,beat+capAt(beat)-1,totalBeats-1);
    if(end<=beat)break;
    phrases.push({s:beat,e:end});
    let g=sampleQuart(rng,gapQ,diff===1?2:1,6);
    if(inst==='wind')g=Math.max(g,1.2);
    const slow=feel==='ballad'||feel==='bossa'||feel==='latin';
    g=Math.min(g,slow?BPB-1:BPB+1);   /* 프레이즈 사이 쉼 — 느린 계열(발라드·보사·라틴)은 더 촘촘히 */
    {const r=rng(),sparse=densityAt(end)<0.8,dense=densityAt(end)>=0.95;if(!sparse&&r<(dense?PHRASE_FLOW.denseGapP:REST_MIX.gapShortP))g=Math.min(g,1.4);else if(r<1-REST_MIX.longGapP*(sparse?2:1))g=Math.min(g,REST_MIX.gapMax)}   /* v0.60 짧은 숨(1박)을 자주, 긴 쉼은 가끔만 · v0.63 첫 코러스 앞부분(성긴 곳)은 숨을 넉넉히 */
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
        for(const n of CL.desc)for(const hl of CL.hold)for(const k of CL.asc){
          const H=Eend-(3*n+6)-hl,W0=H-3*k;
          if(H<0||H%6||!(H%TPB===0||(BPB===4&&H%TPB===12)))continue;   /* 끄는 음은 마디 첫 박 또는 셋째 박 */
          if(W0<notes[0].t)continue;
          const win=events.filter(e=>e.t+e.d>W0&&e.t<Eend);
          if(win.some(e=>e.ph!==ph||(e.midi!==null&&!free(e))))continue;
          const st=win.find(e=>e.t<W0);if(st&&(W0-st.t<3||(W0-st.t)%3))continue;
          cands.push({ph,Eend,H,W0,hl,n,k,nxt,w:0.5+Eend/TOT+(hl>=18?0.3:0)});
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
        const asc=[top];
        for(let j=c.k-1;j>=0;j--){const t=c.W0+3*j,sg=segOf(t),hi=asc[0],opt=[];
          for(let m=hi-2;m>=Math.max(LO,hi-MAXLEAP);m--){if(tone(sg,m)<1.5)continue;const iv=hi-m;opt.push({m,w:iv>=3&&iv<=5?3:1})}
          if(!opt.length)return null;let r=rng()*opt.reduce((a,o)=>a+o.w,0),pk=opt[0];for(const o of opt){r-=o.w;if(r<=0){pk=o;break}}asc.unshift(pk.m)}
        asc.pop();   /* 마지막은 끄는 음(top) */
        if(top-asc[0]<CL.minRise)return null;
        if(pv!==null&&Math.abs(asc[0]-pv)>MAXLEAP)return null;
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
        P.asc.forEach((m,j)=>nw.push({t:c.W0+3*j,d:3,midi:m,ph:c.ph,climb:true}));
        nw.push({t:c.H,d:c.hl,midi:P.top,ph:c.ph,climb:true});
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
  return Number.isInteger(v)?String(v):ticks+'/3';
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

/* Weimar Jazz Database v2.1 (Jazzomat Research Project, HfM Weimar · ODbL 1.0) 에서 추출한 통계 요약.
   원 전사 음표열은 포함하지 않으며, 연주자 그룹별 확률 분포와 다수 연주자 공통 4~5음 셀(4명 이상 공통)만 담는다. */
const STYLE_DATA={"profiles":{"all":{"rhy":{"1":{"R":[0.526,0.0,0.07,0.118,0.248,0.0,0.018,0.02],"H":[0.321,0.241,0.114,0.126,0.115,0.056,0.013,0.013],"Q":[0.191,0.098,0.299,0.247,0.098,0.034,0.018,0.016],"E":[0.028,0.099,0.155,0.478,0.035,0.137,0.041,0.028],"Ur":[0.022,0.127,0.138,0.317,0.064,0.231,0.058,0.042],"Uh":[0.019,0.142,0.167,0.293,0.042,0.257,0.038,0.041],"T":[0.025,0.077,0.138,0.378,0.029,0.144,0.149,0.058],"Tr":[0.009,0.098,0.119,0.34,0.033,0.24,0.08,0.082]},"2":{"R":[0.576,0.0,0.039,0.126,0.212,0.0,0.023,0.024],"H":[0.231,0.262,0.092,0.13,0.093,0.158,0.014,0.02],"Q":[0.169,0.146,0.176,0.223,0.106,0.14,0.022,0.019],"E":[0.037,0.095,0.094,0.518,0.035,0.147,0.045,0.029],"Ur":[0.019,0.103,0.096,0.363,0.061,0.232,0.071,0.054],"Uh":[0.029,0.135,0.11,0.305,0.039,0.296,0.041,0.045],"T":[0.017,0.065,0.117,0.371,0.028,0.153,0.182,0.067],"Tr":[0.011,0.064,0.081,0.37,0.033,0.242,0.11,0.089]},"3":{"R":[0.527,0.0,0.077,0.18,0.177,0.0,0.018,0.02],"H":[0.277,0.247,0.147,0.146,0.086,0.067,0.011,0.018],"Q":[0.136,0.12,0.294,0.282,0.079,0.052,0.021,0.015],"E":[0.021,0.089,0.122,0.528,0.034,0.135,0.043,0.027],"Ur":[0.017,0.146,0.134,0.303,0.052,0.239,0.057,0.052],"Uh":[0.019,0.137,0.141,0.323,0.041,0.258,0.04,0.043],"T":[0.017,0.081,0.11,0.368,0.04,0.167,0.168,0.05],"Tr":[0.014,0.09,0.109,0.371,0.028,0.225,0.087,0.076]},"4":{"R":[0.649,0.0,0.032,0.093,0.193,0.0,0.017,0.016],"H":[0.297,0.243,0.085,0.121,0.1,0.121,0.008,0.024],"Q":[0.172,0.132,0.201,0.256,0.08,0.121,0.021,0.019],"E":[0.034,0.081,0.101,0.527,0.036,0.143,0.045,0.033],"Ur":[0.017,0.083,0.094,0.362,0.065,0.257,0.069,0.054],"Uh":[0.035,0.102,0.113,0.327,0.042,0.294,0.04,0.047],"T":[0.013,0.072,0.088,0.405,0.035,0.163,0.171,0.053],"Tr":[0.011,0.069,0.091,0.34,0.032,0.274,0.093,0.088]}},"pc":{"maj":{"on":[0.156,0.022,0.117,0.046,0.153,0.058,0.034,0.172,0.022,0.094,0.03,0.097],"off":[0.139,0.028,0.119,0.045,0.134,0.066,0.044,0.158,0.035,0.095,0.033,0.103]},"min":{"on":[0.141,0.038,0.094,0.15,0.029,0.112,0.039,0.147,0.041,0.075,0.087,0.046],"off":[0.124,0.04,0.103,0.134,0.039,0.117,0.042,0.141,0.046,0.07,0.093,0.05]},"dom":{"on":[0.149,0.044,0.098,0.051,0.112,0.076,0.041,0.133,0.044,0.1,0.114,0.037],"off":[0.132,0.051,0.104,0.052,0.094,0.088,0.049,0.128,0.051,0.097,0.105,0.049]},"domalt":{"on":[0.135,0.077,0.046,0.08,0.112,0.072,0.046,0.122,0.091,0.042,0.135,0.041],"off":[0.13,0.087,0.057,0.075,0.085,0.09,0.051,0.122,0.09,0.042,0.12,0.05]},"hdim":{"on":[0.118,0.084,0.032,0.135,0.049,0.124,0.123,0.035,0.079,0.062,0.115,0.044],"off":[0.102,0.088,0.045,0.147,0.04,0.137,0.105,0.039,0.081,0.057,0.115,0.043]},"dim":{"on":[0.078,0.068,0.057,0.107,0.08,0.033,0.123,0.055,0.103,0.119,0.046,0.13],"off":[0.099,0.064,0.075,0.088,0.069,0.047,0.129,0.07,0.085,0.127,0.056,0.092]}},"iv":[0.0013,0.0006,0.0016,0.0039,0.004,0.0087,0.0071,0.0307,0.0525,0.0901,0.1535,0.1453,0.043,0.1379,0.132,0.0851,0.0404,0.0304,0.0073,0.0111,0.0048,0.004,0.0022,0.0012,0.0014],"stats":{"ctOn":0.588,"chrom":0.215,"eighth":0.735,"trip":0.098,"phraseMed":14,"phLen":[4.2,7.1,13.1],"gap":[1.2,2.0,3.1]},"label":"균형 · WJD 전체","swingOff":0,"n":158660,"solos":347},"parker":{"rhy":{"1":{"R":[0.54,0.0,0.051,0.081,0.28,0.0,0.015,0.033],"H":[0.496,0.209,0.04,0.079,0.139,0.022,0.003,0.012],"Q":[0.151,0.128,0.183,0.345,0.131,0.029,0.029,0.005],"E":[0.019,0.093,0.124,0.503,0.035,0.145,0.044,0.036],"Ur":[0.006,0.069,0.146,0.457,0.023,0.174,0.066,0.059],"Uh":[0.024,0.083,0.149,0.365,0.031,0.245,0.043,0.062],"T":[0.038,0.016,0.122,0.496,0.039,0.077,0.163,0.048],"Tr":[0.027,0.084,0.165,0.406,0.012,0.173,0.107,0.026]},"2":{"R":[0.552,0.0,0.018,0.09,0.264,0.0,0.033,0.043],"H":[0.291,0.18,0.041,0.181,0.127,0.12,0.03,0.029],"Q":[0.162,0.172,0.102,0.28,0.133,0.056,0.016,0.08],"E":[0.034,0.111,0.073,0.49,0.05,0.168,0.045,0.029],"Ur":[0.003,0.049,0.079,0.445,0.028,0.23,0.098,0.068],"Uh":[0.021,0.103,0.142,0.34,0.027,0.24,0.067,0.06],"T":[0.021,0.094,0.147,0.381,0.046,0.149,0.148,0.015],"Tr":[0.001,0.112,0.061,0.399,0.009,0.142,0.172,0.105]},"3":{"R":[0.555,0.0,0.039,0.174,0.214,0.0,0.007,0.011],"H":[0.366,0.242,0.074,0.089,0.09,0.065,0.004,0.069],"Q":[0.117,0.18,0.153,0.298,0.133,0.089,0.009,0.02],"E":[0.016,0.097,0.115,0.545,0.033,0.123,0.049,0.021],"Ur":[0.005,0.068,0.132,0.417,0.035,0.185,0.095,0.063],"Uh":[0.013,0.125,0.133,0.348,0.029,0.252,0.068,0.033],"T":[0.002,0.052,0.171,0.397,0.072,0.132,0.148,0.027],"Tr":[0.02,0.018,0.1,0.409,0.007,0.144,0.242,0.059]},"4":{"R":[0.651,0.0,0.013,0.077,0.228,0.0,0.004,0.027],"H":[0.384,0.2,0.043,0.096,0.136,0.115,0.012,0.014],"Q":[0.158,0.214,0.118,0.211,0.064,0.165,0.02,0.051],"E":[0.017,0.111,0.072,0.527,0.035,0.16,0.043,0.034],"Ur":[0.002,0.022,0.072,0.361,0.034,0.256,0.142,0.109],"Uh":[0.018,0.078,0.092,0.417,0.025,0.283,0.057,0.031],"T":[0.002,0.041,0.063,0.469,0.039,0.121,0.224,0.041],"Tr":[0.002,0.023,0.08,0.498,0.004,0.178,0.153,0.062]}},"pc":{"maj":{"on":[0.151,0.015,0.103,0.027,0.176,0.064,0.021,0.192,0.019,0.092,0.027,0.112],"off":[0.146,0.027,0.13,0.04,0.118,0.078,0.033,0.16,0.03,0.086,0.031,0.122]},"min":{"on":[0.15,0.026,0.122,0.15,0.019,0.125,0.034,0.121,0.042,0.066,0.102,0.043],"off":[0.14,0.031,0.108,0.154,0.037,0.107,0.038,0.142,0.04,0.056,0.095,0.052]},"dom":{"on":[0.153,0.048,0.103,0.037,0.13,0.077,0.028,0.162,0.035,0.089,0.112,0.027],"off":[0.12,0.048,0.108,0.046,0.101,0.098,0.038,0.141,0.045,0.097,0.109,0.046]},"domalt":{"on":[0.106,0.087,0.052,0.073,0.132,0.053,0.046,0.129,0.096,0.042,0.171,0.013],"off":[0.12,0.108,0.045,0.051,0.079,0.1,0.036,0.164,0.082,0.034,0.128,0.054]},"hdim":{"on":[0.098,0.053,0.037,0.184,0.061,0.114,0.116,0.015,0.063,0.095,0.128,0.034],"off":[0.132,0.068,0.041,0.159,0.038,0.154,0.113,0.028,0.072,0.044,0.108,0.044]},"dim":{"on":[0.076,0.034,0.127,0.176,0.027,0.009,0.148,0.103,0.08,0.102,0.022,0.096],"off":[0.161,0.03,0.076,0.049,0.067,0.067,0.096,0.041,0.118,0.116,0.042,0.138]}},"iv":[0.0009,0.0001,0.0019,0.0052,0.003,0.0066,0.0057,0.0281,0.0462,0.0895,0.1651,0.1721,0.0326,0.1394,0.1168,0.0924,0.0356,0.022,0.0057,0.0123,0.0079,0.0051,0.0026,0.002,0.0011],"stats":{"ctOn":0.675,"chrom":0.173,"eighth":0.763,"trip":0.139,"phraseMed":16,"phLen":[3.5,6.4,9.2],"gap":[1.0,1.6,2.6]},"label":"Charlie Parker 계열","swingOff":0.012,"n":5188,"solos":15},"cbrown":{"rhy":{"1":{"R":[0.522,0.0,0.037,0.088,0.312,0.0,0.016,0.025],"H":[0.384,0.178,0.069,0.154,0.128,0.065,0.005,0.018],"Q":[0.162,0.128,0.245,0.282,0.149,0.018,0.008,0.008],"E":[0.022,0.06,0.152,0.494,0.042,0.149,0.057,0.023],"Ur":[0.008,0.068,0.196,0.397,0.044,0.192,0.055,0.041],"Uh":[0.008,0.073,0.118,0.275,0.044,0.383,0.036,0.063],"T":[0.036,0.166,0.2,0.233,0.041,0.212,0.084,0.029],"Tr":[0.005,0.059,0.116,0.302,0.022,0.259,0.055,0.183]},"2":{"R":[0.544,0.0,0.016,0.143,0.268,0.0,0.02,0.011],"H":[0.376,0.221,0.042,0.093,0.081,0.154,0.008,0.025],"Q":[0.167,0.081,0.167,0.275,0.092,0.163,0.037,0.017],"E":[0.031,0.089,0.065,0.536,0.033,0.16,0.059,0.026],"Ur":[0.006,0.066,0.094,0.361,0.06,0.288,0.086,0.04],"Uh":[0.044,0.148,0.103,0.292,0.042,0.288,0.034,0.048],"T":[0.006,0.04,0.134,0.469,0.037,0.19,0.078,0.046],"Tr":[0.003,0.053,0.032,0.396,0.017,0.365,0.07,0.064]},"3":{"R":[0.512,0.0,0.048,0.161,0.215,0.0,0.016,0.049],"H":[0.382,0.159,0.165,0.121,0.102,0.056,0.006,0.009],"Q":[0.152,0.105,0.245,0.278,0.091,0.04,0.068,0.021],"E":[0.022,0.051,0.116,0.561,0.038,0.142,0.04,0.03],"Ur":[0.004,0.11,0.109,0.385,0.046,0.263,0.02,0.063],"Uh":[0.013,0.091,0.153,0.276,0.031,0.336,0.041,0.06],"T":[0.004,0.051,0.068,0.409,0.097,0.249,0.066,0.057],"Tr":[0.006,0.031,0.083,0.401,0.047,0.309,0.029,0.095]},"4":{"R":[0.657,0.0,0.04,0.081,0.205,0.0,0.009,0.009],"H":[0.291,0.229,0.077,0.128,0.081,0.12,0.066,0.009],"Q":[0.204,0.153,0.222,0.254,0.034,0.088,0.038,0.008],"E":[0.036,0.08,0.068,0.603,0.03,0.11,0.045,0.027],"Ur":[0.022,0.08,0.06,0.406,0.045,0.301,0.038,0.047],"Uh":[0.042,0.076,0.112,0.315,0.036,0.327,0.035,0.059],"T":[0.006,0.041,0.035,0.493,0.017,0.103,0.125,0.179],"Tr":[0.005,0.054,0.062,0.382,0.04,0.387,0.025,0.046]}},"pc":{"maj":{"on":[0.147,0.022,0.141,0.028,0.188,0.052,0.029,0.178,0.014,0.082,0.023,0.096],"off":[0.144,0.024,0.135,0.045,0.12,0.083,0.038,0.162,0.026,0.088,0.022,0.112]},"min":{"on":[0.171,0.043,0.112,0.152,0.022,0.088,0.038,0.156,0.036,0.067,0.061,0.055],"off":[0.14,0.043,0.132,0.136,0.034,0.105,0.041,0.142,0.034,0.06,0.075,0.058]},"dom":{"on":[0.178,0.05,0.093,0.042,0.12,0.059,0.035,0.128,0.037,0.096,0.132,0.03],"off":[0.129,0.053,0.114,0.041,0.101,0.083,0.054,0.13,0.046,0.089,0.114,0.045]},"domalt":{"on":[0.106,0.118,0.026,0.073,0.126,0.068,0.078,0.135,0.083,0.023,0.138,0.026],"off":[0.139,0.08,0.069,0.051,0.102,0.097,0.035,0.165,0.076,0.039,0.103,0.044]},"hdim":{"on":[0.144,0.113,0.049,0.088,0.053,0.086,0.113,0.081,0.017,0.104,0.069,0.084],"off":[0.138,0.071,0.068,0.13,0.027,0.149,0.097,0.051,0.032,0.078,0.116,0.042]},"dim":{"on":[0.185,0.127,0.032,0.043,0.031,0.013,0.122,0.028,0.135,0.133,0.034,0.119],"off":[0.042,0.132,0.03,0.187,0.038,0.025,0.051,0.124,0.03,0.181,0.074,0.085]}},"iv":[0.0018,0.0007,0.0013,0.0037,0.0033,0.0064,0.0061,0.0284,0.0446,0.0898,0.1675,0.1462,0.039,0.1593,0.1452,0.0785,0.0313,0.0233,0.0063,0.0083,0.0033,0.0021,0.002,0.001,0.0006],"stats":{"ctOn":0.604,"chrom":0.2,"eighth":0.788,"trip":0.094,"phraseMed":14,"phLen":[4.1,7.3,13.0],"gap":[1.1,2.2,3.3]},"label":"Clifford Brown 계열","swingOff":-0.007,"n":3803,"solos":8},"rollins":{"rhy":{"1":{"R":[0.544,0.0,0.037,0.118,0.271,0.0,0.008,0.021],"H":[0.335,0.206,0.092,0.192,0.11,0.045,0.015,0.004],"Q":[0.24,0.083,0.325,0.179,0.111,0.048,0.007,0.007],"E":[0.039,0.071,0.142,0.526,0.023,0.147,0.027,0.025],"Ur":[0.007,0.115,0.132,0.269,0.058,0.312,0.035,0.071],"Uh":[0.041,0.079,0.141,0.254,0.04,0.369,0.027,0.05],"T":[0.07,0.034,0.187,0.266,0.014,0.197,0.145,0.087],"Tr":[0.004,0.029,0.169,0.339,0.058,0.185,0.101,0.114]},"2":{"R":[0.612,0.0,0.02,0.102,0.239,0.0,0.011,0.015],"H":[0.309,0.284,0.039,0.148,0.063,0.122,0.025,0.009],"Q":[0.222,0.082,0.276,0.209,0.061,0.093,0.04,0.018],"E":[0.042,0.118,0.087,0.518,0.043,0.135,0.025,0.031],"Ur":[0.018,0.141,0.081,0.365,0.066,0.221,0.065,0.044],"Uh":[0.057,0.144,0.168,0.252,0.061,0.241,0.042,0.035],"T":[0.005,0.018,0.102,0.46,0.014,0.248,0.13,0.023],"Tr":[0.041,0.025,0.221,0.281,0.015,0.266,0.079,0.072]},"3":{"R":[0.564,0.0,0.034,0.126,0.237,0.0,0.018,0.021],"H":[0.303,0.287,0.11,0.149,0.085,0.042,0.005,0.02],"Q":[0.239,0.156,0.212,0.211,0.101,0.063,0.011,0.007],"E":[0.025,0.089,0.102,0.545,0.035,0.141,0.031,0.032],"Ur":[0.004,0.07,0.18,0.301,0.033,0.344,0.032,0.036],"Uh":[0.04,0.117,0.161,0.266,0.037,0.291,0.036,0.052],"T":[0.004,0.073,0.09,0.385,0.018,0.263,0.15,0.017],"Tr":[0.005,0.03,0.093,0.66,0.012,0.099,0.075,0.026]},"4":{"R":[0.679,0.0,0.03,0.087,0.176,0.0,0.014,0.014],"H":[0.335,0.319,0.046,0.114,0.073,0.09,0.005,0.019],"Q":[0.171,0.166,0.252,0.238,0.036,0.106,0.012,0.019],"E":[0.048,0.087,0.111,0.519,0.034,0.115,0.056,0.029],"Ur":[0.021,0.087,0.15,0.354,0.055,0.24,0.06,0.033],"Uh":[0.041,0.145,0.122,0.247,0.046,0.298,0.054,0.047],"T":[0.006,0.038,0.085,0.491,0.068,0.068,0.113,0.131],"Tr":[0.005,0.032,0.04,0.426,0.019,0.269,0.072,0.138]}},"pc":{"maj":{"on":[0.158,0.008,0.113,0.043,0.167,0.052,0.029,0.188,0.013,0.08,0.024,0.127],"off":[0.167,0.021,0.104,0.025,0.14,0.065,0.049,0.181,0.034,0.076,0.022,0.115]},"min":{"on":[0.135,0.033,0.087,0.201,0.017,0.112,0.021,0.156,0.017,0.075,0.067,0.079],"off":[0.126,0.032,0.135,0.144,0.035,0.098,0.037,0.141,0.037,0.053,0.086,0.075]},"dom":{"on":[0.145,0.035,0.115,0.04,0.118,0.07,0.036,0.142,0.034,0.099,0.138,0.029],"off":[0.121,0.043,0.116,0.044,0.096,0.078,0.055,0.144,0.038,0.104,0.115,0.046]},"domalt":{"on":[0.18,0.069,0.028,0.043,0.113,0.089,0.018,0.166,0.092,0.043,0.119,0.04],"off":[0.135,0.091,0.045,0.101,0.093,0.095,0.043,0.122,0.079,0.032,0.125,0.04]},"hdim":{"on":[0.091,0.085,0.022,0.197,0.065,0.085,0.137,0.057,0.017,0.105,0.101,0.039],"off":[0.128,0.09,0.038,0.092,0.032,0.166,0.094,0.072,0.059,0.042,0.062,0.124]},"dim":{"on":[0.029,0.045,0.601,0.04,0.029,0.012,0.042,0.025,0.053,0.052,0.031,0.04],"off":[0.135,0.038,0.219,0.048,0.13,0.118,0.048,0.032,0.029,0.043,0.122,0.037]}},"iv":[0.0012,0.0005,0.0005,0.0024,0.0042,0.0087,0.0089,0.0317,0.0654,0.0953,0.1478,0.143,0.0352,0.1418,0.1168,0.0932,0.0437,0.0244,0.0082,0.0122,0.0046,0.0034,0.0019,0.0038,0.0014],"stats":{"ctOn":0.64,"chrom":0.193,"eighth":0.751,"trip":0.08,"phraseMed":10,"phLen":[3.4,5.4,9.6],"gap":[2.0,2.9,3.9]},"label":"Sonny Rollins 계열","swingOff":0.014,"n":2618,"solos":7},"dgordon":{"rhy":{"1":{"R":[0.333,0.0,0.039,0.193,0.387,0.0,0.026,0.022],"H":[0.347,0.157,0.088,0.11,0.22,0.046,0.005,0.026],"Q":[0.27,0.116,0.202,0.183,0.124,0.041,0.02,0.045],"E":[0.051,0.111,0.2,0.387,0.035,0.139,0.042,0.036],"Ur":[0.007,0.137,0.154,0.325,0.091,0.2,0.029,0.055],"Uh":[0.017,0.103,0.189,0.276,0.04,0.312,0.025,0.039],"T":[0.01,0.122,0.176,0.366,0.014,0.143,0.12,0.049],"Tr":[0.004,0.059,0.175,0.329,0.14,0.169,0.085,0.038]},"2":{"R":[0.397,0.0,0.022,0.2,0.299,0.0,0.05,0.033],"H":[0.249,0.207,0.039,0.172,0.107,0.192,0.025,0.009],"Q":[0.133,0.14,0.184,0.176,0.099,0.213,0.041,0.014],"E":[0.04,0.106,0.091,0.484,0.033,0.169,0.049,0.029],"Ur":[0.006,0.117,0.074,0.292,0.06,0.324,0.071,0.056],"Uh":[0.014,0.154,0.11,0.213,0.059,0.389,0.023,0.039],"T":[0.005,0.048,0.075,0.566,0.014,0.076,0.133,0.083],"Tr":[0.003,0.048,0.078,0.453,0.015,0.209,0.112,0.082]},"3":{"R":[0.54,0.0,0.024,0.184,0.158,0.0,0.051,0.043],"H":[0.397,0.218,0.096,0.151,0.047,0.061,0.021,0.008],"Q":[0.161,0.21,0.233,0.267,0.076,0.035,0.011,0.007],"E":[0.022,0.089,0.134,0.471,0.043,0.151,0.059,0.03],"Ur":[0.014,0.103,0.173,0.31,0.049,0.28,0.029,0.043],"Uh":[0.007,0.103,0.149,0.265,0.035,0.371,0.027,0.043],"T":[0.004,0.064,0.132,0.46,0.035,0.174,0.079,0.052],"Tr":[0.005,0.03,0.098,0.443,0.09,0.151,0.079,0.104]},"4":{"R":[0.652,0.0,0.014,0.097,0.182,0.0,0.024,0.031],"H":[0.356,0.209,0.043,0.095,0.138,0.13,0.013,0.016],"Q":[0.16,0.115,0.142,0.29,0.074,0.185,0.019,0.014],"E":[0.041,0.12,0.089,0.442,0.047,0.179,0.045,0.038],"Ur":[0.009,0.127,0.062,0.335,0.038,0.297,0.094,0.038],"Uh":[0.023,0.124,0.115,0.292,0.046,0.33,0.036,0.034],"T":[0.006,0.126,0.077,0.377,0.016,0.178,0.171,0.049],"Tr":[0.031,0.11,0.118,0.322,0.019,0.282,0.05,0.069]}},"pc":{"maj":{"on":[0.152,0.008,0.167,0.044,0.123,0.02,0.011,0.221,0.008,0.091,0.024,0.13],"off":[0.195,0.011,0.121,0.032,0.118,0.072,0.033,0.205,0.014,0.066,0.039,0.092]},"min":{"on":[0.143,0.024,0.11,0.157,0.017,0.11,0.038,0.155,0.039,0.077,0.089,0.04],"off":[0.137,0.046,0.119,0.129,0.035,0.11,0.038,0.134,0.042,0.06,0.102,0.047]},"dom":{"on":[0.171,0.037,0.109,0.042,0.103,0.076,0.038,0.149,0.033,0.108,0.096,0.037],"off":[0.133,0.04,0.106,0.043,0.098,0.093,0.042,0.16,0.038,0.1,0.103,0.044]},"domalt":{"on":[0.126,0.071,0.052,0.058,0.126,0.092,0.022,0.163,0.109,0.04,0.108,0.033],"off":[0.131,0.067,0.067,0.058,0.087,0.105,0.046,0.134,0.094,0.045,0.126,0.04]},"hdim":{"on":[0.16,0.077,0.068,0.151,0.072,0.107,0.135,0.033,0.032,0.057,0.072,0.035],"off":[0.113,0.083,0.039,0.152,0.041,0.168,0.103,0.064,0.051,0.042,0.114,0.032]},"dim":{"on":[0.029,0.045,0.029,0.611,0.029,0.012,0.042,0.025,0.053,0.052,0.031,0.04],"off":[0.04,0.038,0.029,0.62,0.035,0.023,0.048,0.032,0.029,0.043,0.027,0.037]}},"iv":[0.0011,0.0002,0.0008,0.0033,0.0061,0.0084,0.0053,0.0314,0.0522,0.0919,0.1611,0.1356,0.0515,0.1357,0.1223,0.0898,0.0389,0.0322,0.0068,0.0129,0.0043,0.0041,0.0019,0.0012,0.0012],"stats":{"ctOn":0.606,"chrom":0.185,"eighth":0.754,"trip":0.1,"phraseMed":12,"phLen":[3.3,6.1,9.8],"gap":[1.1,1.7,2.5]},"label":"Dexter Gordon 계열","swingOff":0.025,"n":4149,"solos":6},"baker":{"rhy":{"1":{"R":[0.526,0.0,0.091,0.116,0.247,0.0,0.005,0.016],"H":[0.348,0.222,0.165,0.102,0.093,0.044,0.024,0.002],"Q":[0.08,0.076,0.468,0.253,0.07,0.043,0.006,0.003],"E":[0.018,0.172,0.15,0.488,0.034,0.106,0.013,0.019],"Ur":[0.004,0.181,0.179,0.33,0.071,0.182,0.041,0.012],"Uh":[0.006,0.309,0.159,0.216,0.018,0.253,0.03,0.009],"T":[0.007,0.03,0.36,0.456,0.008,0.059,0.068,0.012],"Tr":[0.001,0.207,0.117,0.487,0.022,0.12,0.028,0.017]},"2":{"R":[0.646,0.0,0.009,0.101,0.182,0.0,0.037,0.025],"H":[0.19,0.279,0.102,0.211,0.044,0.154,0.014,0.005],"Q":[0.131,0.177,0.19,0.214,0.093,0.184,0.007,0.003],"E":[0.024,0.097,0.112,0.592,0.03,0.098,0.026,0.022],"Ur":[0.054,0.13,0.096,0.379,0.065,0.218,0.034,0.025],"Uh":[0.032,0.171,0.069,0.326,0.061,0.316,0.01,0.014],"T":[0.007,0.198,0.405,0.21,0.013,0.068,0.086,0.013],"Tr":[0.012,0.039,0.263,0.523,0.015,0.082,0.035,0.032]},"3":{"R":[0.56,0.0,0.101,0.123,0.205,0.0,0.005,0.006],"H":[0.279,0.227,0.184,0.182,0.064,0.057,0.005,0.002],"Q":[0.112,0.136,0.308,0.317,0.075,0.022,0.025,0.005],"E":[0.026,0.17,0.099,0.52,0.015,0.139,0.024,0.007],"Ur":[0.007,0.283,0.083,0.288,0.039,0.225,0.032,0.044],"Uh":[0.036,0.223,0.2,0.286,0.039,0.191,0.014,0.011],"T":[0.011,0.037,0.17,0.613,0.014,0.066,0.079,0.011],"Tr":[0.002,0.036,0.064,0.33,0.016,0.488,0.042,0.022]},"4":{"R":[0.686,0.0,0.044,0.052,0.205,0.0,0.01,0.003],"H":[0.231,0.216,0.095,0.202,0.084,0.154,0.011,0.006],"Q":[0.118,0.13,0.222,0.292,0.103,0.121,0.007,0.007],"E":[0.038,0.076,0.099,0.616,0.036,0.097,0.027,0.011],"Ur":[0.006,0.13,0.172,0.395,0.024,0.219,0.034,0.021],"Uh":[0.049,0.068,0.125,0.346,0.069,0.262,0.029,0.052],"T":[0.006,0.03,0.065,0.726,0.017,0.07,0.067,0.019],"Tr":[0.001,0.067,0.031,0.15,0.024,0.132,0.041,0.553]}},"pc":{"maj":{"on":[0.17,0.015,0.118,0.023,0.128,0.051,0.02,0.176,0.021,0.132,0.03,0.116],"off":[0.138,0.016,0.126,0.031,0.108,0.071,0.026,0.166,0.019,0.141,0.029,0.128]},"min":{"on":[0.15,0.031,0.104,0.169,0.025,0.136,0.034,0.143,0.037,0.044,0.102,0.026],"off":[0.131,0.032,0.118,0.158,0.023,0.143,0.034,0.141,0.039,0.044,0.102,0.033]},"dom":{"on":[0.139,0.036,0.104,0.035,0.102,0.099,0.033,0.16,0.043,0.132,0.098,0.02],"off":[0.147,0.06,0.099,0.045,0.084,0.123,0.053,0.123,0.06,0.092,0.085,0.029]},"domalt":{"on":[0.172,0.071,0.039,0.035,0.104,0.086,0.011,0.104,0.103,0.043,0.205,0.025],"off":[0.135,0.06,0.055,0.085,0.082,0.103,0.026,0.153,0.118,0.025,0.124,0.033]},"hdim":{"on":[0.153,0.12,0.025,0.172,0.054,0.131,0.057,0.017,0.037,0.044,0.158,0.03],"off":[0.132,0.169,0.026,0.197,0.018,0.098,0.096,0.029,0.052,0.048,0.115,0.02]},"dim":{"on":[0.122,0.164,0.035,0.102,0.091,0.015,0.111,0.095,0.105,0.063,0.02,0.078],"off":[0.044,0.022,0.093,0.097,0.101,0.016,0.25,0.044,0.106,0.136,0.027,0.063]}},"iv":[0.0006,0.0002,0.0008,0.0033,0.0035,0.0073,0.0056,0.0246,0.0453,0.092,0.1694,0.1274,0.0506,0.1392,0.1559,0.0954,0.0411,0.0197,0.0034,0.0074,0.0021,0.0021,0.001,0.0009,0.0011],"stats":{"ctOn":0.597,"chrom":0.142,"eighth":0.748,"trip":0.03,"phraseMed":15,"phLen":[4.9,11.3,17.8],"gap":[1.6,2.3,3.7]},"label":"Chet Baker 계열","swingOff":-0.017,"n":1428,"solos":8},"getz":{"rhy":{"1":{"R":[0.483,0.0,0.1,0.114,0.288,0.0,0.005,0.01],"H":[0.37,0.232,0.112,0.089,0.121,0.039,0.033,0.002],"Q":[0.137,0.1,0.391,0.219,0.094,0.05,0.006,0.003],"E":[0.018,0.095,0.146,0.572,0.02,0.108,0.025,0.016],"Ur":[0.004,0.232,0.103,0.285,0.107,0.21,0.038,0.02],"Uh":[0.006,0.209,0.167,0.37,0.04,0.153,0.046,0.009],"T":[0.007,0.112,0.179,0.354,0.028,0.098,0.21,0.012],"Tr":[0.001,0.035,0.288,0.318,0.021,0.249,0.072,0.017]},"2":{"R":[0.712,0.0,0.016,0.09,0.135,0.0,0.029,0.018],"H":[0.235,0.273,0.104,0.166,0.085,0.105,0.012,0.02],"Q":[0.135,0.17,0.2,0.231,0.064,0.179,0.013,0.009],"E":[0.026,0.107,0.085,0.567,0.026,0.137,0.021,0.031],"Ur":[0.031,0.156,0.069,0.331,0.082,0.179,0.081,0.072],"Uh":[0.022,0.207,0.057,0.302,0.053,0.301,0.044,0.013],"T":[0.032,0.077,0.085,0.249,0.038,0.218,0.287,0.013],"Tr":[0.119,0.145,0.085,0.495,0.014,0.079,0.033,0.031]},"3":{"R":[0.564,0.0,0.117,0.099,0.203,0.0,0.01,0.006],"H":[0.323,0.168,0.125,0.223,0.092,0.056,0.011,0.002],"Q":[0.114,0.141,0.357,0.282,0.041,0.041,0.01,0.015],"E":[0.014,0.084,0.104,0.65,0.017,0.101,0.019,0.012],"Ur":[0.007,0.169,0.102,0.309,0.045,0.227,0.125,0.017],"Uh":[0.042,0.144,0.133,0.439,0.026,0.179,0.02,0.017],"T":[0.032,0.121,0.106,0.428,0.013,0.084,0.204,0.011],"Tr":[0.002,0.12,0.145,0.293,0.072,0.194,0.125,0.05]},"4":{"R":[0.66,0.0,0.02,0.099,0.193,0.0,0.025,0.003],"H":[0.417,0.191,0.062,0.086,0.12,0.097,0.003,0.024],"Q":[0.162,0.112,0.284,0.225,0.08,0.092,0.019,0.026],"E":[0.027,0.07,0.092,0.582,0.059,0.115,0.038,0.017],"Ur":[0.005,0.052,0.091,0.429,0.051,0.249,0.089,0.034],"Uh":[0.027,0.048,0.09,0.422,0.078,0.269,0.036,0.029],"T":[0.005,0.109,0.06,0.308,0.016,0.256,0.172,0.072],"Tr":[0.002,0.17,0.03,0.359,0.022,0.341,0.039,0.038]}},"pc":{"maj":{"on":[0.162,0.013,0.109,0.046,0.132,0.073,0.038,0.169,0.022,0.1,0.02,0.116],"off":[0.202,0.012,0.113,0.048,0.125,0.058,0.045,0.154,0.04,0.091,0.029,0.083]},"min":{"on":[0.156,0.05,0.092,0.18,0.033,0.095,0.033,0.136,0.038,0.04,0.112,0.034],"off":[0.125,0.048,0.118,0.149,0.022,0.113,0.038,0.137,0.05,0.05,0.105,0.045]},"dom":{"on":[0.147,0.041,0.089,0.039,0.119,0.08,0.037,0.154,0.039,0.112,0.107,0.035],"off":[0.135,0.048,0.103,0.045,0.098,0.087,0.045,0.142,0.044,0.113,0.092,0.048]},"domalt":{"on":[0.182,0.06,0.019,0.039,0.096,0.108,0.011,0.149,0.086,0.043,0.191,0.015],"off":[0.193,0.068,0.033,0.099,0.071,0.08,0.023,0.111,0.096,0.033,0.139,0.055]},"hdim":{"on":[0.061,0.115,0.012,0.176,0.063,0.089,0.043,0.016,0.107,0.127,0.102,0.088],"off":[0.086,0.119,0.036,0.239,0.066,0.122,0.074,0.039,0.072,0.015,0.12,0.011]},"dim":{"on":[0.124,0.069,0.067,0.071,0.044,0.031,0.062,0.081,0.073,0.199,0.036,0.143],"off":[0.095,0.036,0.066,0.047,0.087,0.03,0.116,0.087,0.093,0.12,0.079,0.142]}},"iv":[0.0015,0.0007,0.0009,0.0023,0.004,0.0085,0.0062,0.0331,0.0588,0.0956,0.1486,0.1384,0.0431,0.1555,0.1174,0.0932,0.0332,0.0286,0.0055,0.0101,0.0044,0.0037,0.0025,0.0014,0.0029],"stats":{"ctOn":0.596,"chrom":0.202,"eighth":0.763,"trip":0.073,"phraseMed":14,"phLen":[5.6,8.7,14.4],"gap":[1.5,2.5,3.9]},"label":"Stan Getz 계열","swingOff":-0.004,"n":3550,"solos":5},"miles":{"rhy":{"1":{"R":[0.588,0.0,0.059,0.084,0.241,0.0,0.009,0.018],"H":[0.365,0.222,0.171,0.114,0.089,0.03,0.005,0.004],"Q":[0.237,0.091,0.345,0.171,0.105,0.033,0.01,0.007],"E":[0.034,0.141,0.162,0.445,0.031,0.137,0.028,0.023],"Ur":[0.03,0.168,0.145,0.256,0.077,0.272,0.025,0.027],"Uh":[0.022,0.184,0.163,0.244,0.034,0.292,0.02,0.04],"T":[0.009,0.169,0.116,0.218,0.013,0.152,0.189,0.135],"Tr":[0.004,0.129,0.131,0.278,0.038,0.301,0.024,0.095]},"2":{"R":[0.587,0.0,0.057,0.131,0.187,0.0,0.017,0.02],"H":[0.246,0.283,0.126,0.1,0.072,0.138,0.01,0.025],"Q":[0.166,0.157,0.211,0.163,0.087,0.189,0.012,0.016],"E":[0.064,0.111,0.09,0.506,0.038,0.142,0.036,0.013],"Ur":[0.035,0.08,0.14,0.294,0.086,0.295,0.036,0.034],"Uh":[0.039,0.149,0.126,0.231,0.047,0.334,0.032,0.043],"T":[0.005,0.058,0.122,0.281,0.053,0.271,0.148,0.062],"Tr":[0.003,0.069,0.075,0.363,0.037,0.29,0.038,0.125]},"3":{"R":[0.593,0.0,0.078,0.155,0.141,0.0,0.011,0.023],"H":[0.298,0.222,0.25,0.096,0.052,0.066,0.009,0.007],"Q":[0.146,0.159,0.34,0.203,0.07,0.04,0.021,0.021],"E":[0.017,0.097,0.138,0.506,0.035,0.152,0.039,0.015],"Ur":[0.031,0.141,0.164,0.234,0.046,0.296,0.034,0.054],"Uh":[0.034,0.164,0.132,0.277,0.041,0.286,0.023,0.044],"T":[0.064,0.058,0.072,0.333,0.047,0.322,0.088,0.016],"Tr":[0.005,0.111,0.063,0.355,0.032,0.321,0.047,0.066]},"4":{"R":[0.729,0.0,0.032,0.069,0.14,0.0,0.012,0.018],"H":[0.29,0.263,0.129,0.104,0.07,0.128,0.005,0.011],"Q":[0.181,0.136,0.248,0.184,0.052,0.165,0.014,0.02],"E":[0.045,0.112,0.089,0.502,0.035,0.154,0.033,0.029],"Ur":[0.041,0.126,0.138,0.328,0.068,0.242,0.031,0.028],"Uh":[0.048,0.122,0.126,0.259,0.038,0.335,0.033,0.039],"T":[0.005,0.059,0.132,0.215,0.065,0.29,0.183,0.05],"Tr":[0.004,0.07,0.158,0.311,0.037,0.277,0.044,0.1]}},"pc":{"maj":{"on":[0.138,0.025,0.121,0.039,0.143,0.064,0.048,0.164,0.037,0.084,0.031,0.105],"off":[0.103,0.037,0.128,0.056,0.117,0.07,0.064,0.137,0.044,0.094,0.041,0.109]},"min":{"on":[0.149,0.039,0.116,0.156,0.036,0.116,0.039,0.133,0.037,0.063,0.074,0.042],"off":[0.122,0.038,0.149,0.116,0.039,0.134,0.036,0.126,0.036,0.061,0.092,0.051]},"dom":{"on":[0.171,0.043,0.097,0.059,0.091,0.08,0.036,0.143,0.043,0.099,0.106,0.032],"off":[0.141,0.047,0.103,0.054,0.088,0.092,0.047,0.131,0.05,0.103,0.097,0.046]},"domalt":{"on":[0.112,0.08,0.029,0.108,0.107,0.067,0.062,0.138,0.1,0.042,0.109,0.047],"off":[0.13,0.08,0.054,0.115,0.086,0.088,0.068,0.119,0.07,0.033,0.107,0.049]},"hdim":{"on":[0.115,0.143,0.02,0.222,0.057,0.143,0.087,0.015,0.017,0.024,0.106,0.051],"off":[0.091,0.121,0.053,0.104,0.014,0.127,0.057,0.07,0.091,0.09,0.126,0.055]},"dim":{"on":[0.068,0.102,0.067,0.094,0.069,0.028,0.101,0.059,0.123,0.122,0.071,0.096],"off":[0.093,0.087,0.067,0.111,0.081,0.053,0.112,0.074,0.068,0.103,0.062,0.087]}},"iv":[0.0004,0.0003,0.0014,0.0032,0.003,0.0076,0.0048,0.0237,0.0453,0.0758,0.1595,0.1439,0.0672,0.1782,0.1495,0.0625,0.0307,0.0206,0.0056,0.0085,0.0037,0.0021,0.0013,0.0007,0.0005],"stats":{"ctOn":0.544,"chrom":0.233,"eighth":0.698,"trip":0.061,"phraseMed":9,"phLen":[4.3,6.5,10.8],"gap":[2.0,3.2,4.6]},"label":"Miles Davis 계열","swingOff":-0.026,"n":5348,"solos":15},"lyoung":{"rhy":{"1":{"R":[0.512,0.0,0.065,0.101,0.264,0.0,0.037,0.021],"H":[0.328,0.166,0.169,0.137,0.112,0.059,0.015,0.015],"Q":[0.115,0.105,0.368,0.299,0.057,0.039,0.006,0.01],"E":[0.007,0.108,0.167,0.47,0.018,0.189,0.029,0.011],"Ur":[0.026,0.202,0.113,0.328,0.026,0.24,0.052,0.013],"Uh":[0.011,0.277,0.185,0.257,0.031,0.199,0.024,0.016],"T":[0.003,0.166,0.142,0.478,0.018,0.118,0.056,0.019],"Tr":[0.001,0.108,0.128,0.29,0.018,0.246,0.038,0.17]},"2":{"R":[0.43,0.0,0.056,0.137,0.296,0.0,0.037,0.044],"H":[0.159,0.2,0.093,0.155,0.084,0.253,0.027,0.028],"Q":[0.135,0.212,0.143,0.196,0.058,0.22,0.019,0.018],"E":[0.019,0.193,0.116,0.426,0.026,0.173,0.024,0.024],"Ur":[0.004,0.044,0.134,0.476,0.018,0.212,0.03,0.082],"Uh":[0.032,0.216,0.124,0.284,0.025,0.274,0.026,0.019],"T":[0.015,0.033,0.333,0.469,0.013,0.042,0.064,0.03],"Tr":[0.006,0.302,0.035,0.461,0.014,0.08,0.062,0.04]},"3":{"R":[0.543,0.0,0.044,0.175,0.216,0.0,0.011,0.011],"H":[0.212,0.223,0.16,0.183,0.132,0.066,0.006,0.019],"Q":[0.086,0.193,0.334,0.251,0.048,0.061,0.007,0.019],"E":[0.019,0.153,0.13,0.5,0.027,0.119,0.031,0.019],"Ur":[0.008,0.163,0.176,0.356,0.037,0.189,0.023,0.049],"Uh":[0.009,0.202,0.199,0.329,0.022,0.184,0.032,0.024],"T":[0.002,0.135,0.131,0.395,0.014,0.238,0.062,0.023],"Tr":[0.009,0.026,0.17,0.339,0.01,0.317,0.103,0.027]},"4":{"R":[0.509,0.0,0.045,0.098,0.329,0.0,0.011,0.008],"H":[0.249,0.251,0.073,0.097,0.113,0.195,0.003,0.02],"Q":[0.167,0.194,0.168,0.215,0.084,0.138,0.02,0.014],"E":[0.014,0.139,0.116,0.447,0.019,0.189,0.046,0.031],"Ur":[0.005,0.067,0.112,0.458,0.02,0.279,0.035,0.025],"Uh":[0.011,0.118,0.17,0.248,0.017,0.368,0.035,0.033],"T":[0.008,0.033,0.056,0.4,0.019,0.305,0.049,0.13],"Tr":[0.005,0.132,0.051,0.282,0.011,0.213,0.164,0.141]}},"pc":{"maj":{"on":[0.179,0.015,0.105,0.093,0.114,0.064,0.025,0.19,0.02,0.12,0.028,0.047],"off":[0.159,0.017,0.087,0.055,0.151,0.069,0.05,0.192,0.031,0.106,0.025,0.059]},"min":{"on":[0.168,0.051,0.039,0.165,0.012,0.094,0.053,0.202,0.043,0.067,0.073,0.033],"off":[0.155,0.023,0.112,0.154,0.026,0.092,0.04,0.159,0.058,0.047,0.098,0.037]},"dom":{"on":[0.174,0.029,0.128,0.054,0.115,0.069,0.027,0.119,0.043,0.096,0.113,0.031],"off":[0.155,0.045,0.12,0.061,0.103,0.085,0.04,0.114,0.045,0.102,0.085,0.048]},"domalt":{"on":[0.169,0.17,0.064,0.114,0.064,0.084,0.017,0.103,0.082,0.04,0.074,0.019],"off":[0.131,0.068,0.05,0.057,0.067,0.073,0.047,0.132,0.098,0.026,0.202,0.051]},"hdim":{"on":[0.134,0.1,0.009,0.073,0.031,0.169,0.144,0.035,0.065,0.052,0.167,0.021],"off":[0.118,0.07,0.04,0.175,0.025,0.119,0.105,0.042,0.076,0.113,0.095,0.021]},"dim":{"on":[0.067,0.025,0.012,0.134,0.052,0.047,0.16,0.058,0.052,0.266,0.038,0.09],"off":[0.078,0.029,0.044,0.075,0.048,0.035,0.24,0.049,0.121,0.155,0.035,0.091]}},"iv":[0.0027,0.001,0.0013,0.0034,0.0054,0.0098,0.0098,0.0376,0.0555,0.1044,0.1302,0.0915,0.0493,0.17,0.118,0.0997,0.0354,0.0412,0.0112,0.0122,0.0034,0.0026,0.0011,0.0006,0.0028],"stats":{"ctOn":0.622,"chrom":0.188,"eighth":0.74,"trip":0.053,"phraseMed":14,"phLen":[6.0,10.0,15.4],"gap":[1.3,2.1,2.9]},"label":"Lester Young 계열","swingOff":0.019,"n":1787,"solos":7}},"cells":[{"id":"w0","cls":"min","s":0,"iv":[2,1,2],"np":18,"by":["baker","cbrown","coltrane","dorham","konitz","morgan","rollins"],"src":"WJD","name":"1-2-♭3-4"},{"id":"w1","cls":"min","s":3,"iv":[2,2,3],"np":16,"by":["baker","coltrane","dgordon","dorham","miles"],"src":"WJD","name":"♭3-4-5-♭7"},{"id":"w2","cls":"dom","s":7,"iv":[2,1,2],"np":15,"by":["cbrown","coltrane","getz","henderson","miles","rollins"],"src":"WJD","name":"5-6-♭7-1"},{"id":"w3","cls":"maj","s":2,"iv":[-3,1,2],"np":15,"by":["dorham","konitz","miles","rollins"],"src":"WJD","name":"2-7-1-2"},{"id":"w4","cls":"maj","s":2,"iv":[-2,-1,1],"np":13,"by":["cbrown","konitz","rollins"],"src":"WJD","name":"2-1-7-1"},{"id":"w5","cls":"dom","s":7,"iv":[-2,-1,-2],"np":13,"by":["baker","coltrane","dorham","getz","henderson","konitz","miles"],"src":"WJD","name":"5-4-3-2"},{"id":"w6","cls":"dom","s":0,"iv":[-2,-1,-2],"np":12,"by":["cbrown","coltrane","konitz","parker"],"src":"WJD","name":"1-♭7-6-5"},{"id":"w7","cls":"maj","s":7,"iv":[-2,-1,-2],"np":11,"by":["cbrown","coltrane","dorham","getz","henderson","parker"],"src":"WJD","name":"5-4-3-2"},{"id":"w8","cls":"dom","s":4,"iv":[-2,-2,-2],"np":12,"by":["cbrown","coltrane","jj","miles"],"src":"WJD","name":"3-2-1-♭7"},{"id":"w9","cls":"maj","s":0,"iv":[2,2,3],"np":9,"by":["cbrown","coltrane","dorham","parker"],"src":"WJD","name":"1-2-3-5"},{"id":"w10","cls":"dom","s":10,"iv":[-1,-2,-2],"np":10,"by":["konitz","morgan","parker"],"src":"WJD","name":"♭7-6-5-4"},{"id":"w11","cls":"dom","s":10,"iv":[2,2,2],"np":10,"by":["coltrane","dgordon","getz","henderson"],"src":"WJD","name":"♭7-1-2-3"},{"id":"w12","cls":"min","s":2,"iv":[-3,1,2],"np":10,"by":["cbrown","henderson","morgan","parker","rollins"],"src":"WJD","name":"2-7-1-2"},{"id":"w13","cls":"domalt","s":7,"iv":[-2,-1,3],"np":9,"by":["baker","cbrown","coltrane","parker","rollins"],"src":"WJD","name":"5-4-3-5"},{"id":"w14","cls":"dom","s":0,"iv":[-2,-3,1],"np":9,"by":["cbrown","dorham","konitz"],"src":"WJD","name":"1-♭7-5-♭6"},{"id":"w15","cls":"dom","s":4,"iv":[3,3,2],"np":9,"by":["coltrane","getz","henderson"],"src":"WJD","name":"3-5-♭7-1"},{"id":"w16","cls":"dom","s":2,"iv":[2,1,2],"np":9,"by":["getz","henderson","morgan"],"src":"WJD","name":"2-3-4-5"},{"id":"w17","cls":"maj","s":7,"iv":[-3,-2,-2],"np":8,"by":["cbrown","coltrane","henderson","konitz"],"src":"WJD","name":"5-3-2-1"},{"id":"w18","cls":"dom","s":4,"iv":[-1,-1,-1],"np":8,"by":["getz","henderson"],"src":"WJD","name":"3-♭3-2-♭2"},{"id":"w19","cls":"maj","s":2,"iv":[-2,-1,-2],"np":8,"by":["cbrown","coltrane","dorham","konitz","miles","parker","rollins"],"src":"WJD","name":"2-1-7-6"},{"id":"w20","cls":"dom","s":4,"iv":[1,2,2],"np":8,"by":["coltrane","getz","henderson","morgan"],"src":"WJD","name":"3-4-5-6"},{"id":"w21","cls":"min","s":9,"iv":[-2,-2,-1],"np":8,"by":["cannon","cbrown","coltrane","dorham","miles"],"src":"WJD","name":"6-5-4-3"},{"id":"w22","cls":"min","s":7,"iv":[-4,-1,-2],"np":8,"by":["cbrown","coltrane","morgan"],"src":"WJD","name":"5-♭3-2-1"},{"id":"w23","cls":"maj","s":11,"iv":[-1,-1,-1],"np":8,"by":["cbrown","coltrane","dorham","henderson"],"src":"WJD","name":"7-♭7-6-♭6"},{"id":"w24","cls":"maj","s":4,"iv":[3,4,3],"np":8,"by":["baker","cannon"],"src":"WJD","name":"3-5-7-2"},{"id":"w25","cls":"dom","s":4,"iv":[-2,-2,-1],"np":8,"by":["coltrane","getz","jj","morgan","parker"],"src":"WJD","name":"3-2-1-7"},{"id":"w26","cls":"min","s":7,"iv":[2,1,2],"np":8,"by":["cbrown","coltrane","getz"],"src":"WJD","name":"5-6-♭7-1"},{"id":"w27","cls":"dom","s":0,"iv":[2,2,3],"np":6,"by":["coltrane"],"src":"WJD","name":"1-2-3-5"},{"id":"w28","cls":"maj","s":0,"iv":[2,2,1],"np":7,"by":["cbrown","coltrane","konitz","miles"],"src":"WJD","name":"1-2-3-4"},{"id":"w29","cls":"dom","s":4,"iv":[-3,-1,-2],"np":7,"by":["cannon"],"src":"WJD","name":"3-♭2-1-♭7"},{"id":"w30","cls":"min","s":7,"iv":[-1,-1,-1],"np":7,"by":["cbrown","miles"],"src":"WJD","name":"5-♭5-4-3"},{"id":"w31","cls":"dom","s":0,"iv":[-1,-1,-1],"np":6,"by":["coltrane","dorham","getz","konitz","parker"],"src":"WJD","name":"1-7-♭7-6"},{"id":"w32","cls":"dom","s":2,"iv":[-1,-1,-1],"np":7,"by":[],"src":"WJD","name":"2-♭2-1-7"},{"id":"w33","cls":"dom","s":2,"iv":[-2,-2,-1],"np":7,"by":["getz","konitz","parker"],"src":"WJD","name":"2-1-♭7-6"},{"id":"w34","cls":"dom","s":4,"iv":[3,3,4],"np":6,"by":["coltrane","getz","parker"],"src":"WJD","name":"3-5-♭7-2"},{"id":"w35","cls":"dom","s":9,"iv":[-1,-1,-1],"np":7,"by":["henderson","parker"],"src":"WJD","name":"6-♭6-5-♭5"},{"id":"w36","cls":"maj","s":4,"iv":[-1,-1,-1],"np":7,"by":["baker"],"src":"WJD","name":"3-♭3-2-♭2"},{"id":"w37","cls":"min","s":5,"iv":[-1,-1,-1],"np":7,"by":["coltrane","dorham","konitz","parker","rollins"],"src":"WJD","name":"4-3-♭3-2"},{"id":"w38","cls":"maj","s":4,"iv":[-2,-2,-1],"np":6,"by":["konitz","parker","rollins"],"src":"WJD","name":"3-2-1-7"},{"id":"w39","cls":"dom","s":0,"iv":[-1,-1,2],"np":6,"by":["cbrown","coltrane"],"src":"WJD","name":"1-7-♭7-1"},{"id":"w40","cls":"dom","s":3,"iv":[-2,-1,-2],"np":6,"by":["coltrane","dorham","morgan"],"src":"WJD","name":"♭3-♭2-1-♭7"},{"id":"w41","cls":"dom","s":7,"iv":[-2,-1,3],"np":6,"by":["baker","konitz","parker","rollins"],"src":"WJD","name":"5-4-3-5"},{"id":"w42","cls":"dom","s":7,"iv":[-3,-4,-3],"np":6,"by":["getz","konitz","lyoung"],"src":"WJD","name":"5-3-1-6"},{"id":"w43","cls":"dom","s":8,"iv":[1,1,1],"np":6,"by":["jj","lyoung"],"src":"WJD","name":"♭6-6-♭7-7"},{"id":"w44","cls":"min","s":3,"iv":[-1,-1,-1],"np":6,"by":["miles"],"src":"WJD","name":"♭3-2-♭2-1"},{"id":"w45","cls":"dom","s":5,"iv":[2,2,1],"np":6,"by":["cbrown","hubbard"],"src":"WJD","name":"4-5-6-♭7"},{"id":"w46","cls":"min","s":0,"iv":[-2,-3,-4],"np":6,"by":["baker","cannon","coltrane","getz","konitz"],"src":"WJD","name":"1-♭7-5-♭3"},{"id":"w47","cls":"dom","s":7,"iv":[-1,-1,-1],"np":6,"by":["konitz","parker"],"src":"WJD","name":"5-♭5-4-3"},{"id":"w48","cls":"min","s":0,"iv":[-2,-1,-2],"np":6,"by":["cbrown","henderson","parker","rollins"],"src":"WJD","name":"1-♭7-6-5"},{"id":"w49","cls":"min","s":5,"iv":[-3,1,2],"np":6,"by":["baker","miles","morgan"],"src":"WJD","name":"4-2-♭3-4"},{"id":"w50","cls":"maj","s":7,"iv":[-3,1,2],"np":6,"by":["lyoung","miles"],"src":"WJD","name":"5-3-4-5"},{"id":"w51","cls":"maj","s":7,"iv":[-1,-1,-1],"np":5,"by":["cannon","dorham","konitz","miles"],"src":"WJD","name":"5-♭5-4-3"},{"id":"w52","cls":"maj","s":4,"iv":[3,2,3],"np":5,"by":["coltrane"],"src":"WJD","name":"3-5-6-1"},{"id":"w53","cls":"dom","s":3,"iv":[1,1,1],"np":5,"by":["getz","jj","konitz"],"src":"WJD","name":"♭3-3-4-♭5"},{"id":"w54","cls":"domalt","s":0,"iv":[-1,-1,-1],"np":5,"by":[],"src":"WJD","name":"1-7-♭7-6"},{"id":"w55","cls":"dom","s":0,"iv":[-1,-1,4],"np":5,"by":["coltrane","konitz","parker"],"src":"WJD","name":"1-7-♭7-2"},{"id":"w56","cls":"maj","s":7,"iv":[2,2,1],"np":5,"by":["dorham","konitz","miles"],"src":"WJD","name":"5-6-7-1"},{"id":"w57","cls":"min","s":0,"iv":[3,4,3],"np":5,"by":["coltrane","dorham","rollins"],"src":"WJD","name":"1-♭3-5-♭7"},{"id":"w58","cls":"domalt","s":4,"iv":[-3,-1,-2],"np":5,"by":["jj"],"src":"WJD","name":"3-♭2-1-♭7"},{"id":"w59","cls":"min","s":3,"iv":[2,2,2],"np":5,"by":["coltrane"],"src":"WJD","name":"♭3-4-5-6"},{"id":"w60","cls":"dom","s":2,"iv":[-4,-3,-2],"np":5,"by":["getz"],"src":"WJD","name":"2-♭7-5-4"},{"id":"w61","cls":"maj","s":7,"iv":[-3,-4,-3],"np":5,"by":["coltrane"],"src":"WJD","name":"5-3-1-6"},{"id":"w62","cls":"dom","s":9,"iv":[-2,-1,1],"np":5,"by":["dgordon","konitz"],"src":"WJD","name":"6-5-♭5-5"},{"id":"w63","cls":"maj","s":0,"iv":[-1,-2,-1],"np":5,"by":["cannon","getz"],"src":"WJD","name":"1-7-6-♭6"},{"id":"w64","cls":"dom","s":2,"iv":[3,-1,-2],"np":5,"by":["coltrane","jj","parker"],"src":"WJD","name":"2-4-3-2"},{"id":"w65","cls":"maj","s":7,"iv":[-2,-3,1],"np":5,"by":["baker","dorham","miles"],"src":"WJD","name":"5-4-2-♭3"},{"id":"w66","cls":"maj","s":4,"iv":[1,2,2],"np":5,"by":["baker","cbrown","konitz","miles"],"src":"WJD","name":"3-4-5-6"},{"id":"w67","cls":"maj","s":11,"iv":[1,2,2],"np":5,"by":["konitz","miles"],"src":"WJD","name":"7-1-2-3"},{"id":"w68","cls":"domalt","s":7,"iv":[2,1,2],"np":5,"by":["cbrown"],"src":"WJD","name":"5-6-♭7-1"},{"id":"w69","cls":"dom","s":7,"iv":[-2,-3,1],"np":5,"by":["getz","konitz","miles"],"src":"WJD","name":"5-4-2-♭3"},{"id":"w70","cls":"maj","s":9,"iv":[2,1,2],"np":5,"by":["henderson","jj","konitz"],"src":"WJD","name":"6-7-1-2"},{"id":"w71","cls":"dom","s":2,"iv":[-1,-1,-2],"np":5,"by":["coltrane","konitz"],"src":"WJD","name":"2-♭2-1-♭7"},{"id":"w72","cls":"dom","s":9,"iv":[-2,-3,-2],"np":4,"by":["coltrane","getz","konitz"],"src":"WJD","name":"6-5-3-2"},{"id":"w73","cls":"dom","s":10,"iv":[-1,1,-1],"np":5,"by":["getz","jj"],"src":"WJD","name":"♭7-6-♭7-6"},{"id":"w74","cls":"dom","s":5,"iv":[-3,-4,-3],"np":5,"by":[],"src":"WJD","name":"4-2-♭7-5"},{"id":"w75","cls":"dom","s":10,"iv":[-2,-1,-2],"np":5,"by":["cbrown","henderson","parker","rollins"],"src":"WJD","name":"♭7-♭6-5-4"},{"id":"w76","cls":"dom","s":9,"iv":[-2,-1,-2],"np":5,"by":["baker","cbrown"],"src":"WJD","name":"6-5-♭5-3"},{"id":"w77","cls":"min","s":3,"iv":[-2,-1,-2],"np":5,"by":["baker"],"src":"WJD","name":"♭3-♭2-1-♭7"},{"id":"w78","cls":"dom","s":0,"iv":[2,1,2],"np":5,"by":["jj","konitz","miles"],"src":"WJD","name":"1-2-♭3-4"},{"id":"w79","cls":"dom","s":4,"iv":[3,3,3],"np":5,"by":["cbrown","coltrane","konitz"],"src":"WJD","name":"3-5-♭7-♭2"},{"id":"w80","cls":"dom","s":10,"iv":[2,1,2],"np":5,"by":["getz"],"src":"WJD","name":"♭7-1-♭2-♭3"},{"id":"w81","cls":"dom","s":11,"iv":[-1,-1,-1],"np":5,"by":["henderson"],"src":"WJD","name":"7-♭7-6-♭6"},{"id":"w82","cls":"dom","s":5,"iv":[-1,-2,-2],"np":5,"by":["konitz"],"src":"WJD","name":"4-3-2-1"},{"id":"w83","cls":"min","s":0,"iv":[-1,-1,-1],"np":5,"by":["coltrane","dgordon","konitz"],"src":"WJD","name":"1-7-♭7-6"},{"id":"w84","cls":"dom","s":7,"iv":[2,1,1],"np":5,"by":["getz","miles"],"src":"WJD","name":"5-6-♭7-7"},{"id":"w85","cls":"dom","s":2,"iv":[-4,-1,-2],"np":5,"by":["coltrane","getz","rollins"],"src":"WJD","name":"2-♭7-6-5"},{"id":"w86","cls":"maj","s":4,"iv":[3,2,2],"np":4,"by":["dorham","parker"],"src":"WJD","name":"3-5-6-7"},{"id":"w87","cls":"dom","s":2,"iv":[-4,-3,-3],"np":4,"by":["parker"],"src":"WJD","name":"2-♭7-5-3"},{"id":"w88","cls":"maj","s":7,"iv":[2,2,3],"np":4,"by":["cbrown","coltrane"],"src":"WJD","name":"5-6-7-2"},{"id":"w89","cls":"dom","s":0,"iv":[-1,-1,-1,-2,-2],"np":4,"by":["dorham","konitz","parker"],"src":"WJD","name":"1-7-♭7-6-5-4"},{"id":"w90","cls":"min","s":3,"iv":[2,2,-4],"np":4,"by":["baker","cannon","cbrown"],"src":"WJD","name":"♭3-4-5-♭3"},{"id":"w91","cls":"dom","s":0,"iv":[-1,-1,-2],"np":4,"by":["rollins"],"src":"WJD","name":"1-7-♭7-♭6"},{"id":"w92","cls":"dom","s":7,"iv":[-3,-4,-1],"np":4,"by":["getz","jj","konitz"],"src":"WJD","name":"5-3-1-7"},{"id":"w93","cls":"dom","s":4,"iv":[1,2,2,1,2],"np":4,"by":["getz","henderson"],"src":"WJD","name":"3-4-5-6-♭7-1"},{"id":"w94","cls":"min","s":10,"iv":[-3,-4,-3],"np":4,"by":[],"src":"WJD","name":"♭7-5-♭3-1"},{"id":"w95","cls":"domalt","s":10,"iv":[-2,-1,-2],"np":4,"by":["jj","rollins"],"src":"WJD","name":"♭7-♭6-5-4"},{"id":"w96","cls":"maj","s":2,"iv":[-2,-3,-2],"np":4,"by":["konitz","lyoung"],"src":"WJD","name":"2-1-6-5"},{"id":"w97","cls":"dom","s":6,"iv":[-2,-1,-2],"np":4,"by":["getz","henderson","konitz"],"src":"WJD","name":"♭5-3-♭3-♭2"},{"id":"w98","cls":"min","s":10,"iv":[-1,-2,-2],"np":4,"by":["konitz","miles","parker"],"src":"WJD","name":"♭7-6-5-4"},{"id":"w99","cls":"dom","s":10,"iv":[-2,-2,-2],"np":4,"by":[],"src":"WJD","name":"♭7-♭6-♭5-3"},{"id":"w100","cls":"maj","s":0,"iv":[-3,-4,-3],"np":4,"by":["konitz"],"src":"WJD","name":"1-6-4-2"},{"id":"w101","cls":"dom","s":4,"iv":[-2,-1,-2],"np":4,"by":["coltrane","dorham","rollins"],"src":"WJD","name":"3-2-♭2-7"},{"id":"w102","cls":"min","s":3,"iv":[-1,-2,-2],"np":4,"by":["konitz"],"src":"WJD","name":"♭3-2-1-♭7"},{"id":"w103","cls":"dom","s":10,"iv":[2,2,-4],"np":4,"by":["henderson"],"src":"WJD","name":"♭7-1-2-♭7"},{"id":"w104","cls":"dom","s":10,"iv":[2,2,3],"np":4,"by":["coltrane","miles"],"src":"WJD","name":"♭7-1-2-4"},{"id":"w105","cls":"domalt","s":10,"iv":[3,-1,-2],"np":4,"by":["rollins"],"src":"WJD","name":"♭7-♭2-1-♭7"},{"id":"w106","cls":"dom","s":9,"iv":[-2,-3,1],"np":4,"by":["dorham"],"src":"WJD","name":"6-5-3-4"},{"id":"w107","cls":"maj","s":2,"iv":[-2,2,-2],"np":4,"by":["miles"],"src":"WJD","name":"2-1-2-1"},{"id":"w108","cls":"min","s":5,"iv":[-1,-1,4],"np":4,"by":["coltrane"],"src":"WJD","name":"4-3-♭3-5"},{"id":"w109","cls":"maj","s":9,"iv":[-2,-3,-4],"np":4,"by":["coltrane"],"src":"WJD","name":"6-5-3-1"},{"id":"w110","cls":"dom","s":9,"iv":[3,-2,-3],"np":4,"by":["getz"],"src":"WJD","name":"6-1-♭7-5"},{"id":"w111","cls":"maj","s":0,"iv":[-3,-2,-3],"np":4,"by":[],"src":"WJD","name":"1-6-5-3"},{"id":"w112","cls":"min","s":7,"iv":[3,-1,-2],"np":4,"by":["rollins"],"src":"WJD","name":"5-♭7-6-5"},{"id":"w113","cls":"dom","s":10,"iv":[1,1,-2],"np":4,"by":["cbrown","konitz"],"src":"WJD","name":"♭7-7-1-♭7"},{"id":"w114","cls":"min","s":0,"iv":[2,1,2,2,3],"np":4,"by":["dorham","rollins"],"src":"WJD","name":"1-2-♭3-4-5-♭7"},{"id":"w115","cls":"dom","s":7,"iv":[2,2,1],"np":4,"by":["coltrane","jj"],"src":"WJD","name":"5-6-7-1"},{"id":"w116","cls":"dom","s":9,"iv":[-3,1,2],"np":4,"by":[],"src":"WJD","name":"6-♭5-5-6"},{"id":"w117","cls":"dom","s":0,"iv":[1,-1,-2],"np":4,"by":["cbrown","getz","rollins"],"src":"WJD","name":"1-♭2-1-♭7"},{"id":"w118","cls":"maj","s":2,"iv":[-1,-1,-1],"np":4,"by":["konitz","parker"],"src":"WJD","name":"2-♭2-1-7"},{"id":"w119","cls":"min","s":3,"iv":[-1,-1,4],"np":4,"by":["baker","coltrane"],"src":"WJD","name":"♭3-2-♭2-4"},{"id":"w120","cls":"dom","s":9,"iv":[-2,-1,3],"np":4,"by":["getz","miles"],"src":"WJD","name":"6-5-♭5-6"},{"id":"w121","cls":"dom","s":2,"iv":[-2,-2,-3],"np":4,"by":["henderson"],"src":"WJD","name":"2-1-♭7-5"},{"id":"w122","cls":"maj","s":9,"iv":[-2,2,-2],"np":4,"by":["konitz"],"src":"WJD","name":"6-5-6-5"},{"id":"w123","cls":"dom","s":6,"iv":[-1,-1,-1],"np":4,"by":[],"src":"WJD","name":"♭5-4-3-♭3"},{"id":"w124","cls":"dom","s":3,"iv":[-1,-2,-2],"np":4,"by":["dorham","miles"],"src":"WJD","name":"♭3-2-1-♭7"},{"id":"w125","cls":"dom","s":7,"iv":[2,1,2,2,-4],"np":4,"by":["getz","henderson"],"src":"WJD","name":"5-6-♭7-1-2-♭7"},{"id":"w126","cls":"dom","s":5,"iv":[2,1,2],"np":4,"by":["cbrown","henderson"],"src":"WJD","name":"4-5-♭6-♭7"},{"id":"w127","cls":"dom","s":7,"iv":[-1,-2,-2],"np":4,"by":["cbrown","jj"],"src":"WJD","name":"5-♭5-3-2"},{"id":"w128","cls":"maj","s":11,"iv":[-1,-1,-1,-1,-2],"np":4,"by":["cbrown","dorham","henderson"],"src":"WJD","name":"7-♭7-6-♭6-5-4"},{"id":"w129","cls":"maj","s":11,"iv":[1,2,-3],"np":4,"by":["cbrown","miles"],"src":"WJD","name":"7-1-2-7"},{"id":"w130","cls":"domalt","s":5,"iv":[2,1,2],"np":4,"by":["lyoung"],"src":"WJD","name":"4-5-♭6-♭7"},{"id":"w131","cls":"min","s":3,"iv":[2,-3,1],"np":4,"by":["getz"],"src":"WJD","name":"♭3-4-2-♭3"},{"id":"w132","cls":"dom","s":5,"iv":[2,1,1],"np":4,"by":[],"src":"WJD","name":"4-5-♭6-6"},{"id":"w133","cls":"dom","s":10,"iv":[2,-3,1],"np":4,"by":["getz","jj"],"src":"WJD","name":"♭7-1-6-♭7"},{"id":"wp0","cls":"min","to":"dom","tr":5,"s":9,"iv":[-2,-2,-1,-1],"np":7,"by":["cannon","cbrown","coltrane","dorham","miles"],"src":"WJD","name":"6-5-4-3 → ♭7(다음 코드)"},{"id":"wp1","cls":"domalt","to":"min","tr":5,"s":7,"iv":[-2,-1,3,-2],"np":5,"by":["baker","cbrown","coltrane","parker"],"src":"WJD","name":"5-4-3-5 → 1(다음 코드)"},{"id":"wp2","cls":"dom","to":"maj","tr":5,"s":0,"iv":[-2,-1,-2,-2],"np":5,"by":["coltrane","konitz","parker"],"src":"WJD","name":"1-♭7-6-5 → 1(다음 코드)"},{"id":"wp3","cls":"min","to":"dom","tr":5,"s":5,"iv":[-1,-1,-1,-2],"np":5,"by":["coltrane","dorham","konitz","parker"],"src":"WJD","name":"4-3-♭3-2 → 5(다음 코드)"},{"id":"wp4","cls":"min","to":"dom","tr":5,"s":2,"iv":[-3,1,2,1],"np":4,"by":[],"src":"WJD","name":"2-7-1-2 → ♭7(다음 코드)"},{"id":"wp5","cls":"dom","to":"maj","tr":5,"s":0,"iv":[-2,-3,1,1],"np":4,"by":["konitz"],"src":"WJD","name":"1-♭7-5-♭6 → 3(다음 코드)"},{"id":"wp6","cls":"min","to":"dom","tr":5,"s":3,"iv":[2,2,3,4],"np":4,"by":["dgordon"],"src":"WJD","name":"♭3-4-5-♭7 → 6(다음 코드)"}]};
STYLE_DATA.cells=STYLE_DATA.cells.concat(CURATED_CELLS.map((c,i)=>Object.assign({id:"c"+i,src:"교본"},c)));
/* v0.33 리듬 v2 — WJD 4/4 스윙 솔로의 박 토큰 2차 전이·프레이즈 첫 박·끝음 길이 분포(tools/rhythm_v2.py · inject_rhythm_v2.py 산출물) */
STYLE_DATA.rhy2={"tok":["R","H","Q","Qs","E","Ur","Uh","T"],"tri":{"1R|R":[0.0,0.0018,0.0997,0.0627,0.2706,0.498,0.0045,0.0627],"1R|Q":[0.0,0.125,0.35,0.1,0.25,0.075,0.1,0.0],"1R|Qs":[0.0,0.0278,0.1944,0.1111,0.4444,0.1667,0.0278,0.0278],"1R|E":[0.0,0.1031,0.1183,0.0802,0.4008,0.0763,0.1565,0.0649],"1R|Ur":[0.0,0.0859,0.1097,0.0384,0.4168,0.0896,0.1846,0.075],"1R|T":[0.0,0.0339,0.1695,0.0678,0.4746,0.0339,0.0678,0.1525],"1H|H":[0.0,0.5196,0.1034,0.0363,0.1285,0.1117,0.081,0.0196],"1H|Q":[0.0,0.4096,0.3253,0.0241,0.0843,0.0482,0.1084,0.0],"1H|Qs":[0.0,0.0,0.4194,0.129,0.3226,0.1129,0.0,0.0161],"1H|E":[0.0,0.2774,0.1058,0.0438,0.3139,0.062,0.1606,0.0365],"1H|Ur":[0.0,0.1343,0.0896,0.0448,0.3383,0.0647,0.2587,0.0697],"1H|Uh":[0.0,0.1883,0.1172,0.046,0.318,0.0795,0.1715,0.0795],"1Q|H":[0.0,0.336,0.1,0.052,0.248,0.144,0.1,0.02],"1Q|Q":[0.0,0.1705,0.4716,0.0511,0.1818,0.0568,0.0625,0.0057],"1Q|Qs":[0.0,0.0177,0.4779,0.1504,0.2743,0.0708,0.0,0.0088],"1Q|E":[0.0,0.3137,0.1768,0.0505,0.2337,0.0526,0.1579,0.0147],"1Q|Ur":[0.0,0.2411,0.0893,0.0536,0.2411,0.0714,0.2857,0.0179],"1Q|Uh":[0.0,0.1719,0.2034,0.063,0.3009,0.0516,0.1805,0.0287],"1Q|T":[0.0,0.1379,0.2759,0.0,0.3793,0.069,0.1034,0.0345],"1Qs|Q":[0.0,0.2192,0.4384,0.0685,0.1507,0.0548,0.0548,0.0137],"1Qs|Qs":[0.0,0.0096,0.2596,0.25,0.3846,0.0769,0.0,0.0192],"1Qs|E":[0.0,0.1462,0.1344,0.0711,0.3597,0.0909,0.1779,0.0198],"1Qs|Ur":[0.0,0.1508,0.1032,0.1349,0.3175,0.0952,0.1349,0.0635],"1E|H":[0.0,0.1981,0.1226,0.0786,0.2704,0.239,0.0755,0.0157],"1E|Q":[0.0,0.1667,0.2283,0.0725,0.3225,0.0906,0.0942,0.0254],"1E|Qs":[0.0,0.009,0.2275,0.1108,0.4371,0.1946,0.009,0.012],"1E|E":[0.0,0.0727,0.0988,0.0667,0.5739,0.0535,0.0924,0.042],"1E|Ur":[0.0,0.1409,0.1045,0.0795,0.3477,0.0795,0.2091,0.0386],"1E|Uh":[0.0,0.1478,0.1201,0.0497,0.3372,0.0774,0.2229,0.045],"1E|T":[0.0,0.0804,0.074,0.0579,0.4887,0.0322,0.1061,0.1608],"1Ur|H":[0.0,0.2198,0.1429,0.0989,0.1648,0.2308,0.1429,0.0],"1Ur|Q":[0.0,0.32,0.16,0.0533,0.2533,0.0533,0.16,0.0],"1Ur|Qs":[0.0,0.0,0.2258,0.2258,0.2581,0.2258,0.0215,0.043],"1Ur|E":[0.0,0.0922,0.1245,0.0512,0.4392,0.0966,0.142,0.0542],"1Ur|Ur":[0.0,0.0629,0.08,0.08,0.2571,0.1943,0.3029,0.0229],"1Ur|Uh":[0.0,0.0939,0.1362,0.0634,0.3498,0.0845,0.2441,0.0282],"1Ur|T":[0.0,0.0574,0.0984,0.082,0.377,0.0656,0.123,0.1967],"1Uh|H":[0.0,0.2407,0.179,0.0556,0.2037,0.1914,0.0988,0.0309],"1Uh|Q":[0.0,0.1983,0.2231,0.0331,0.2314,0.157,0.1488,0.0083],"1Uh|Qs":[0.0,0.0111,0.1778,0.0556,0.4556,0.2556,0.0111,0.0333],"1Uh|E":[0.0,0.1081,0.1108,0.0554,0.4392,0.0851,0.1608,0.0405],"1Uh|Ur":[0.0,0.1863,0.0745,0.0994,0.2484,0.118,0.2547,0.0186],"1Uh|Uh":[0.0,0.1516,0.1081,0.0452,0.2484,0.0613,0.3565,0.029],"1Uh|T":[0.0,0.1098,0.1098,0.0732,0.3902,0.0488,0.1951,0.0732],"1T|H":[0.0,0.2432,0.0811,0.027,0.0811,0.3514,0.1351,0.0811],"1T|Q":[0.0,0.3871,0.0968,0.0,0.2258,0.1613,0.0,0.129],"1T|E":[0.0,0.0674,0.0704,0.0587,0.4721,0.0938,0.1261,0.1114],"1T|Ur":[0.0,0.2162,0.0541,0.0,0.3514,0.1622,0.1081,0.1081],"1T|Uh":[0.0,0.1163,0.1163,0.0698,0.3721,0.0698,0.2326,0.0233],"1T|T":[0.0,0.047,0.1208,0.0604,0.349,0.0403,0.0671,0.3154],"2R|R":[0.0,0.0056,0.0557,0.035,0.3232,0.508,0.0119,0.0605],"2R|Q":[0.0,0.3175,0.1058,0.0317,0.2275,0.0899,0.2011,0.0265],"2R|Qs":[0.0,0.0222,0.1556,0.2333,0.3667,0.2,0.0,0.0222],"2R|E":[0.0,0.2774,0.0323,0.0495,0.4538,0.0688,0.0925,0.0258],"2R|Ur":[0.0,0.1797,0.04,0.0359,0.386,0.0914,0.191,0.076],"2R|T":[0.0,0.407,0.0349,0.0349,0.2674,0.0116,0.0698,0.1744],"2H|H":[0.0,0.5106,0.0517,0.0274,0.1064,0.0881,0.1824,0.0334],"2H|Q":[0.0,0.3407,0.0667,0.0667,0.1259,0.0963,0.2889,0.0148],"2H|Qs":[0.0,0.0,0.22,0.24,0.34,0.18,0.0,0.02],"2H|E":[0.0,0.2043,0.1021,0.0468,0.3745,0.034,0.183,0.0553],"2H|Ur":[0.0,0.1147,0.0734,0.0321,0.344,0.1193,0.2569,0.0596],"2H|Uh":[0.0,0.1091,0.0727,0.0455,0.3818,0.0818,0.2273,0.0818],"2H|T":[0.0,0.08,0.08,0.12,0.52,0.0,0.04,0.16],"2Q|H":[0.0,0.2569,0.1042,0.0833,0.1736,0.1181,0.2292,0.0347],"2Q|Q":[0.0,0.309,0.2189,0.0687,0.133,0.0773,0.1888,0.0043],"2Q|Qs":[0.0,0.0,0.1935,0.2258,0.4516,0.129,0.0,0.0],"2Q|E":[0.0,0.2256,0.0769,0.0462,0.3692,0.0564,0.1949,0.0308],"2Q|Ur":[0.0,0.1127,0.1127,0.0563,0.3944,0.0563,0.1972,0.0704],"2Q|Uh":[0.0,0.1852,0.1728,0.0494,0.1728,0.1111,0.2963,0.0123],"2Qs|Q":[0.0,0.2871,0.0766,0.0718,0.177,0.0957,0.2919,0.0],"2Qs|Qs":[0.0,0.0,0.1649,0.2577,0.3402,0.2371,0.0,0.0],"2Qs|E":[0.0,0.1129,0.0677,0.1097,0.4355,0.0516,0.1968,0.0258],"2Qs|Ur":[0.0,0.0571,0.05,0.0786,0.4429,0.0643,0.1786,0.1286],"2E|H":[0.0,0.2996,0.0794,0.0476,0.2183,0.119,0.2183,0.0179],"2E|Q":[0.0,0.2181,0.0856,0.0727,0.273,0.0969,0.2262,0.0275],"2E|Qs":[0.0,0.0072,0.1227,0.1083,0.4801,0.2419,0.0036,0.0361],"2E|E":[0.0,0.0716,0.0489,0.0509,0.6284,0.0593,0.0965,0.0444],"2E|Ur":[0.0,0.0958,0.0701,0.0561,0.4229,0.0794,0.2407,0.035],"2E|Uh":[0.0,0.1468,0.0753,0.0558,0.3688,0.0519,0.2558,0.0455],"2E|T":[0.0,0.0484,0.0657,0.0692,0.4983,0.045,0.1176,0.1557],"2Ur|H":[0.0,0.2312,0.0753,0.0645,0.2634,0.172,0.1882,0.0054],"2Ur|Q":[0.0,0.1975,0.0494,0.0556,0.2593,0.142,0.2593,0.037],"2Ur|Qs":[0.0,0.0103,0.134,0.134,0.3196,0.3505,0.0206,0.0309],"2Ur|E":[0.0,0.1005,0.0494,0.0596,0.4974,0.0937,0.155,0.0443],"2Ur|Ur":[0.0,0.1118,0.0497,0.0559,0.2733,0.1677,0.2857,0.0559],"2Ur|Uh":[0.0,0.1554,0.0959,0.057,0.285,0.101,0.2824,0.0233],"2Ur|T":[0.0,0.0645,0.0645,0.0753,0.4194,0.1075,0.0753,0.1935],"2Uh|H":[0.0,0.2973,0.0743,0.0845,0.1892,0.1351,0.2095,0.0101],"2Uh|Q":[0.0,0.2349,0.073,0.0667,0.2571,0.073,0.2825,0.0127],"2Uh|Qs":[0.0,0.0088,0.1593,0.1504,0.3451,0.2655,0.0088,0.0619],"2Uh|E":[0.0,0.1339,0.0585,0.0429,0.4473,0.0949,0.173,0.0494],"2Uh|Ur":[0.0,0.1957,0.0707,0.038,0.2174,0.125,0.3098,0.0435],"2Uh|Uh":[0.0,0.1548,0.0806,0.0458,0.2923,0.0569,0.3381,0.0316],"2Uh|T":[0.0,0.0521,0.1042,0.0521,0.4583,0.0417,0.125,0.1667],"2T|H":[0.0,0.3333,0.0,0.0278,0.1389,0.1667,0.2222,0.1111],"2T|Q":[0.0,0.2222,0.0794,0.0159,0.1905,0.1746,0.254,0.0635],"2T|Qs":[0.0,0.0,0.1154,0.1154,0.3077,0.2692,0.0385,0.1538],"2T|E":[0.0,0.0912,0.0503,0.0472,0.4843,0.0629,0.1069,0.1572],"2T|Ur":[0.0,0.1081,0.0,0.0811,0.2703,0.0811,0.1892,0.2703],"2T|Uh":[0.0,0.0235,0.0353,0.0471,0.4941,0.0353,0.2353,0.1294],"2T|T":[0.0,0.0362,0.087,0.029,0.3478,0.0362,0.0507,0.413],"3R|R":[0.0,0.0021,0.083,0.0681,0.3603,0.434,0.0099,0.0426],"3R|Q":[0.0,0.2206,0.2941,0.0,0.2353,0.0735,0.1324,0.0441],"3R|Qs":[0.0,0.0,0.4211,0.0526,0.3158,0.1316,0.0526,0.0263],"3R|E":[0.0,0.0746,0.0498,0.0124,0.5796,0.0423,0.1592,0.0821],"3R|Ur":[0.0,0.142,0.1151,0.0252,0.3691,0.0726,0.2035,0.0726],"3R|T":[0.0,0.0667,0.0533,0.0533,0.56,0.0667,0.0933,0.1067],"3H|H":[0.0,0.4555,0.0916,0.0593,0.1833,0.1051,0.0863,0.0189],"3H|Q":[0.0,0.1818,0.3434,0.0606,0.303,0.0505,0.0606,0.0],"3H|Qs":[0.0,0.0,0.3676,0.1618,0.3088,0.1324,0.0,0.0294],"3H|E":[0.0,0.1985,0.125,0.0257,0.3934,0.0846,0.1471,0.0257],"3H|Ur":[0.0,0.1337,0.0963,0.0374,0.369,0.107,0.2139,0.0428],"3H|Uh":[0.0,0.134,0.2092,0.0294,0.3758,0.0654,0.1569,0.0294],"3H|T":[0.0,0.0938,0.25,0.0312,0.375,0.0,0.125,0.125],"3Q|H":[0.0,0.3091,0.1893,0.0442,0.224,0.1356,0.0915,0.0063],"3Q|Q":[0.0,0.1875,0.4261,0.0398,0.2216,0.0568,0.0568,0.0114],"3Q|Qs":[0.0,0.0,0.3636,0.2222,0.3131,0.101,0.0,0.0],"3Q|E":[0.0,0.2452,0.1779,0.0409,0.3005,0.0505,0.1707,0.0144],"3Q|Ur":[0.0,0.2079,0.1124,0.0169,0.2978,0.0562,0.2584,0.0506],"3Q|Uh":[0.0,0.2378,0.16,0.0511,0.2644,0.0756,0.18,0.0311],"3Q|T":[0.0,0.1622,0.2703,0.0,0.2162,0.0,0.2703,0.0811],"3Qs|Q":[0.0,0.3039,0.3039,0.1078,0.1863,0.049,0.049,0.0],"3Qs|Qs":[0.0,0.0,0.2185,0.2353,0.4538,0.0672,0.0084,0.0168],"3Qs|E":[0.0,0.1508,0.1279,0.059,0.4459,0.0426,0.1508,0.023],"3Qs|Ur":[0.0,0.105,0.0773,0.0718,0.4033,0.116,0.1768,0.0497],"3Qs|T":[0.0,0.0741,0.0,0.0741,0.5926,0.0,0.1481,0.1111],"3E|H":[0.0,0.2853,0.1649,0.0707,0.212,0.1597,0.0864,0.0209],"3E|Q":[0.0,0.2667,0.1852,0.0333,0.3185,0.0926,0.0852,0.0185],"3E|Qs":[0.0,0.0,0.2188,0.1094,0.5352,0.1094,0.0,0.0273],"3E|E":[0.0,0.0726,0.0802,0.0497,0.6055,0.0547,0.0953,0.0421],"3E|Ur":[0.0,0.0944,0.102,0.0587,0.3929,0.0587,0.2398,0.0536],"3E|Uh":[0.0,0.1393,0.1202,0.0478,0.3743,0.0519,0.2295,0.0369],"3E|T":[0.0,0.0596,0.0912,0.0421,0.4667,0.0737,0.1193,0.1474],"3Ur|H":[0.0,0.3112,0.1582,0.0663,0.2347,0.1173,0.1071,0.0051],"3Ur|Q":[0.0,0.2793,0.1802,0.0541,0.2613,0.0811,0.1441,0.0],"3Ur|Qs":[0.0,0.0,0.2674,0.0581,0.3605,0.2558,0.0233,0.0349],"3Ur|E":[0.0,0.0627,0.0815,0.0451,0.5388,0.0977,0.1228,0.0514],"3Ur|Ur":[0.0,0.0762,0.1095,0.0381,0.3095,0.181,0.2333,0.0524],"3Ur|Uh":[0.0,0.0903,0.0903,0.0575,0.3491,0.0903,0.2854,0.037],"3Ur|T":[0.0,0.0397,0.106,0.0331,0.4636,0.053,0.0861,0.2185],"3Uh|H":[0.0,0.3041,0.1659,0.0783,0.1935,0.1244,0.1244,0.0092],"3Uh|Q":[0.0,0.3072,0.1111,0.0588,0.2353,0.0915,0.1503,0.0458],"3Uh|Qs":[0.0,0.0,0.1839,0.1379,0.4598,0.1264,0.069,0.023],"3Uh|E":[0.0,0.0908,0.0772,0.0499,0.4811,0.0847,0.171,0.0454],"3Uh|Ur":[0.0,0.1128,0.0902,0.0752,0.3083,0.0977,0.2556,0.0602],"3Uh|Uh":[0.0,0.1282,0.0684,0.0342,0.2991,0.0803,0.3658,0.0239],"3Uh|T":[0.0,0.131,0.0357,0.0476,0.3929,0.0476,0.2262,0.119],"3T|Q":[0.0,0.3043,0.1522,0.0,0.1957,0.1522,0.1522,0.0435],"3T|Qs":[0.0,0.0,0.1852,0.1111,0.1852,0.2963,0.037,0.1852],"3T|E":[0.0,0.1171,0.057,0.0253,0.519,0.0633,0.0823,0.1361],"3T|Ur":[0.0,0.1212,0.0606,0.0303,0.3939,0.1818,0.0303,0.1818],"3T|Uh":[0.0,0.0571,0.0857,0.0429,0.4571,0.0714,0.1857,0.1],"3T|T":[0.0,0.0256,0.0577,0.0128,0.4487,0.0192,0.1154,0.3205],"4R|R":[0.0,0.003,0.0426,0.0405,0.2766,0.5623,0.0142,0.0608],"4R|Q":[0.0,0.3235,0.0686,0.0588,0.1961,0.1275,0.2255,0.0],"4R|Qs":[0.0,0.0145,0.0725,0.2319,0.3188,0.3188,0.0145,0.029],"4R|E":[0.0,0.065,0.0488,0.061,0.5325,0.0752,0.1687,0.0488],"4R|Ur":[0.0,0.0597,0.0514,0.0498,0.4295,0.0763,0.2421,0.0912],"4R|T":[0.0,0.0847,0.0339,0.1017,0.4576,0.0508,0.1017,0.1695],"4H|H":[0.0,0.4936,0.0308,0.0257,0.162,0.0848,0.1954,0.0077],"4H|Q":[0.0,0.3096,0.1574,0.0711,0.1574,0.0457,0.2589,0.0],"4H|Qs":[0.0,0.0,0.2373,0.2542,0.4068,0.0678,0.0339,0.0],"4H|E":[0.0,0.1825,0.0737,0.0456,0.3754,0.0772,0.207,0.0386],"4H|Ur":[0.0,0.0561,0.0561,0.0561,0.398,0.0663,0.2755,0.0918],"4H|Uh":[0.0,0.1119,0.0629,0.0559,0.3147,0.1049,0.2657,0.0839],"4Q|H":[0.0,0.3554,0.0663,0.0361,0.1928,0.1747,0.1627,0.012],"4Q|Q":[0.0,0.2389,0.2168,0.0973,0.2301,0.0796,0.1283,0.0088],"4Q|Qs":[0.0,0.0,0.2121,0.1212,0.5152,0.1515,0.0,0.0],"4Q|E":[0.0,0.126,0.1181,0.0669,0.374,0.0787,0.2205,0.0157],"4Q|Ur":[0.0,0.1026,0.0641,0.1026,0.3333,0.0769,0.2179,0.1026],"4Q|Uh":[0.0,0.1667,0.1458,0.0833,0.3646,0.0625,0.1354,0.0417],"4Qs|Q":[0.0,0.2775,0.0751,0.1503,0.2428,0.0462,0.2081,0.0],"4Qs|Qs":[0.0,0.0233,0.1163,0.4651,0.2674,0.1163,0.0116,0.0],"4Qs|E":[0.0,0.0957,0.0525,0.1358,0.4074,0.1019,0.1883,0.0185],"4Qs|Ur":[0.0,0.07,0.03,0.11,0.36,0.18,0.18,0.07],"4E|H":[0.0,0.2677,0.0505,0.0783,0.25,0.1768,0.1515,0.0253],"4E|Q":[0.0,0.1955,0.0988,0.0947,0.3724,0.0494,0.1667,0.0226],"4E|Qs":[0.0,0.0049,0.1232,0.0985,0.5172,0.2118,0.0099,0.0345],"4E|E":[0.0,0.0592,0.0401,0.0625,0.6288,0.0571,0.1023,0.05],"4E|Ur":[0.0,0.0787,0.0482,0.0711,0.4492,0.0838,0.2259,0.0431],"4E|Uh":[0.0,0.1081,0.077,0.0568,0.4257,0.0689,0.2257,0.0378],"4E|T":[0.0,0.0539,0.064,0.0303,0.5488,0.0303,0.1178,0.1549],"4Ur|H":[0.0,0.2386,0.0909,0.0909,0.1989,0.2102,0.1648,0.0057],"4Ur|Q":[0.0,0.1852,0.1164,0.0635,0.2804,0.0899,0.2593,0.0053],"4Ur|Qs":[0.0,0.0278,0.125,0.1667,0.2917,0.3472,0.0417,0.0],"4Ur|E":[0.0,0.0886,0.0458,0.0606,0.5362,0.0857,0.1359,0.0473],"4Ur|Ur":[0.0,0.0632,0.046,0.0345,0.3161,0.2299,0.2816,0.0287],"4Ur|Uh":[0.0,0.0993,0.0726,0.0654,0.3293,0.0823,0.3172,0.0339],"4Ur|T":[0.0,0.0508,0.0593,0.0678,0.3898,0.0763,0.161,0.1949],"4Uh|H":[0.0,0.3454,0.1124,0.0602,0.1807,0.1245,0.1727,0.004],"4Uh|Q":[0.0,0.2034,0.069,0.0759,0.3241,0.0655,0.2483,0.0138],"4Uh|Qs":[0.0,0.0,0.1413,0.0978,0.4891,0.1848,0.0326,0.0543],"4Uh|E":[0.0,0.1368,0.0472,0.0531,0.4552,0.0743,0.1875,0.046],"4Uh|Ur":[0.0,0.1237,0.0484,0.086,0.3118,0.1075,0.2742,0.0484],"4Uh|Uh":[0.0,0.1248,0.0462,0.0586,0.2881,0.0786,0.3713,0.0324],"4Uh|T":[0.0,0.1,0.0111,0.0222,0.4556,0.0778,0.1333,0.2],"4T|H":[0.0,0.2424,0.0303,0.0303,0.303,0.2121,0.1515,0.0303],"4T|Q":[0.0,0.1127,0.1549,0.0845,0.2676,0.0563,0.169,0.1549],"4T|E":[0.0,0.0932,0.0329,0.0795,0.526,0.0575,0.1096,0.1014],"4T|Ur":[0.0,0.0976,0.0488,0.0976,0.3902,0.0732,0.1951,0.0976],"4T|Uh":[0.0,0.0673,0.0385,0.0385,0.4135,0.0577,0.3173,0.0673],"4T|T":[0.0,0.0541,0.0135,0.0338,0.4459,0.0541,0.0608,0.3378]},"bi":{"all":{"1R":[0.0,0.0018,0.0997,0.0627,0.2706,0.498,0.0045,0.0627],"1H":[0.0,0.3287,0.1226,0.0572,0.2003,0.1783,0.0924,0.0204],"1Q":[0.0,0.2183,0.2983,0.0549,0.232,0.0846,0.096,0.016],"1Qs":[0.0,0.0105,0.2745,0.1379,0.3785,0.1682,0.0082,0.0222],"1E":[0.0,0.1084,0.1094,0.062,0.489,0.0663,0.1204,0.0445],"1Ur":[0.0,0.1284,0.0973,0.0656,0.3413,0.0978,0.2179,0.0517],"1Uh":[0.0,0.1458,0.1301,0.0532,0.3127,0.0723,0.2476,0.0383],"1T":[0.0,0.0751,0.1056,0.0598,0.4211,0.0471,0.1107,0.1807],"2R":[0.0,0.0056,0.0557,0.035,0.3232,0.5081,0.0119,0.0605],"2H":[0.0,0.3322,0.0731,0.0565,0.186,0.1243,0.206,0.0219],"2Q":[0.0,0.2561,0.0961,0.0634,0.2244,0.0961,0.2436,0.0203],"2Qs":[0.0,0.0077,0.1472,0.1639,0.3944,0.2458,0.0064,0.0346],"2E":[0.0,0.112,0.053,0.0531,0.5424,0.0667,0.1242,0.0486],"2Ur":[0.0,0.1423,0.0547,0.0452,0.3687,0.0972,0.2232,0.0687],"2Uh":[0.0,0.1455,0.0831,0.0519,0.3285,0.0653,0.2848,0.0408],"2T":[0.0,0.0896,0.0711,0.0593,0.4295,0.0448,0.0962,0.2095],"3R":[0.0,0.0021,0.083,0.0681,0.3603,0.434,0.0099,0.0426],"3H":[0.0,0.3406,0.1495,0.0615,0.205,0.1316,0.0972,0.0146],"3Q":[0.0,0.2546,0.2478,0.0468,0.2576,0.078,0.0966,0.0185],"3Qs":[0.0,0.0,0.2603,0.1423,0.4244,0.1295,0.0154,0.0282],"3E":[0.0,0.096,0.0875,0.0444,0.5416,0.0633,0.1198,0.0474],"3Ur":[0.0,0.1247,0.1037,0.0416,0.3604,0.0909,0.2182,0.0606],"3Uh":[0.0,0.1408,0.1189,0.0445,0.3366,0.0713,0.2532,0.0347],"3T":[0.0,0.0638,0.0897,0.0354,0.4534,0.0484,0.1287,0.1806],"4R":[0.0,0.003,0.0426,0.0405,0.2766,0.5623,0.0142,0.0608],"4H":[0.0,0.3492,0.0637,0.0559,0.2011,0.1466,0.1707,0.0127],"4Q":[0.0,0.2266,0.1159,0.0888,0.2837,0.0646,0.2036,0.0167],"4Qs":[0.0,0.0095,0.1317,0.1857,0.4111,0.2127,0.0206,0.0286],"4E":[0.0,0.0842,0.0469,0.065,0.5524,0.0675,0.1354,0.0486],"4Ur":[0.0,0.0739,0.0497,0.0643,0.3979,0.101,0.2438,0.0694],"4Uh":[0.0,0.1124,0.0663,0.0599,0.357,0.0751,0.2893,0.0401],"4T":[0.0,0.0649,0.0493,0.0493,0.476,0.0519,0.1141,0.1946]},"parker":{"1R":[0.0,0.0002,0.0964,0.0422,0.2015,0.5876,0.0177,0.0543],"1H":[0.0,0.4248,0.0533,0.02,0.2176,0.2385,0.04,0.0058],"1Q":[0.0,0.24,0.211,0.0202,0.3002,0.0939,0.0955,0.0391],"1Qs":[0.0,0.0091,0.2123,0.1602,0.3745,0.211,0.0084,0.0245],"1E":[0.0,0.1066,0.0739,0.0555,0.5453,0.0622,0.1192,0.0373],"1Ur":[0.0,0.1055,0.1175,0.036,0.4616,0.0478,0.1731,0.0585],"1Uh":[0.0,0.0795,0.1151,0.0365,0.422,0.028,0.2669,0.052],"1T":[0.0,0.0144,0.0845,0.0337,0.5476,0.0638,0.0723,0.1837],"2R":[0.0,0.0008,0.0188,0.0296,0.2921,0.5937,0.0016,0.0635],"2H":[0.0,0.1919,0.0505,0.0257,0.3257,0.1833,0.1697,0.0533],"2Q":[0.0,0.2732,0.1227,0.0234,0.3059,0.1376,0.1323,0.0049],"2Qs":[0.0,0.0023,0.1217,0.1266,0.4624,0.2618,0.0084,0.0167],"2E":[0.0,0.1178,0.0255,0.0349,0.5618,0.0805,0.1385,0.0411],"2Ur":[0.0,0.0567,0.0742,0.0144,0.4127,0.0714,0.2667,0.1039],"2Uh":[0.0,0.121,0.0818,0.0776,0.3755,0.0396,0.2487,0.0558],"2T":[0.0,0.0531,0.0952,0.1116,0.4977,0.0579,0.095,0.0896],"3R":[0.0,0.0003,0.0486,0.0242,0.4001,0.5047,0.0038,0.0182],"3H":[0.0,0.4157,0.0751,0.0475,0.1884,0.1366,0.132,0.0046],"3Q":[0.0,0.3606,0.1393,0.0309,0.3578,0.027,0.082,0.0025],"3Qs":[0.0,0.0,0.215,0.1526,0.4224,0.1488,0.0184,0.0429],"3E":[0.0,0.1105,0.088,0.041,0.5542,0.0589,0.1006,0.0467],"3Ur":[0.0,0.074,0.0932,0.0383,0.4677,0.0629,0.1788,0.085],"3Uh":[0.0,0.1225,0.1143,0.0414,0.3705,0.0699,0.2111,0.0702],"3T":[0.0,0.0474,0.1889,0.0324,0.5364,0.0453,0.0734,0.0762],"4R":[0.0,0.0004,0.0087,0.0201,0.2426,0.6794,0.0377,0.0111],"4H":[0.0,0.3434,0.0423,0.0481,0.1826,0.2107,0.1689,0.004],"4Q":[0.0,0.3257,0.0715,0.0676,0.2482,0.0646,0.197,0.0254],"4Qs":[0.0,0.0028,0.0815,0.1188,0.456,0.2979,0.0132,0.0298],"4E":[0.0,0.1106,0.044,0.0485,0.5428,0.06,0.146,0.0482],"4Ur":[0.0,0.0349,0.0643,0.0506,0.4952,0.0518,0.2266,0.0765],"4Uh":[0.0,0.0754,0.1009,0.0234,0.3883,0.0636,0.324,0.0245],"4T":[0.0,0.0221,0.0467,0.0234,0.6787,0.0504,0.0455,0.1332]},"cbrown":{"1R":[0.0,0.001,0.0941,0.0177,0.1972,0.6475,0.0021,0.0405],"1H":[0.0,0.2671,0.0489,0.032,0.2382,0.2862,0.118,0.0097],"1Q":[0.0,0.2248,0.3454,0.061,0.2027,0.0697,0.088,0.0084],"1Qs":[0.0,0.0032,0.2729,0.0532,0.3352,0.3204,0.0047,0.0103],"1E":[0.0,0.067,0.132,0.0525,0.5009,0.057,0.1203,0.0703],"1Ur":[0.0,0.0511,0.1335,0.0729,0.441,0.1059,0.1566,0.0391],"1Uh":[0.0,0.0921,0.098,0.0464,0.2541,0.0445,0.4398,0.025],"1T":[0.0,0.1553,0.1025,0.0632,0.3971,0.0852,0.0857,0.1109],"2R":[0.0,0.0017,0.0219,0.0143,0.304,0.594,0.0083,0.0557],"2H":[0.0,0.2861,0.0918,0.0468,0.1854,0.1471,0.2138,0.029],"2Q":[0.0,0.159,0.0803,0.0714,0.2875,0.1059,0.2537,0.0422],"2Qs":[0.0,0.0023,0.1828,0.1285,0.3696,0.2625,0.0104,0.044],"2E":[0.0,0.0948,0.0353,0.0334,0.5678,0.0701,0.133,0.0655],"2Ur":[0.0,0.0725,0.0408,0.0355,0.4267,0.0906,0.2579,0.0759],"2Uh":[0.0,0.1232,0.0735,0.0409,0.3437,0.0748,0.3065,0.0375],"2T":[0.0,0.0512,0.056,0.0807,0.5551,0.0452,0.1075,0.1044],"3R":[0.0,0.0014,0.034,0.0211,0.3046,0.5774,0.0057,0.0559],"3H":[0.0,0.2944,0.099,0.1301,0.1896,0.1636,0.1157,0.0077],"3Q":[0.0,0.2974,0.2761,0.044,0.2049,0.0669,0.0861,0.0246],"3Qs":[0.0,0.0,0.2898,0.1129,0.3889,0.16,0.0299,0.0185],"3E":[0.0,0.0609,0.0719,0.0403,0.5934,0.0822,0.1071,0.0443],"3Ur":[0.0,0.0879,0.1079,0.0304,0.3424,0.101,0.2963,0.0342],"3Uh":[0.0,0.0903,0.1174,0.029,0.3452,0.0652,0.3318,0.0211],"3T":[0.0,0.0526,0.046,0.0076,0.5336,0.0533,0.2332,0.0738],"4R":[0.0,0.0004,0.0255,0.1091,0.175,0.6509,0.008,0.031],"4H":[0.0,0.3353,0.0722,0.0539,0.1768,0.1421,0.1972,0.0224],"4Q":[0.0,0.2986,0.1193,0.1851,0.1396,0.0569,0.1604,0.0402],"4Qs":[0.0,0.0028,0.1469,0.15,0.4643,0.1771,0.0188,0.0402],"4E":[0.0,0.0872,0.0251,0.0564,0.6155,0.0561,0.1051,0.0544],"4Ur":[0.0,0.0947,0.0374,0.043,0.4532,0.0415,0.2696,0.0605],"4Uh":[0.0,0.0895,0.0458,0.0485,0.3783,0.0566,0.3405,0.0408],"4T":[0.0,0.0825,0.0398,0.0356,0.4951,0.0406,0.1139,0.1925]},"rollins":{"1R":[0.0,0.0009,0.0843,0.017,0.2086,0.6353,0.017,0.0368],"1H":[0.0,0.2719,0.1239,0.1075,0.2175,0.1756,0.0946,0.009],"1Q":[0.0,0.2244,0.3428,0.0606,0.2043,0.0705,0.0885,0.0089],"1Qs":[0.0,0.0072,0.2675,0.1171,0.3397,0.2359,0.0102,0.0224],"1E":[0.0,0.0777,0.0774,0.0891,0.5321,0.0482,0.1281,0.0474],"1Ur":[0.0,0.0862,0.1038,0.0863,0.3116,0.0787,0.278,0.0554],"1Uh":[0.0,0.0634,0.1237,0.0547,0.3005,0.1245,0.304,0.0292],"1T":[0.0,0.0328,0.0735,0.0978,0.3764,0.0233,0.1189,0.2772],"2R":[0.0,0.0017,0.038,0.0308,0.2578,0.6162,0.0076,0.0479],"2H":[0.0,0.2887,0.0908,0.0473,0.1854,0.1458,0.2134,0.0286],"2Q":[0.0,0.2402,0.2629,0.0992,0.1591,0.0705,0.131,0.0371],"2Qs":[0.0,0.0011,0.1294,0.1858,0.4447,0.19,0.0043,0.0446],"2E":[0.0,0.1179,0.0381,0.0525,0.5404,0.0913,0.1245,0.0353],"2Ur":[0.0,0.1171,0.0692,0.0504,0.3794,0.1261,0.1872,0.0707],"2Uh":[0.0,0.1209,0.0866,0.0968,0.3041,0.0785,0.2658,0.0473],"2T":[0.0,0.0485,0.0572,0.0458,0.4859,0.0335,0.1028,0.2262],"3R":[0.0,0.0012,0.0441,0.0446,0.2958,0.5419,0.0174,0.055],"3H":[0.0,0.3981,0.1229,0.0621,0.2081,0.1234,0.0783,0.0071],"3Q":[0.0,0.3954,0.2521,0.0525,0.1563,0.0289,0.1044,0.0104],"3Qs":[0.0,0.0,0.2882,0.1146,0.3908,0.1583,0.0291,0.019],"3E":[0.0,0.102,0.068,0.0481,0.5523,0.0664,0.1261,0.037],"3Ur":[0.0,0.0805,0.1443,0.0511,0.3226,0.138,0.2086,0.0549],"3Uh":[0.0,0.1298,0.093,0.0764,0.3341,0.068,0.2676,0.0311],"3T":[0.0,0.0531,0.0994,0.0176,0.4787,0.0538,0.1356,0.1617],"4R":[0.0,0.0004,0.0235,0.0627,0.2739,0.5829,0.0074,0.0492],"4H":[0.0,0.4297,0.0546,0.0231,0.1954,0.1324,0.1553,0.0094],"4Q":[0.0,0.3268,0.1616,0.1437,0.1566,0.0267,0.1739,0.0108],"4Qs":[0.0,0.0032,0.146,0.152,0.4614,0.179,0.0189,0.0395],"4E":[0.0,0.1015,0.0376,0.0502,0.5548,0.061,0.1185,0.0763],"4Ur":[0.0,0.0472,0.0651,0.0811,0.4434,0.0713,0.2398,0.0521],"4Uh":[0.0,0.1862,0.0775,0.0629,0.2828,0.0462,0.3131,0.0313],"4T":[0.0,0.0815,0.0404,0.0364,0.494,0.0412,0.1139,0.1926]},"dgordon":{"1R":[0.0,0.0079,0.074,0.031,0.2985,0.537,0.002,0.0496],"1H":[0.0,0.226,0.068,0.0515,0.1865,0.3834,0.0647,0.02],"1Q":[0.0,0.2244,0.3428,0.0606,0.2043,0.0705,0.0885,0.0089],"1Qs":[0.0,0.0031,0.2827,0.0502,0.28,0.3364,0.0044,0.0432],"1E":[0.0,0.1138,0.1445,0.0775,0.4229,0.0656,0.109,0.0667],"1Ur":[0.0,0.1184,0.117,0.0643,0.3336,0.0934,0.2208,0.0524],"1Uh":[0.0,0.1282,0.1773,0.0439,0.3009,0.0669,0.264,0.0188],"1T":[0.0,0.1042,0.1114,0.0663,0.4426,0.0769,0.0695,0.1291],"2R":[0.0,0.0121,0.031,0.0135,0.3548,0.4777,0.018,0.093],"2H":[0.0,0.2694,0.0389,0.0203,0.2363,0.141,0.2595,0.0347],"2Q":[0.0,0.2261,0.0969,0.06,0.1601,0.1111,0.3164,0.0294],"2Qs":[0.0,0.0011,0.2514,0.1056,0.3081,0.2363,0.0043,0.0931],"2E":[0.0,0.1098,0.0447,0.0527,0.5159,0.0842,0.1293,0.0634],"2Ur":[0.0,0.1266,0.0387,0.0395,0.3375,0.1217,0.2676,0.0685],"2Uh":[0.0,0.1295,0.093,0.0548,0.2485,0.0937,0.3554,0.0252],"2T":[0.0,0.0419,0.0457,0.0196,0.568,0.0355,0.0864,0.2028],"3R":[0.0,0.0012,0.0319,0.0202,0.3785,0.4072,0.0052,0.1557],"3H":[0.0,0.3619,0.0774,0.076,0.2637,0.0779,0.1215,0.0218],"3Q":[0.0,0.4341,0.1836,0.0409,0.2209,0.0509,0.0591,0.0104],"3Qs":[0.0,0.0,0.314,0.0809,0.4532,0.1313,0.0125,0.0081],"3E":[0.0,0.0902,0.0732,0.0708,0.4969,0.0842,0.1045,0.0802],"3Ur":[0.0,0.0804,0.1346,0.0301,0.3428,0.1283,0.2569,0.0269],"3Uh":[0.0,0.1145,0.1439,0.038,0.2794,0.0626,0.3306,0.0308],"3T":[0.0,0.0382,0.1198,0.023,0.5295,0.054,0.1353,0.1002],"4R":[0.0,0.0004,0.0235,0.0219,0.3147,0.5421,0.0074,0.09],"4H":[0.0,0.3113,0.0308,0.0371,0.1461,0.2422,0.2093,0.0233],"4Q":[0.0,0.2008,0.0792,0.0614,0.2556,0.0698,0.3116,0.0216],"4Qs":[0.0,0.0014,0.1145,0.1431,0.5354,0.1806,0.0081,0.0169],"4E":[0.0,0.1217,0.0434,0.0509,0.4851,0.0797,0.156,0.0632],"4Ur":[0.0,0.1148,0.0555,0.0272,0.3316,0.0613,0.3229,0.0865],"4Uh":[0.0,0.147,0.0568,0.0829,0.309,0.083,0.2949,0.0264],"4T":[0.0,0.1021,0.0341,0.0324,0.447,0.0345,0.1497,0.2002]},"baker":{"1R":[0.0,0.0002,0.1172,0.1172,0.2135,0.5354,0.0022,0.0144],"1H":[0.0,0.2982,0.198,0.0559,0.1563,0.1358,0.1197,0.0361],"1Q":[0.0,0.1861,0.4246,0.0528,0.1392,0.0711,0.1183,0.0078],"1Qs":[0.0,0.0053,0.3739,0.1188,0.3853,0.1087,0.0011,0.0068],"1E":[0.0,0.1801,0.109,0.061,0.4901,0.0637,0.0808,0.0153],"1Ur":[0.0,0.2325,0.1503,0.0467,0.3021,0.0849,0.1641,0.0193],"1Uh":[0.0,0.3262,0.086,0.0945,0.2324,0.073,0.1739,0.014],"1T":[0.0,0.0658,0.1752,0.0618,0.424,0.0216,0.0936,0.1581],"2R":[0.0,0.0015,0.028,0.0181,0.3425,0.5599,0.0076,0.0425],"2H":[0.0,0.2976,0.0455,0.0929,0.2754,0.0802,0.1898,0.0186],"2Q":[0.0,0.2654,0.0988,0.0711,0.1941,0.0529,0.313,0.0047],"2Qs":[0.0,0.0037,0.1937,0.1232,0.3901,0.2704,0.0008,0.018],"2E":[0.0,0.091,0.0531,0.0718,0.6399,0.0419,0.0796,0.0227],"2Ur":[0.0,0.1523,0.0349,0.076,0.4058,0.1398,0.1609,0.0304],"2Uh":[0.0,0.2412,0.0692,0.0252,0.3217,0.0597,0.2719,0.0109],"2T":[0.0,0.0566,0.0737,0.0596,0.4869,0.0448,0.1023,0.1761],"3R":[0.0,0.0021,0.1271,0.0682,0.2907,0.4924,0.0049,0.0146],"3H":[0.0,0.311,0.2216,0.1035,0.2188,0.0848,0.0552,0.005],"3Q":[0.0,0.2714,0.3042,0.0206,0.2747,0.0479,0.0416,0.0396],"3Qs":[0.0,0.0,0.2957,0.1371,0.4441,0.0895,0.0041,0.0296],"3E":[0.0,0.1894,0.0543,0.0522,0.5276,0.0504,0.1003,0.0258],"3Ur":[0.0,0.2039,0.066,0.0666,0.3648,0.0523,0.2146,0.0318],"3Uh":[0.0,0.29,0.1288,0.082,0.2541,0.081,0.1512,0.013],"3T":[0.0,0.0799,0.0868,0.0725,0.4457,0.0759,0.0759,0.1633],"4R":[0.0,0.007,0.0174,0.0416,0.2462,0.6,0.0099,0.0779],"4H":[0.0,0.2548,0.0589,0.0735,0.2741,0.1317,0.1918,0.0153],"4Q":[0.0,0.2445,0.1003,0.1085,0.3015,0.0374,0.2029,0.005],"4Qs":[0.0,0.0395,0.1196,0.1689,0.3639,0.2569,0.041,0.0102],"4E":[0.0,0.0818,0.0274,0.0796,0.6575,0.0541,0.0758,0.0238],"4Ur":[0.0,0.0891,0.0965,0.0837,0.4396,0.0382,0.2243,0.0285],"4Uh":[0.0,0.0851,0.0965,0.0858,0.3747,0.0947,0.2482,0.015],"4T":[0.0,0.0462,0.0808,0.0808,0.4743,0.0621,0.0882,0.1676]},"getz":{"1R":[0.0,0.0002,0.071,0.1669,0.2077,0.5379,0.002,0.0142],"1H":[0.0,0.3253,0.1653,0.0665,0.1782,0.1369,0.1017,0.0259],"1Q":[0.0,0.2407,0.3097,0.0389,0.2163,0.0761,0.1022,0.0161],"1Qs":[0.0,0.005,0.3267,0.0637,0.4066,0.1903,0.0011,0.0066],"1E":[0.0,0.098,0.1302,0.0375,0.5424,0.0455,0.1099,0.0365],"1Ur":[0.0,0.2428,0.0825,0.0462,0.2768,0.1283,0.1828,0.0405],"1Uh":[0.0,0.1437,0.1895,0.0662,0.3259,0.0988,0.1625,0.0134],"1T":[0.0,0.1385,0.1332,0.0824,0.3569,0.0104,0.0433,0.2352],"2R":[0.0,0.0016,0.0292,0.0188,0.3417,0.5577,0.0077,0.0433],"2H":[0.0,0.1884,0.069,0.1613,0.2492,0.1953,0.1063,0.0305],"2Q":[0.0,0.2927,0.0496,0.0634,0.2461,0.0872,0.2564,0.0047],"2Qs":[0.0,0.0076,0.1182,0.1819,0.4475,0.206,0.0019,0.0369],"2E":[0.0,0.14,0.054,0.0419,0.6021,0.0559,0.0791,0.027],"2Ur":[0.0,0.1911,0.0314,0.0374,0.3152,0.1505,0.1887,0.0857],"2Uh":[0.0,0.233,0.0384,0.0238,0.3541,0.1,0.2165,0.0342],"2T":[0.0,0.058,0.0736,0.0596,0.4845,0.0448,0.1021,0.1775],"3R":[0.0,0.0019,0.0824,0.0804,0.3139,0.4811,0.0046,0.0356],"3H":[0.0,0.2467,0.156,0.1199,0.2874,0.1479,0.0373,0.0048],"3Q":[0.0,0.2643,0.2164,0.0425,0.2709,0.0975,0.0858,0.0227],"3Qs":[0.0,0.0,0.2942,0.1374,0.4432,0.0912,0.0045,0.0295],"3E":[0.0,0.1014,0.0752,0.0308,0.6549,0.0281,0.0948,0.0149],"3Ur":[0.0,0.13,0.0754,0.0538,0.2901,0.1151,0.2185,0.1171],"3Uh":[0.0,0.1986,0.1058,0.0413,0.3621,0.0753,0.2046,0.0124],"3T":[0.0,0.0793,0.0869,0.0709,0.446,0.0747,0.0782,0.164],"4R":[0.0,0.0031,0.0085,0.0191,0.1909,0.6868,0.0046,0.0869],"4H":[0.0,0.3022,0.0534,0.0833,0.1773,0.2228,0.1558,0.0052],"4Q":[0.0,0.2342,0.0848,0.1956,0.2745,0.0766,0.1295,0.0049],"4Qs":[0.0,0.0221,0.1286,0.2279,0.3968,0.178,0.0253,0.0213],"4E":[0.0,0.0812,0.0337,0.0707,0.5598,0.0975,0.0941,0.0629],"4Ur":[0.0,0.0378,0.0219,0.0563,0.3958,0.1069,0.2836,0.0976],"4Uh":[0.0,0.0791,0.0884,0.0529,0.3969,0.1128,0.2041,0.0658],"4T":[0.0,0.047,0.0795,0.0795,0.4744,0.0617,0.0893,0.1687]},"miles":{"1R":[0.0,0.0009,0.1167,0.07,0.1978,0.5872,0.0018,0.0257],"1H":[0.0,0.3822,0.1502,0.0659,0.1781,0.1567,0.0586,0.0083],"1Q":[0.0,0.1984,0.4183,0.0604,0.1456,0.0741,0.0994,0.0037],"1Qs":[0.0,0.0254,0.3413,0.1253,0.2697,0.2031,0.0152,0.02],"1E":[0.0,0.1471,0.1194,0.0658,0.4357,0.0728,0.1202,0.0389],"1Ur":[0.0,0.1578,0.1072,0.0914,0.2667,0.1102,0.2505,0.0162],"1Uh":[0.0,0.2026,0.1329,0.0552,0.2586,0.0769,0.2609,0.0129],"1T":[0.0,0.1059,0.075,0.0278,0.2746,0.097,0.1609,0.2589],"2R":[0.0,0.0016,0.0817,0.1062,0.3319,0.419,0.0068,0.0528],"2H":[0.0,0.3893,0.1181,0.0636,0.1369,0.1015,0.1732,0.0174],"2Q":[0.0,0.2483,0.1002,0.0611,0.1678,0.1036,0.302,0.0169],"2Qs":[0.0,0.0153,0.338,0.1934,0.2596,0.1589,0.018,0.0169],"2E":[0.0,0.1212,0.0569,0.0591,0.5398,0.0735,0.1162,0.0333],"2Ur":[0.0,0.09,0.0905,0.0861,0.3005,0.1046,0.2866,0.0417],"2Uh":[0.0,0.134,0.1016,0.0759,0.2681,0.1014,0.2822,0.0368],"2T":[0.0,0.0516,0.0583,0.0469,0.4815,0.0344,0.1023,0.225],"3R":[0.0,0.0011,0.0947,0.1235,0.3467,0.3992,0.0113,0.0235],"3H":[0.0,0.2988,0.2454,0.1156,0.1457,0.0721,0.1088,0.0137],"3Q":[0.0,0.3225,0.3315,0.0424,0.1498,0.0684,0.0677,0.0177],"3Qs":[0.0,0.0,0.3179,0.1144,0.3602,0.1495,0.0306,0.0273],"3E":[0.0,0.0936,0.1173,0.0435,0.5137,0.07,0.127,0.0349],"3Ur":[0.0,0.1445,0.1077,0.0421,0.2928,0.1156,0.2444,0.0528],"3Uh":[0.0,0.1625,0.1301,0.0412,0.2824,0.0838,0.2745,0.0254],"3T":[0.0,0.0591,0.0768,0.0075,0.4908,0.0968,0.129,0.14],"4R":[0.0,0.0005,0.0874,0.0638,0.2785,0.5147,0.0288,0.0263],"4H":[0.0,0.3768,0.0831,0.1,0.1575,0.1113,0.163,0.0083],"4Q":[0.0,0.2049,0.1923,0.1194,0.1803,0.0401,0.2533,0.0096],"4Qs":[0.0,0.0014,0.2436,0.2163,0.3512,0.1492,0.0075,0.0308],"4E":[0.0,0.1036,0.0383,0.0647,0.5311,0.0751,0.1528,0.0344],"4Ur":[0.0,0.0836,0.0562,0.1405,0.3361,0.0938,0.2402,0.0497],"4Uh":[0.0,0.1598,0.0562,0.0954,0.3054,0.0834,0.28,0.0198],"4T":[0.0,0.0316,0.0465,0.0753,0.2547,0.1075,0.1964,0.2881]},"lyoung":{"1R":[0.0,0.0002,0.2075,0.0191,0.2344,0.4895,0.0051,0.0441],"1H":[0.0,0.2596,0.1791,0.1038,0.1963,0.1592,0.0776,0.0245],"1Q":[0.0,0.1962,0.2699,0.0877,0.2484,0.0861,0.1055,0.0062],"1Qs":[0.0,0.0076,0.4058,0.0689,0.4343,0.0414,0.0358,0.0061],"1E":[0.0,0.1196,0.129,0.0307,0.5029,0.0306,0.1558,0.0315],"1Ur":[0.0,0.1808,0.0881,0.0388,0.3549,0.0791,0.2213,0.0369],"1Uh":[0.0,0.2945,0.144,0.0418,0.2655,0.0488,0.1755,0.0299],"1T":[0.0,0.0956,0.1561,0.047,0.3885,0.0506,0.1061,0.156],"2R":[0.0,0.0008,0.1015,0.0125,0.2216,0.603,0.0036,0.0571],"2H":[0.0,0.2325,0.0681,0.056,0.193,0.1076,0.3197,0.0231],"2Q":[0.0,0.2575,0.0842,0.0364,0.2093,0.0788,0.3209,0.0128],"2Qs":[0.0,0.0181,0.1543,0.1989,0.4015,0.1992,0.0019,0.0261],"2E":[0.0,0.1876,0.0713,0.0537,0.4458,0.0422,0.1714,0.028],"2Ur":[0.0,0.1316,0.1061,0.0198,0.4573,0.0539,0.2045,0.0267],"2Uh":[0.0,0.2688,0.1379,0.0191,0.2665,0.0396,0.2329,0.0351],"2T":[0.0,0.0679,0.1538,0.1088,0.3588,0.0713,0.0781,0.1613],"3R":[0.0,0.0006,0.0659,0.0431,0.3505,0.469,0.0122,0.0587],"3H":[0.0,0.2554,0.1839,0.0643,0.2695,0.1197,0.0994,0.0079],"3Q":[0.0,0.2903,0.3318,0.0199,0.1987,0.0326,0.1209,0.0059],"3Qs":[0.0,0.0,0.3264,0.1543,0.3997,0.0943,0.0045,0.0208],"3E":[0.0,0.1517,0.1015,0.0277,0.534,0.04,0.1098,0.0353],"3Ur":[0.0,0.1544,0.1707,0.0524,0.3137,0.0713,0.2034,0.0342],"3Uh":[0.0,0.2022,0.1821,0.038,0.354,0.0341,0.1565,0.0331],"3T":[0.0,0.107,0.0943,0.0444,0.4252,0.0346,0.1533,0.1413],"4R":[0.0,0.0004,0.082,0.0129,0.1854,0.6844,0.0019,0.033],"4H":[0.0,0.3347,0.0648,0.0423,0.1445,0.1665,0.2438,0.0034],"4Q":[0.0,0.2464,0.0732,0.067,0.2632,0.0813,0.244,0.0249],"4Qs":[0.0,0.0129,0.1396,0.2059,0.4335,0.1634,0.0262,0.0185],"4E":[0.0,0.1304,0.0618,0.0717,0.4563,0.0585,0.1813,0.0399],"4Ur":[0.0,0.0392,0.119,0.0543,0.4255,0.0321,0.2929,0.037],"4Uh":[0.0,0.1761,0.0688,0.0946,0.2695,0.0507,0.3015,0.0389],"4T":[0.0,0.0619,0.0858,0.0501,0.4608,0.0723,0.1405,0.1285]}},"first":{"1":[0.0,0.0018,0.0997,0.0627,0.2706,0.498,0.0045,0.0627],"2":[0.0,0.0056,0.0557,0.035,0.3232,0.508,0.0119,0.0605],"3":[0.0,0.0021,0.083,0.0681,0.3603,0.434,0.0099,0.0426],"4":[0.0,0.003,0.0426,0.0405,0.2766,0.5623,0.0142,0.0608]},"lastLen":[0.6183,0.2261,0.0783,0.047,0.0111,0.0078,0.0023,0.0089]};

/* ── 릭 사전 v0.40 — 한 마디 길이 릭(리듬 포함) + 다음 코드 착지 ─────────────────
   CURATED_CELLS(4음 셀)보다 긴 어휘. 리듬까지 통째로 넣고, 다음 마디 첫 박에 해결음을 둔다.
   · 4/4 한 마디(24틱) 전용. n=[[틱 위치, 길이(틱), 음]], 음 = Ⅴ 코드 뿌리 기준 반음(악보에 적힌 옥타브 관계 그대로).
   · to = 착지 코드 종류(maj·min), tr = 뿌리 이동(5 = 4도 위 = Ⅴ→Ⅰ), t = 착지음(Ⅴ 뿌리 기준 반음)
   · v0.49 to·tr·t 가 null 이면 '코드 릭' — 그 마디 코드 위에서만 쓰고 다음 마디 착지음을 두지 않는다
   · v0.60 nx = 착지음 뒤 착지 마디에서 이어지는 음, w = 뽑힐 무게(없으면 1)
   · 출처를 꼭 적는다. 특정 녹음 전사·원곡 멜로디는 넣지 않는다(AGENTS.md 법적 선). */
'use strict';
const CURATED_LICKS=[
  /* 2026-11-11 사용자 제공 악보(시벨리우스 MusicXML, C7♭5 → Fmaj7) — 얼터드 스케일 릭 3종. "Ⅴ→Ⅰ 해결 때 쓰면 좋다" */
  {id:'alt1',src:'사용자 제공',cls:['dom','domalt'],to:['maj','min'],tr:5,
   n:[[0,3,3],[3,3,1],[6,3,0],[9,3,-2],[12,3,-4],[15,3,-8],[18,3,-9],[21,3,-11]],t:-12,
   name:'얼터드 하행 ♯9-♭9-1-♭7-♭13-3-♯9-♭9 → Ⅰ의 5음'},
  {id:'alt2',src:'사용자 제공',cls:['dom','domalt'],to:['maj'],tr:5,minDiff:3,   /* 셋잇단 — 난이도 2는 셋잇단 금지 */
   n:[[3,3,1],[6,2,0],[8,2,-4],[10,2,-8],[12,3,3],[15,3,1],[18,3,0],[21,3,-2]],t:-3,
   name:'얼터드 셋잇단 ♭9-(1-♭13-3)-♯9-♭9-1-♭7 → Ⅰ의 3음'},
  {id:'alt3',src:'사용자 제공',cls:['dom','domalt'],to:['maj'],tr:5,
   n:[[0,3,3],[3,3,1],[6,3,0],[9,3,-4],[12,3,-8],[15,3,-2],[18,3,-5],[21,3,-4]],t:-3,
   name:'얼터드 ♯9-♭9-1-♭13-3-♭7-5-♭13 → Ⅰ의 3음(반음 접근)'},
  /* ── v0.49 코드 릭 — 해결 없이 한 코드 한 마디 위에서 쓰는 릭. to·tr·t = null(착지음 없음), 음 = 그 코드 뿌리 기준 반음.
     2026-11-13 사용자 제공 악보(시벨리우스 MusicXML, "문득 떠오른 릭 아이디어") — D / Dm 한 마디씩 */
  {id:'chA',src:'사용자 제공 2026-11-13',cls:['maj','dom'],to:null,tr:null,t:null,
   n:[[0,3,0],[3,3,4],[6,3,7],[9,6,9],[15,9,7]],
   name:'1-3-5-6 꾸밈 후 5음에 머묾'},
  {id:'chAm',src:'사용자 제공 2026-11-13',cls:['min'],to:null,tr:null,t:null,
   n:[[0,3,0],[3,3,3],[6,3,7],[9,6,9],[15,9,12]],
   name:'1-♭3-5-6 → 옥타브 위 1음(도리안)'},
  {id:'chB',src:'사용자 제공 2026-11-13',cls:['maj'],to:null,tr:null,t:null,minDiff:3,   /* 셋잇단 */
   n:[0,6].flatMap(b=>[[b,2,5],[b+2,2,4],[b+4,2,4]]).concat([[12,3,7],[15,3,9],[18,6,7]]),   /* v0.60 첫 음이 꾸밈(4), 뒤 두 음이 코드톤(3) · v0.61 셋잇단은 연달아 두 묶음까지(사용자 규칙) — 3·4박은 5-6-5 */
   name:'셋잇단 4-3-3 두 번 → 5-6-5'},
  {id:'chBm',src:'사용자 제공 2026-11-13',cls:['min'],to:null,tr:null,t:null,minDiff:3,
   n:[0,6].flatMap(b=>[[b,2,5],[b+2,2,3],[b+4,2,3]]).concat([[12,3,7],[15,3,10],[18,6,7]]),   /* v0.60 첫 음 4(마이너 펜타), 뒤 두 음 ♭3 · v0.61 두 묶음 뒤 5-♭7-5 */
   name:'셋잇단 4-♭3-♭3 두 번 → 5-♭7-5'},
  /* ── v0.60 2026-11-13 사용자 제공(채팅 음 이름 「CC B♭B♭ GG FD | F D FG」, C7 → F 기준) — Ⅳ 메이저 펜타(B♭ C D F G)를 두 번씩 짚으며 내려와 Ⅰ에서 1-6-1-2.
     nx = 착지음 뒤 착지 마디에서 이어지는 음([틱, 길이, Ⅴ 뿌리 기준 반음]) */
  {id:'pentDbl',src:'사용자 제공 2026-11-13',cls:['dom'],to:['maj'],tr:5,w:3,   /* 착지 뒤 자리가 비어야 해서 덜 뽑히므로 무게 3 */
   n:[[0,3,0],[3,3,0],[6,3,-2],[9,3,-2],[12,3,-5],[15,3,-5],[18,3,-7],[21,3,-10]],t:-7,
   nx:[[3,3,-10],[6,3,-7],[9,3,-5]],
   name:'Ⅳ 펜타 두 번씩 하행(5-5-4-4-2-2-1-6) → Ⅰ에서 1-6-1-2'}
];
/* LICKS66> v0.66.3 재즈 교육 공통 어휘 — tools/licks_src.js 에서 만든다(여기서 직접 고치지 말 것). v:66 = '선율 다듬기'를 끄면 쓰지 않는다 */
CURATED_LICKS.push(
{"id":"bb1","v":66,"src":"재즈 교육 공통 어휘","cls":["dom"],"to":["maj","dom"],"tr":5,"n":[[0,3,12],[3,3,11],[6,3,10],[9,3,9],[12,3,7],[15,3,5],[18,3,4],[21,3,2]],"t":0,"name":"비밥 스케일 하행 1-7-♭7-6-5-4-3-2 → Ⅰ의 5음","w":0.5},
{"id":"bb2","v":66,"src":"재즈 교육 공통 어휘","cls":["dom"],"to":["maj","dom"],"tr":5,"n":[[0,3,16],[3,3,14],[6,3,12],[9,3,11],[12,3,10],[15,3,9],[18,3,7],[21,3,10]],"t":9,"name":"3음부터 비밥 스케일 하행, 5-♭7로 감싸 → Ⅰ의 3음","w":0.5},
{"id":"bb5","v":66,"src":"재즈 교육 공통 어휘","cls":["dom"],"to":["maj","dom"],"tr":5,"n":[[0,3,4],[3,3,7],[6,3,10],[9,3,14],[12,3,12],[15,3,10],[18,3,9],[21,3,7]],"t":5,"name":"3-5-♭7-9 올라 순차 하행 → Ⅰ의 1음","w":0.5},
{"id":"gt1","v":66,"src":"재즈 교육 공통 어휘","cls":["dom"],"to":["maj","dom"],"tr":5,"n":[[0,3,4],[3,3,7],[6,3,10],[9,3,14],[12,3,12],[15,3,10],[18,3,7],[21,3,10]],"t":9,"name":"3-5-♭7-9 올라 1-♭7-5-♭7 → Ⅰ의 3음 (7→3 해결)","w":0.5},
{"id":"gt2","v":66,"src":"재즈 교육 공통 어휘","cls":["dom"],"to":["maj","dom"],"tr":5,"n":[[0,3,12],[3,3,11],[6,3,10],[9,3,9],[12,3,7],[15,3,4],[18,3,7],[21,3,10]],"t":9,"name":"비밥 하행 1-7-♭7-6-5 뒤 3-5-♭7 → Ⅰ의 3음","w":0.5},
{"id":"dg1","v":66,"src":"재즈 교육 공통 어휘","cls":["dom"],"to":["maj","dom"],"tr":5,"n":[[0,3,0],[3,3,2],[6,3,4],[9,3,7],[12,3,10],[15,3,14],[18,3,12],[21,3,10]],"t":9,"name":"1-2-3-5-♭7-9 올라 1-♭7 → Ⅰ의 3음","w":0.5},
{"id":"sc1","v":66,"src":"재즈 교육 공통 어휘","cls":["dom"],"to":["maj","dom"],"tr":5,"n":[[0,3,19],[3,3,17],[6,3,16],[9,3,14],[12,3,12],[15,3,16],[18,3,19],[21,3,22]],"t":21,"name":"5음에서 순차 하행 뒤 1-3-5-♭7 아르페지오 → Ⅰ의 3음","w":0.5},
{"id":"tr1","v":66,"src":"재즈 교육 공통 어휘","cls":["dom"],"to":["maj","dom"],"tr":5,"n":[[0,6,19],[6,2,17],[8,2,19],[10,2,17],[12,3,16],[15,3,14],[18,3,12],[21,3,10]],"t":9,"name":"5음 길게 · 셋잇단 꾸밈 4-5-4 · 3-2-1-♭7 → Ⅰ의 3음","w":0.5},
{"id":"ob1","v":66,"src":"재즈 교육 공통 어휘","cls":["dom"],"to":["maj","dom"],"tr":5,"n":[[3,3,4],[6,3,7],[9,3,10],[12,3,14],[15,3,12],[18,3,10],[21,3,7]],"t":9,"name":"쉼표 뒤 3-5-♭7-9, 1-♭7-5로 감싸 → Ⅰ의 3음","w":0.5},
{"id":"bb3","v":66,"src":"재즈 교육 공통 어휘","cls":["dom","domalt"],"to":["maj"],"tr":5,"n":[[0,3,7],[3,3,5],[6,3,4],[9,3,7],[12,3,10],[15,3,13],[18,3,12],[21,3,10]],"t":9,"name":"5-4-3 하행 뒤 3→♭9 아르페지오, 1-♭7 → Ⅰ의 3음","w":0.45,"dm":3,"alt":1},
{"id":"bb4","v":66,"src":"재즈 교육 공통 어휘","cls":["dom"],"to":["maj"],"tr":5,"n":[[0,2,4],[2,2,7],[4,2,10],[6,3,13],[9,3,12],[12,3,10],[15,3,9],[18,3,7],[21,3,4]],"t":5,"name":"셋잇단 3-5-♭7 → ♭9, 순차 하행, 5-3으로 감싸 → Ⅰ의 1음","w":0.45,"dm":3,"alt":1},
{"id":"hm3M","v":66,"src":"재즈 교육 공통 어휘","cls":["dom","domalt"],"to":["maj"],"tr":5,"n":[[0,3,0],[3,3,1],[6,3,4],[9,3,7],[12,3,10],[15,3,13],[18,3,12],[21,3,10]],"t":9,"name":"1-♭9-3-5-♭7-♭9(감7 아르페지오) 올라 1-♭7 → Ⅰ의 3음","w":0.45,"dm":3,"alt":1},
{"id":"ts1","v":66,"src":"재즈 교육 공통 어휘","cls":["dom","domalt"],"to":["maj","min"],"tr":5,"n":[[0,3,4],[3,3,6],[6,3,10],[9,3,13],[12,3,16],[15,3,13],[18,3,10],[21,3,6]],"t":5,"name":"트라이톤 대리 아르페지오 3-♭5-♭7-♭9 올라갔다 내려와 → Ⅰ의 1음","w":0.45,"minDiff":3,"alt":1},
{"id":"wt1","v":66,"src":"재즈 교육 공통 어휘","cls":["dom"],"to":["maj"],"tr":5,"n":[[0,3,4],[3,3,8],[6,3,12],[9,3,16],[12,3,14],[15,3,12],[18,3,10],[21,3,8]],"t":9,"name":"증3화음 3-♯5-1-3 올라 온음음계 9-1-♭7-♯5 하행 → Ⅰ의 3음","w":0.45,"minDiff":3,"alt":1},
{"id":"dim1","v":66,"src":"재즈 교육 공통 어휘","cls":["dom"],"to":["maj"],"tr":5,"n":[[0,3,12],[3,3,9],[6,3,6],[9,3,3],[12,3,4],[15,3,7],[18,3,10],[21,3,13]],"t":12,"name":"감7 아르페지오 하행 1-13-♯11-♯9 → 3으로 반음 올라 3-5-♭7-♭9 → Ⅰ의 5음","w":0.45,"minDiff":3,"alt":1},
{"id":"hm1","v":66,"src":"재즈 교육 공통 어휘","cls":["dom","domalt"],"to":["min"],"tr":5,"n":[[0,3,7],[3,3,5],[6,3,4],[9,3,1],[12,3,0],[15,3,-2],[18,3,-4],[21,3,-5]],"t":-7,"name":"하모닉 마이너 하행 5-4-3-♭9-1-♭7-♭13-5 → ⅰ의 1음","w":0.6,"alt":1},
{"id":"hm2","v":66,"src":"재즈 교육 공통 어휘","cls":["dom","domalt"],"to":["min"],"tr":5,"n":[[0,2,4],[2,2,7],[4,2,10],[6,3,13],[9,3,12],[12,3,10],[15,3,8],[18,3,7],[21,3,4]],"t":5,"name":"셋잇단 3-5-♭7 → ♭9, 하행, 5-3으로 감싸 → ⅰ의 1음","w":0.6,"alt":1},
{"id":"hm3","v":66,"src":"재즈 교육 공통 어휘","cls":["dom","domalt"],"to":["min"],"tr":5,"n":[[0,3,0],[3,3,1],[6,3,4],[9,3,7],[12,3,10],[15,3,13],[18,3,12],[21,3,10]],"t":8,"name":"1-♭9-3-5-♭7-♭9 올라 1-♭7 → ⅰ의 ♭3음","w":0.6,"alt":1},
{"id":"hm4","v":66,"src":"재즈 교육 공통 어휘","cls":["dom","domalt"],"to":["min"],"tr":5,"n":[[0,3,12],[3,3,13],[6,3,10],[9,3,7],[12,3,4],[15,3,7],[18,3,10],[21,3,7]],"t":8,"name":"1-♭9-♭7-5-3 내려와 5-♭7-5로 감싸 → ⅰ의 ♭3음","w":0.6,"alt":1},
{"id":"hm5","v":66,"src":"재즈 교육 공통 어휘","cls":["dom","domalt"],"to":["min"],"tr":5,"n":[[0,6,19],[6,2,17],[8,2,19],[10,2,17],[12,3,16],[15,3,13],[18,3,12],[21,3,10]],"t":8,"name":"5음 길게 · 셋잇단 꾸밈 4-5-4 · 3-♭9-1-♭7 → ⅰ의 ♭3음","w":0.6,"alt":1},
{"id":"hm6","v":66,"src":"재즈 교육 공통 어휘","cls":["dom","domalt"],"to":["min"],"tr":5,"n":[[0,3,4],[3,3,7],[6,3,10],[9,3,13],[12,3,12],[15,3,10],[18,3,8],[21,3,7]],"t":5,"name":"3-5-♭7-♭9 올라 1-♭7-♭13-5 하행 → ⅰ의 1음","w":0.6,"alt":1},
{"id":"hm7","v":66,"src":"재즈 교육 공통 어휘","cls":["dom","domalt"],"to":["min"],"tr":5,"n":[[3,3,4],[6,3,7],[9,3,10],[12,3,13],[15,3,12],[18,3,10],[21,3,7]],"t":8,"name":"쉼표 뒤 3-5-♭7-♭9, 1-♭7-5로 감싸 → ⅰ의 ♭3음","w":0.6,"alt":1},
{"id":"hm1M","v":66,"src":"재즈 교육 공통 어휘","cls":["domalt"],"to":["maj"],"tr":5,"n":[[0,3,7],[3,3,5],[6,3,4],[9,3,1],[12,3,0],[15,3,-2],[18,3,-4],[21,3,-5]],"t":-7,"name":"하모닉 마이너 하행 5-4-3-♭9-1-♭7-♭13-5 → Ⅰ의 1음","w":0.45,"alt":1},
{"id":"hm2M","v":66,"src":"재즈 교육 공통 어휘","cls":["domalt"],"to":["maj"],"tr":5,"n":[[0,2,4],[2,2,7],[4,2,10],[6,3,13],[9,3,12],[12,3,10],[15,3,8],[18,3,7],[21,3,4]],"t":5,"name":"셋잇단 3-5-♭7 → ♭9, 하행, 5-3으로 감싸 → Ⅰ의 1음","w":0.45,"alt":1},
{"id":"hm6M","v":66,"src":"재즈 교육 공통 어휘","cls":["domalt"],"to":["maj"],"tr":5,"n":[[0,3,4],[3,3,7],[6,3,10],[9,3,13],[12,3,12],[15,3,10],[18,3,8],[21,3,7]],"t":5,"name":"3-5-♭7-♭9 올라 1-♭7-♭13-5 하행 → Ⅰ의 1음","w":0.45,"alt":1},
{"id":"ii1","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["dom"],"tr":5,"n":[[0,3,7],[3,3,3],[6,3,0],[9,3,-2],[12,3,0],[15,3,3],[18,3,7],[21,3,10]],"t":9,"name":"5-♭3-1-♭7 내려와 1-♭3-5-♭7 올라 → Ⅴ의 3음"},
{"id":"ii2","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["dom"],"tr":5,"n":[[0,3,0],[3,3,2],[6,3,3],[9,3,7],[12,3,10],[15,3,14],[18,3,12],[21,3,10]],"t":9,"name":"1-2-♭3-5-♭7-9 올라 1-♭7 → Ⅴ의 3음"},
{"id":"ii3","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["dom"],"tr":5,"n":[[0,3,3],[3,3,7],[6,3,10],[9,3,14],[12,3,12],[15,3,10],[18,3,7],[21,3,10]],"t":9,"name":"♭3-5-♭7-9 올라 1-♭7-5-♭7 → Ⅴ의 3음"},
{"id":"ii4","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["dom"],"tr":5,"n":[[0,3,7],[3,3,5],[6,3,3],[9,3,2],[12,3,0],[15,3,3],[18,3,7],[21,3,10]],"t":9,"name":"5음에서 순차 하행 뒤 1-♭3-5-♭7 → Ⅴ의 3음"},
{"id":"ii5","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["dom"],"tr":5,"n":[[0,2,0],[2,2,3],[4,2,7],[6,3,10],[9,3,14],[12,3,12],[15,3,10],[18,3,7],[21,3,10]],"t":9,"name":"셋잇단 1-♭3-5 → ♭7-9, 1-♭7-5-♭7 → Ⅴ의 3음"},
{"id":"ii6","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["dom"],"tr":5,"n":[[0,3,12],[3,3,11],[6,3,10],[9,3,7],[12,3,3],[15,3,7],[18,3,12],[21,3,10]],"t":9,"name":"1-7-♭7 반음 하행, 5-♭3-5-1-♭7 → Ⅴ의 3음"},
{"id":"ii8","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["dom"],"tr":5,"n":[[3,3,0],[6,3,3],[9,3,7],[12,3,10],[15,3,14],[18,3,12],[21,3,10]],"t":9,"name":"쉼표 뒤 1-♭3-5-♭7-9, 1-♭7 → Ⅴ의 3음"},
{"id":"ii9","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["dom"],"tr":5,"n":[[0,6,7],[6,2,5],[8,2,7],[10,2,5],[12,3,3],[15,3,2],[18,3,0],[21,3,-2]],"t":-3,"name":"5음 길게 · 셋잇단 꾸밈 4-5-4 · ♭3-2-1-♭7 → Ⅴ의 3음"},
{"id":"ii10","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["dom"],"tr":5,"n":[[0,3,3],[3,3,5],[6,3,7],[9,3,10],[12,3,14],[15,3,12],[18,3,10],[21,3,14]],"t":12,"name":"♭3-4-5-♭7-9 올라 1-♭7-9로 감싸 → Ⅴ의 5음"},
{"id":"ii11","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["dom"],"tr":5,"n":[[0,3,0],[3,3,2],[6,3,3],[9,3,7],[12,3,5],[15,3,3],[18,3,2],[21,3,4]],"t":5,"name":"1-2-♭3-5 올라 4-♭3-2, 반음으로 → Ⅴ의 1음"},
{"id":"hd1","v":66,"src":"재즈 교육 공통 어휘","cls":["hdim"],"to":["dom"],"tr":5,"n":[[0,3,10],[3,3,8],[6,3,6],[9,3,5],[12,3,3],[15,3,1],[18,3,0],[21,3,-2]],"t":-3,"name":"로크리안 하행 ♭7-♭6-♭5-4-♭3-♭2-1-♭7 → Ⅴ의 3음","alt":1},
{"id":"hd2","v":66,"src":"재즈 교육 공통 어휘","cls":["hdim"],"to":["dom"],"tr":5,"n":[[0,3,6],[3,3,3],[6,3,0],[9,3,-2],[12,3,0],[15,3,3],[18,3,6],[21,3,10]],"t":9,"name":"♭5-♭3-1-♭7 내려와 1-♭3-♭5-♭7 올라 → Ⅴ의 3음","alt":1},
{"id":"hd3","v":66,"src":"재즈 교육 공통 어휘","cls":["hdim"],"to":["dom"],"tr":5,"n":[[0,3,3],[3,3,6],[6,3,10],[9,3,13],[12,3,12],[15,3,10],[18,3,6],[21,3,10]],"t":9,"name":"♭3-♭5-♭7-♭9 올라 1-♭7-♭5-♭7 → Ⅴ의 3음","alt":1},
{"id":"hd4","v":66,"src":"재즈 교육 공통 어휘","cls":["hdim"],"to":["dom"],"tr":5,"n":[[3,3,0],[6,3,3],[9,3,6],[12,3,10],[15,3,13],[18,3,12],[21,3,10]],"t":9,"name":"쉼표 뒤 1-♭3-♭5-♭7-♭9, 1-♭7 → Ⅴ의 3음","alt":1},
{"id":"s1","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["maj","dom"],"tr":5,"n":[[0,3,0],[3,3,3],[6,3,7],[9,3,10],[12,3,9],[15,3,7],[18,3,5],[21,3,3]],"t":2,"name":"Ⅱ 1-♭3-5-♭7 · Ⅴ 3-2-1-♭7 → Ⅰ의 3음","half":1,"cls2":["dom"]},
{"id":"s1b","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["maj"],"tr":5,"n":[[0,3,0],[3,3,3],[6,3,7],[9,3,10],[12,3,9],[15,3,6],[18,3,5],[21,3,3]],"t":2,"name":"Ⅱ 1-♭3-5-♭7 · Ⅴ 3-♭9-1-♭7 → Ⅰ의 3음","dm":3,"alt":1,"half":1,"cls2":["dom"]},
{"id":"s1m","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["min"],"tr":5,"n":[[0,3,0],[3,3,3],[6,3,7],[9,3,10],[12,3,9],[15,3,6],[18,3,5],[21,3,3]],"t":1,"name":"Ⅱ 1-♭3-5-♭7 · Ⅴ 3-♭9-1-♭7 → ⅰ의 ♭3음","alt":1,"half":1,"cls2":["dom"]},
{"id":"s2","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["maj","dom"],"tr":5,"n":[[0,3,3],[3,3,2],[6,3,0],[9,3,-2],[12,3,-3],[15,3,0],[18,3,3],[21,3,7]],"t":5,"name":"Ⅱ ♭3-2-1-♭7 · Ⅴ 3-5-♭7-9 → Ⅰ의 5음","half":1,"cls2":["dom"]},
{"id":"s2b","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["maj","min"],"tr":5,"n":[[0,3,3],[3,3,2],[6,3,0],[9,3,-2],[12,3,-3],[15,3,0],[18,3,3],[21,3,6]],"t":5,"name":"Ⅱ ♭3-2-1-♭7 · Ⅴ 3-5-♭7-♭9 → Ⅰ의 5음","dm":3,"alt":1,"half":1,"cls2":["dom"]},
{"id":"s3","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["maj","dom"],"tr":5,"n":[[0,3,7],[3,3,3],[6,3,0],[9,3,-2],[12,3,-3],[15,3,-2],[18,3,0],[21,3,3]],"t":2,"name":"Ⅱ 5-♭3-1-♭7 · Ⅴ 3-4-5-♭7 → Ⅰ의 3음","half":1,"cls2":["dom"]},
{"id":"s4","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["maj","dom"],"tr":5,"n":[[0,3,0],[3,3,2],[6,3,3],[9,3,7],[12,3,5],[15,3,3],[18,3,0],[21,3,3]],"t":2,"name":"Ⅱ 1-2-♭3-5 · Ⅴ 1-♭7-5-♭7 → Ⅰ의 3음","half":1,"cls2":["dom"]},
{"id":"s5","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["maj","dom"],"tr":5,"n":[[0,3,3],[3,3,7],[6,3,10],[9,3,14],[12,3,12],[15,3,9],[18,3,5],[21,3,3]],"t":2,"name":"Ⅱ ♭3-5-♭7-9 · Ⅴ 5-3-1-♭7 → Ⅰ의 3음","half":1,"cls2":["dom"]},
{"id":"s6","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["maj","dom"],"tr":5,"n":[[0,3,7],[3,3,5],[6,3,3],[9,3,2],[12,3,0],[15,3,-2],[18,3,-3],[21,3,0]],"t":-2,"name":"Ⅱ 5-4-♭3-2 · Ⅴ 5-4-3-5 → Ⅰ의 1음","half":1,"cls2":["dom"]},
{"id":"s7","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["maj","dom"],"tr":5,"n":[[0,2,0],[2,2,3],[4,2,7],[6,3,10],[9,3,14],[12,3,12],[15,3,9],[18,3,5],[21,3,3]],"t":2,"name":"Ⅱ 셋잇단 1-♭3-5 → ♭7-9 · Ⅴ 5-3-1-♭7 → Ⅰ의 3음","half":1,"cls2":["dom"]},
{"id":"m1","v":66,"src":"재즈 교육 공통 어휘","cls":["hdim"],"to":["min"],"tr":5,"n":[[0,3,0],[3,3,3],[6,3,6],[9,3,10],[12,3,9],[15,3,6],[18,3,5],[21,3,3]],"t":1,"name":"Ⅱø 1-♭3-♭5-♭7 · Ⅴ 3-♭9-1-♭7 → ⅰ의 ♭3음","alt":1,"half":1,"cls2":["dom"]},
{"id":"m2","v":66,"src":"재즈 교육 공통 어휘","cls":["hdim"],"to":["min","maj"],"tr":5,"n":[[0,3,3],[3,3,1],[6,3,0],[9,3,-2],[12,3,-3],[15,3,0],[18,3,3],[21,3,6]],"t":5,"name":"Ⅱø ♭3-♭2-1-♭7 · Ⅴ 3-5-♭7-♭9 → ⅰ의 5음","alt":1,"half":1,"cls2":["dom"]},
{"id":"m3","v":66,"src":"재즈 교육 공통 어휘","cls":["hdim"],"to":["min"],"tr":5,"n":[[0,3,6],[3,3,3],[6,3,0],[9,3,-2],[12,3,-3],[15,3,-2],[18,3,0],[21,3,3]],"t":1,"name":"Ⅱø ♭5-♭3-1-♭7 · Ⅴ 3-4-5-♭7 → ⅰ의 ♭3음","alt":1,"half":1,"cls2":["dom"]},
{"id":"m4","v":66,"src":"재즈 교육 공통 어휘","cls":["hdim"],"to":["min","maj"],"tr":5,"n":[[0,3,10],[3,3,6],[6,3,3],[9,3,0],[12,3,5],[15,3,3],[18,3,0],[21,3,-3]],"t":-2,"name":"Ⅱø ♭7-♭5-♭3-1 · Ⅴ 1-♭7-5-3 → ⅰ의 1음","alt":1,"half":1,"cls2":["dom"]},
{"id":"ch1","v":66,"src":"재즈 교육 공통 어휘","cls":["maj","dom"],"to":null,"tr":null,"n":[[0,3,0],[3,3,2],[6,3,4],[9,3,7],[12,6,9],[18,3,7],[21,3,4]],"t":null,"name":"1-2-3-5 올라 6에 머물고 5-3","w":0.5},
{"id":"ch2","v":66,"src":"재즈 교육 공통 어휘","cls":["maj"],"to":null,"tr":null,"n":[[0,3,4],[3,3,7],[6,3,11],[9,3,14],[12,3,12],[15,3,9],[18,3,7],[21,3,4]],"t":null,"name":"3-5-7-9 올라 1-6-5-3 하행","w":0.5},
{"id":"ch7","v":66,"src":"재즈 교육 공통 어휘","cls":["maj","dom"],"to":null,"tr":null,"n":[[0,3,7],[3,3,4],[6,3,0],[9,3,2],[12,12,4]],"t":null,"name":"5-3-1-2 뒤 3음에 머묾","w":0.5},
{"id":"ch8","v":66,"src":"재즈 교육 공통 어휘","cls":["maj"],"to":null,"tr":null,"n":[[0,3,-1],[3,3,0],[6,3,4],[9,3,7],[12,3,11],[15,3,9],[18,3,7],[21,3,4]],"t":null,"name":"7-1-3-5-7 올라 6-5-3","w":0.5},
{"id":"ch11","v":66,"src":"재즈 교육 공통 어휘","cls":["maj","dom"],"to":null,"tr":null,"n":[[0,3,9],[3,3,7],[6,3,4],[9,3,2],[12,12,0]],"t":null,"name":"6-5-3-2 내려와 1음에 머묾","w":0.5},
{"id":"ch3","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":null,"tr":null,"n":[[0,3,0],[3,3,3],[6,3,5],[9,3,7],[12,3,10],[15,3,7],[18,3,5],[21,3,3]],"t":null,"name":"마이너 펜타 1-♭3-4-5-♭7 올라 5-4-♭3","w":0.5},
{"id":"ch4","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":null,"tr":null,"n":[[0,3,7],[3,3,10],[6,3,12],[9,3,15],[12,3,14],[15,3,12],[18,3,10],[21,3,7]],"t":null,"name":"5-♭7-1-♭3 올라 2-1-♭7-5 하행","w":0.5},
{"id":"ch9","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":null,"tr":null,"n":[[0,3,0],[3,3,2],[6,3,3],[9,3,7],[12,3,10],[15,3,7],[18,3,3],[21,3,2]],"t":null,"name":"1-2-♭3-5-♭7 올라 5-♭3-2","w":0.5},
{"id":"ch12","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":null,"tr":null,"n":[[0,3,7],[3,3,3],[6,3,0],[9,3,2],[12,12,3]],"t":null,"name":"5-♭3-1-2 뒤 ♭3음에 머묾","w":0.5},
{"id":"ch5","v":66,"src":"재즈 교육 공통 어휘","cls":["dom"],"to":null,"tr":null,"n":[[0,3,4],[3,3,7],[6,3,10],[9,3,14],[12,3,12],[15,3,10],[18,3,9],[21,3,7]],"t":null,"name":"3-5-♭7-9 올라 1-♭7-6-5 하행","w":0.5},
{"id":"ch10","v":66,"src":"재즈 교육 공통 어휘","cls":["dom"],"to":null,"tr":null,"n":[[0,3,10],[3,3,9],[6,3,7],[9,3,4],[12,3,0],[15,3,4],[18,3,7],[21,3,9]],"t":null,"name":"♭7-6-5-3-1 내려와 3-5-6","w":0.5},
{"id":"ch6","v":66,"src":"재즈 교육 공통 어휘","cls":["hdim"],"to":null,"tr":null,"n":[[0,3,0],[3,3,3],[6,3,6],[9,3,10],[12,3,6],[15,3,5],[18,3,3],[21,3,0]],"t":null,"name":"1-♭3-♭5-♭7 올라 ♭5-4-♭3-1","w":0.5},
{"id":"tqa","v":66,"src":"재즈 교육 공통 어휘","cls":["dom"],"to":["maj","dom"],"tr":5,"n":[[0,3,4],[3,3,7],[6,3,10],[9,3,14],[12,3,12],[15,3,10]],"t":9,"name":"3-5-♭7-9 올라 1-♭7 → Ⅰ의 3음","m":3},
{"id":"tqb","v":66,"src":"재즈 교육 공통 어휘","cls":["dom"],"to":["maj","dom"],"tr":5,"n":[[0,3,12],[3,3,11],[6,3,10],[9,3,9],[12,3,7],[15,3,10]],"t":9,"name":"비밥 하행 1-7-♭7-6-5, ♭7로 감싸 → Ⅰ의 3음","m":3},
{"id":"tqc","v":66,"src":"재즈 교육 공통 어휘","cls":["dom"],"to":["maj","dom"],"tr":5,"n":[[0,3,7],[3,3,5],[6,3,4],[9,3,7],[12,3,10],[15,3,7]],"t":9,"name":"5-4-3 내려와 5-♭7-5로 감싸 → Ⅰ의 3음","m":3},
{"id":"tqd","v":66,"src":"재즈 교육 공통 어휘","cls":["dom","domalt"],"to":["maj"],"tr":5,"n":[[0,3,4],[3,3,7],[6,3,10],[9,3,13],[12,3,12],[15,3,10]],"t":9,"name":"3-5-♭7-♭9 올라 1-♭7 → Ⅰ의 3음","dm":3,"alt":1,"m":3},
{"id":"tqe","v":66,"src":"재즈 교육 공통 어휘","cls":["dom","domalt"],"to":["min"],"tr":5,"n":[[0,3,4],[3,3,7],[6,3,10],[9,3,13],[12,3,12],[15,3,10]],"t":8,"name":"3-5-♭7-♭9 올라 1-♭7 → ⅰ의 ♭3음","alt":1,"m":3},
{"id":"tqf","v":66,"src":"재즈 교육 공통 어휘","cls":["dom","domalt"],"to":["min"],"tr":5,"n":[[0,3,12],[3,3,13],[6,3,10],[9,3,7],[12,3,4],[15,3,7]],"t":5,"name":"1-♭9-♭7-5-3-5 → ⅰ의 1음","alt":1,"m":3},
{"id":"tqg","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["dom"],"tr":5,"n":[[0,3,0],[3,3,3],[6,3,7],[9,3,10],[12,3,14],[15,3,10]],"t":9,"name":"1-♭3-5-♭7-9-♭7 → Ⅴ의 3음","m":3},
{"id":"tqh","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":["dom"],"tr":5,"n":[[0,3,3],[3,3,2],[6,3,0],[9,3,-2],[12,3,-5],[15,3,-2]],"t":-3,"name":"♭3-2-1-♭7-5-♭7 → Ⅴ의 3음","m":3},
{"id":"tqi","v":66,"src":"재즈 교육 공통 어휘","cls":["hdim"],"to":["dom"],"tr":5,"n":[[0,3,0],[3,3,3],[6,3,6],[9,3,10],[12,3,13],[15,3,10]],"t":9,"name":"1-♭3-♭5-♭7-♭9-♭7 → Ⅴ의 3음","alt":1,"m":3},
{"id":"tqj","v":66,"src":"재즈 교육 공통 어휘","cls":["hdim"],"to":["dom"],"tr":5,"n":[[0,3,3],[3,3,1],[6,3,0],[9,3,-2],[12,3,-6],[15,3,-2]],"t":-3,"name":"♭3-♭2-1-♭7-♭5-♭7 → Ⅴ의 3음","alt":1,"m":3},
{"id":"tqk","v":66,"src":"재즈 교육 공통 어휘","cls":["maj","dom"],"to":null,"tr":null,"n":[[0,3,0],[3,3,2],[6,3,4],[9,3,7],[12,6,9]],"t":null,"name":"1-2-3-5 올라 6에 머묾","m":3},
{"id":"tql","v":66,"src":"재즈 교육 공통 어휘","cls":["maj"],"to":null,"tr":null,"n":[[0,3,4],[3,3,7],[6,3,11],[9,3,14],[12,3,12],[15,3,9]],"t":null,"name":"3-5-7-9 올라 1-6","m":3},
{"id":"tqm","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":null,"tr":null,"n":[[0,3,0],[3,3,3],[6,3,5],[9,3,7],[12,3,10],[15,3,7]],"t":null,"name":"마이너 펜타 1-♭3-4-5-♭7-5","m":3},
{"id":"tqn","v":66,"src":"재즈 교육 공통 어휘","cls":["min"],"to":null,"tr":null,"n":[[0,3,7],[3,3,3],[6,3,0],[9,3,2],[12,6,3]],"t":null,"name":"5-♭3-1-2 뒤 ♭3음에 머묾","m":3},
{"id":"tqo","v":66,"src":"재즈 교육 공통 어휘","cls":["dom"],"to":null,"tr":null,"n":[[0,3,4],[3,3,7],[6,3,10],[9,3,14],[12,3,12],[15,3,10]],"t":null,"name":"3-5-♭7-9 올라 1-♭7","m":3}
);
/* <LICKS66 */
const LICK_RATE={2:0.2,3:0.35};   /* 난이도별 — 해당 Ⅴ→Ⅰ 마디마다 시도할 확률 */
const CHORD_LICK_RATE={2:0.05,3:0.08};   /* v0.49 코드 릭(해결 없음) — 한 코드 한 마디마다 시도할 확률 */
const LICK_MAX_PER_CHORUS=2;

/* v0.28 헤드 멜로디(ABC) 파서 + 모티프 조각 추출 — 사용자가 직접 입력한 헤드만 다룬다(앱에 원곡 멜로디는 수록하지 않음).
   지원: X/T/M/L/K 헤더, 음표(A–G a–g, ^ _ =, , '), 길이(2 /2 3/2 …), 쉼표(z), 마디선(|), 붙임줄(-).
   미지원(무시/중단): 화음 [..], 셋잇단 (3, 장식음 {}, 가사. 지원 못 한 음이 있으면 그 지점에서 조각을 끊는다. */
const _KEY_SIG={C:0,G:1,D:2,A:3,E:4,B:5,'F#':6,'C#':7,F:-1,Bb:-2,Eb:-3,Ab:-4,Db:-5,Gb:-6,Cb:-7};
const _SHARP_ORDER=['F','C','G','D','A','E','B'],_FLAT_ORDER=['B','E','A','D','G','C','F'];
function _keyAccidentals(k){
  k=(k||'C').replace(/\s+/g,'');
  let m=k.match(/^([A-G][b#]?)(m|min|minor|maj|major|dor|mix|lyd|phr|loc)?/i);
  if(!m)return {};
  let tonic=m[1][0].toUpperCase()+(m[1][1]||''),mode=(m[2]||'').toLowerCase();
  let n=_KEY_SIG[tonic];if(n===undefined)return {};
  const shift={m:-3,min:-3,minor:-3,dor:-2,phr:-4,lyd:1,mix:-1,loc:-5}[mode]||0;
  n+=shift;
  const acc={};
  if(n>0)for(let i=0;i<Math.min(7,n);i++)acc[_SHARP_ORDER[i]]=1;
  if(n<0)for(let i=0;i<Math.min(7,-n);i++)acc[_FLAT_ORDER[i]]=-1;
  return acc;
}
function parseHeadAbc(text){
  const out={notes:[],bpb:4,errors:[],bars:0};
  if(!text||!String(text).trim())return out;
  let L=1/8,M=[4,4],K='C',body=[];
  for(const raw of String(text).split(/\r?\n/)){
    const line=raw.replace(/%.*$/,'').trim();if(!line)continue;
    const h=line.match(/^([A-Za-z]):\s*(.*)$/);
    if(h&&line.length>1&&line[1]===':'){
      const f=h[1],v=h[2].trim();
      if(f==='L'){const q=v.match(/^(\d+)\/(\d+)$/);if(q)L=+q[1]/+q[2]}
      else if(f==='M'){if(v==='C')M=[4,4];else if(v==='C|')M=[2,2];else{const q=v.match(/^(\d+)\/(\d+)$/);if(q)M=[+q[1],+q[2]]}}
      else if(f==='K')K=v.split(/\s+/)[0]||'C';
      continue;
    }
    body.push(line);
  }
  out.bpb=Math.max(1,Math.round(M[0]*4/M[1]));
  const keyAcc=_keyAccidentals(K),ticksPer=L*4*6;   /* 4분음표 = 6틱 */
  const s=body.join(' ');
  let i=0,t=0,bar=0,barAcc={},pendingTie=false,last=null;
  const NAT={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  const skipTrip=()=>{};
  while(i<s.length){
    const ch=s[i];
    if(ch==='|'||ch===':'){ if(ch==='|'){barAcc={};}i++;continue}
    if(/\s/.test(ch)||ch==='['&&s[i+1]==='|'||ch===']'||ch==='-'&&false){i++;continue}
    if(ch==='('){ /* 셋잇단 (3 → 이 구간 지원 안 함 */
      out.errors.push('셋잇단 미지원 @'+i);
      if(last)last.brk=true;
      const m=s.slice(i).match(/^\(\d/);i+=m?2:1;
      /* 셋잇단 음표 3개를 건너뛰되 시간은 2박자 분량(L 기준)으로 가정하지 않고 끊는다 */
      let skip=3;while(skip>0&&i<s.length){if(/[A-Ga-gz]/.test(s[i])){skip--}i++;while(i<s.length&&/[\d\/,'^_=]/.test(s[i]))i++}
      t=Math.round(t);continue;
    }
    if(ch==='['){ /* 화음 → 첫 음만 받지 않고 건너뜀 */
      const j=s.indexOf(']',i);out.errors.push('화음 미지원 @'+i);if(last)last.brk=true;i=j<0?s.length:j+1;
      while(i<s.length&&/[\d\/]/.test(s[i]))i++;continue;
    }
    if(ch==='{'){const j=s.indexOf('}',i);i=j<0?s.length:j+1;continue}
    if(ch==='"'){const j=s.indexOf('"',i+1);i=j<0?s.length:j+1;continue}
    if(ch==='!'||ch==='+'){const j=s.indexOf(ch,i+1);i=j<0?s.length:j+1;continue}
    if(ch==='>'||ch==='<'){i++;if(last)last.brk=true;continue}
    let acc=null;
    if(ch==='^'||ch==='_'||ch==='='){let a=0;while(s[i]==='^'||s[i]==='_'||s[i]==='='){if(s[i]==='^')a++;else if(s[i]==='_')a--;else a=0;i++}acc=(s[i-1]==='=')?0:a}
    const nc=s[i];
    if(!nc||!/[A-Ga-gz]/.test(nc)){i++;continue}
    i++;
    let oct=0;while(s[i]==="'"||s[i]===','){oct+=s[i]==="'"?1:-1;i++}
    let num='',den='',slash=false;
    while(i<s.length&&/\d/.test(s[i]))num+=s[i++];
    while(i<s.length&&s[i]==='/'){slash=true;i++;let dd='';while(i<s.length&&/\d/.test(s[i]))dd+=s[i++];den=dd||(den?String(2*+den):'2');}
    let mult=num?+num:1;if(slash)mult=mult/(den?+den:2);
    const d=mult*ticksPer;
    const isTie=s[i]==='-';if(isTie)i++;
    if(nc==='z'||nc==='Z'){
      if(last)last.brk=true;
      t+=d;continue;
    }
    const up=nc===nc.toLowerCase(),L0=nc.toUpperCase();
    let a=acc!==null?acc:(barAcc[L0+oct+(up?'u':'l')]!==undefined?barAcc[L0+oct+(up?'u':'l')]:(keyAcc[L0]||0));
    if(acc!==null)barAcc[L0+oct+(up?'u':'l')]=acc;
    const midi=12*(up?6:5)+NAT[L0]+a+12*oct;
    if(pendingTie&&last&&last.midi===midi){last.d+=d;pendingTie=isTie;t+=d;continue}
    const n={t:Math.round(t*100)/100,d:Math.round(d*100)/100,midi};
    out.notes.push(n);last=n;pendingTie=isTie;t+=d;
  }
  for(const n of out.notes)if(!Number.isInteger(n.t)||!Number.isInteger(n.d)){out.errors.push('정수 틱이 아닌 음 (16분 이하·잇단 길이)');break}
  out.bars=Math.ceil(t/(out.bpb*6));
  return out;
}
/* 파싱된 헤드 → 모티프 조각 [{off:[0,..],d:[..],bar}] — 음높이는 첫 음 기준 상대값, 길이는 틱.
   쉼표·미지원 구간에서 끊고, 3~5음을 잘라 쓴다. 쓸 수 있는 길이는 8분(3)~2분(12) 정수 틱만. */
function headFragments(parsed,maxFrag){
  const out=[],ns=parsed&&parsed.notes||[];
  let run=[];
  const flush=()=>{
    const ok=n=>[3,6,9,12].includes(n.d);
    /* 연속 음 중 길이가 쓸 수 있는 구간만 */
    let seg=[];
    const emit=()=>{
      for(const len of [4,3,5]){
        for(let s0=0;s0+len<=seg.length;s0+=2){
          const f=seg.slice(s0,s0+len);
          if(new Set(f.map(n=>n.midi)).size<2)continue;       /* 한 음만 반복하는 조각은 제외 */
          out.push({off:f.map(n=>n.midi-f[0].midi),d:f.map(n=>n.d),bar:Math.floor(f[0].t/(parsed.bpb*6))});
        }
      }
      seg=[];
    };
    for(const n of run){if(ok(n))seg.push(n);else emit()}
    emit();run=[];
  };
  for(let k=0;k<ns.length;k++){
    const n=ns[k],nx=ns[k+1];
    run.push(n);
    if(n.brk||!nx||nx.t!==n.t+n.d)flush();
  }
  flush();
  /* 중복 제거 + 상한 */
  const seen=new Set(),res=[];
  for(const f of out){const key=f.off.join(',')+'|'+f.d.join(',');if(seen.has(key))continue;seen.add(key);res.push(f)}
  return res.slice(0,maxFrag||24);
}

/* ── v0.46 헤드 연주 — 불러온(또는 직접 입력한) 헤드 멜로디를 첫(·마지막) 코러스에 그대로 싣는다 ─────────────
   앱이 멜로디를 지어내지 않는다: 헤드 음이 있는 마디는 입력 그대로, 음이 없는 마디만 일반 솔로 생성을 따른다.
   틱 그리드(8분음표 = 3틱)에 맞춘다: 한 박 안에 0·2·4틱에서 시작하는 2틱 음 셋이면 셋잇단(trip), 나머지는 8분 격자로 반올림.
   반환: {마디번호: [{t,d,midi,tie?,trip?}] (합 = 박 × 6)} — 음이 하나도 없는 마디는 빠진다 */
const HEAD_GRID=3;
function headLockBars(notes,nb,bpb){
  const T=(bpb||4)*6,out={};
  if(!notes||!notes.length)return out;
  const ns=notes.filter(n=>n.midi!==null&&n.d>0).map(n=>({t:n.t,e:n.t+n.d,midi:n.midi})).sort((a,b)=>a.t-b.t);
  /* 셋잇단 박: 박 시작 B에 B·B+2·B+4 시작 음이 있고 앞의 둘이 2틱 */
  const tripBeat=new Set();
  for(let k=0;k+2<ns.length;k++){const a=ns[k],b=ns[k+1],c=ns[k+2];
    if(a.t%6===0&&b.t===a.t+2&&c.t===a.t+4&&a.e===b.t&&b.e===c.t)tripBeat.add(a.t)}
  const inTrip=t=>tripBeat.has(t-t%6);
  const q=[];
  for(const n of ns){
    let s,e;
    if(inTrip(n.t)){s=n.t;e=n.e;if(!inTrip(e)&&e%6!==0)e=Math.round(e/HEAD_GRID)*HEAD_GRID}
    else{s=Math.round(n.t/HEAD_GRID)*HEAD_GRID;e=inTrip(n.e)?n.e:Math.round(n.e/HEAD_GRID)*HEAD_GRID}
    if(e<=s)e=s+(inTrip(s)?2:HEAD_GRID);
    const p=q[q.length-1];
    if(p&&s<p.e){if(s<=p.s)continue;p.e=s}   /* 겹치면 앞 음을 줄인다(같은 자리 둘째 음은 버림) */
    q.push({s,e,midi:n.midi});
  }
  /* 마디 안 칸: 셋잇단 박은 2틱 칸 셋, 나머지 박은 3틱 칸 둘. 칸마다 울리는 음(또는 쉼)을 정해 이어 붙인다 */
  for(let b=0;b<nb;b++){
    const a=b*T,z=a+T;
    if(!q.some(n=>n.s<z&&n.e>a))continue;
    const slots=[];
    for(let bt=a;bt<z;bt+=6){if(tripBeat.has(bt))[0,2,4].forEach(o=>slots.push({t:bt+o,d:2,trip:true}));else[0,3].forEach(o=>slots.push({t:bt+o,d:3}))}
    const bar=[];
    slots.forEach(sl=>{
      const n=q.find(x=>x.s<=sl.t&&x.e>sl.t)||null;
      const prev=bar[bar.length-1],same=prev&&prev._n===n;
      if(same&&!sl.trip&&!prev.trip){prev.d+=sl.d;return}             /* 같은 음·같은 격자면 길이만 늘림 */
      if(same&&n===null&&!sl.trip&&!prev.trip){prev.d+=sl.d;return}
      const o={t:sl.t-a,d:sl.d,midi:n?n.midi:null,_n:n};if(sl.trip)o.trip=true;
      if(same&&n)prev.tie=true;                                         /* 셋잇단 경계를 넘는 같은 음은 붙임줄 */
      bar.push(o);
    });
    if(!bar.some(x=>x.midi!==null))continue;
    /* 마디를 넘어가는 음: 다음 마디 첫 칸이 같은 음이면 붙임줄 */
    const last=bar[bar.length-1];
    if(last._n&&last._n.e>z)last.tie=true;
    bar.forEach(x=>delete x._n);
    out[b]=bar;
  }
  return out;
}
/* 생성한 솔로에 헤드 마디를 끼운다. 헤드는 적힌 옥타브를 지키고, 악기 음역 rg=[낮은,높은]을 많이 벗어날 때만 옥타브를 옮긴다(조는 곡 원조 그대로) */
function spliceHeadBars(solo,lock,rg){
  const T=(solo.bpb||4)*6,ks=Object.keys(lock||{}).map(Number).filter(b=>b>=0&&b<solo.bars.length);
  if(!ks.length)return solo;
  const hs=ks.flatMap(b=>lock[b].filter(n=>n.midi!==null).map(n=>n.midi)),R=rg||[52,86];
  let sh=0,bestOut=1e9;
  [0,-12,12,-24,24].forEach(o=>{const out=hs.filter(m=>m+o<R[0]||m+o>R[1]).length;if(out<bestOut){bestOut=out;sh=o}});
  ks.forEach(b=>{
    const ns=lock[b];if(ns.reduce((s,n)=>s+n.d,0)!==T)return;
    solo.bars[b].notes=ns.map(n=>Object.assign({},n,n.midi===null?{}:{midi:n.midi+sh}));
    solo.bars[b].head=true;solo.bars[b].tags=['헤드'];
  });
  /* 이음매: 붙임줄은 다음 마디 첫 음이 같은 음일 때만 */
  for(let b=0;b<solo.bars.length;b++){
    const ns=solo.bars[b].notes,last=ns[ns.length-1],nx=solo.bars[b+1];
    if(last&&last.tie&&(!nx||nx.notes[0].midi===null||nx.notes[0].midi!==last.midi))delete last.tie;
  }
  solo.head=true;
  return solo;
}

/* ── v0.29 연습 악보 생성 — 「연습」 보기에서는 솔로 대신 주제별 연습 음형을 만든다 ──
   · 코드톤: 4분음표로 1·3·5·7음        · 스케일/펜타토닉/활용 스케일: 8분음표
   · 코드마다 상행·하행을 시드 난수로 고른다(같은 시드 → 같은 악보)
   · 기보 음 기준 상한(기본 B♭5=82)을 넘는 음형은 한 옥타브 낮춰 시작한다
   결과는 generateSolo와 같은 모양({bars:[{chords,notes,tags}]})이라 악보·재생·MusicXML을 그대로 쓴다.
   음높이는 실음(콘서트)으로 돌려준다. opts.wt = 기보 이조(B♭ 악기 +2, E♭ 악기 +9). */
const DRILL_CEIL=82,DRILL_ROOT_LO=59,DRILL_FLOOR=54;   /* 기보: 상한 B♭5 · 뿌리음 자리 B3~B♭4 · 하한 F♯3 */
const DRILL_PENTA={maj:[0,2,4,7,9],min:[0,3,5,7,10],dom:[0,2,4,7,10],domalt:[0,2,4,7,10],hdim:[0,3,5,6,10],dim:[0,3,6,9]};
const DRILL_VAR={maj:[[0,2,4,5,7,9,11],[0,2,4,6,7,9,11]],min:[[0,2,3,5,7,9,10],[0,2,3,5,7,9,11]],dom:[[0,2,4,5,7,9,10],[0,2,4,6,7,9,10],[0,1,3,4,6,8,10]],domalt:[[0,1,3,4,6,8,10],[0,2,4,6,7,9,10]],hdim:[[0,1,3,5,6,8,10],[0,2,3,5,6,8,10]],dim:[[0,2,3,5,6,8,9,11]]};
const DRILL_VAR_NAME={maj:['이오니안','리디안'],min:['도리안','멜로딕 마이너'],dom:['믹소리디안','리디안 ♭7','얼터드'],domalt:['얼터드','리디안 ♭7'],hdim:['로크리안','로크리안 ♮2'],dim:['디미니시드']};
const DRILL_TOPICS=['ct','penta','scale','dom','gt'];
function drillLadder(type,topic,ph){
  const T=CHORD_TYPES[type],cls=TYPE_CLS[type]||'dom';
  if(topic==='ct')return T.iv.slice(0,4);
  if(topic==='penta')return (DRILL_PENTA[cls]||DRILL_PENTA.dom).slice();
  if(topic==='dom'){const L=DRILL_VAR[cls]||DRILL_VAR.dom;return L[ph%L.length].slice()}
  return T.scale.slice();
}
/* 사다리(한 옥타브 음정 목록)를 위로 n음 펼친다. 7음 스케일 반 마디(4음)는 1-2-3-5 음형 */
function drillPattern(ladder,n,topic){
  if(n===4&&ladder.length===7&&topic!=='ct')return [ladder[0],ladder[1],ladder[2],ladder[4]];
  const out=[];for(let k=0;k<n;k++)out.push(ladder[k%ladder.length]+12*Math.floor(k/ladder.length));
  return out;
}
function drillPlace(rootPcW,rel,ceil,floor){
  let base=DRILL_ROOT_LO+mod12(rootPcW-DRILL_ROOT_LO);
  const mx=Math.max(...rel),mn=Math.min(...rel);
  while(base+mx>ceil)base-=12;                   /* 상한을 넘으면 한 옥타브 아래에서 시작 */
  if(base+mn<floor&&base+12+mx<=ceil)base+=12;
  return base;
}
function generateDrill(progId,keyPc,topic,seed,opts){
  opts=opts||{};
  const prog=SONGDB[progId],bpb=prog.bpb||4,TPBAR=bpb*6;
  const wt=opts.wt||0,ceil=opts.ceil||DRILL_CEIL,floor=opts.floor||DRILL_FLOOR;
  if(!DRILL_TOPICS.includes(topic))topic='ct';
  const rng=mulberry32((seed>>>0)^0x9e3779b9);
  const bars=barChords(prog,keyPc);
  const result=bars.map(bar=>({chords:bar,notes:[],tags:[]}));
  const stats={targets:0,guideHits:0,enc:0,appr:0,chrom:0,cells:0,motif:0,headQuote:0,up:0,down:0};
  const segBeats=bar=>{const n=bar.length,q=Math.floor(bpb/n),r=bpb-q*n;return bar.map((_,k)=>q+(k<r?1:0))};
  if(topic==='gt'){
    drillGuideLine(bars,bpb,wt,ceil,floor).forEach(n=>{const nn={t:n.t,d:n.d,midi:n.midi-wt,deg:n.degree};if(n.first)nn.ci=bars[n.b].indexOf(n.c);result[n.b].notes.push(nn)});
    result.forEach(b=>{if(!b.notes.length)b.notes.push({t:0,d:TPBAR,midi:null})});
  }else{
    const unit=topic==='ct'?6:3;                 /* 코드톤 4분 · 나머지 8분 */
    bars.forEach((bar,b)=>{
      const beats=segBeats(bar);let t=0;const dirs=[];
      bar.forEach((c,k)=>{
        const n=beats[k]*6/unit;
        if(n<=0)return;
        const ladder=drillLadder(c.type,topic,Math.floor(b/4));
        let rel=drillPattern(ladder,n,topic);
        const down=rng()<0.5;if(down)rel=rel.slice().reverse();
        const base=drillPlace(mod12(c.root+wt),rel,ceil,floor);
        rel.forEach((r,q)=>{const nn={t,d:unit,midi:base+r-wt};if(q===0)nn.ci=k;result[b].notes.push(nn);t+=unit});
        dirs.push(down?'하행':'상행');if(down)stats.down++;else stats.up++;
      });
      if(t<TPBAR)result[b].notes.push({t,d:TPBAR-t,midi:null});
      result[b].tags.push(dirs.join('·'));
    });
  }
  const P=(prog.form&&prog.form.phrase)||8,secs=String((prog.form&&prog.form.sections)||'');
  return {progId,keyPc,diff:0,style:'all',bpb,bars:result,ts:Date.now(),harm:[],stats,feel:opts.feel||'swing',topic,drill:true,quote:null,motifs:[],
    form:{phrase:P,sections:secs.split(''),licks:0,phrases:0}};
}
/* 가이드톤(3·7음) 연결 라인 — 2분음표 기본, 7→3 반음 해결을 우선하는 최단 경로. 기보 음으로 계산 */
function drillGuideLine(bars,bpb,wt,ceil,floor){
  const GM={maj7:[4,11],'6':[4,9],m7:[3,10],m9:[3,10],m6:[3,9],'7':[4,10],'9':[4,10],'7b9':[4,10],'7#9':[4,10],m7b5:[3,10],dim7:[3,9],'7sus4':[5,10],mmaj7:[3,11],'7#11':[4,10],'maj7#11':[4,11]};
  const slots=[];
  bars.forEach((bar,b)=>{
    const st=chordBeats(bar.length,bpb),lens=st.map((x,i)=>(i+1<st.length?st[i+1]:bpb)-x);
    let t=0;
    bar.forEach((c,ci)=>{
      let rem=lens[ci]*6;
      while(rem>0){const d=Math.min(12,rem);slots.push({b,t,d,c,root:mod12(c.root+wt),gs:GM[c.type]||[4,10],first:rem===lens[ci]*6});t+=d;rem-=d}
    });
  });
  let states=[];
  slots.forEach((s,i)=>{
    const next=[];
    s.gs.forEach((g,j)=>{for(let m=Math.max(55,floor);m<=Math.min(81,ceil);m++)if(mod12(m-s.root)===g){
      const degree=j===0?3:7;
      let cost=i===0?Math.abs(m-67)*0.15+(degree===7?0:0.2):Infinity,from=-1;
      states.forEach((p,k)=>{
        const leap=Math.abs(m-p.m),prev=slots[i-1];
        if(leap>7)return;
        let v=p.cost+leap+(leap>4?(leap-4)*3:0);
        if(s.first&&mod12(s.root-prev.root)===5&&p.degree===7&&degree===3&&leap===1)v-=40;
        if(s.c===prev.c&&p.degree===degree)v+=0.8;
        if(v<cost){cost=v;from=k}
      });
      next.push({m,degree,cost,from});
    }});
    s.states=next;states=next;
  });
  if(!slots.length)return [];
  let k=states.reduce((best,p,i)=>p.cost<states[best].cost?i:best,0);
  for(let i=slots.length-1;i>=0;i--){const p=slots[i].states[k];slots[i].midi=p.m;slots[i].degree=p.degree;k=p.from;delete slots[i].states}
  return slots;
}

/* ── v0.30 마디 고정 — 마음에 든 마디는 그대로 두고 나머지만 새로 생성한다 ──
   locks = {마디번호(0부터): 그 마디의 음표 배열(실음·원조)}. 순수 함수라 Node에서 검사한다. */
function spliceLockedBars(solo,locks){
  const nb=solo.bars.length,TPBAR=(solo.bpb||4)*6;
  Object.keys(locks||{}).forEach(k=>{
    const b=+k,notes=locks[k];
    if(!(b>=0&&b<nb)||!Array.isArray(notes)||!notes.length)return;
    if(notes.reduce((a,n)=>a+n.d,0)!==TPBAR)return;          /* 박자가 다른 곡의 마디는 무시 */
    solo.bars[b].notes=JSON.parse(JSON.stringify(notes));
    solo.bars[b].locked=true;
    if(!solo.bars[b].tags.includes('고정 마디'))solo.bars[b].tags.push('고정 마디');
  });
  /* 이음매 정리: 붙임줄은 다음 마디 첫 음이 같은 음일 때만 남긴다 */
  for(let b=0;b<nb;b++){
    const ns=solo.bars[b].notes,last=ns[ns.length-1],nx=solo.bars[b+1];
    if(!last||!last.tie)continue;
    const seam=!nx||!!solo.bars[b].locked!==!!nx.locked;
    if(!nx||(seam&&(nx.notes[0].midi===null||nx.notes[0].midi!==last.midi)))delete last.tie;
  }
  return solo;
}
/* 고정 마디와 새 마디가 만나는 곳의 어색함: 7반음을 넘는 도약만큼 비용 */
function lockSeamCost(solo){
  let cost=0;
  const edge=(bar,first)=>{const p=bar.notes.filter(n=>n.midi!==null);return p.length?(first?p[0]:p[p.length-1]).midi:null};
  for(let b=0;b+1<solo.bars.length;b++){
    if(!!solo.bars[b].locked===!!solo.bars[b+1].locked)continue;
    const a=edge(solo.bars[b],false),c=edge(solo.bars[b+1],true);
    if(a!==null&&c!==null)cost+=Math.max(0,Math.abs(a-c)-7);
  }
  return cost;
}

/* 웹 빌드 곡 상태 */
const SONG_STATUS={"p251": {"s": "practice", "n": "앱 연습용 진행", "a": []}, "blues12": {"s": "practice", "n": "앱 연습용 진행", "a": []}, "m25": {"s": "practice", "n": "앱 연습용 진행", "a": []}, "form-rhythm": {"s": "form", "n": "공통 형식 — 재즈에서 널리 쓰는 리듬 체인지 진행", "a": []}, "form-jazzblues": {"s": "form", "n": "공통 형식 — 재즈 블루스 12마디", "a": []}, "form-minorblues": {"s": "form", "n": "공통 형식 — 마이너 블루스 12마디", "a": []}, "pd-i-got-rhythm": {"s": "draft", "n": "거슈윈 1930 · 퍼블릭 도메인. 재즈에서 흔히 치는 32마디(원곡 끝 2마디 꼬리는 뺌)", "a": []}, "pd-honeysuckle-rose": {"s": "draft", "n": "팻츠 월러 1929 · 퍼블릭 도메인. A 5~8마디 확인 필요", "a": []}, "pd-tea-for-two": {"s": "draft", "n": "빈센트 유먼스 1924 · 퍼블릭 도메인. B 끝 턴어라운드·마지막 8마디 확인 필요", "a": []}, "pd-it-had-to-be-you": {"s": "draft", "n": "아이셤 존스 1924 · 퍼블릭 도메인. 9~16마디·마지막 8마디 확인 필요", "a": []}};
/* ── 곡 불러오기 v0.42(v0.44 보강) — MusicXML(.musicxml/.xml/.mxl) · iReal Pro 링크 → 앱 곡 데이터 ─────────────
   사용자가 「자기 기기에서」 연 파일만 읽는다. 결과는 그 기기의 「내 곡」에만 저장되고 어디로도 보내지 않는다.
   DOM 없이 Node에서도 돈다(작은 XML 파서 · DecompressionStream으로 .mxl 압축 해제).
   결과 형식: {song:{n,c,k,bpm,m,f:[섹션,프레이즈],ch}, head:{notes:[{t,d,midi}],bpb}|null, warn:[..]}
   v0.44: D.S.·D.C.·코다·Fine 펼치기 · 형식(AABA 등) 추정 · 여러 코러스 연주 악보는 한 코러스로 · 코드 없는 인트로 빼기 ·
          화음 맨 위 음 = 멜로디 · 이조 정보 없는 이조 악기 짐작 · 장·단조 짐작
   코드 표기는 앱 어휘(maj7·m7·7·m7b5·7b9·7#9·6·m6·9·m9·dim7·7sus4·mmaj7·7#11·maj7#11)로 단순화한다. */
'use strict';
const IMP_NOTE=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const imod=x=>((x%12)+12)%12;

/* ── 작은 XML 파서(요소·속성·텍스트·주석·CDATA·DOCTYPE) ── */
function xmlParse(src){
  const root={name:'#root',attrs:{},children:[],text:''},st=[root],n=src.length;let i=0;
  const ent=s=>s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(m,e)=>e[0]==='#'?String.fromCodePoint(/^#x/i.test(e)?parseInt(e.slice(2),16):+e.slice(1)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[e.toLowerCase()]);
  const tagEnd=p=>{let q=null;for(let k=p;k<n;k++){const c=src[k];if(q){if(c===q)q=null}else if(c==='"'||c==="'")q=c;else if(c==='>')return k}return n};
  while(i<n){
    const lt=src.indexOf('<',i);if(lt<0)break;
    if(lt>i){const t=src.slice(i,lt);if(t.trim())st[st.length-1].text+=ent(t)}
    if(src.startsWith('<!--',lt)){const e=src.indexOf('-->',lt);i=e<0?n:e+3;continue}
    if(src.startsWith('<![CDATA[',lt)){const e=src.indexOf(']]>',lt);st[st.length-1].text+=src.slice(lt+9,e<0?n:e);i=e<0?n:e+3;continue}
    if(src[lt+1]==='?'||src[lt+1]==='!'){
      let e=src.indexOf('>',lt);const b=src.indexOf('[',lt);
      if(src.startsWith('<!DOCTYPE',lt)&&b>=0&&b<e){const c=src.indexOf(']>',b);if(c>=0)e=c+1}
      i=e<0?n:e+1;continue;
    }
    const gt=tagEnd(lt+1),raw=src.slice(lt+1,gt).trim();i=gt+1;
    if(raw[0]==='/'){const nm=raw.slice(1).trim();for(let k=st.length-1;k>0;k--)if(st[k].name===nm){st.length=k;break}continue}
    const self=raw.endsWith('/'),body=self?raw.slice(0,-1):raw,m=body.match(/^[^\s/>]+/);if(!m)continue;
    const el={name:m[0],attrs:{},children:[],text:''};
    body.slice(m[0].length).replace(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,(_,k,a,b)=>{el.attrs[k]=ent(a!==undefined?a:b);return ''});
    st[st.length-1].children.push(el);if(!self)st.push(el);
  }
  return root;
}
const xkids=(e,nm)=>e?e.children.filter(c=>c.name===nm):[];
const xkid=(e,nm)=>e?e.children.find(c=>c.name===nm)||null:null;
const xtxt=(e,nm)=>{const k=xkid(e,nm);return k?k.text.trim():''};
function xfind(e,nm){if(!e)return null;for(const c of e.children){if(c.name===nm)return c;const r=xfind(c,nm);if(r)return r}return null}

/* ── .mxl(압축 MusicXML) — ZIP 중앙 디렉터리를 읽고 deflate는 DecompressionStream으로 푼다 ── */
async function unzipEntries(buf){
  const u8=new Uint8Array(buf),dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  let eocd=-1;for(let p=u8.length-22;p>=Math.max(0,u8.length-66000);p--)if(dv.getUint32(p,true)===0x06054b50){eocd=p;break}
  if(eocd<0)throw new Error('압축 파일(.mxl)을 읽지 못했어요');
  const cnt=dv.getUint16(eocd+10,true);let p=dv.getUint32(eocd+16,true);const out={};
  const dec=new TextDecoder('utf-8');
  for(let k=0;k<cnt;k++){
    if(dv.getUint32(p,true)!==0x02014b50)break;
    const meth=dv.getUint16(p+10,true),csz=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),xl=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),lo=dv.getUint32(p+42,true);
    const name=dec.decode(u8.subarray(p+46,p+46+nl));p+=46+nl+xl+cl;
    const ds=lo+30+dv.getUint16(lo+26,true)+dv.getUint16(lo+28,true),data=u8.subarray(ds,ds+csz);
    out[name]={meth,data};
  }
  const read=async nm=>{const e=out[nm];if(!e)return null;
    if(e.meth===0)return dec.decode(e.data);
    if(e.meth!==8)throw new Error('지원하지 않는 압축 방식');
    const s=new Blob([e.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return dec.decode(await new Response(s).arrayBuffer());};
  return {names:Object.keys(out),read};
}
async function mxlToXml(buf){
  const z=await unzipEntries(buf);
  const cont=await z.read('META-INF/container.xml');
  let main=null;if(cont){const r=xfind(xmlParse(cont),'rootfile');if(r)main=r.attrs['full-path']}
  if(!main)main=z.names.find(n=>/\.(xml|musicxml)$/i.test(n)&&!/^META-INF\//.test(n));
  const x=main&&await z.read(main);if(!x)throw new Error('압축 안에 악보(MusicXML)가 없어요');
  return x;
}

/* ── 코드 이름 → 앱 어휘 ── */
const MXL_KIND={major:'6','major-sixth':'6',minor:'m7','minor-seventh':'m7','minor-sixth':'m6','minor-ninth':'m9','minor-11th':'m7','minor-13th':'m9',
  dominant:'7','dominant-seventh':'7','dominant-ninth':'9','dominant-11th':'7sus4','dominant-13th':'9','major-seventh':'maj7','major-ninth':'maj7','major-11th':'maj7','major-13th':'maj7',
  'half-diminished':'m7b5',diminished:'dim7','diminished-seventh':'dim7',augmented:'7#9','augmented-seventh':'7#9','major-minor':'mmaj7',
  'suspended-fourth':'7sus4','suspended-second':'7sus4',power:'6'};
function mxlChord(h,shift){
  const rs=xtxt(xkid(h,'root'),'root-step');if(!rs)return null;   /* N.C.·function 표기는 건너뜀 */
  const ra=+xtxt(xkid(h,'root'),'root-alter')||0,kindEl=xkid(h,'kind'),kind=kindEl?kindEl.text.trim():'major';
  if(kind==='none'||kind==='pedal')return null;
  let t=MXL_KIND[kind]||(/dominant/.test(kind)?'7':/minor/.test(kind)?'m7':/major/.test(kind)?'maj7':'6');
  const txt=(kindEl&&kindEl.attrs.text||'').toLowerCase();
  const alt=xkids(h,'degree').map(d=>({v:+xtxt(d,'degree-value'),a:+xtxt(d,'degree-alter')||0,ty:xtxt(d,'degree-type')}));
  const has=(v,a)=>alt.some(d=>d.v===v&&d.a===a&&d.ty!=='subtract');
  if(t==='7'||t==='9'){
    if(has(9,1)||has(5,1)||has(13,-1)||/alt|\+/.test(txt))t='7#9';
    else if(has(9,-1))t='7b9';
    else if(has(11,1)||has(5,-1))t='7#11';
  }else if(t==='maj7'&&(has(11,1)||has(5,-1)))t='maj7#11';
  else if(t==='m7'&&has(5,-1))t='m7b5';
  return {root:imod({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[rs]+ra+(shift||0)),type:t};
}
/* iReal 품질 문자열 → 앱 어휘 */
function irealQual(q){
  q=q.replace(/\(.*?\)/g,'');
  if(/^\^7?#11|^\^9#11|^\^13#11/.test(q))return 'maj7#11';
  if(/^\^/.test(q))return 'maj7';
  if(/^-\^/.test(q))return 'mmaj7';
  if(/^-6/.test(q))return 'm6';
  if(/^-(9|11|13)/.test(q))return /^-9|^-13/.test(q)?'m9':'m7';
  if(/^-/.test(q))return /^-7b5/.test(q)?'m7b5':'m7';
  if(/^h/.test(q))return 'm7b5';
  if(/^o/.test(q))return 'dim7';
  if(/sus/.test(q))return '7sus4';
  if(/^(6|69|2|add9)?$/.test(q))return '6';
  if(/^(\+|7#5|7b13|7alt|7#9|7b9#9|9#5|7#5#9|7b9b13|alt)/.test(q))return /^7b9(?!#)/.test(q)?'7b9':'7#9';
  if(/^7b9|^13b9|^9b9/.test(q))return '7b9';
  if(/^(7#11|9#11|13#11|7b5)/.test(q))return '7#11';
  if(/^(9|13|11)/.test(q))return /^11/.test(q)?'7sus4':'9';
  if(/^7/.test(q))return '7';
  return '6';
}
/* 한 마디의 박별 코드 → 토큰(1개·반마디 2개·박마다) */
function barTokens(beats,bpb){
  const nm=c=>IMP_NOTE[c.root]+c.type;
  if(beats.every(c=>nm(c)===nm(beats[0])))return [nm(beats[0])];
  const half=Math.ceil(bpb/2);
  if(beats.every((c,b)=>nm(c)===nm(beats[b<half?0:half])))return [nm(beats[0]),nm(beats[half])];
  return beats.map(nm);
}
function formOf(nb){const P=(nb%8===0||nb%4!==0)?8:4;return ['A'.repeat(Math.max(1,Math.floor(nb/P))),P]}
const KEY_FIFTHS_PC=f=>imod(f*7);

/* ── v0.44 마디 코드 비교 — 같은 뿌리·같은 계열(장·단·속·반감·감)이면 거의 같은 마디로 본다 ── */
const IMP_FAM={'6':'M',maj7:'M','maj7#11':'M',m7:'m',m6:'m',m9:'m',mmaj7:'m','7':'7','9':'7','7b9':'7','7#9':'7','7#11':'7','7sus4':'7',m7b5:'h',dim7:'o'};
const barSig=tok=>String(tok).split(' ').map(c=>{const m=c.match(/^([A-G]b?)(.*)$/);return m?m[1]+(IMP_FAM[m[2]]||m[2]):c}).join(' ');
const barSim=(a,b)=>{if(a===b)return 1;const A=barSig(a),B=barSig(b);if(A===B)return 0.9;return A.split(' ')[0]===B.split(' ')[0]?0.5:0};
const IMP_FORM={chorusMin:0.6,introTol:0.15,sameBlock:0.7,divisorKeep:0.9};   /* 코러스 반복 인정 · 인트로 판단 여유 · 같은 섹션 인정 · 짧은 주기 우선(점수 90% 이상이면) */

/* v0.44 형식 추정 — 8마디(64마디 이상은 16마디) 블록끼리 코드가 얼마나 같은지로 AABA·ABAC 등을 붙인다. 12마디는 블루스 AAB/4 */
function detectForm(bars){
  const nb=bars.length;
  if(nb===12)return ['AAB',4];
  const P=nb>=64&&nb%16===0?16:(nb%8===0?8:0);
  if(!P||nb<16)return formOf(nb);
  const blocks=[];for(let i=0;i<nb;i+=P)blocks.push(bars.slice(i,i+P));
  const cmp=(x,y)=>{const n=P-2;let s=0;for(let j=0;j<n;j++)s+=barSim(x[j],y[j]);return s/n};   /* 끝 2마디(턴어라운드·엔딩)는 빼고 비교 */
  const reps=[],lab=[];
  for(const b of blocks){let best=-1,bs=0;reps.forEach((r,ri)=>{const s=cmp(b,r);if(s>bs){bs=s;best=ri}});
    if(best>=0&&bs>=IMP_FORM.sameBlock)lab.push(String.fromCharCode(65+best));else{reps.push(b);lab.push(String.fromCharCode(64+reps.length))}}
  return [lab.join(''),P];
}

/* v0.44 여러 코러스가 적힌 연주 악보(헤드+솔로 전사 등) — 코드가 P마디마다 되풀이되면 한 코러스로 줄인다.
   코러스마다 같은 자리 코드를 모아 가장 많이 나온 것을 고른다(전사 실수·리하모니 완화). 반환 {P,o,n,bars}|null */
function findChoruses(bars){
  const nb=bars.length,sc={};
  for(const P of [12,16,24,32,36,40,48,64]){if(nb<P*2)continue;let s=0,n=0;for(let i=0;i+P<nb;i++){s+=barSim(bars[i],bars[i+P]);n++}sc[P]=s/n}
  const Ps=Object.keys(sc).map(Number);if(!Ps.length)return null;
  let P=Ps.reduce((a,b)=>sc[b]>sc[a]?b:a);
  const smaller=Ps.filter(q=>q<P&&P%q===0&&sc[q]>=sc[P]*IMP_FORM.divisorKeep).sort((a,b)=>a-b);if(smaller.length)P=smaller[0];
  if(sc[P]<IMP_FORM.chorusMin)return null;
  const win=o=>{let s=0;for(let j=0;j<P;j++)s+=barSim(bars[o+j],bars[o+j+P]);return s/P};
  let o=0;for(let q=0;q<P&&q+2*P<=nb;q++)if(win(q)>=Math.max(IMP_FORM.chorusMin,sc[P]-IMP_FORM.introTol)){o=q;break}
  const n=Math.floor((nb-o)/P);if(n<2)return null;
  const out=[];
  /* 자리마다 계열(뿌리+장·단·속…)로 먼저 표를 모으고, 이긴 계열 안에서 가장 많은 표기를 고른다. 동점이면 첫 코러스(헤드) 쪽 */
  const pick=(arr,key)=>{const c={};arr.forEach(x=>{const q=key(x);c[q]=(c[q]||0)+1});const mx=Math.max(...Object.values(c));return arr.find(x=>c[key(x)]===mx)};
  for(let j=0;j<P;j++){const col=[];for(let k=0;k<n;k++)col.push(bars[o+j+k*P]);const fam=barSig(pick(col,barSig));out.push(pick(col.filter(t=>barSig(t)===fam),t=>t))}
  return {P,o,n,bars:out};
}

/* v0.44 반복·엔딩·D.S.·D.C.·코다·Fine 펼치기(MusicXML·iReal 공통).
   마디: {fwd,bwd(반복 횟수),ending:[번호],segno,codaSign,codaTgt,toCoda,ds,dc,fine}
   D.S./D.C. 뒤에는 반복을 다시 돌지 않고 엔딩은 마지막 번호를 탄다(관례). 코다: 마지막 코다 표시가 도착점, 그 앞의 표시는 「To Coda」 */
function navUnroll(L){
  const out=[],done=new Set(),n=L.length,segI=L.findIndex(m=>m.segno);
  let tgt=-1;for(let i=n-1;i>=0;i--)if(L[i].codaTgt){tgt=i;break}
  if(tgt<0)for(let i=n-1;i>=0;i--)if(L[i].codaSign){tgt=i;break}
  const toC=i=>i!==tgt&&(L[i].toCoda||(L[i].codaSign&&i<tgt));
  const gMax=[];for(let i=0;i<n;i++)if(L[i].ending){let j=i;while(j<n&&L[j].ending)j++;const mx=Math.max(...L.slice(i,j).flatMap(m=>m.ending));for(let q=i;q<j;q++)gMax[q]=mx;i=j-1}
  let i=0,start=0,pass=1,jumped=false,guard=0;out.nav=false;
  while(i<n&&out.length<1500&&guard++<20000){
    const m=L[i];
    if(!jumped&&m.fwd&&start!==i){start=i;pass=1}
    if(m.ending&&!m.ending.includes(jumped?gMax[i]:pass)){i++;continue}
    out.push(m);
    if(jumped&&m.fine)break;
    if(jumped&&tgt>i&&toC(i)){i=tgt;continue}
    if(!jumped&&m.bwd&&!done.has(i)){if(pass<m.bwd){pass++;i=start;continue}done.add(i);start=i+1;pass=1}
    if(!jumped&&(m.ds||m.dc)){jumped=true;out.nav=true;i=m.ds&&segI>=0?segI:0;continue}
    i++;
  }
  return out;
}
/* 악보 글자(words)로 적힌 길잡이 */
function navWords(M,w){
  const s=String(w).toLowerCase().replace(/\s+/g,' ').trim();
  if(/(^|[^a-z])d\.? ?s\.?($|[^a-z])|dal segno/.test(s))M.ds=true;
  else if(/(^|[^a-z])d\.? ?c\.?($|[^a-z])|da capo/.test(s))M.dc=true;
  else if(/to coda/.test(s))M.toCoda=true;
  else if(/^fine\.?$/.test(s))M.fine=true;
  else if(/^coda\.?$/.test(s))M.codaSign=true;
}
/* v0.44 이조 정보(<transpose>)가 빠진 이조 악기 파트 — 파트 이름으로 실음 이동량을 짐작한다 */
function guessTransp(name){
  const s=String(name||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  if(/sax/.test(s)){if(/tenor/.test(s))return [-14,'테너 색소폰'];if(/alto/.test(s))return [-9,'알토 색소폰'];if(/bari/.test(s))return [-21,'바리톤 색소폰'];if(/soprano/.test(s))return [-2,'소프라노 색소폰'];return null}
  if(/\bin c\b|\(c\)|c trumpet/.test(s))return null;
  if(/clarinet|clarinette|klarinette|clarinetto/.test(s))return /\bin a\b/.test(s)?[-3,'A 클라리넷']:[-2,'B♭ 클라리넷'];
  if(/trumpet|trompete|trompette|tromba|cornet|flugel/.test(s))return [-2,'B♭ 트럼펫'];
  if(/horn|corno|\bcor\b/.test(s)&&!/english|anglais/.test(s))return [-7,'F 호른'];
  return null;
}

/* ── MusicXML → 곡 ── */
function musicXmlToSong(xml,fileName){
  const root=xmlParse(xml),warn=[];
  const sp=xkid(root,'score-partwise');
  if(!sp)throw new Error(xkid(root,'score-timewise')?'score-timewise 형식은 아직 못 읽어요(악보 프로그램에서 일반 MusicXML로 다시 내보내 주세요)':'MusicXML 악보가 아니에요');
  /* 제목: work-title → movement-title → 악보 위 글자(credit, 제목 표시 우선) → 파일 이름 */
  const cred=xkids(sp,'credit'),credT=(cred.find(c=>xtxt(c,'credit-type')==='title')||cred.find(c=>xkid(c,'credit-words')));
  const title=(xtxt(xkid(sp,'work'),'work-title')||xtxt(sp,'movement-title')||(credT?xtxt(credT,'credit-words'):'')||String(fileName||'').replace(/\.(musicxml|xml|mxl)$/i,'')||'불러온 곡').trim();
  const parts=xkids(sp,'part');if(!parts.length)throw new Error('악보에 파트가 없어요');
  const hasNotes=p=>xkids(p,'measure').some(m=>xkids(m,'note').some(n=>xkid(n,'pitch')));
  const hasHarm=p=>xkids(p,'measure').some(m=>xkid(m,'harmony'));
  const melP=parts.find(hasNotes)||parts[0],harP=hasHarm(melP)?melP:(parts.find(hasHarm)||null);
  if(!harP)throw new Error('코드 기호(화음 이름)가 없는 악보예요 — 코드가 적힌 리드시트를 불러와 주세요');
  /* v0.44 이조 정보가 없는 이조 악기 파트는 이름으로 짐작해 실음으로 옮긴다 */
  const spl=xkids(xkid(sp,'part-list')||{children:[]},'score-part');
  const partName=p=>{const s=spl.find(x=>x.attrs.id===p.attrs.id);return s?(xtxt(s,'part-name')||xtxt(s,'part-abbreviation')):''};
  const hasTr=p=>xkids(p,'measure').some(m=>xkids(m,'attributes').some(a=>xkid(a,'transpose')));
  const shift0=p=>{if(hasTr(p))return 0;const g=guessTransp(partName(p));if(!g)return 0;
    const w='악보에 이조 정보가 없어 「'+g[1]+'」 파트로 보고 실음으로 옮겼어요(이미 실음 악보라면 조를 다시 고르세요)';if(!warn.includes(w))warn.push(w);return g[0]};
  const midiOf=(pi,sh)=>12*((+xtxt(pi,'octave'))+1)+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[xtxt(pi,'step')]+(+xtxt(pi,'alter')||0)+sh;
  /* 파트를 마디 목록으로: 박자·조·이조·반복·엔딩·길잡이(D.S.·코다)·코드 위치·음 */
  function readPart(p,wantNotes){
    let div=1,beats=4,bt=4,fifths=null,mode='major',shift=shift0(p),tempo=null,melVoice=null,ending=null;
    return xkids(p,'measure').map(m=>{
      const M={num:m.attrs.number,implicit:m.attrs.implicit==='yes',harm:[],notes:[],fwd:false,bwd:0,ending:null};
      let pos=0,maxPos=0;
      for(const c of m.children){
        if(c.name==='attributes'){
          if(xtxt(c,'divisions'))div=+xtxt(c,'divisions')||div;
          const ti=xkid(c,'time');if(ti&&xtxt(ti,'beats')){beats=+xtxt(ti,'beats').split('+').reduce((a,b)=>+a+ +b,0);bt=+xtxt(ti,'beat-type')||4}
          const ke=xkid(c,'key');if(ke&&fifths===null&&xtxt(ke,'fifths')!==''){fifths=+xtxt(ke,'fifths');mode=xtxt(ke,'mode')||'major'}
          const tr=xkid(c,'transpose');if(tr)shift=+xtxt(tr,'chromatic')||0;
        }else if(c.name==='harmony'){
          const ch=mxlChord(c,shift);const off=+xtxt(c,'offset')||0;
          if(ch)M.harm.push({tk:Math.round((pos+off)*6/div),ch});
        }else if(c.name==='note'){
          if(xkid(c,'grace'))continue;
          const du=+xtxt(c,'duration')||0;
          const v=xtxt(c,'voice')||'1';
          if(xkid(c,'chord')){   /* v0.44 화음으로 적힌 곳(피아노 오른손 등)은 맨 위 음을 멜로디로 */
            const pi=xkid(c,'pitch'),L=M.notes[M.notes.length-1];
            if(wantNotes&&pi&&v===(melVoice||'1')&&L&&L.midi!==null){const mi=midiOf(pi,shift);if(mi>L.midi)L.midi=mi}
            continue;
          }
          if(wantNotes){
            if(melVoice===null&&xkid(c,'pitch'))melVoice=v;
            if(v===(melVoice||'1')){
              const pi=xkid(c,'pitch'),ties=xkids(c,'tie').map(t=>t.attrs.type);
              const midi=pi?midiOf(pi,shift):null;
              M.notes.push({tk:Math.round(pos*6/div),d:Math.round(du*6/div),midi,tieStop:ties.includes('stop')});
            }
          }
          pos+=du;
        }else if(c.name==='backup')pos-=+xtxt(c,'duration')||0;
        else if(c.name==='forward')pos+=+xtxt(c,'duration')||0;
        else if(c.name==='barline'){
          const r=xkid(c,'repeat');if(r){if(r.attrs.direction==='forward')M.fwd=true;else M.bwd=+r.attrs.times||2}
          const e=xkid(c,'ending');if(e){const ns=String(e.attrs.number||'1').split(/[ ,]+/).map(Number).filter(Boolean);
            if(e.attrs.type==='start'){ending=ns;M.ending=ns}else{M.ending=M.ending||ending||ns;ending=null}}
          if(xkid(c,'segno'))M.segno=true;if(xkid(c,'coda'))M.codaSign=true;
        }else if(c.name==='direction'||c.name==='sound'){
          const s=c.name==='sound'?c:xfind(c,'sound');if(s&&s.attrs.tempo&&!tempo)tempo=+s.attrs.tempo;
          const pm=xfind(c,'per-minute');if(pm&&!tempo)tempo=+pm.text||null;
          /* v0.44 길잡이: 세뇨·코다 기호, 「D.S. al Coda」 같은 글자, 재생 지시(sound) */
          for(const d of xkids(c,'direction-type')){if(xkid(d,'segno'))M.segno=true;if(xkid(d,'coda'))M.codaSign=true;const w=xkids(d,'words').map(x=>x.text).join(' ');if(w.trim())navWords(M,w)}
          if(s){const a=s.attrs;if(a.segno)M.segno=true;if(a.coda)M.codaTgt=true;if(a.tocoda)M.toCoda=true;if(a.dalsegno)M.ds=true;if(a.dacapo==='yes')M.dc=true;if(a.fine)M.fine=true}
        }
        if(pos>maxPos)maxPos=pos;
      }
      if(ending&&!M.ending)M.ending=ending;
      M.len=Math.round(maxPos*6/div);M.bpbRaw=beats*4/bt;M.full=Math.round(beats*4/bt*6);M.fifths=fifths;M.mode=mode;M.tempo=tempo;M.shift=shift;
      return M;
    });
  }
  let H=readPart(harP,harP===melP),N=harP===melP?H:readPart(melP,true);
  /* 못갖춘마디(픽업) — 첫 마디가 짧으면 빼고(멜로디도) 알린다 */
  if(H.length>1&&H[0].len<H[0].full&&!H[0].harm.length){H=H.slice(1);if(N!==H){N=N.slice(1)}else N=H;warn.push('못갖춘마디(픽업)는 빼고 읽었어요')}
  /* 반복·엔딩·D.S.·코다 펼치기 — 길잡이는 멜로디 파트에만 적혀 있을 수도 있어 두 파트를 합쳐 본다 */
  const NAVK=['segno','codaSign','codaTgt','toCoda','ds','dc','fine'];
  const order=navUnroll(H.map((m,k)=>{const o=Object.assign({},m,{k});if(N!==H&&N[k])NAVK.forEach(f=>{if(N[k][f])o[f]=true});return o}));
  const Nk=N===H?null:N;
  /* 박자 */
  let bpb=Math.round(H[0].bpbRaw);let merge=1;
  if(Math.abs(H[0].bpbRaw-bpb)>0.01||![2,3,4,5].includes(bpb))throw new Error(H[0].bpbRaw+'박(4분음표 기준) 마디는 아직 못 읽어요 — 4/4·3/4·5/4·2/2·6/8을 지원해요');
  if(bpb===2){merge=2;bpb=4;warn.push('2박 마디를 두 마디씩 묶어 4/4로 읽었어요')}
  if(H.some(m=>Math.abs(m.bpbRaw-H[0].bpbRaw)>0.01))warn.push('중간에 박자가 바뀌는 곳은 첫 박자 기준으로 읽었어요');
  /* 마디별 박 단위 코드 */
  let last=null,intro=0;const bars=[],head=[];let tick=0;
  const beatOf=(m,k)=>{const off=k*m.full;return m.harm.map(h=>({b:Math.floor((h.tk+off)/6),ch:h.ch}))};
  for(let q=0;q<order.length;q+=merge){
    const grp=order.slice(q,q+merge),beats=[];const hs=[];grp.forEach((m,k)=>beatOf(m,k).forEach(x=>hs.push(x)));
    if(!last&&!hs.length){intro+=grp.length;continue}   /* v0.44 첫 코드 전의 마디(코드 없는 인트로)는 뺀다 */
    for(let b=0;b<bpb;b++){const h=hs.filter(x=>x.b<=b).pop();if(h)last=h.ch;if(!last)last=hs[0].ch;beats.push(last)}
    bars.push(barTokens(beats,bpb).join(' '));
    grp.forEach((m,k)=>{const src=Nk?Nk[m.k]:m;if(src)src.notes.forEach(n=>head.push({t:tick+k*m.full+n.tk,d:n.d,midi:n.midi,tieStop:n.tieStop}))});
    tick+=bpb*6;
  }
  if(!bars.length)throw new Error('코드를 읽지 못했어요');
  if(order.nav||order.length>H.length)warn.push((order.nav?'반복·D.S.·코다를 따라 ':'반복·엔딩을 ')+'펼쳐 '+order.length+'마디로 읽었어요');
  if(intro)warn.push('코드가 없는 앞 '+intro+'마디는 인트로로 보고 뺐어요');
  /* 멜로디: 붙임줄 합치기 · 쉼표 제외 */
  let notes=[];for(const n of head){if(n.midi===null)continue;const p=notes[notes.length-1];if(n.tieStop&&p&&p.midi===n.midi&&p.t+p.d===n.t){p.d+=n.d;continue}notes.push({t:n.t,d:n.d,midi:n.midi})}
  /* v0.44 여러 코러스(헤드+솔로 전사 등)면 한 코러스로 줄이고 멜로디는 첫 코러스(헤드)만 남긴다 */
  let B=bars;const cr=bars.length>=24?findChoruses(bars):null;
  if(cr){const T=bpb*6,a=cr.o*T,b=(cr.o+cr.P)*T;B=cr.bars;notes=notes.filter(n=>n.t>=a&&n.t<b).map(n=>({t:n.t-a,d:Math.min(n.d,b-n.t),midi:n.midi}));
    warn.push(cr.P+'마디 × '+cr.n+'코러스가 적힌 연주 악보로 보여요 — 코드는 코러스들을 모아 한 코러스로 정하고, 멜로디는 첫 코러스만 헤드로 남겼어요'+(cr.o?'(그 앞 '+cr.o+'마디는 인트로로 보고 뺐어요)':''))}
  else if(bars.length>64)warn.push('곡이 '+bars.length+'마디로 길어요 — 한 코러스만 담긴 악보인지 확인해 주세요');
  const f0=H[0].fifths,sh=H[0].shift;
  let k=f0===null?null:imod(KEY_FIFTHS_PC(f0)+(H[0].mode==='minor'?9:0)+sh);
  if(k===null){const lastC=B[B.length-1].split(' ').pop();k=IMP_NOTE.indexOf(lastC.match(/^[A-G]b?/)[0]);warn.push('조표가 없어 마지막 코드로 조를 정했어요')}
  else if(H[0].mode!=='minor'){   /* v0.44 조표만으로는 장·단조를 모른다 — 마지막(또는 첫) 코드가 나란한조 단화음이면 단조 */
    const rel=imod(k+9),root=t=>{const m=String(t).split(' ')[0].match(/^([A-G]b?)(.*)$/);return m?[IMP_NOTE.indexOf(m[1]),IMP_FAM[m[2]]]:[-1,'']};
    let mi=0,ma=0;B.forEach(t=>{const [r,f]=root(t);if(r===rel&&f==='m')mi++;else if(r===k&&f==='M')ma++});   /* 으뜸화음이 장·단 중 어느 쪽으로 더 자주 오나 */
    const [lr,lf]=root(B[B.length-1]);
    if(mi>ma||(mi===ma&&lr===rel&&lf==='m'))k=rel;
  }
  const bpm=Math.max(40,Math.min(320,Math.round(H.find(m=>m.tempo)?.tempo||120)));
  return {song:{n:title,c:'스윙',k,bpm,m:bpb,f:detectForm(B),ch:B.join('|')},head:notes.length?{notes,bpb}:null,warn};
}

/* ── iReal Pro 링크(irealb:// · irealbook://) 또는 그 링크가 든 HTML ── */
function irealUnscramble(s){
  const swap50=p=>{const a=p.split('');for(let i=0;i<5;i++){a[49-i]=p[i];a[i]=p[49-i]}for(let i=10;i<24;i++){a[49-i]=p[i];a[i]=p[49-i]}return a.join('')};
  let r='';while(s.length>50){const p=s.slice(0,50);s=s.slice(50);r+=s.length<2?p:swap50(p)}
  return (r+s).replace(/Kcl/g,'| x').replace(/LZ/g,' |').replace(/XyQ/g,'   ');
}
const IREAL_STYLE=[[/ballad/i,'발라드'],[/bossa|samba|latin|afro|cuban|salsa|mambo|cha/i,'라틴'],[/funk|soul|rock|pop|rnb|r&b|groove|fusion/i,'펑키'],[/blues|shuffle/i,'블루스']];
function irealToSongs(text){
  let s=String(text||'');
  const m=s.match(/irealb(?:ook)?:\/\/[^"'<>\s]+/);if(!m)throw new Error('iReal Pro 링크(irealb://…)를 찾지 못했어요');
  s=m[0];const book=/^irealbook:/.test(s);
  try{s=decodeURIComponent(s.replace(/^irealb(?:ook)?:\/\//,''))}catch(e){throw new Error('링크가 깨졌어요(일부만 복사됐을 수 있어요)')}
  const chunks=s.split('===').filter(x=>x.trim());
  const out=[];
  const last=chunks[chunks.length-1];let playlist='';if(chunks.length>1&&!/=/.test(last)){playlist=chunks.pop().trim()}   /* 끝의 플레이리스트 이름(v0.48 폴더 이름으로 씀) */
  for(const ch of chunks){
    try{out.push(Object.assign(irealOne(ch,book),{playlist}))}catch(e){out.push({error:e.message,title:ch.split('=')[0]})}
  }
  return out;
}
function irealOne(str,book){
  const f=str.split('=');const warn=[];
  let mi=f.findIndex(x=>/^1r34LbKcu7/.test(x)),music;
  if(mi>=0)music=irealUnscramble(f[mi].slice(10));
  else{mi=book?5:6;music=f[mi]||'';if(!music)throw new Error('곡 내용을 찾지 못했어요')}
  const title=(f[0]||'불러온 곡').replace(/\s*,\s*The$/,'').trim(),style=f[3]||'',keyS=f[4]||'C';
  const bpmF=+f[mi+2]||0;
  /* 박자 */
  /* v0.61 박자 — iReal 표기 T44·T34·T54·T22·T68·T12(12/8)·T98… 를 표로. 예전 식(Math.round(a*4/b))은 12/8을 12박으로 읽어 막고,
     9/8·7/8·5/8을 5/4·4/4·3/4로 조용히 잘못 읽었다(외부 검토 11/13 지적 — 확인함). 겹박자는 큰 박 기준(12/8 → 4박, 6/8·9/8 → 3박).
     엔진은 3·4·5박만 다룬다 — 2/4·7/8·5/8 등은 분명한 안내로 막는다 */
  const METER={'44':4,'34':3,'54':5,'22':4,'12':4,'68':3,'98':3};
  const ts=music.match(/T(\d)(\d)/);let bpb=4;
  if(ts){const k=ts[1]+ts[2];if(METER[k]===undefined)throw new Error('박자 '+(k==='12'?'12/8':ts[1]+'/'+ts[2])+'는 아직 못 읽어요 — 지금은 4/4·3/4·5/4·2/2·6/8·9/8·12/8만 됩니다');bpb=METER[k]}
  /* 토큰화: 마디·반복·엔딩·코드 */
  /* v0.44 글자 지시(<D.S. al Coda>·<D.C. al Fine>·<Fine>)는 길잡이 표시로 바꿔 두고 나머지 글자는 지운다 */
  const src=music.replace(/<([^>]*)>/g,(m0,w)=>{const M={};navWords(M,w);return M.ds?' ¶DS ':M.dc?' ¶DC ':M.fine?' ¶FN ':' '})
    .replace(/\([^)]*\)/g,' ').replace(/T\d\d/g,' ').replace(/\*([A-Za-z])/g,' ¶S$1 ');   /* v0.47 섹션 표시(*A·*B·*i 인트로·*v 버스)는 남긴다 */
  const bars=[];let curB={ch:[],fwd:false,bwd:false,end:null},ending=null,pend={},sec=null;
  const push=()=>{if(curB.ch.length||curB.rep){curB.end=curB.end||ending;Object.assign(curB,pend);pend={};curB.sec=sec;bars.push(curB)}curB={ch:[],fwd:false,bwd:false,end:null}};
  /* 코드: 뿌리 + 품질(- ^ h o + 숫자 sus alt add, 숫자 앞 #·b) + /베이스. S(세뇨)·Q(코다)·글자 지시는 길잡이로, 그 밖의 표시(Y·U·f·s·l 등)는 건너뜀 */
  const re=/(\{|\}|\[|\]|\||Z|¶DS|¶DC|¶FN|¶S[A-Za-z]|S|Q|N(\d)|x|r|n|p|W(?:\/[A-G][b#]?)?|([A-G][b#]?)((?:[-^ho+]|\d|sus|alt|add|[#b](?=\d))*)(?:\/[A-G][b#]?)?)/g;let t;
  while((t=re.exec(src))){
    const k=t[0];
    if(k.startsWith('¶S'))sec=k[2];
    else if(k==='S')pend.segno=true;
    else if(k==='Q')pend.codaSign=true;
    else if(k==='¶DS')pend.ds=true;
    else if(k==='¶DC')pend.dc=true;
    else if(k==='¶FN')pend.fine=true;
    else if(k==='{'){push();ending=null;curB.fwd=true}
    else if(k==='}'){curB.bwd=true;push();ending=null}
    else if(k==='['||k===']'||k==='Z'){push();ending=null}
    else if(k==='|')push();
    else if(t[2]){ending=[+t[2]];curB.end=ending}
    else if(k==='x'){curB.rep=1}
    else if(k==='r'){curB.rep=2}
    else if(k==='n'||k==='p'||k[0]==='W'){curB.ch.push(null)}
    else if(t[3]){const base={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[t[3][0]]+(t[3][1]==='b'?-1:t[3][1]==='#'?1:0);curB.ch.push({root:imod(base),type:irealQual(t[4]||'')})}
  }
  push();
  /* x(한 마디 반복)·r(두 마디 반복) 채우기 */
  const nv=b=>({segno:b.segno,codaSign:b.codaSign,ds:b.ds,dc:b.dc,fine:b.fine,sec:b.sec});   /* 반복 마디는 코드만 베끼고 길잡이는 제 것 */
  const flat=[];for(const b of bars){if(b.rep===1&&!b.ch.length&&flat.length){flat.push(Object.assign({},flat[flat.length-1],{fwd:b.fwd,bwd:b.bwd,end:b.end},nv(b)));continue}
    if(b.rep===2&&!b.ch.length&&flat.length>=2){flat.push(Object.assign({},flat[flat.length-2],{fwd:b.fwd,bwd:false,end:b.end},nv(b)));flat.push(Object.assign({},flat[flat.length-2],{fwd:false,bwd:b.bwd,end:b.end},nv({})));continue}
    flat.push(b)}
  /* 반복·엔딩·D.S.·코다 펼치기(v0.44 공통 navUnroll) */
  const order=navUnroll(flat.map(b=>Object.assign({},b,{bwd:b.bwd?2:0,ending:b.end})));
  /* v0.47 인트로(*i)·버스(*v) 구간은 곡 형식에서 뺀다(솔로는 형식 위에서 돈다). 남는 마디가 너무 적으면 그대로 둔다 */
  const isX=b=>b.sec==='i'||b.sec==='v',nI=order.filter(b=>b.sec==='i').length,nV=order.filter(b=>b.sec==='v').length;
  const drop=(nI||nV)&&order.length-nI-nV>=4;
  let lastC=null;const out=[],outSec=[];
  for(const b of order){
    if(drop&&isX(b))continue;
    const cs=b.ch.map(c=>c||lastC);const real=cs.filter(Boolean);
    if(!real.length&&!lastC)continue;
    const n=Math.max(1,cs.length),beats=[];
    for(let q=0;q<bpb;q++){const c=cs[Math.min(n-1,Math.floor(q*n/bpb))]||lastC;beats.push(c)}
    beats.forEach(c=>{if(c)lastC=c});
    out.push(barTokens(beats.map(c=>c||lastC),bpb).join(' '));outSec.push(b.sec);
  }
  if(!out.length)throw new Error('코드를 읽지 못했어요');
  if(drop&&nI)warn.push('인트로 '+nI+'마디는 곡 형식에서 뺐어요(iReal 「인트로」 구간)');
  if(drop&&nV)warn.push('버스(verse) '+nV+'마디는 곡 형식에서 뺐어요');
  const km=keyS.match(/^([A-G][b#]?)(-)?/);let k=0;
  if(km){k=imod({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[km[1][0]]+(km[1][1]==='b'?-1:km[1][1]==='#'?1:0))}
  let c='스윙';for(const [re2,cc] of IREAL_STYLE)if(re2.test(style)){c=cc;break}
  const bpm=bpmF>=40?bpmF:(c==='발라드'?70:c==='라틴'?140:c==='펑키'?100:/up/i.test(style)?220:150);
  if(order.nav||order.length!==flat.length)warn.push((order.nav?'반복·D.S.·코다를 따라 ':'반복·엔딩을 ')+'펼쳐 '+order.length+'마디로 읽었어요');
  /* 형식: 코드 비교로 섹션이 하나뿐(A만)으로 나오면 iReal 섹션 표시(A·B·C·D)를 따른다 */
  let fm=detectForm(out);
  const marks=[...new Set(outSec.filter(x=>/^[A-D]$/.test(x||'')))];
  if(/^(.)\1*$/.test(fm[0])&&marks.length>=2){const P=out.length%8===0?8:4;let lab='',last='A';for(let i=0;i<out.length;i+=P){const x=outSec[i];if(/^[A-D]$/.test(x||''))last=x;lab+=last}fm=[lab,P]}
  return {song:{n:title,c,k,bpm,m:bpb,f:fm,ch:out.join('|')},head:null,warn,style};
}

/* ── 멜로디 → ABC(헤드 입력란 형식). 붙임줄로 마디를 넘긴다 ── */
function notesToAbc(notes,bpb){
  const BAR=bpb*6,PC=['C','_D','D','_E','E','F','_G','G','_A','A','_B','B'],NAT={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  const nm=m=>{const s=PC[imod(m)],L=s.replace('_',''),acc=s[0]==='_'?'_':'=';
    const o=Math.floor((m-(acc==='_'?-1:0)-NAT[L]-60)/12);let out=acc+(o>=1?L.toLowerCase():L);
    if(o>=2)out+="'".repeat(o-1);if(o<0)out+=','.repeat(-o);return out};
  const dur=d=>d===3?'':(d%3===0?String(d/3):d+'/3');
  let s='',t=0;const end=notes.length?Math.ceil((notes[notes.length-1].t+notes[notes.length-1].d)/BAR)*BAR:0;
  const emit=(tok,d,tie)=>{while(d>0){const room=BAR-(t%BAR),dd=Math.min(d,room);s+=tok+dur(dd)+(tie&&d>dd?'-':'')+' ';t+=dd;d-=dd;if(t%BAR===0)s+='| '}};
  for(const n of notes){if(n.t>t)emit('z',n.t-t,false);if(n.t<t)continue;emit(nm(n.midi),n.d,true)}
  if(t<end)emit('z',end-t,false);
  return 'M:'+bpb+'/4\nL:1/8\nK:C\n'+s.trim();
}

/* ── 웹 테스트 빌드용 기본 곡(v0.44) — python3 tools/build.py --web 이 songs_part1.js 대신 넣는다 ─────────────
   공통 형식만 담는다(형식·코드 진행 관례는 특정 곡의 표현이 아님). 퍼블릭 도메인 스탠더드는 원 악보(초판)에서 새로 채보해
   출처 대장을 갖춘 뒤 여기에 추가한다 — 출판된 리드시트 모음집에서 옮기지 않는다.
   필드: id · n(이름) · c(분류) · k(조, C=0) · bpm · m(박) · f([섹션, 프레이즈 마디]) · ch(마디는 |, 한 마디 여러 코드는 공백) */
const RAW_SONGS = [
  {id:'form-rhythm',n:'리듬 체인지 (형식)',c:'스윙',k:10,bpm:180,m:4,f:['AABA',8],
   ch:'Bbmaj7 G7|Cm7 F7|Bbmaj7 G7|Cm7 F7|Fm7 Bb7|Ebmaj7 Ab7|Dm7 G7|Cm7 F7|Bbmaj7 G7|Cm7 F7|Bbmaj7 G7|Cm7 F7|Fm7 Bb7|Ebmaj7 Ab7|Cm7 F7|Bbmaj7|D7|D7|G7|G7|C7|C7|F7|F7|Bbmaj7 G7|Cm7 F7|Bbmaj7 G7|Cm7 F7|Fm7 Bb7|Ebmaj7 Ab7|Cm7 F7|Bbmaj7'},
  {id:'form-jazzblues',n:'재즈 블루스 F (형식)',c:'블루스',k:5,bpm:150,m:4,f:['AAB',4],
   ch:'F7|Bb7|F7|Cm7 F7|Bb7|Bb7|F7|Am7b5 D7|Gm7|C7|F7 D7|Gm7 C7'},
  {id:'form-minorblues',n:'마이너 블루스 C (형식)',c:'블루스',k:0,bpm:140,m:4,f:['AAB',4],
   ch:'Cm7|Cm7|Cm7|Cm7|Fm7|Fm7|Cm7|Cm7|Ab7|G7|Cm7|G7'},
  /* ── 퍼블릭 도메인 곡(미국 1930년까지 발행 · 한국 저작권법 제3조 제4항) — v0.45 초안: 재즈에서 흔히 쓰는 진행으로 적음.
     원 악보(초판) 대조 전이라 곡 상태 'draft'. 대조하면 출처 대장(코어 곡셋 후보 대장)에 채보 근거를 적고 상태를 올린다 ── */
  {id:'pd-i-got-rhythm',n:'I Got Rhythm',c:'스윙',k:10,bpm:200,m:4,f:['AABA',8],
   ch:'Bb6 Gm7|Cm7 F7|Bb6 Gm7|Cm7 F7|Bb6 Bb7|Eb6 Ebm6|Cm7 F7|Bb6 F7|Bb6 Gm7|Cm7 F7|Bb6 Gm7|Cm7 F7|Bb6 Bb7|Eb6 Ebm6|Cm7 F7|Bb6|D7|D7|G7|G7|C7|C7|F7|F7|Bb6 Gm7|Cm7 F7|Bb6 Gm7|Cm7 F7|Bb6 Bb7|Eb6 Ebm6|Cm7 F7|Bb6'},
  {id:'pd-honeysuckle-rose',n:'Honeysuckle Rose',c:'스윙',k:5,bpm:160,m:4,f:['AABA',8],
   ch:'Gm7 C7|Gm7 C7|Gm7 C7|Gm7 C7|F6|F6 D7|Gm7 C7|F6 C7|Gm7 C7|Gm7 C7|Gm7 C7|Gm7 C7|F6|F6 D7|Gm7 C7|F6|Cm7 F7|Cm7 F7|Bb6|Bb6|Dm7 G7|Dm7 G7|Gm7|C7|Gm7 C7|Gm7 C7|Gm7 C7|Gm7 C7|F6|F6 D7|Gm7 C7|F6'},
  {id:'pd-tea-for-two',n:'Tea for Two',c:'스윙',k:8,bpm:170,m:4,f:['ABAC',8],
   ch:'Bbm7 Eb7|Bbm7 Eb7|Abmaj7|Abmaj7|Bbm7 Eb7|Bbm7 Eb7|Abmaj7|Abmaj7|Dm7 G7|Dm7 G7|Cmaj7|Cmaj7|Dm7 G7|Dm7 G7|Cmaj7|Bbm7 Eb7|Bbm7 Eb7|Bbm7 Eb7|Abmaj7|Abmaj7|Bbm7 Eb7|Bbm7 Eb7|Abmaj7|Abmaj7|Bbm7 Eb7|Abmaj7 F7|Bbm7 Eb7|Abmaj7 F7|Bbm7|Eb7|Ab6|Ab6'},
  {id:'pd-it-had-to-be-you',n:'It Had to Be You',c:'스윙',k:7,bpm:130,m:4,f:['ABAC',8],
   ch:'Gmaj7|Gmaj7|E7|E7|A7|A7|D7|D7|Gmaj7|Gmaj7|B7|B7|E7|E7|A7|Am7 D7|Gmaj7|Gmaj7|E7|E7|A7|A7|D7|D7|Gmaj7|Gmaj7|Cmaj7|Cm6|Bm7 E7|Am7 D7|G6|Am7 D7'},
];
/* ── 파서 + SONGDB 구성 ── */
function parseCh(ch){
  const m=/^([A-G])([b#\u266d\u266f]?)((?:maj7#11|maj7|mmaj7|m7b5|m7|m6|m9|dim7|7sus4|7b9|7#9|7#11|7|6|9))$/.exec(ch.trim());
  if(!m)throw new Error('bad chord: '+ch);
  const base={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1]];
  const r=(base+(m[2]==='b'||m[2]==='\u266d'?-1:(m[2]==='#'||m[2]==='\u266f')?1:0)+12)%12;
  return {root:r,type:m[3]};
}
const SONGDB={};
RAW_SONGS.forEach(s=>{SONGDB[s.id]={name:s.n,c:s.c,key:s.k,bpm:s.bpm,bpb:s.m||4,
  form:{phrase:s.f[1],sections:s.f[0]},
  bars:s.ch.split('|').map(b=>b.trim().split(/\s+/).map(parseCh))}});
/* 연습용 진행(v0.3 유지) */
SONGDB.p251={name:'메이저 Ⅱ-Ⅴ-Ⅰ (연습)',c:'연습',key:0,bpm:120,bpb:4,form:PROGS.p251.form,bars:PROGS.p251.bars};
SONGDB.blues12={name:'블루스 12마디 (연습)',c:'연습',key:0,bpm:120,bpb:4,form:PROGS.blues.form,bars:PROGS.blues.bars};
SONGDB.m25={name:'마이너 Ⅱ-Ⅴ 연쇄 (연습)',c:'연습',key:0,bpm:120,bpb:4,form:PROGS.autumn.form,bars:PROGS.autumn.bars};

