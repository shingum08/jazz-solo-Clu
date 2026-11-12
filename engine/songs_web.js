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
