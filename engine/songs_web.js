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
];
