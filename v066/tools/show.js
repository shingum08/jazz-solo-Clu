'use strict';
/* 사용: node tools/show.js <engine.js> <songId> [seed] [level] [nCh] [feel] [inst] [from-to] */
const path = require('path');
const { loadEngine, addSong, genChoruses } = require('./harness');
const { render } = require('./notes');
const T = require('./songs_test');
const [, , eng, song, seed, level, nCh, feel, inst, range] = process.argv;
const E = loadEngine(path.resolve(eng));
Object.keys(T).forEach(id => addSong(E, id, T[id]));
const solos = genChoruses(E, song, { seed: +(seed || 1), level: +(level || 5), nCh: +(nCh || 2), feel: feel && feel !== '-' ? feel : undefined, inst: inst && inst !== '-' ? inst : 'wind', carry: process.env.CARRY === '1' });
const o = { tags: process.env.TAGS !== '0' };
if (range) { const [a, b] = range.split('-').map(Number); o.from = a - 1; o.to = b - 1; }
console.log(render(E, solos, o));
