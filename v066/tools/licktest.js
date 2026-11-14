'use strict';
/* node tools/licktest.js <engine> <levels> <seeds> [list|where] — 릭·셀이 코러스당 몇 번, 몇 가지나 쓰이는지 */
const path = require('path'); const { loadEngine, addSong, genChoruses } = require('./harness'); const T = require('./songs_test');
const [, , eng, levels, seeds, first] = process.argv;
const E = loadEngine(path.resolve(eng)); Object.keys(T).forEach(id => addSong(E, id, T[id]));
const IDS = ['form-rhythm', 'form-jazzblues', 'form-minorblues', 'pd-i-got-rhythm', 'pd-honeysuckle-rose', 'pd-tea-for-two', 'pd-it-had-to-be-you', 'p251', 't-minor', 't-dense', 't-cycle', 't-bossa', 't-ballad', 't-long'];
const LID = new Set(E.CURATED_LICKS.map(L => L.id)), NEW = new Set(E.CURATED_LICKS.filter(L => L.v).map(L => L.id));
const HALF = new Set(E.CURATED_LICKS.filter(L => L.half).map(L => L.id));
const cellNew = new Set(E.STYLE_DATA.cells.filter(c => c.v).map(c => c.id));
for (const lv of (levels || '5').split(',').map(Number)) {
  const use = {}, cuse = {}, per = {}, firstAt = {}, fun = {}; let nBar = 0, nCh = 0, nL = 0, nC = 0, nNew = 0, nHalf = 0, chain = 0, rep = 0, solos = 0, cNew = 0;
  for (const id of IDS) {
    let l = 0, n = 0, nb = 0;
    for (let s = 1; s <= +(seeds || 6); s++) {
      const seed = s * 101 + 7, r = genChoruses(E, id, { seed, level: lv, nCh: 4, inst: process.env.INST || 'wind', carry: true, extra: process.env.FUNNEL ? { debug: true } : {} });
      const cnt = {}; solos++;
      r.forEach((so, c) => {
        const u = so.form.licks || {}; n++; nCh++; nb += so.bars.length; nBar += so.bars.length; chain += so.stats.lickChain || 0; if (so.stats.lk) for (const k in so.stats.lk) fun[k] = (fun[k] || 0) + so.stats.lk[k];
        for (const k in u) {
          if (LID.has(k)) { use[k] = (use[k] || 0) + u[k]; nL += u[k]; l += u[k]; cnt[k] = (cnt[k] || 0) + 1; if (NEW.has(k)) nNew += u[k]; if (HALF.has(k)) nHalf += u[k]; if (!firstAt[k]) firstAt[k] = `${id} ${seed} c${c}`; }
          else { cuse[k] = (cuse[k] || 0) + u[k]; nC += u[k]; if (cellNew.has(k)) cNew += u[k]; }
        }
      });
      rep += Object.values(cnt).filter(x => x >= 2).length;
    }
    per[id] = (32 * l / nb).toFixed(2);
  }
  console.log(`L${lv} · 코러스 ${nCh} · 릭 ${(32 * nL / nBar).toFixed(2)}개/32마디 (새 릭 ${nL ? Math.round(100 * nNew / nL) : 0}% · 짧은Ⅱ–Ⅴ ${nHalf} · 이어붙임 ${chain}) · 쓰인 릭 ${Object.keys(use).length}/${LID.size}가지 · 한 솔로에서 같은 릭이 2코러스 이상 ${(rep / solos).toFixed(2)}개`);
  console.log(`  셀/코러스 ${(nC / nCh).toFixed(2)} (새 셀 ${nC ? Math.round(100 * cNew / nC) : 0}%) · 쓰인 셀 ${Object.keys(cuse).length}가지`);
  console.log('  곡별 릭/32마디 ' + Object.entries(per).map(([k, v]) => k.replace(/^(form|pd|t)-/, '') + ' ' + v).join(' · '));
  if (process.env.FUNNEL) console.log('  자리 진단(코러스당) ' + Object.entries(fun).map(([k, v]) => k + ' ' + (v / nCh).toFixed(2)).join(' → '));
  if (first) {
    console.log('  릭별 ' + Object.entries(use).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ':' + v).join(' '));
    console.log('  새 셀 ' + Object.entries(cuse).filter(([k]) => cellNew.has(k)).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ':' + v).join(' '));
    if (first === 'where') console.log('  첫 등장 ' + Object.entries(firstAt).filter(([k]) => NEW.has(k)).map(([k, v]) => k + '=' + v).join(' | '));
  }
}
