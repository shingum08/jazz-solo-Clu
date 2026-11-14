'use strict';
/* 릭·셀 사전 원본(v0.66.3~) — 음이름으로 적고 tools/licks_build.js 가 엔진 자료(뿌리 기준 반음)로 바꾼다.
   · 모두 재즈 교육에서 두루 가르치는 공식(비밥 스케일, 3→♭9 아르페지오, 7→3 해결, 인클로저 …)이다.
     특정 녹음의 전사나 곡의 선율은 넣지 않는다(AGENTS.md 법적 선).
   · s: 음이름+옥타브(기본 8분 = 3틱) · 이름:6 = 4분 · (a b c) = 셋잇단 · z = 쉼 · | = 코드가 바뀌는 자리(half 릭) · > 뒤 = 다음 마디 첫 박 착지음
   · root: 그 마디 코드(half 릭은 앞 코드 Ⅱ)의 뿌리. 예시는 모두 C조(Dm7–G7–C, Dø–G7♭9–Cm)
   · dm: 그냥 7코드(dom) 위에서는 이 난이도(diff)부터 · minDiff: 코드 종류와 상관없이 이 난이도부터 · alt: '얼터드' 연습 주제에서도 쓴다 */
const IN = 0.5, COL = 0.45, MIN = 0.6, CH = 0.5;
const licks = [
  /* ── Ⅴ7 → Ⅰ (메이저) · 안쪽 소리 ── */
  { g: 'Ⅴ7 → Ⅰ', id: 'bb1', cls: ['dom'], to: ['maj', 'dom'], root: 'G3', w: IN, s: 'G4 F#4 F4 E4 D4 C4 B3 A3 > G3', name: '비밥 스케일 하행 1-7-♭7-6-5-4-3-2 → Ⅰ의 5음' },
  { g: 'Ⅴ7 → Ⅰ', id: 'bb2', cls: ['dom'], to: ['maj', 'dom'], root: 'G3', w: IN, s: 'B4 A4 G4 F#4 F4 E4 D4 F4 > E4', name: '3음부터 비밥 스케일 하행, 5-♭7로 감싸 → Ⅰ의 3음' },
  { g: 'Ⅴ7 → Ⅰ', id: 'bb5', cls: ['dom'], to: ['maj', 'dom'], root: 'G3', w: IN, s: 'B3 D4 F4 A4 G4 F4 E4 D4 > C4', name: '3-5-♭7-9 올라 순차 하행 → Ⅰ의 1음' },
  { g: 'Ⅴ7 → Ⅰ', id: 'gt1', cls: ['dom'], to: ['maj', 'dom'], root: 'G3', w: IN, s: 'B3 D4 F4 A4 G4 F4 D4 F4 > E4', name: '3-5-♭7-9 올라 1-♭7-5-♭7 → Ⅰ의 3음 (7→3 해결)' },
  { g: 'Ⅴ7 → Ⅰ', id: 'gt2', cls: ['dom'], to: ['maj', 'dom'], root: 'G3', w: IN, s: 'G4 F#4 F4 E4 D4 B3 D4 F4 > E4', name: '비밥 하행 1-7-♭7-6-5 뒤 3-5-♭7 → Ⅰ의 3음' },
  { g: 'Ⅴ7 → Ⅰ', id: 'dg1', cls: ['dom'], to: ['maj', 'dom'], root: 'G3', w: IN, s: 'G3 A3 B3 D4 F4 A4 G4 F4 > E4', name: '1-2-3-5-♭7-9 올라 1-♭7 → Ⅰ의 3음' },
  { g: 'Ⅴ7 → Ⅰ', id: 'sc1', cls: ['dom'], to: ['maj', 'dom'], root: 'G3', w: IN, s: 'D5 C5 B4 A4 G4 B4 D5 F5 > E5', name: '5음에서 순차 하행 뒤 1-3-5-♭7 아르페지오 → Ⅰ의 3음' },
  { g: 'Ⅴ7 → Ⅰ', id: 'tr1', cls: ['dom'], to: ['maj', 'dom'], root: 'G3', w: IN, s: 'D5:6 (C5 D5 C5) B4 A4 G4 F4 > E4', name: '5음 길게 · 셋잇단 꾸밈 4-5-4 · 3-2-1-♭7 → Ⅰ의 3음' },
  { g: 'Ⅴ7 → Ⅰ', id: 'ob1', cls: ['dom'], to: ['maj', 'dom'], root: 'G3', w: IN, s: 'z B3 D4 F4 A4 G4 F4 D4 > E4', name: '쉼표 뒤 3-5-♭7-9, 1-♭7-5로 감싸 → Ⅰ의 3음' },
  /* ── Ⅴ7 → Ⅰ (메이저) · 색깔 있는 소리(♭9·얼터드·온음·디미니시) ── */
  { g: 'Ⅴ7 → Ⅰ · 색채', id: 'bb3', cls: ['dom', 'domalt'], to: ['maj'], root: 'G3', w: COL, dm: 3, alt: 1, s: 'D4 C4 B3 D4 F4 Ab4 G4 F4 > E4', name: '5-4-3 하행 뒤 3→♭9 아르페지오, 1-♭7 → Ⅰ의 3음' },
  { g: 'Ⅴ7 → Ⅰ · 색채', id: 'bb4', cls: ['dom'], to: ['maj'], root: 'G3', w: COL, dm: 3, alt: 1, s: '(B3 D4 F4) Ab4 G4 F4 E4 D4 B3 > C4', name: '셋잇단 3-5-♭7 → ♭9, 순차 하행, 5-3으로 감싸 → Ⅰ의 1음' },
  { g: 'Ⅴ7 → Ⅰ · 색채', id: 'hm3M', cls: ['dom', 'domalt'], to: ['maj'], root: 'G3', w: COL, dm: 3, alt: 1, s: 'G3 Ab3 B3 D4 F4 Ab4 G4 F4 > E4', name: '1-♭9-3-5-♭7-♭9(감7 아르페지오) 올라 1-♭7 → Ⅰ의 3음' },
  { g: 'Ⅴ7 → Ⅰ · 색채', id: 'ts1', cls: ['dom', 'domalt'], to: ['maj', 'min'], root: 'G3', w: COL, minDiff: 3, alt: 1, s: 'B3 Db4 F4 Ab4 B4 Ab4 F4 Db4 > C4', name: '트라이톤 대리 아르페지오 3-♭5-♭7-♭9 올라갔다 내려와 → Ⅰ의 1음' },
  { g: 'Ⅴ7 → Ⅰ · 색채', id: 'wt1', cls: ['dom'], to: ['maj'], root: 'G3', w: COL, minDiff: 3, alt: 1, s: 'B3 D#4 G4 B4 A4 G4 F4 D#4 > E4', name: '증3화음 3-♯5-1-3 올라 온음음계 9-1-♭7-♯5 하행 → Ⅰ의 3음' },
  { g: 'Ⅴ7 → Ⅰ · 색채', id: 'dim1', cls: ['dom'], to: ['maj'], root: 'G3', w: COL, minDiff: 3, alt: 1, s: 'G4 E4 Db4 Bb3 B3 D4 F4 Ab4 > G4', name: '감7 아르페지오 하행 1-13-♯11-♯9 → 3으로 반음 올라 3-5-♭7-♭9 → Ⅰ의 5음' },
  /* ── Ⅴ7(♭9) → ⅰ (마이너) · 하모닉 마이너 ── */
  { g: 'Ⅴ7 → ⅰ', id: 'hm1', cls: ['dom', 'domalt'], to: ['min'], root: 'G3', w: MIN, alt: 1, s: 'D4 C4 B3 Ab3 G3 F3 Eb3 D3 > C3', name: '하모닉 마이너 하행 5-4-3-♭9-1-♭7-♭13-5 → ⅰ의 1음' },
  { g: 'Ⅴ7 → ⅰ', id: 'hm2', cls: ['dom', 'domalt'], to: ['min'], root: 'G3', w: MIN, alt: 1, s: '(B3 D4 F4) Ab4 G4 F4 Eb4 D4 B3 > C4', name: '셋잇단 3-5-♭7 → ♭9, 하행, 5-3으로 감싸 → ⅰ의 1음' },
  { g: 'Ⅴ7 → ⅰ', id: 'hm3', cls: ['dom', 'domalt'], to: ['min'], root: 'G3', w: MIN, alt: 1, s: 'G3 Ab3 B3 D4 F4 Ab4 G4 F4 > Eb4', name: '1-♭9-3-5-♭7-♭9 올라 1-♭7 → ⅰ의 ♭3음' },
  { g: 'Ⅴ7 → ⅰ', id: 'hm4', cls: ['dom', 'domalt'], to: ['min'], root: 'G3', w: MIN, alt: 1, s: 'G4 Ab4 F4 D4 B3 D4 F4 D4 > Eb4', name: '1-♭9-♭7-5-3 내려와 5-♭7-5로 감싸 → ⅰ의 ♭3음' },
  { g: 'Ⅴ7 → ⅰ', id: 'hm5', cls: ['dom', 'domalt'], to: ['min'], root: 'G3', w: MIN, alt: 1, s: 'D5:6 (C5 D5 C5) B4 Ab4 G4 F4 > Eb4', name: '5음 길게 · 셋잇단 꾸밈 4-5-4 · 3-♭9-1-♭7 → ⅰ의 ♭3음' },
  { g: 'Ⅴ7 → ⅰ', id: 'hm6', cls: ['dom', 'domalt'], to: ['min'], root: 'G3', w: MIN, alt: 1, s: 'B3 D4 F4 Ab4 G4 F4 Eb4 D4 > C4', name: '3-5-♭7-♭9 올라 1-♭7-♭13-5 하행 → ⅰ의 1음' },
  { g: 'Ⅴ7 → ⅰ', id: 'hm7', cls: ['dom', 'domalt'], to: ['min'], root: 'G3', w: MIN, alt: 1, s: 'z B3 D4 F4 Ab4 G4 F4 D4 > Eb4', name: '쉼표 뒤 3-5-♭7-♭9, 1-♭7-5로 감싸 → ⅰ의 ♭3음' },
  { g: 'Ⅴ7 → ⅰ', id: 'hm1M', cls: ['domalt'], to: ['maj'], root: 'G3', w: COL, alt: 1, s: 'D4 C4 B3 Ab3 G3 F3 Eb3 D3 > C3', name: '하모닉 마이너 하행 5-4-3-♭9-1-♭7-♭13-5 → Ⅰ의 1음' },
  { g: 'Ⅴ7 → ⅰ', id: 'hm2M', cls: ['domalt'], to: ['maj'], root: 'G3', w: COL, alt: 1, s: '(B3 D4 F4) Ab4 G4 F4 Eb4 D4 B3 > C4', name: '셋잇단 3-5-♭7 → ♭9, 하행, 5-3으로 감싸 → Ⅰ의 1음' },
  { g: 'Ⅴ7 → ⅰ', id: 'hm6M', cls: ['domalt'], to: ['maj'], root: 'G3', w: COL, alt: 1, s: 'B3 D4 F4 Ab4 G4 F4 Eb4 D4 > C4', name: '3-5-♭7-♭9 올라 1-♭7-♭13-5 하행 → Ⅰ의 1음' },
  /* ── Ⅱm7 → Ⅴ7 (한 마디씩) ── */
  { g: 'Ⅱm7 → Ⅴ7', id: 'ii1', cls: ['min'], to: ['dom'], root: 'D4', s: 'A4 F4 D4 C4 D4 F4 A4 C5 > B4', name: '5-♭3-1-♭7 내려와 1-♭3-5-♭7 올라 → Ⅴ의 3음' },
  { g: 'Ⅱm7 → Ⅴ7', id: 'ii2', cls: ['min'], to: ['dom'], root: 'D4', s: 'D4 E4 F4 A4 C5 E5 D5 C5 > B4', name: '1-2-♭3-5-♭7-9 올라 1-♭7 → Ⅴ의 3음' },
  { g: 'Ⅱm7 → Ⅴ7', id: 'ii3', cls: ['min'], to: ['dom'], root: 'D4', s: 'F4 A4 C5 E5 D5 C5 A4 C5 > B4', name: '♭3-5-♭7-9 올라 1-♭7-5-♭7 → Ⅴ의 3음' },
  { g: 'Ⅱm7 → Ⅴ7', id: 'ii4', cls: ['min'], to: ['dom'], root: 'D4', s: 'A4 G4 F4 E4 D4 F4 A4 C5 > B4', name: '5음에서 순차 하행 뒤 1-♭3-5-♭7 → Ⅴ의 3음' },
  { g: 'Ⅱm7 → Ⅴ7', id: 'ii5', cls: ['min'], to: ['dom'], root: 'D4', s: '(D4 F4 A4) C5 E5 D5 C5 A4 C5 > B4', name: '셋잇단 1-♭3-5 → ♭7-9, 1-♭7-5-♭7 → Ⅴ의 3음' },
  { g: 'Ⅱm7 → Ⅴ7', id: 'ii6', cls: ['min'], to: ['dom'], root: 'D4', s: 'D5 C#5 C5 A4 F4 A4 D5 C5 > B4', name: '1-7-♭7 반음 하행, 5-♭3-5-1-♭7 → Ⅴ의 3음' },
  { g: 'Ⅱm7 → Ⅴ7', id: 'ii8', cls: ['min'], to: ['dom'], root: 'D4', s: 'z D4 F4 A4 C5 E5 D5 C5 > B4', name: '쉼표 뒤 1-♭3-5-♭7-9, 1-♭7 → Ⅴ의 3음' },
  { g: 'Ⅱm7 → Ⅴ7', id: 'ii9', cls: ['min'], to: ['dom'], root: 'D4', s: 'A4:6 (G4 A4 G4) F4 E4 D4 C4 > B3', name: '5음 길게 · 셋잇단 꾸밈 4-5-4 · ♭3-2-1-♭7 → Ⅴ의 3음' },
  { g: 'Ⅱm7 → Ⅴ7', id: 'ii10', cls: ['min'], to: ['dom'], root: 'D4', s: 'F4 G4 A4 C5 E5 D5 C5 E5 > D5', name: '♭3-4-5-♭7-9 올라 1-♭7-9로 감싸 → Ⅴ의 5음' },
  { g: 'Ⅱm7 → Ⅴ7', id: 'ii11', cls: ['min'], to: ['dom'], root: 'D4', s: 'D4 E4 F4 A4 G4 F4 E4 F#4 > G4', name: '1-2-♭3-5 올라 4-♭3-2, 반음으로 → Ⅴ의 1음' },
  /* ── Ⅱø → Ⅴ7♭9 (마이너 Ⅱ–Ⅴ, 한 마디씩) ── */
  { g: 'Ⅱø → Ⅴ7', id: 'hd1', cls: ['hdim'], to: ['dom'], root: 'D4', alt: 1, s: 'C5 Bb4 Ab4 G4 F4 Eb4 D4 C4 > B3', name: '로크리안 하행 ♭7-♭6-♭5-4-♭3-♭2-1-♭7 → Ⅴ의 3음' },
  { g: 'Ⅱø → Ⅴ7', id: 'hd2', cls: ['hdim'], to: ['dom'], root: 'D4', alt: 1, s: 'Ab4 F4 D4 C4 D4 F4 Ab4 C5 > B4', name: '♭5-♭3-1-♭7 내려와 1-♭3-♭5-♭7 올라 → Ⅴ의 3음' },
  { g: 'Ⅱø → Ⅴ7', id: 'hd3', cls: ['hdim'], to: ['dom'], root: 'D4', alt: 1, s: 'F4 Ab4 C5 Eb5 D5 C5 Ab4 C5 > B4', name: '♭3-♭5-♭7-♭9 올라 1-♭7-♭5-♭7 → Ⅴ의 3음' },
  { g: 'Ⅱø → Ⅴ7', id: 'hd4', cls: ['hdim'], to: ['dom'], root: 'D4', alt: 1, s: 'z D4 F4 Ab4 C5 Eb5 D5 C5 > B4', name: '쉼표 뒤 1-♭3-♭5-♭7-♭9, 1-♭7 → Ⅴ의 3음' },
  /* ── 짧은 Ⅱ–Ⅴ(한 마디 안 두 박씩) → Ⅰ ── */
  { g: '짧은 Ⅱ–Ⅴ → Ⅰ', id: 's1', half: 1, cls: ['min'], cls2: ['dom'], to: ['maj', 'dom'], root: 'D4', s: 'D4 F4 A4 C5 | B4 A4 G4 F4 > E4', name: 'Ⅱ 1-♭3-5-♭7 · Ⅴ 3-2-1-♭7 → Ⅰ의 3음' },
  { g: '짧은 Ⅱ–Ⅴ → Ⅰ', id: 's1b', half: 1, cls: ['min'], cls2: ['dom'], to: ['maj'], root: 'D4', dm: 3, alt: 1, s: 'D4 F4 A4 C5 | B4 Ab4 G4 F4 > E4', name: 'Ⅱ 1-♭3-5-♭7 · Ⅴ 3-♭9-1-♭7 → Ⅰ의 3음' },
  { g: '짧은 Ⅱ–Ⅴ → Ⅰ', id: 's1m', half: 1, cls: ['min'], cls2: ['dom'], to: ['min'], root: 'D4', alt: 1, s: 'D4 F4 A4 C5 | B4 Ab4 G4 F4 > Eb4', name: 'Ⅱ 1-♭3-5-♭7 · Ⅴ 3-♭9-1-♭7 → ⅰ의 ♭3음' },
  { g: '짧은 Ⅱ–Ⅴ → Ⅰ', id: 's2', half: 1, cls: ['min'], cls2: ['dom'], to: ['maj', 'dom'], root: 'D4', s: 'F4 E4 D4 C4 | B3 D4 F4 A4 > G4', name: 'Ⅱ ♭3-2-1-♭7 · Ⅴ 3-5-♭7-9 → Ⅰ의 5음' },
  { g: '짧은 Ⅱ–Ⅴ → Ⅰ', id: 's2b', half: 1, cls: ['min'], cls2: ['dom'], to: ['maj', 'min'], root: 'D4', dm: 3, alt: 1, s: 'F4 E4 D4 C4 | B3 D4 F4 Ab4 > G4', name: 'Ⅱ ♭3-2-1-♭7 · Ⅴ 3-5-♭7-♭9 → Ⅰ의 5음' },
  { g: '짧은 Ⅱ–Ⅴ → Ⅰ', id: 's3', half: 1, cls: ['min'], cls2: ['dom'], to: ['maj', 'dom'], root: 'D4', s: 'A4 F4 D4 C4 | B3 C4 D4 F4 > E4', name: 'Ⅱ 5-♭3-1-♭7 · Ⅴ 3-4-5-♭7 → Ⅰ의 3음' },
  { g: '짧은 Ⅱ–Ⅴ → Ⅰ', id: 's4', half: 1, cls: ['min'], cls2: ['dom'], to: ['maj', 'dom'], root: 'D4', s: 'D4 E4 F4 A4 | G4 F4 D4 F4 > E4', name: 'Ⅱ 1-2-♭3-5 · Ⅴ 1-♭7-5-♭7 → Ⅰ의 3음' },
  { g: '짧은 Ⅱ–Ⅴ → Ⅰ', id: 's5', half: 1, cls: ['min'], cls2: ['dom'], to: ['maj', 'dom'], root: 'D4', s: 'F4 A4 C5 E5 | D5 B4 G4 F4 > E4', name: 'Ⅱ ♭3-5-♭7-9 · Ⅴ 5-3-1-♭7 → Ⅰ의 3음' },
  { g: '짧은 Ⅱ–Ⅴ → Ⅰ', id: 's6', half: 1, cls: ['min'], cls2: ['dom'], to: ['maj', 'dom'], root: 'D4', s: 'A4 G4 F4 E4 | D4 C4 B3 D4 > C4', name: 'Ⅱ 5-4-♭3-2 · Ⅴ 5-4-3-5 → Ⅰ의 1음' },
  { g: '짧은 Ⅱ–Ⅴ → Ⅰ', id: 's7', half: 1, cls: ['min'], cls2: ['dom'], to: ['maj', 'dom'], root: 'D4', s: '(D4 F4 A4) C5 E5 | D5 B4 G4 F4 > E4', name: 'Ⅱ 셋잇단 1-♭3-5 → ♭7-9 · Ⅴ 5-3-1-♭7 → Ⅰ의 3음' },
  { g: '짧은 Ⅱø–Ⅴ → ⅰ', id: 'm1', half: 1, cls: ['hdim'], cls2: ['dom'], to: ['min'], root: 'D4', alt: 1, s: 'D4 F4 Ab4 C5 | B4 Ab4 G4 F4 > Eb4', name: 'Ⅱø 1-♭3-♭5-♭7 · Ⅴ 3-♭9-1-♭7 → ⅰ의 ♭3음' },
  { g: '짧은 Ⅱø–Ⅴ → ⅰ', id: 'm2', half: 1, cls: ['hdim'], cls2: ['dom'], to: ['min', 'maj'], root: 'D4', alt: 1, s: 'F4 Eb4 D4 C4 | B3 D4 F4 Ab4 > G4', name: 'Ⅱø ♭3-♭2-1-♭7 · Ⅴ 3-5-♭7-♭9 → ⅰ의 5음' },
  { g: '짧은 Ⅱø–Ⅴ → ⅰ', id: 'm3', half: 1, cls: ['hdim'], cls2: ['dom'], to: ['min'], root: 'D4', alt: 1, s: 'Ab4 F4 D4 C4 | B3 C4 D4 F4 > Eb4', name: 'Ⅱø ♭5-♭3-1-♭7 · Ⅴ 3-4-5-♭7 → ⅰ의 ♭3음' },
  { g: '짧은 Ⅱø–Ⅴ → ⅰ', id: 'm4', half: 1, cls: ['hdim'], cls2: ['dom'], to: ['min', 'maj'], root: 'D4', alt: 1, s: 'C5 Ab4 F4 D4 | G4 F4 D4 B3 > C4', name: 'Ⅱø ♭7-♭5-♭3-1 · Ⅴ 1-♭7-5-3 → ⅰ의 1음' },
  /* ── 코드 릭(한 코드 한 마디, 해결 없음 — 그 코드 스케일 안 음만) ── */
  { g: '코드 릭 · 메이저', id: 'ch1', cls: ['maj', 'dom'], to: null, root: 'C4', w: CH, s: 'C4 D4 E4 G4 A4:6 G4 E4', name: '1-2-3-5 올라 6에 머물고 5-3' },
  { g: '코드 릭 · 메이저', id: 'ch2', cls: ['maj'], to: null, root: 'C4', w: CH, s: 'E4 G4 B4 D5 C5 A4 G4 E4', name: '3-5-7-9 올라 1-6-5-3 하행' },
  { g: '코드 릭 · 메이저', id: 'ch7', cls: ['maj', 'dom'], to: null, root: 'C4', w: CH, s: 'G4 E4 C4 D4 E4:12', name: '5-3-1-2 뒤 3음에 머묾' },
  { g: '코드 릭 · 메이저', id: 'ch8', cls: ['maj'], to: null, root: 'C4', w: CH, s: 'B3 C4 E4 G4 B4 A4 G4 E4', name: '7-1-3-5-7 올라 6-5-3' },
  { g: '코드 릭 · 메이저', id: 'ch11', cls: ['maj', 'dom'], to: null, root: 'C4', w: CH, s: 'A4 G4 E4 D4 C4:12', name: '6-5-3-2 내려와 1음에 머묾' },
  { g: '코드 릭 · 마이너', id: 'ch3', cls: ['min'], to: null, root: 'D4', w: CH, s: 'D4 F4 G4 A4 C5 A4 G4 F4', name: '마이너 펜타 1-♭3-4-5-♭7 올라 5-4-♭3' },
  { g: '코드 릭 · 마이너', id: 'ch4', cls: ['min'], to: null, root: 'D4', w: CH, s: 'A4 C5 D5 F5 E5 D5 C5 A4', name: '5-♭7-1-♭3 올라 2-1-♭7-5 하행' },
  { g: '코드 릭 · 마이너', id: 'ch9', cls: ['min'], to: null, root: 'D4', w: CH, s: 'D4 E4 F4 A4 C5 A4 F4 E4', name: '1-2-♭3-5-♭7 올라 5-♭3-2' },
  { g: '코드 릭 · 마이너', id: 'ch12', cls: ['min'], to: null, root: 'D4', w: CH, s: 'A4 F4 D4 E4 F4:12', name: '5-♭3-1-2 뒤 ♭3음에 머묾' },
  { g: '코드 릭 · 7코드', id: 'ch5', cls: ['dom'], to: null, root: 'G3', w: CH, s: 'B3 D4 F4 A4 G4 F4 E4 D4', name: '3-5-♭7-9 올라 1-♭7-6-5 하행' },
  { g: '코드 릭 · 7코드', id: 'ch10', cls: ['dom'], to: null, root: 'G3', w: CH, s: 'F4 E4 D4 B3 G3 B3 D4 E4', name: '♭7-6-5-3-1 내려와 3-5-6' },
  { g: '코드 릭 · 하프디미니시', id: 'ch6', cls: ['hdim'], to: null, root: 'D4', w: CH, s: 'D4 F4 Ab4 C5 Ab4 G4 F4 D4', name: '1-♭3-♭5-♭7 올라 ♭5-4-♭3-1' },
  /* ── 3/4 박자(한 마디 8분음표 여섯) ── */
  { g: '3/4 박자', m: 3, id: 'tqa', cls: ['dom'], to: ['maj', 'dom'], root: 'G3', s: 'B3 D4 F4 A4 G4 F4 > E4', name: '3-5-♭7-9 올라 1-♭7 → Ⅰ의 3음' },
  { g: '3/4 박자', m: 3, id: 'tqb', cls: ['dom'], to: ['maj', 'dom'], root: 'G3', s: 'G4 F#4 F4 E4 D4 F4 > E4', name: '비밥 하행 1-7-♭7-6-5, ♭7로 감싸 → Ⅰ의 3음' },
  { g: '3/4 박자', m: 3, id: 'tqc', cls: ['dom'], to: ['maj', 'dom'], root: 'G3', s: 'D4 C4 B3 D4 F4 D4 > E4', name: '5-4-3 내려와 5-♭7-5로 감싸 → Ⅰ의 3음' },
  { g: '3/4 박자', m: 3, id: 'tqd', cls: ['dom', 'domalt'], to: ['maj'], root: 'G3', dm: 3, alt: 1, s: 'B3 D4 F4 Ab4 G4 F4 > E4', name: '3-5-♭7-♭9 올라 1-♭7 → Ⅰ의 3음' },
  { g: '3/4 박자', m: 3, id: 'tqe', cls: ['dom', 'domalt'], to: ['min'], root: 'G3', alt: 1, s: 'B3 D4 F4 Ab4 G4 F4 > Eb4', name: '3-5-♭7-♭9 올라 1-♭7 → ⅰ의 ♭3음' },
  { g: '3/4 박자', m: 3, id: 'tqf', cls: ['dom', 'domalt'], to: ['min'], root: 'G3', alt: 1, s: 'G4 Ab4 F4 D4 B3 D4 > C4', name: '1-♭9-♭7-5-3-5 → ⅰ의 1음' },
  { g: '3/4 박자', m: 3, id: 'tqg', cls: ['min'], to: ['dom'], root: 'D4', s: 'D4 F4 A4 C5 E5 C5 > B4', name: '1-♭3-5-♭7-9-♭7 → Ⅴ의 3음' },
  { g: '3/4 박자', m: 3, id: 'tqh', cls: ['min'], to: ['dom'], root: 'D4', s: 'F4 E4 D4 C4 A3 C4 > B3', name: '♭3-2-1-♭7-5-♭7 → Ⅴ의 3음' },
  { g: '3/4 박자', m: 3, id: 'tqi', cls: ['hdim'], to: ['dom'], root: 'D4', alt: 1, s: 'D4 F4 Ab4 C5 Eb5 C5 > B4', name: '1-♭3-♭5-♭7-♭9-♭7 → Ⅴ의 3음' },
  { g: '3/4 박자', m: 3, id: 'tqj', cls: ['hdim'], to: ['dom'], root: 'D4', alt: 1, s: 'F4 Eb4 D4 C4 Ab3 C4 > B3', name: '♭3-♭2-1-♭7-♭5-♭7 → Ⅴ의 3음' },
  { g: '3/4 박자', m: 3, id: 'tqk', cls: ['maj', 'dom'], to: null, root: 'C4', s: 'C4 D4 E4 G4 A4:6', name: '1-2-3-5 올라 6에 머묾' },
  { g: '3/4 박자', m: 3, id: 'tql', cls: ['maj'], to: null, root: 'C4', s: 'E4 G4 B4 D5 C5 A4', name: '3-5-7-9 올라 1-6' },
  { g: '3/4 박자', m: 3, id: 'tqm', cls: ['min'], to: null, root: 'D4', s: 'D4 F4 G4 A4 C5 A4', name: '마이너 펜타 1-♭3-4-5-♭7-5' },
  { g: '3/4 박자', m: 3, id: 'tqn', cls: ['min'], to: null, root: 'D4', s: 'A4 F4 D4 E4 F4:6', name: '5-♭3-1-2 뒤 ♭3음에 머묾' },
  { g: '3/4 박자', m: 3, id: 'tqo', cls: ['dom'], to: null, root: 'G3', s: 'B3 D4 F4 A4 G4 F4', name: '3-5-♭7-9 올라 1-♭7' }
];

