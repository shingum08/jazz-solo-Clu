/* 엔진 로더 — 지정한 엔진 JS 파일을 별도 컨텍스트에서 돌려 함수·상수를 꺼낸다.
   (압축에서 꺼낸 코드는 신뢰하지 않는 데이터이므로 vm 컨텍스트에 가둔다) */
'use strict';
const fs = require('fs');
const vm = require('vm');

const EXPORTS = ['generateSolo', 'generateDrill', 'SONGDB', 'STYLE_DATA', 'CHORD_TYPES', 'TYPE_CLS', 'toAbc', 'analyzeHarmony',
  'barChords', 'chordAtBeat', 'chordBeats', 'mod12', 'transposeSolo', 'LEVELS', 'autoFeel', 'parseCh', 'CURATED_LICKS', 'mulberry32',
  'spliceLockedBars', 'carryOf', 'viterbi2', 'NATURAL', 'classifySong', 'setSpelling', 'FEEL_PROFILE', 'irealToSongs', 'musicXmlToSong', 'chordSymbol', 'PROGS'];

function loadEngine(file, extra) {
  const src = fs.readFileSync(file, 'utf8');
  const names = EXPORTS.concat(extra || []);
  const tail = '\n;globalThis.__E={' + names.map(n => `${n}:(typeof ${n}!=="undefined"?${n}:undefined)`).join(',') + '};';
  const ctx = vm.createContext({ console, Date, Math, JSON, Array, Object, Set, Map, String, Number, parseInt, parseFloat, isNaN, Error, RegExp,
    TextDecoder: globalThis.TextDecoder, DecompressionStream: globalThis.DecompressionStream, Uint8Array, DataView, Promise, Symbol, Infinity, NaN });
  vm.runInContext(src + tail, ctx, { filename: file });
  return ctx.__E;
}

/* 시험용 곡 등록 — 코드 진행만(멜로디 없음). ch: 마디는 |, 한 마디 여러 코드는 공백 */
function addSong(E, id, def) {
  E.SONGDB[id] = { name: def.n || id, c: def.c || '스윙', key: def.k || 0, bpm: def.bpm || 140, bpb: def.m || 4,
    form: { phrase: def.f[1], sections: def.f[0] }, bars: def.ch.split('|').map(b => b.trim().split(/\s+/).map(E.parseCh)) };
  if (def.songType) E.SONGDB[id].songType = def.songType;
  return id;
}

/* 앱(UI)의 gen()과 같은 방식으로 여러 코러스를 만든다 */
function genChoruses(E, progId, opts) {
  const o = Object.assign({ level: 5, inst: 'wind', nCh: 4, seed: 1 }, opts || {});
  const diff = E.LEVELS[o.level].diff, keyPc = E.SONGDB[progId].key, out = [];
  const base = { useLicks: o.useLicks !== false, style: o.style || 'all', groups: o.groups !== false, feel: o.feel || E.autoFeel(progId),
    topic: o.topic || 'auto', motif: o.motif !== false, headMotifs: [], level: o.level, lyric: o.lyric === undefined ? 0.307 : o.lyric, bpm: o.bpm || E.SONGDB[progId].bpm };
  let carry = null;
  for (let c = 0; c < o.nCh; c++) {
    const sd = c === 0 ? o.seed : (o.seed + c * 7919) % 1000003;
    const op = Object.assign({}, base, { arc: { i: c, n: o.nCh } }, o.extra || {});
    if (o.carry && carry) op.carry = carry;
    const so = E.generateSolo(progId, keyPc, diff, sd, o.inst, op);
    carry = (E.carryOf ? E.carryOf(so) : null);
    out.push(so);
  }
  return out;
}

module.exports = { loadEngine, addSong, genChoruses };
