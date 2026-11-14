/* 생성 솔로의 지표 — WJD 내장 분포와 비교할 수 있게 같은 기준으로 센다 */
'use strict';
const { flatten, kindOf, mod12 } = require('./notes');

function metrics(E, solosList) {
  /* solosList: [ [chorus solos...], ... ]  여러 곡·시드의 코러스 묶음 */
  const M = { n: 0, on: 0, onCT: 0, onTens: 0, onScale: 0, onOut: 0, off: 0, offCT: 0, out: 0, rep: 0, ivN: 0,
    iv: new Array(25).fill(0), bigLeap: 0, leapN: 0, leapFilled: 0, runs: [], zig: 0, zigN: 0, osc: 0, oscN: 0, narrow: 0, narrowN: 0,
    dur: {}, trip: 0, eighth: 0, phrases: 0, phEndOn: 0, phEndCT: 0, phEndTens: 0, phEndLong: 0, phStartOn: 0, phStartPos: {}, phEndPos: {},
    unresolved: 0, unresolvedN: 0, seamIv: [], seamGap: [], avoidHeld: 0, heldN: 0, heldTens: 0, heldCT: 0, pcOn: {}, pcOff: {},
    offQChain: 0, bars: 0, emptyBars: 0, perBar: [], rangeLo: 999, rangeHi: 0, beat13: 0, beat13CT: 0, beat24: 0, beat24CT: 0,
    changeHits: 0, changeN: 0, stepInto: 0, peakPos: [], tripShapes: {}, noteSpan: [], sameDirPairs: 0, phLenBeats: [], gapBeats: [],
    endDur: {}, turnN: 0, turn: 0, zigN: 0, zig2: 0, pitchByCh: {}, antic: 0, anticCT: 0, restShare: 0, totTicks: 0, restTicks: 0, densByChorus: {} };
  const clsOf = ch => E.TYPE_CLS[ch.type];
  for (const solos of solosList) {
    const notes = flatten(E, solos);
    const BPB = solos[0].bpb || 4, TPB = BPB * 6, NB = solos[0].bars.length, CH = NB * TPB;
    M.bars += NB * solos.length;
    M.totTicks += CH * solos.length;
    solos.forEach((so, ci) => so.bars.forEach(b => { const k = b.notes.filter(n => n.midi !== null && true).length; if (!b.notes.some(n => n.midi !== null)) M.emptyBars++; }));
    /* 코러스별 음 수 */
    solos.forEach((so, ci) => { const k = notes.filter(n => n.chorus === ci).length; (M.densByChorus[ci] = M.densByChorus[ci] || []).push(k / NB); });
    notes.forEach(n => { (M.pitchByCh[n.chorus] = M.pitchByCh[n.chorus] || []).push(n.midi); });
    for (let i = 1; i + 1 < notes.length; i++) { const a = notes[i - 1], b = notes[i], c = notes[i + 1];
      if (b.T !== a.T + a.d || c.T !== b.T + b.d) continue; const d1 = b.midi - a.midi, d2 = c.midi - b.midi; if (!d1 || !d2) continue;
      M.turnN++; const ch = Math.sign(d1) !== Math.sign(d2); if (ch) M.turn++;
      const d = notes[i + 2]; if (d && d.T === c.T + c.d && d.midi !== c.midi) { M.zigN++; if (ch && Math.sign(d.midi - c.midi) !== Math.sign(d2)) M.zig2++; } }
    let run = 0, lastDir = 0, offChain = 0;
    let sounding = 0;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i], pv = notes[i - 1], nx = notes[i + 1];
      sounding += n.d;
      const cls = clsOf(n.ch), rel = mod12(n.midi - n.ch.root), k = kindOf(E, n.midi, n.ch);
      const T = E.CHORD_TYPES[n.ch.type];
      const onBeat = n.pos % 6 === 0;
      const isTens = k === 1 && [2, 9, 5, 6].includes(rel) && !(rel === 5 && (cls === 'maj' || cls === 'dom' || cls === 'domalt'));
      M.n++; M.rangeLo = Math.min(M.rangeLo, n.midi); M.rangeHi = Math.max(M.rangeHi, n.midi);
      M.dur[n.d] = (M.dur[n.d] || 0) + 1;
      if (n.trip) M.trip++; if (n.d === 3 && !n.trip) M.eighth++;
      if (k === 0) M.out++;
      if (onBeat) {
        M.on++; if (k === 2) M.onCT++; else if (k === 1) { M.onScale++; if (isTens) M.onTens++; } else M.onOut++;
        const key = cls; (M.pcOn[key] = M.pcOn[key] || new Array(12).fill(0))[rel]++;
        const beat = n.pos / 6;
        if (BPB === 4) { if (beat === 0 || beat === 2) { M.beat13++; if (k === 2) M.beat13CT++; } else { M.beat24++; if (k === 2) M.beat24CT++; } }
      } else { M.off++; if (k === 2) M.offCT++; (M.pcOff[cls] = M.pcOff[cls] || new Array(12).fill(0))[rel]++; }
      /* 긴 음(1박 이상) */
      if (n.d >= 6) { M.heldN++; if (k === 2) M.heldCT++; else if (isTens) M.heldTens++;
        if ((rel === 5 && (cls === 'maj' || cls === 'dom')) || (rel === 8 && cls === 'min') || (rel === 1 && cls !== 'domalt') ) M.avoidHeld++; }
      /* 음정 */
      if (pv && pv.chorus === n.chorus) {
        const gap = n.T - (pv.T + pv.d), d = n.midi - pv.midi;
        if (gap < 12) {
          M.ivN++; if (d >= -12 && d <= 12) M.iv[d + 12]++; else M.bigLeap++;
          if (d === 0) M.rep++;
          const dir = Math.sign(d);
          if (gap <= 0) {
            if (dir !== 0 && dir === lastDir) run++; else { if (run > 0) M.runs.push(run + 1); run = dir !== 0 ? 1 : 0; }
            if (dir !== 0) lastDir = dir;
          } else { if (run > 0) M.runs.push(run + 1); run = 0; lastDir = 0; }
          /* 도약 뒤 메우기 */
          if (Math.abs(d) >= 5 && nx && nx.chorus === n.chorus && nx.T === n.T + n.d) { M.leapN++; const d2 = nx.midi - n.midi; if (d2 !== 0 && Math.sign(d2) !== Math.sign(d) && Math.abs(d2) <= 2) M.leapFilled++; }
        } else { if (run > 0) M.runs.push(run + 1); run = 0; lastDir = 0; }
      }
      /* 두 음 왕복(A-B-A-B) · 좁은 음역 맴돌기(연속 8음이 4반음 안) */
      if (i >= 3) { const w = notes.slice(i - 3, i + 1); if (w.every((x, q) => q === 0 || (x.T === w[q - 1].T + w[q - 1].d))) { M.oscN++; if (w[0].midi === w[2].midi && w[1].midi === w[3].midi && w[0].midi !== w[1].midi) M.osc++; } }
      if (i >= 7) { const w = notes.slice(i - 7, i + 1); if (w.every((x, q) => q === 0 || (x.T === w[q - 1].T + w[q - 1].d))) { M.narrowN++; const ms = w.map(x => x.midi); if (Math.max(...ms) - Math.min(...ms) <= 4) M.narrow++; } }
      /* 엇박 4분 사슬 */
      if (!onBeat && !n.trip && n.d === 6) { offChain++; if (offChain === 4) M.offQChain++; } else offChain = 0;
      /* 프레이즈 */
      if (n.phStart) { M.phrases++; if (onBeat) M.phStartOn++; const p = n.pos % 24; M.phStartPos[p] = (M.phStartPos[p] || 0) + 1; }
      if (n.phEnd) {
        if (onBeat) M.phEndOn++; if (k === 2) M.phEndCT++; else if (isTens) M.phEndTens++; if (n.d >= 6) M.phEndLong++;
        M.phEndPos[n.pos % 24] = (M.phEndPos[n.pos % 24] || 0) + 1;
        M.endDur[Math.min(n.d, 24)] = (M.endDur[Math.min(n.d, 24)] || 0) + 1;
        /* 해결 직전에 끊긴 프레이즈: 끝음이 Ⅴ7 위에서 끝나고, 그 화음이 4도 위로 해결하는 자리가 2박 안에 오는데 다음 음이 그 자리에 없음 */
        const so = solos[n.chorus], endT = n.t + n.d;
        const segEnd = (() => { let b = n.bar, beat = Math.floor(n.pos / 6); for (let q = 0; q < BPB * 2; q++) { beat++; if (beat >= BPB) { beat = 0; b++; } if (b >= NB) return null; const c2 = E.chordAtBeat(so.bars[b].chords, beat, BPB); if (c2.root !== n.ch.root || c2.type !== n.ch.type) return { t: b * TPB + beat * 6, c: c2 }; } return null; })();
        if ((cls === 'dom' || cls === 'domalt') && segEnd && mod12(segEnd.c.root - n.ch.root) === 5) {
          M.unresolvedN++;
          const landed = endT > segEnd.t || (nx && nx.chorus === n.chorus && nx.t <= segEnd.t + 3);
          if (!landed && segEnd.t - endT <= 6) M.unresolved++;
        }
      }
      /* 당겨 친 음(마디선·코드 경계를 넘는 엇박 음)이 다음 코드의 코드톤인가 */
      if (!onBeat && n.pos + n.d > TPB) { M.antic++; const so = solos[n.chorus]; const b2 = n.bar + 1; if (b2 < NB) { const c2 = so.bars[b2].chords[0]; if (kindOf(E, n.midi, c2) === 2) M.anticCT++; } }
      /* 코드 전환 첫 박 착지 */
      if (onBeat && pv && pv.chorus === n.chorus && (pv.ch.root !== n.ch.root || pv.ch.type !== n.ch.type) && pv.T + pv.d === n.T) {
        M.changeN++; if ([3, 4, 10, 11].includes(rel) || (T.iv.includes(9) && rel === 9)) M.changeHits++; if (Math.abs(n.midi - pv.midi) <= 2 && n.midi !== pv.midi) M.stepInto++;
      }
      /* 셋잇단 모양(박 머리에서 시작하는 3음 + 다음 음) */
      if (n.trip && n.d === 2 && n.pos % 6 === 0 && notes[i + 2] && notes[i + 2].trip) {
        const a = n.midi, b = notes[i + 1].midi, c = notes[i + 2].midi, d1 = b - a, d2 = c - b;
        let shape;
        if (d1 > 2 && d2 > 2) shape = '아르페지오↑'; else if (d1 < -2 && d2 < -2) shape = '아르페지오↓';
        else if (d1 > 0 && d2 > 0) shape = '순차↑'; else if (d1 < 0 && d2 < 0) shape = '순차↓';
        else if (a === c && a !== b) shape = '이웃음 꾸밈(턴)'; else if (d1 === 0 || d2 === 0) shape = '같은 음 포함'; else shape = '꺾임';
        M.tripShapes[shape] = (M.tripShapes[shape] || 0) + 1;
      }
    }
    if (run > 0) M.runs.push(run + 1);
    M.restTicks += CH * solos.length - sounding;
    /* 코러스 이음매 */
    for (let c = 1; c < solos.length; c++) {
      const a = notes.filter(n => n.chorus === c - 1), b = notes.filter(n => n.chorus === c);
      if (a.length && b.length) { const la = a[a.length - 1], fb = b[0]; M.seamIv.push(fb.midi - la.midi); M.seamGap.push((fb.T - (la.T + la.d)) / 6); }
    }
    /* 프레이즈 길이·사이 쉼(박) */
    { let st = null, pe = null; for (const n of notes) { if (n.phStart) { if (pe !== null) M.gapBeats.push((n.T - pe) / 6); st = n.T; } if (n.phEnd) { if (st !== null) M.phLenBeats.push((n.T + n.d - st) / 6); pe = n.T + n.d; } } }
    /* 최고음 위치(전체 길이 대비) */
    if (notes.length) { let hi = notes[0]; for (const n of notes) if (n.midi > hi.midi) hi = n; M.peakPos.push(hi.T / (CH * solos.length)); }
  }
  return M;
}

