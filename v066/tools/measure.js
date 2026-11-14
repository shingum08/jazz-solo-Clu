'use strict';
/* 사용: node tools/measure.js <engine.js> [level] [nCh] [seeds] [feelSet]  — 스윙 곡 묶음 지표 */
const path = require('path');
const { loadEngine, addSong, genChoruses } = require('./harness');
const { metrics, report } = require('./metrics');
const T = require('./songs_test');
const [, , eng, level, nCh, seeds, set] = process.argv;
const E = loadEngine(path.resolve(eng));
Object.keys(T).forEach(id => addSong(E, id, T[id]));
const SETS = {
  swing: ['form-rhythm', 'form-jazzblues', 'form-minorblues', 'pd-i-got-rhythm', 'pd-honeysuckle-rose', 'pd-tea-for-two', 'pd-it-had-to-be-you', 'p251', 't-minor', 't-dense'],
  std: ['form-rhythm', 'pd-honeysuckle-rose', 'pd-tea-for-two', 'pd-it-had-to-be-you', 't-minor'],
  blues: ['form-jazzblues', 'form-minorblues', 'blues12'],
  ballad: ['t-ballad'], latin: ['t-calypso'], bossa: ['t-bossa'], funk: ['t-funk'], modal: ['t-modal'], shuffle: ['t-shuffle'], waltz: ['t-waltz', 't-five'],
};
const ids = SETS[set || 'swing'];
const list = [];
for (const id of ids) for (let s = 1; s <= +(seeds || 6); s++) list.push(genChoruses(E, id, { seed: s * 101 + 7, level: +(level || 5), nCh: +(nCh || 4), inst: process.env.INST || 'wind', carry: process.env.CARRY === '1', style: process.env.STYLE || 'all' }));
console.log(report(E, metrics(E, list), `${path.basename(eng)} · ${set || 'swing'} · 단계 ${level || 5} · ${nCh || 4}코러스 · 시드 ${seeds || 6}`));
