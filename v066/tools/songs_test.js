/* 시험용 코드 진행 — 장르·박자·코드 종류를 고루 덮기 위한 내부 시험 자료(코드 진행만, 멜로디 없음).
   재즈에서 널리 쓰는 일반적인 진행 꼴로 직접 적었다. 배포물에는 들어가지 않는다. */
'use strict';
module.exports = {
  /* 발라드: 장조 32마디 AABA 꼴 — 한 마디 한두 코드, Ⅱ-Ⅴ 연쇄·부속 도미넌트 */
  't-ballad': { n: '시험 발라드', c: '발라드', k: 3, bpm: 66, m: 4, f: ['AABA', 8],
    ch: 'Ebmaj7|Bbm7 Eb7|Abmaj7|Abm7 Db7|Ebmaj7 Cm7|Fm7 Bb7|Gm7 C7|Fm7 Bb7|' +
        'Ebmaj7|Bbm7 Eb7|Abmaj7|Abm7 Db7|Ebmaj7 Cm7|Fm7 Bb7|Eb6|Eb6|' +
        'Bbm7|Eb7b9|Abmaj7|Abmaj7|Am7|D7|Gm7 C7|Fm7 Bb7|' +
        'Ebmaj7|Bbm7 Eb7|Abmaj7|Abm7 Db7|Ebmaj7 Cm7|Fm7 Bb7|Eb6|Fm7 Bb7' },
  /* 칼립소: 16마디 장조, Ⅰ-Ⅵ-Ⅱ-Ⅴ 중심 */
  't-calypso': { n: '시험 칼립소', c: '라틴', k: 0, bpm: 200, m: 4, f: ['AABC', 4],
    ch: 'Cmaj7|Em7 A7|Dm7 G7|Cmaj7|Cmaj7|Em7 A7|Dm7 G7|Cmaj7|Em7b5|A7b9|Dm7|G7|Cmaj7 C7|Fmaj7 Fm6|Cmaj7 G7|Cmaj7' },
  /* 보사노바: 32마디, 장조 토닉 길게 + 반음 내려가는 Ⅱ-Ⅴ */
  't-bossa': { n: '시험 보사노바', c: '보사노바', k: 5, bpm: 130, m: 4, f: ['AABA', 8],
    ch: 'Fmaj7|Fmaj7|G7|G7|Gm7|C7|Fmaj7|Gm7 C7|Fmaj7|Fmaj7|G7|G7|Gm7|C7|Fmaj7|Fmaj7|' +
        'Bbmaj7|Bbmaj7|Bbm7|Eb7|Am7|D7b9|Gm7|C7|Fmaj7|Fmaj7|G7|G7|Gm7|C7|Fmaj7|Gm7 C7' },
  /* 펑크: 16마디 한 코드 뱀프 + 4도 위 */
  't-funk': { n: '시험 펑크', c: '펑키', k: 4, bpm: 100, m: 4, f: ['AABA', 4],
    ch: 'E9|E9|E9|E9|E9|E9|E9|E9|A9|A9|A9|A9|E9|E9|B7#9|E9' },
  /* 모달: 도리안 16+8+8 */
  't-modal': { n: '시험 모달', c: '모달', k: 2, bpm: 136, m: 4, f: ['AABA', 8], songType: 'modal',
    ch: 'Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Ebm7|Ebm7|Ebm7|Ebm7|Ebm7|Ebm7|Ebm7|Ebm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7' },
  /* 단조 스탠더드 꼴 32마디 */
  't-minor': { n: '시험 단조', c: '스윙', k: 0, bpm: 150, m: 4, f: ['AABA', 8],
    ch: 'Cm6|Dm7b5 G7b9|Cm6|Gm7b5 C7b9|Fm7|Dm7b5 G7b9|Cm6|Dm7b5 G7b9|Cm6|Dm7b5 G7b9|Cm6|Gm7b5 C7b9|Fm7|Dm7b5 G7b9|Cm6|Cm6|' +
        'Fm7|Bb7|Ebmaj7|Abmaj7|Dm7b5|G7b9|Cm7|Dm7b5 G7#9|Cm6|Dm7b5 G7b9|Cm6|Gm7b5 C7b9|Fm7|Dm7b5 G7b9|Cm6|Dm7b5 G7b9' },
  /* 3/4 왈츠 */
  't-waltz': { n: '시험 왈츠', c: '스윙', k: 10, bpm: 150, m: 3, f: ['AB', 8],
    ch: 'Bbmaj7|Bbmaj7|Cm7|F7|Dm7|G7b9|Cm7|F7|Bbmaj7|Bb7|Ebmaj7|Ebm6|Bbmaj7 G7|Cm7 F7|Bb6|Cm7 F7' },
  /* 5/4 */
  't-five': { n: '시험 5박', c: '스윙', k: 3, bpm: 170, m: 5, f: ['AA', 4],
    ch: 'Ebm7 Bbm7|Ebm7 Bbm7|Ebm7 Bbm7|Ebm7 Bbm7|Abm7 Db7|Gbmaj7|Fm7b5 Bb7b9|Ebm7 Bbm7' },
  /* 여러 코드·특수 코드(한 마디 4코드, dim7, sus4, mmaj7, #11) */
  't-dense': { n: '시험 빽빽', c: '비밥', k: 5, bpm: 220, m: 4, f: ['AB', 8],
    ch: 'Fmaj7|Em7b5 A7b9|Dm7 G7|Cm7 F7|Bb7 Bdim7|Fmaj7 D7|Gm7 C7|Fmaj7 Abm7 Gm7 C7|Bbmaj7#11|Bbmmaj7|Am7 D7#11|Gm7 C7sus4|Fmaj7 D7#9|Gm9 C7|F6|Gm7 C7' },
  /* 콜트레인 체인지 꼴(빠른 전조) */
  't-cycle': { n: '시험 전조', c: '스윙', k: 11, bpm: 240, m: 4, f: ['AB', 8],
    ch: 'Bmaj7 D7|Gmaj7 Bb7|Ebmaj7|Am7 D7|Gmaj7 Bb7|Ebmaj7 Gb7|Bmaj7|Fm7 Bb7|Ebmaj7|Am7 D7|Gmaj7|Dbm7 Gb7|Bmaj7|Fm7 Bb7|Ebmaj7|Dbm7 Gb7' },
  /* 셔플 블루스 */
  't-shuffle': { n: '시험 셔플', c: '블루스', k: 7, bpm: 100, m: 4, f: ['AAB', 4],
    ch: 'G7|C7|G7|G7|C7|C7|G7|G7|D7|C7|G7|D7' },
  /* 긴 Ⅱ–Ⅴ–Ⅰ(한 마디 한 코드) 연쇄 — 스탠더드에 가장 흔한 화성 리듬. 장조·단조 Ⅱ–Ⅴ, 부속 도미넌트 */
  't-long': { n: '시험 긴 Ⅱ–Ⅴ', c: '스윙', k: 0, bpm: 160, m: 4, f: ['AABA', 8],
    ch: 'Dm7|G7|Cmaj7|Cmaj7|Gm7|C7|Fmaj7|Fmaj7|' +
        'Fm7|Bb7|Ebmaj7|Ebmaj7|Dm7b5|G7b9|Cm7|Cm7|' +
        'Em7|A7|Dm7|Dm7|Dm7|G7|Cmaj7|A7|' +
        'Dm7|G7|Em7|A7|Dm7|G7|C6|Dm7 G7' }
};