const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '-';
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const med = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

function report(E, M, label) {
  const L = [];
  const P = E.STYLE_DATA.profiles.all;
  L.push(`=== ${label} : 음 ${M.n}개, 마디 ${M.bars} ===`);
  L.push(`정박 코드톤 ${pct(M.onCT, M.on)} (WJD ${(P.stats.ctOn * 100).toFixed(1)}%) · 정박 텐션(9·11·13) ${pct(M.onTens, M.on)} · 정박 기타 스케일음 ${pct(M.onScale - M.onTens, M.on)} · 정박 스케일 밖 ${pct(M.onOut, M.on)}`);
  L.push(`  1·3박 코드톤 ${pct(M.beat13CT, M.beat13)} · 2·4박 코드톤 ${pct(M.beat24CT, M.beat24)} · 엇박 코드톤 ${pct(M.offCT, M.off)}`);
  L.push(`스케일 밖 음 ${pct(M.out, M.n)} (WJD chrom ${(P.stats.chrom * 100).toFixed(1)}%) · 같은 음 반복 ${pct(M.rep, M.ivN)} (WJD ${(P.iv[12] * 100).toFixed(1)}%)`);
  L.push(`8분 ${pct(M.eighth, M.n)} (WJD ${(P.stats.eighth * 100).toFixed(1)}%) · 셋잇단 ${pct(M.trip, M.n)} (WJD ${(P.stats.trip * 100).toFixed(1)}%) · 쉼 비율 ${pct(M.restTicks, M.totTicks)} · 빈 마디 ${pct(M.emptyBars, M.bars)}`);
  const ivs = M.iv.map(x => x / M.ivN);
  const grp = f => { let g = 0, w = 0; for (let d = -12; d <= 12; d++) if (f(d)) { g += ivs[d + 12]; w += P.iv[d + 12]; } return `${(g * 100).toFixed(1)}% (WJD ${(w * 100).toFixed(1)}%)`; };
  L.push(`음정: 반음 ${grp(d => Math.abs(d) === 1)} · 온음 ${grp(d => Math.abs(d) === 2)} · 3도 ${grp(d => Math.abs(d) === 3 || Math.abs(d) === 4)} · 4·5도 ${grp(d => Math.abs(d) >= 5 && Math.abs(d) <= 7)} · 6도 이상 ${grp(d => Math.abs(d) >= 8)}`);
  L.push(`  상행 ${grp(d => d > 0)} · 하행 ${grp(d => d < 0)} · 상행 순차 ${grp(d => d === 1 || d === 2)} · 하행 순차 ${grp(d => d === -1 || d === -2)} · 상행 3도 ${grp(d => d === 3 || d === 4)} · 하행 3도 ${grp(d => d === -3 || d === -4)}`);
  const rl = {}; M.runs.forEach(r => { const k = Math.min(r, 8); rl[k] = (rl[k] || 0) + 1; });
  L.push(`같은 방향으로 이어진 음 수(연속 구간): 평균 ${avg(M.runs).toFixed(2)} · 분포 ` + Object.keys(rl).map(k => `${k}${k === '8' ? '+' : ''}:${pct(rl[k], M.runs.length)}`).join(' '));
  L.push(`방향 전환(이어진 세 음 가운데서 꺾이는 비율) ${pct(M.turn, M.turnN)} · 연달아 두 번 꺾임(지그재그) ${pct(M.zig2, M.zigN)}  (무작위면 50% · 25%)`);
  L.push(`두 음 왕복(A-B-A-B) ${pct(M.osc, M.oscN)} · 좁은 음역 맴돌기(8음이 장3도 안) ${pct(M.narrow, M.narrowN)} · 도약 뒤 반대 순차 ${pct(M.leapFilled, M.leapN)} · 엇박 4분 4연속 ${M.offQChain}회`);
  L.push(`긴 음(1박+): 코드톤 ${pct(M.heldCT, M.heldN)} · 텐션 ${pct(M.heldTens, M.heldN)} · 피할 음 ${pct(M.avoidHeld, M.heldN)}`);
  L.push(`프레이즈 ${M.phrases}개 · 평균 길이 ${avg(M.phLenBeats).toFixed(1)}박(중앙 ${med(M.phLenBeats).toFixed(1)}) · 사이 쉼 평균 ${avg(M.gapBeats).toFixed(1)}박 · 시작이 정박 ${pct(M.phStartOn, M.phrases)} · 끝음이 정박 ${pct(M.phEndOn, M.phrases)} · 끝음 코드톤 ${pct(M.phEndCT, M.phrases)} / 텐션 ${pct(M.phEndTens, M.phrases)} · 끝음 1박+ ${pct(M.phEndLong, M.phrases)}`);
  L.push(`  해결 직전에 끊긴 프레이즈(Ⅴ7 위에서 끝, 1박 안에 Ⅰ) ${M.unresolved}/${M.unresolvedN} · 당겨 친 음이 다음 코드톤 ${pct(M.anticCT, M.antic)} · 코드 전환 첫 박 3·7음 ${pct(M.changeHits, M.changeN)} · 전환을 순차로 넘음 ${pct(M.stepInto, M.changeN)}`);
  const sp = Object.keys(M.phStartPos).map(Number).sort((a, b) => a - b).map(k => `${(k / 6 + 1).toFixed(1)}:${pct(M.phStartPos[k], M.phrases)}`).join(' ');
  const ep = Object.keys(M.phEndPos).map(Number).sort((a, b) => a - b).map(k => `${(k / 6 + 1).toFixed(1)}:${pct(M.phEndPos[k], M.phrases)}`).join(' ');
  L.push(`  프레이즈 시작 박: ${sp}`);
  L.push(`  프레이즈 끝음 박: ${ep}`);
  L.push(`  끝음 길이(틱): ` + Object.keys(M.endDur).map(Number).sort((a, b) => a - b).map(k => `${k}:${pct(M.endDur[k], M.phrases)}`).join(' '));
  if (M.seamIv.length) L.push(`코러스 이음매: 음정 절댓값 평균 ${avg(M.seamIv.map(Math.abs)).toFixed(1)}반음 · 7반음 초과 ${pct(M.seamIv.filter(x => Math.abs(x) > 7).length, M.seamIv.length)} · 같은 음 ${pct(M.seamIv.filter(x => x === 0).length, M.seamIv.length)} · 사이 쉼 평균 ${avg(M.seamGap).toFixed(1)}박`);
  L.push(`코러스별 마디당 음 수: ` + Object.keys(M.densByChorus).map(c => avg(M.densByChorus[c]).toFixed(2)).join(' · ') + ` · 최고음 위치(0~1) 평균 ${avg(M.peakPos).toFixed(2)} · 음역 ${M.rangeLo}~${M.rangeHi}`);
  { const q = (a, p) => { const s2 = a.slice().sort((x, y) => x - y); return s2[Math.min(s2.length - 1, Math.floor(p * s2.length))]; };
    L.push(`코러스별 음높이(평균 / 상위 10% 선): ` + Object.keys(M.pitchByCh).map(c => `${avg(M.pitchByCh[c]).toFixed(1)} / ${q(M.pitchByCh[c], 0.9)}`).join(' · ')); }
  const ts = Object.keys(M.tripShapes), tn = ts.reduce((a, k) => a + M.tripShapes[k], 0);
  if (tn) L.push(`셋잇단 모양: ` + ts.sort((a, b) => M.tripShapes[b] - M.tripShapes[a]).map(k => `${k} ${pct(M.tripShapes[k], tn)}`).join(' · '));
  /* 음도 분포 비교(정박) */
  const DEG = ['R', 'b9', '9', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];
  for (const cls of ['maj', 'dom', 'min']) {
    const g = M.pcOn[cls]; if (!g) continue; const tot = g.reduce((a, b) => a + b, 0), w = P.pc[cls].on, wt = w.reduce((a, b) => a + b, 0);
    L.push(`  정박 음도 ${cls}: ` + DEG.map((d, i) => `${d} ${(100 * g[i] / tot).toFixed(0)}/${(100 * w[i] / wt).toFixed(0)}`).join('  ') + '   (생성/WJD %)');
  }
  for (const cls of ['maj', 'dom', 'min']) {
    const g = M.pcOff[cls]; if (!g) continue; const tot = g.reduce((a, b) => a + b, 0), w = P.pc[cls].off, wt = w.reduce((a, b) => a + b, 0);
    L.push(`  엇박 음도 ${cls}: ` + DEG.map((d, i) => `${d} ${(100 * g[i] / tot).toFixed(0)}/${(100 * w[i] / wt).toFixed(0)}`).join('  '));
  }
  return L.join('\n');
}

module.exports = { metrics, report, pct, avg, med };
