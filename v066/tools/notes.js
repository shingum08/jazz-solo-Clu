/* 솔로(코러스 배열) → 붙임줄을 합친 음 목록 + 텍스트 악보 */
'use strict';
const NAMES_F = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const DEG = ['R', 'b9', '9', 'b3', '3', '11', '#11', '5', 'b13', '13', 'b7', '7'];
const mod12 = x => ((x % 12) + 12) % 12;
const noteName = m => NAMES_F[mod12(m)] + (Math.floor(m / 12) - 1);

/* 코드 종류에 맞춘 음도 이름(마이너의 b3, 6코드의 6 등) */
function degName(E, m, ch) {
  const r = mod12(m - ch.root), T = E.CHORD_TYPES[ch.type], cls = E.TYPE_CLS[ch.type];
  let s = DEG[r];
  if (r === 3 && T.iv.includes(4)) s = '#9';
  if (r === 6 && T.iv.includes(6)) s = 'b5';
  if (r === 8 && cls === 'hdim') s = 'b13';
  if (r === 9 && T.iv.includes(9)) s = '6';
  if (r === 9 && cls === 'dim') s = 'bb7';
  if (r === 5 && ch.type === '7sus4') s = '4';
  return s;
}
function kindOf(E, m, ch) { /* 2=코드톤, 1=스케일음, 0=밖 */
  const r = mod12(m - ch.root), T = E.CHORD_TYPES[ch.type];
  return T.iv.map(mod12).includes(r) ? 2 : T.scale.includes(r) ? 1 : 0;
}

/* 코러스 배열 → 음 목록. 각 음: {T(절대 틱), d, midi, ch(시작 코드), bar, chorus, trip, phStart, phEnd, beatPos} */
function flatten(E, solos) {
  const out = []; let offset = 0;
  solos.forEach((solo, ci) => {
    const BPB = solo.bpb || 4, TPB = BPB * 6;
    const flat = [];
    solo.bars.forEach((bar, bi) => bar.notes.forEach(n => flat.push(Object.assign({}, n, { bi, T: bi * TPB + n.t }))));
    for (let i = 0; i < flat.length; i++) {
      const n = flat[i];
      if (n.midi === null) continue;
      if (i > 0 && flat[i - 1].tie && flat[i - 1].midi === n.midi) continue;
      let end = n.T + n.d, k = i, phEnd = !!n.phEnd;
      while (flat[k].tie && flat[k + 1] && flat[k + 1].midi === n.midi) { k++; end = flat[k].T + flat[k].d; phEnd = phEnd || !!flat[k].phEnd; }
      const bar = solo.bars[n.bi];
      const ch = E.chordAtBeat(bar.chords, n.t / 6, BPB);
      out.push({ T: offset + n.T, t: n.T, d: end - n.T, midi: n.midi, ch, bar: n.bi, chorus: ci, trip: !!n.trip, phStart: !!n.phStart, phEnd, pos: n.t, bpb: BPB, disp: !!n.disp });
    }
    offset += solo.bars.length * TPB;
  });
  return out;
}

const DUR = { 2: 't', 3: 'e', 4: 'T', 6: 'q', 9: 'q.', 12: 'h', 15: 'h+e', 18: 'h.', 24: 'w' };
function posName(pos) {
  const beat = Math.floor(pos / 6) + 1, r = pos % 6;
  return beat + ({ 0: '', 3: '&', 2: 'b', 4: 'c', 1: '?', 5: '?' }[r]);
}

/* 텍스트 악보: 마디마다 코드와 음(박:음이름(음도)길이). 코드톤이 아닌 음은 음도 뒤에 표시 없음, 스케일 밖은 ! */
function render(E, solos, o) {
  o = o || {};
  const notes = flatten(E, solos), lines = [];
  solos.forEach((solo, ci) => {
    const BPB = solo.bpb || 4, TPB = BPB * 6;
    lines.push(`── ${ci + 1}코러스 (feel=${solo.feel}) ──`);
    solo.bars.forEach((bar, bi) => {
      if (o.from !== undefined && (bi < o.from || bi > o.to)) return;
      const ns = notes.filter(n => n.chorus === ci && n.bar === bi);
      const cs = bar.chords.map(c => E.chordSymbol(c.root, c.type)).join(' ');
      const body = ns.map(n => {
        const k = kindOf(E, n.midi, n.ch);
        const over = n.pos + n.d > TPB ? '~' : '';
        return `${n.phStart ? '[' : ''}${posName(n.pos)}:${noteName(n.midi)}(${degName(E, n.midi, n.ch)}${k === 0 ? '!' : ''})${DUR[n.d] || n.d}${over}${n.phEnd ? ']' : ''}`;
      }).join(' ');
      const tags = o.tags ? '   # ' + (bar.tags || []).filter(t => !/^(프레이즈 시작|프레이즈 종지|호흡 쉼표|음역군|3연음|가이드톤 타깃|코드톤 착지|쉼\(호흡\))/.test(t)).join(', ') : '';
      lines.push(`${String(bi + 1).padStart(2)} ${cs.padEnd(16)}| ${body}${tags}`);
    });
  });
  return lines.join('\n');
}

module.exports = { flatten, render, noteName, degName, kindOf, mod12 };
