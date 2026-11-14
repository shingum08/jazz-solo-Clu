'use strict';
/* 전수 무결성 시험 — 마디 합·겹침·음역·도약·셋잇단 묶음·붙임줄·연달아 셋잇단·재현성·코러스 이음매.
   사용: node tools/validate.js <engine.js> [--ref <orig engine.js>] [--seeds N] [--quick]
   --ref 를 주면 opts.natural=false 결과가 원본 엔진과 완전히 같은지도 본다(v0.65 동작 보존) */
const path = require('path');
const { loadEngine, addSong, genChoruses } = require('./harness');
const T = require('./songs_test');
const args = process.argv.slice(2);
const eng = path.resolve(args[0]);
const refI = args.indexOf('--ref'), ref = refI >= 0 ? path.resolve(args[refI + 1]) : null;
const sI = args.indexOf('--seeds'), NSEED = sI >= 0 ? +args[sI + 1] : 2;
const quick = args.includes('--quick');
const E = loadEngine(eng), R = ref ? loadEngine(ref) : null;
for (const X of [E, R]) if (X) Object.keys(T).forEach(id => addSong(X, id, T[id]));
const RG = { brass: [59, 82], wind: [59, 82], free: [52, 86] };
const strip = so => JSON.stringify(Object.assign({}, so, { ts: 0, carry: undefined, dbg: undefined }));
const errs = {}; let nSolo = 0, nNotes = 0, nBars = 0;
const err = (k, msg) => { (errs[k] = errs[k] || []).push(msg); };

function check(solos, ctx, inst, withCarry) {
  let prev = null; /* 앞 음(코러스를 넘어 이어짐) */
  solos.forEach((so, ci) => {
    nSolo++;
    const BPB = so.bpb || 4, TPB = BPB * 6, [LO, HI] = RG[inst], MAXLEAP = inst === 'free' ? 12 : 7;
    const flat = [];
    so.bars.forEach((bar, bi) => {
      nBars++;
      let t = 0;
      bar.notes.forEach((n, k) => {
        if (!Number.isInteger(n.t) || !Number.isInteger(n.d) || n.d <= 0) err('bad-num', `${ctx} c${ci} m${bi + 1} #${k} t=${n.t} d=${n.d}`);
        if (n.t !== t) err('gap-or-overlap', `${ctx} c${ci} m${bi + 1} #${k} t=${n.t} 기대 ${t}`);
        if (n.midi !== null && (!Number.isInteger(n.midi) || n.midi < LO || n.midi > HI)) err('range', `${ctx} c${ci} m${bi + 1} midi=${n.midi}`);
        t += n.d; flat.push(Object.assign({ bi }, n));
      });
      if (t !== TPB) err('bar-sum', `${ctx} c${ci} m${bi + 1} 합 ${t}≠${TPB}`);
      /* 셋잇단 묶음: 8분 셋잇단(d=2) 3개가 박 머리에서 시작 · 2박 셋잇단(d=4) 3개가 박 머리에서 시작 */
      for (let k = 0; k < bar.notes.length; k++) {
        const n = bar.notes[k]; if (!n.trip) continue;
        const g = bar.notes.slice(k, k + 3);
        if (g.length < 3 || g.some(x => !x.trip || x.d !== n.d) || n.t % 6 !== 0 || (n.d !== 2 && n.d !== 4) || g[1].t !== n.t + n.d || g[2].t !== n.t + 2 * n.d) err('triplet-group', `${ctx} c${ci} m${bi + 1} t=${n.t} d=${n.d}`);
        k += 2;
      }
    });
    /* 붙임줄 */
    flat.forEach((n, i) => { if (n.tie && (!flat[i + 1] || flat[i + 1].midi !== n.midi || n.midi === null)) err('tie', `${ctx} c${ci} m${n.bi + 1}`); });
    /* 연달아 셋잇단 묶음 2개까지 */
    { let run = 0, lastEnd = -1; const T0 = n => n.bi * TPB + n.t;
      for (let i = 0; i < flat.length; i++) { const n = flat[i]; if (n.trip && flat[i + 2] && flat[i + 2].trip) { run = (T0(n) === lastEnd) ? run + 1 : 1; lastEnd = T0(n) + 3 * n.d; if (run > 2) err('triplet-run', `${ctx} c${ci} m${n.bi + 1}`); i += 2; } } }
    /* 도약(붙임줄은 한 음) */
    for (let i = 0; i < flat.length; i++) {
      const n = flat[i]; if (n.midi === null) continue;
      if (i > 0 && flat[i - 1].tie && flat[i - 1].midi === n.midi) continue;
      if (prev !== null) {
        const d = n.midi - prev.midi, lim = n.disp && d > 0 ? 12 : MAXLEAP;
        if (Math.abs(d) > lim && !so.bars[n.bi].locked && !(so.quote)) {
          if (prev.ci !== ci) { if (withCarry) err('seam-leap', `${ctx} c${ci} 첫 음 ${prev.midi}→${n.midi}`); }
          else err('leap', `${ctx} c${ci} m${n.bi + 1} ${prev.midi}→${n.midi}`);
        }
      }
      prev = { midi: n.midi, ci };
    }
    nNotes += flat.filter(n => n.midi !== null).length;
    if (!flat.some(n => n.midi !== null)) err('empty-solo', `${ctx} c${ci}`);
  });
}