/* 4음 셀 — s = 첫 음(코드 뿌리 기준 반음), iv = 이어지는 음정. to·tr 이 있으면 다음 코드 첫 박에 착지하는 셀(iv 가 4개) */
const X = 2.4;
const cells = [
  /* 코드를 건너는 셀: 가이드톤 해결(7→3)·인클로저·턴어라운드 */
  { cls: 'min', to: 'dom', tr: 5, s: 3, iv: [-1, -2, -2, -1], w: X, name: 'Ⅱ: ♭3-2-1-♭7 → Ⅴ의 3음 (7→3 해결)' },
  { cls: 'min', to: 'dom', tr: 5, s: 7, iv: [-4, -3, -2, -1], w: X, name: 'Ⅱ: 5-♭3-1-♭7 → Ⅴ의 3음 (7→3 해결)' },
  { cls: 'hdim', to: 'dom', tr: 5, s: 0, iv: [3, 3, 4, -1], w: X, name: 'Ⅱø: 1-♭3-♭5-♭7 → Ⅴ의 3음' },
  { cls: 'hdim', to: 'dom', tr: 5, s: 6, iv: [-3, -3, -2, -1], w: X, name: 'Ⅱø: ♭5-♭3-1-♭7 → Ⅴ의 3음' },
  { cls: 'dom', to: 'maj', tr: 5, s: 4, iv: [-2, -2, -2, -1], w: X, name: 'Ⅴ: 3-2-1-♭7 → Ⅰ의 3음 (7→3 해결)' },
  { cls: 'dom', to: 'maj', tr: 5, s: 7, iv: [-3, -4, -2, -1], w: X, name: 'Ⅴ: 5-3-1-♭7 → Ⅰ의 3음 (7→3 해결)' },
  { cls: 'dom', to: 'maj', tr: 5, s: 1, iv: [-1, -2, -2, 1], minDiff: 3, name: 'Ⅴ: ♭9-1-♭7-♭13 → Ⅰ의 3음 (인클로저)' },
  { cls: 'dom', to: 'maj', tr: 5, s: 4, iv: [-3, -3, -4, -1], minDiff: 3, name: 'Ⅴ: 3-♭9-♭7-♭5 → Ⅰ의 1음 (트라이톤 대리)' },
  { cls: 'domalt', to: 'min', tr: 5, s: 4, iv: [-3, -1, -2, -2], w: X, name: 'Ⅴ: 3-♭9-1-♭7 → ⅰ의 ♭3음 (7→3 해결)' },
  { cls: 'domalt', to: 'min', tr: 5, s: 1, iv: [-1, -2, -3, 1], name: 'Ⅴ: ♭9-1-♭7-5 → ⅰ의 ♭3음 (인클로저)' },
  { cls: 'dom', to: 'min', tr: 5, s: 4, iv: [-3, -1, -2, -2], w: X, name: 'Ⅴ: 3-♭9-1-♭7 → ⅰ의 ♭3음 (7→3 해결)' },
  { cls: 'dom', to: 'dom', tr: 5, s: 4, iv: [-2, -2, -2, -1], w: X, name: '3-2-1-♭7 → 다음 7코드의 3음 (7→3 해결)' },
  { cls: 'maj', to: 'dom', tr: 9, s: 7, iv: [-3, -2, -2, 1], name: 'Ⅰ: 5-3-2-1 → Ⅵ7의 3음 (반음 위로)' },
  { cls: 'maj', to: 'dom', tr: 9, s: 4, iv: [3, 2, 3, 1], name: 'Ⅰ: 3-5-6-1 → Ⅵ7의 3음 (반음 위로)' },
  { cls: 'dom', to: 'maj', tr: 11, s: 4, iv: [3, 3, 4, 1], name: '♭Ⅱ7: 3-5-♭7-9 → Ⅰ의 3음 (트라이톤 대리 해결)' },
  { cls: 'dom', to: 'maj', tr: 11, s: 10, iv: [-3, -3, -4, -1], name: '♭Ⅱ7: ♭7-5-3-1 → Ⅰ의 1음 (반음 아래로)' },
  { cls: 'maj', to: 'maj', tr: 5, s: 4, iv: [-2, -2, -1, -2], name: 'Ⅰ: 3-2-1-7 → Ⅳ의 3음' },
  { cls: 'maj', to: 'min', tr: 2, s: 4, iv: [3, 2, -2, -2], name: 'Ⅰ: 3-5-6-5 → Ⅱ의 ♭3음' },
  { cls: 'min', to: 'min', tr: 5, s: 3, iv: [-1, -2, -2, -2], name: '♭3-2-1-♭7 → 다음 마이너의 ♭3음 (7→3 해결)' },
  /* 한 코드 안 4음 */
  { cls: 'dom', s: 10, iv: [2, 4, 3], name: '♭7-1-3-5 (♭7에서 오르는 아르페지오)' },
  { cls: 'min', s: 10, iv: [2, 3, 4], name: '♭7-1-♭3-5 (♭7에서 오르는 아르페지오)' },
  { cls: 'maj', s: 11, iv: [1, 4, 3], name: '7-1-3-5 (이끎음에서 오르는 아르페지오)' },
  { cls: 'dom', s: 2, iv: [-4, -3, -3], name: '9-♭7-5-3 (상부 구조 하행)' },
  { cls: 'maj', s: 2, iv: [-3, -4, -3], name: '9-7-5-3 (상부 구조 하행)' },
  { cls: 'min', s: 2, iv: [-4, -3, -4], name: '9-♭7-5-♭3 (상부 구조 하행)' },
  { cls: 'min', s: 7, iv: [-2, -2, -3], name: '5-4-♭3-1 (하행 셀)' },
  { cls: 'maj', s: 4, iv: [-2, -2, -3], name: '3-2-1-6 (펜타토닉 하행)' },
  { cls: 'maj', s: 9, iv: [-1, -1, -3], minDiff: 3, name: '6-♯5-5-3 (비밥 메이저 하행)' },
  { cls: 'dom', s: 7, iv: [-1, -1, -1], minDiff: 3, name: '5-♭5-4-3 (크로매틱 하행)' },
  { cls: 'domalt', s: 1, iv: [-3, -3, -3], name: '♭9-♭7-5-3 (감7 하행 아르페지오)' },
  { cls: 'min', s: 0, iv: [3, 2, 2], name: '1-♭3-4-5 (마이너 펜타)' }
];
module.exports = { licks, cells };
