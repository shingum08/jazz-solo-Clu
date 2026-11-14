'use strict';
/* node tools/licks_build.js <engine.js> [목록.md]
   tools/licks_src.js(음이름) → 엔진 자료. 엔진 파일의 표시(LICKS66 / CELLS66) 사이를 바꿔 넣고, 음이름 목록(md)을 만든다. */
const fs = require('fs'), path = require('path');
const { loadEngine } = require('./harness');
const SRC = require('./licks_src');
const [, , engFile, mdFile] = process.argv;
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = s => { const m = /^([A-G])([#b]?)(-?\d)$/.exec(s); if (!m) throw new Error('음이름 오류: ' + s); return PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12 * (+m[3] + 1); };
const mod12 = x => ((x % 12) + 12) % 12;
const CT = { dom: [0, 4, 7, 10], domalt: [0, 4, 7, 10], min: [0, 3, 7, 10], hdim: [0, 3, 6, 10], maj: [0, 4, 7, 11, 9] };
const LAND = { maj: [0, 4, 7, 11, 9, 2], min: [0, 3, 7, 10], dom: [0, 4, 7, 10] };
const warn = [];

function parse(L) {
  const root = midi(L.root); let t = 0, trip = false, land = false, half = null, tl = null; const n = [];
  for (const tok0 of L.s.trim().split(/\s+/)) {
    let tok = tok0;
    if (tok === '|') { half = t; continue; }
    if (tok === '>') { land = true; continue; }
    if (tok[0] === '(') { trip = true; tok = tok.slice(1); }
    let end = false; if (tok.endsWith(')')) { end = true; tok = tok.slice(0, -1); }
    const [nm, d0] = tok.split(':'); const d = d0 ? +d0 : (trip ? 2 : 3);
    if (land) { tl = midi(nm) - root; break; }
    if (nm !== 'z') n.push([t, d, midi(nm) - root]);
    t += d; if (end) trip = false;
  }
  return { n, t: tl, len: t, half };
}

const E = loadEngine(path.resolve(engFile));
const oldIds = new Set(E.CURATED_LICKS.filter(L => !L.v).map(L => L.id));
const outL = [], seen = new Set();
for (const L of SRC.licks) {
  const p = parse(L), W = m => warn.push(`릭 ${L.id}: ${m}`);
  if (oldIds.has(L.id) || seen.has(L.id)) W('id 겹침'); seen.add(L.id);
  const BAR = L.m === 3 ? 18 : 24; if (p.len !== BAR) W('길이 ' + p.len + '틱(' + BAR + '이어야 함)');
  if (L.half && p.half !== 12) W('코드 바뀌는 자리가 12틱이 아님');
  if (!!L.to !== (p.t !== null)) W('착지음과 to 가 맞지 않음');
  const seq = p.n.map(x => x[2]).concat(p.t !== null ? [p.t] : []);
  const leap = Math.max(...seq.slice(1).map((m, k) => Math.abs(m - seq[k])));
  if (leap > 7) W('도약 ' + leap + '반음(관악 한계 7)');
  const on = p.n.filter(x => x[0] % 6 === 0);
  const isCT = x => (L.half && x[0] >= 12 ? CT.dom.includes(mod12(x[2] - 5)) : L.cls.every(c => CT[c].includes(mod12(x[2]))));
  const nOn = on.filter(isCT).length;
  if (on.length && nOn / on.length < 0.5) W(`정박 코드톤 ${nOn}/${on.length}`);
  if (L.to) for (const c of L.to) if (!LAND[c].includes(mod12(p.t - (L.half ? 10 : 5)))) W('착지음이 ' + c + ' 코드톤이 아님');
  const o = { id: L.id, v: 66, src: '재즈 교육 공통 어휘', cls: L.cls, to: L.to || null, tr: L.to ? 5 : null, n: p.n, t: p.t, name: L.name };
  if (L.w) o.w = L.w; if (L.minDiff) o.minDiff = L.minDiff; if (L.dm) o.dm = L.dm; if (L.alt) o.alt = 1;
  if (L.half) { o.half = 1; o.cls2 = L.cls2; } if (L.m) o.m = L.m;
  outL.push(o);
}
const oldCells = E.STYLE_DATA.cells.filter(c => !c.v), outC = [];
for (const c of SRC.cells) {
  if (c.iv.length !== (c.to ? 4 : 3)) warn.push('셀 ' + c.name + ': 음정 개수');
  const dup = oldCells.find(o => o.cls === c.cls && (o.to || '') === (c.to || '') && (o.tr || 0) === (c.tr || 0) && mod12(o.s) === mod12(c.s) && JSON.stringify(o.iv) === JSON.stringify(c.iv));
  if (dup) { warn.push(`셀 "${c.name}" 은 이미 있음(${dup.id} ${dup.name}) — 뺌`); continue; }
  outC.push(Object.assign({ v: 66 }, c));
}

/* 엔진 파일에 넣기 */
let src = fs.readFileSync(engFile, 'utf8');
function put(tag, block, anchor, after) {
  const a = `/* ${tag}> `, b = `/* <${tag} */`;
  const i = src.indexOf(a), j = src.indexOf(b);
  if (i >= 0 && j > i) { src = src.slice(0, i) + block + src.slice(j + b.length); return; }
  const k = src.indexOf(anchor);
  if (k < 0 || src.indexOf(anchor, k + 1) >= 0) throw new Error(tag + ': 넣을 자리를 찾지 못함');
  src = after ? src.slice(0, k + anchor.length) + '\n' + block + src.slice(k + anchor.length) : src.slice(0, k) + block + '\n' + src.slice(k);
}
const head = "v0.66.3 재즈 교육 공통 어휘 — tools/licks_src.js 에서 만든다(여기서 직접 고치지 말 것). v:66 = '선율 다듬기'를 끄면 쓰지 않는다 */";
put('LICKS66', `/* LICKS66> ${head}\nCURATED_LICKS.push(\n${outL.map(o => JSON.stringify(o)).join(',\n')}\n);\n/* <LICKS66 */`, 'const LICK_RATE={', false);
put('CELLS66', `/* CELLS66> ${head}\nCURATED_CELLS.push(\n${outC.map(o => '  ' + JSON.stringify(o)).join(',\n')}\n);\n/* <CELLS66 */`, "name:'Ⅴ: 5-4-3-2 → Ⅰ의 1음'}\n];", true);
fs.writeFileSync(engFile, src);

/* 음이름 목록(md) */
if (mdFile) {
  const show = s => s.replace(/([A-G])b/g, '$1♭').replace(/([A-G])#/g, '$1♯').replace(/:6/g, '(4분)').replace(/:12/g, '(2분)').replace(/\bz\b/g, '(쉼)').replace(/>/g, '→');
  const ROOT = { G3: 'G7', D4: 'Dm7', C4: 'C' };
  const NOTE = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  let md = '', g = null;
  for (const L of SRC.licks) {
    if (L.g !== g) { g = L.g; md += `\n### ${g}\n\n| 기호 | 음 (C조 예시) | 내용 | 조건 |\n|---|---|---|---|\n`; }
    const chord = L.cls[0] === 'hdim' ? 'Dø' : L.cls[0] === 'min' ? 'Dm7' : ROOT[L.root];
    const cond = [L.dm ? '그냥 7코드에서는 레벨 5' : '', L.minDiff ? '레벨 5' : '', L.s.includes('(') ? '스윙·셔플만(셋잇단)' : ''].filter(Boolean).join(' · ');
    md += `| ${L.id} | ${chord}: ${show(L.s)} | ${L.name} | ${cond || '레벨 3 이상'} |\n`;
  }
  md += '\n### 4음 셀 (8분음표 넷, → 는 다음 코드 첫 박)\n\n| 코드 | 음 (C 뿌리 예시) | 내용 | 조건 |\n|---|---|---|---|\n';
  for (const c of outC) {
    const ms = [c.s]; c.iv.forEach(v => ms.push(ms[ms.length - 1] + v));
    const nm = ms.map((m, k) => (c.to && k === 4 ? '→ ' : '') + NOTE[mod12(m)]).join(' ');
    md += `| ${c.cls}${c.to ? ' → ' + c.to : ''} | ${nm} | ${c.name} | ${c.minDiff ? '레벨 5' : '레벨 3 이상'} |\n`;
  }
  fs.writeFileSync(mdFile, md);
}
const by = {}; SRC.licks.forEach(L => { by[L.g] = (by[L.g] || 0) + 1; });
console.log(`릭 ${outL.length}개 · 셀 ${outC.length}개`, JSON.stringify(by));
console.log(warn.length ? '경고:\n  ' + warn.join('\n  ') : '경고 없음');
