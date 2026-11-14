'use strict';
/* node tools/lick_wjd.js <engine> — 릭의 4음 조각(박에서 시작하는 8분음표 넷)이 WJD 실측 셀(4명 이상 공통)과 얼마나 겹치는지 */
const path = require('path'); const { loadEngine } = require('./harness');
const E = loadEngine(path.resolve(process.argv[2])); const mod12 = x => ((x % 12) + 12) % 12;
const W = E.STYLE_DATA.cells.filter(c => c.src === 'WJD');
const key = (cls, to, s, iv) => cls + '>' + (to || '') + ':' + mod12(s) + ':' + iv.join(',');
const idx = new Map(); W.forEach(c => idx.set(key(c.cls, c.to && c.tr === 5 ? c.to : c.to ? 'x' : '', c.s, c.iv), c));
const res = { new: { n: 0, hit: 0, licks: 0, any: 0 }, old: { n: 0, hit: 0, licks: 0, any: 0 } }; const names = {};
for (const L of E.CURATED_LICKS) {
  const R = res[L.v ? 'new' : 'old']; R.licks++; let any = false;
  const at = t => L.n.find(x => x[0] === t && x[1] === 3);
  for (const t0 of [0, 6, 12]) {
    const ns = [0, 3, 6, 9].map(d => at(t0 + d)); if (ns.some(x => !x)) continue;
    const off = L.half && t0 >= 12 ? 5 : 0, clsL = L.half && t0 >= 12 ? ['dom', 'domalt'] : L.cls;
    const s = ns[0][2] - off, iv = [1, 2, 3].map(k => ns[k][2] - ns[k - 1][2]);
    let c = null; for (const cl of clsL) c = c || idx.get(key(cl, '', s, iv));
    R.n++; if (c) { R.hit++; any = true; names[c.name] = (names[c.name] || 0) + 1; }
    /* 코드를 건너는 조각: 넷째 음 다음이 다음 코드 첫 박 */
    const nxt = t0 === 12 ? (L.t !== null && L.t !== undefined ? L.t : null) : (L.half && t0 === 0 ? (at(12) || {})[2] : null);
    if (nxt !== null && nxt !== undefined) {
      const tos = t0 === 12 ? (L.to || []) : ['dom', 'domalt']; let x = null;
      for (const cl of clsL) for (const to of tos) x = x || idx.get(key(cl, to, s, iv.concat([nxt - ns[3][2]])));
      R.n++; if (x) { R.hit++; any = true; names[x.name] = (names[x.name] || 0) + 1; }
    }
  }
  if (any) R.any++;
}
for (const k of ['old', 'new']) { const R = res[k]; console.log(`${k === 'old' ? '기존 릭' : '새 릭'} ${R.licks}개 · 4음 조각 ${R.n}개 중 WJD 실측 셀과 일치 ${R.hit}개(${(100 * R.hit / R.n).toFixed(0)}%) · 조각이 하나라도 일치하는 릭 ${R.any}개`); }
console.log('많이 겹친 실측 셀: ' + Object.entries(names).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k + ' ×' + v).join(' · '));