const ids = Object.keys(E.SONGDB);
const levels = quick ? [3, 5] : [1, 2, 3, 4, 5], insts = quick ? ['wind'] : ['wind', 'brass', 'free'];
const topics = quick ? ['auto'] : ['auto', 'ct', 'gt', 'penta', 'scale', 'dom'];
let nSame = 0, nDiff = 0, nDet = 0;
for (const id of ids) for (const level of levels) for (const inst of insts) for (let s = 0; s < NSEED; s++) {
  const seed = 1000 + s * 7717 + level * 31;
  for (const nCh of [1, 4]) {
    const ctx = `${id} L${level} ${inst} s${seed} n${nCh}`;
    const o = { seed, level, inst, nCh, carry: true };
    let a;
    try { a = genChoruses(E, id, o); } catch (e) { err('throw', `${ctx}: ${e.message}`); continue; }
    check(a, ctx, inst, true);
    /* 재현성 */
    const b = genChoruses(E, id, o);
    if (a.map(strip).join('|') !== b.map(strip).join('|')) err('nondeterministic', ctx); else nDet++;
    /* v0.65 동작 보존(natural=false) */
    if (R) {
      const x = genChoruses(E, id, Object.assign({}, o, { carry: false, extra: { natural: false } }));
      const y = genChoruses(R, id, Object.assign({}, o, { carry: false }));
      const sx = x.map(so => JSON.stringify(so.bars)).join('|'), sy = y.map(so => JSON.stringify(so.bars)).join('|');
      if (sx === sy) nSame++; else { nDiff++; err('v065-mismatch', ctx); }
    }
  }
}
/* 연습 주제·장르·스타일·옵션 조합(무결성만) */
if (!quick) {
  for (const id of ids) for (const topic of topics.slice(1)) for (const level of [2, 4, 5]) {
    const ctx = `${id} L${level} topic=${topic}`;
    try { check(genChoruses(E, id, { seed: 77 + level, level, inst: 'wind', nCh: 2, topic, carry: true }), ctx, 'wind', true); } catch (e) { err('throw', `${ctx}: ${e.message}`); }
  }
  for (const id of ids) for (const feel of ['swing', 'ballad', 'bossa', 'latin', 'shuffle', 'funk']) for (const style of ['all', 'parker', 'miles', 'getz']) {
    const ctx = `${id} feel=${feel} style=${style}`;
    try { check(genChoruses(E, id, { seed: 4242, level: 5, inst: 'brass', nCh: 3, feel, style, carry: true }), ctx, 'brass', true); } catch (e) { err('throw', `${ctx}: ${e.message}`); }
  }
  for (const id of ids) for (const lyric of [0, 0.3, 0.65, 1]) for (const ex of [{ useLicks: false }, { groups: false }, { motif: false }, {}]) {
    const ctx = `${id} lyric=${lyric} ${JSON.stringify(ex)}`;
    try { check(genChoruses(E, id, Object.assign({ seed: 99, level: 4, inst: 'wind', nCh: 2, lyric, carry: true }, ex)), ctx, 'wind', true); } catch (e) { err('throw', `${ctx}: ${e.message}`); }
  }
}
console.log(`${path.basename(eng)}: 솔로 ${nSolo}개 · 마디 ${nBars} · 음 ${nNotes} · 곡 ${ids.length} · 재현성 통과 ${nDet}` + (R ? ` · natural=false가 원본과 일치 ${nSame}/${nSame + nDiff}` : ''));
const keys = Object.keys(errs);
if (!keys.length) console.log('위반 0');
else keys.forEach(k => { console.log(`✗ ${k}: ${errs[k].length}건`); errs[k].slice(0, 6).forEach(m => console.log('    ' + m)); });
process.exitCode = keys.length ? 1 : 0;
