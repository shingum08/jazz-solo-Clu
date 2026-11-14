'use strict';
/* 머리 없는 브라우저로 빌드된 앱을 실제로 띄워 본다: 스크립트 오류·악보 렌더·여러 코러스 생성·스위치·재생 예약.
   사용: node tools/browser_test.js <배포 폴더> [스크린샷 접두사] */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const ROOT = path.resolve(process.argv[2] || 'dist'), SHOT = process.argv[3] || '/tmp/shot';
const MIME = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0].split('#')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('nf'); return; }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
(async () => {
  await new Promise(res => srv.listen(0, '127.0.0.1', res));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'] });
  const errors = [], out = {};
  const mk = async (vp) => { const ctx = await browser.newContext({ viewport: vp }); const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|fonts\.g|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort()); return page; };
  const page = await mk({ width: 1280, height: 900 });
  await page.goto(base + '/app/', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof cur !== 'undefined' && cur.solo && document.querySelector('#paper svg'), null, { timeout: 20000 });
  out.title = await page.title();
  out.first = await page.evaluate(() => ({ song: cur.selProg, bars: cur.solo.bars.length, svgs: document.querySelectorAll('#paper svg').length, hasSwitch: !!document.querySelector('#naturalOn'), carry: !!cur.soloBase.carry, version: (document.querySelector('.eyebrow') || {}).textContent }));
  /* 모든 곡 × 코러스 4 × 단계 5: 생성·렌더 */
  out.songs = await page.evaluate(() => {
    const res = [], sel = document.querySelector('#songSel'), ids = [...sel.options].map(o => o.value).filter(v => SONGDB[v]);
    for (const id of ids) {
      sel.value = id; sel.onchange();
      document.querySelector('#chorusSel').value = '4'; cur.seed = 4242; gen(false);
      const so = cur.soloBases, seams = [];
      for (let c = 1; c < so.length; c++) { const last = a => { let m = null; a.bars.forEach(b => b.notes.forEach(n => { if (n.midi !== null) m = n.midi })); return m }, first = a => { for (const b of a.bars) for (const n of b.notes) if (n.midi !== null) return n.midi; return null }; seams.push(first(so[c]) - last(so[c - 1])); }
      const tags = so.flatMap(s => s.bars.flatMap(b => b.tags));
      res.push({ id, ch: so.length, seams, svg: document.querySelectorAll('#paper svg').length, land: tags.filter(t => /^해결/.test(t)).length, theme: tags.filter(t => /^주제 회상/.test(t)).length });
    }
    return res;
  });
  /* 스위치: 끄면 달라지고(=v0.65 방식), 다시 켜면 처음과 같아야 한다 */
  out.toggle = await page.evaluate(() => {
    const snap = () => JSON.stringify(cur.soloBases.map(s => s.bars.map(b => b.notes)));
    document.querySelector('#songSel').value = 'form-jazzblues'; document.querySelector('#songSel').onchange();
    document.querySelector('#chorusSel').value = '3'; cur.seed = 777; gen(false);
    const a = snap(), el = document.querySelector('#naturalOn');
    el.checked = false; el.dispatchEvent(new Event('change')); const b = snap();
    el.checked = true; el.dispatchEvent(new Event('change')); const c = snap();
    return { offDiffers: a !== b, backSame: a === c, seed: cur.seed };
  });
  await page.screenshot({ path: SHOT + '_desktop.png', fullPage: false });
  /* 재생: 2.5초 돌려 보고 예약 오류가 없는지, 강약 값이 범위 안인지 */
  out.play = await page.evaluate(async () => {
    const ev = buildAudioEvents(cur.solos[0], 150, 0.62);
    const v = ev.map(e => e.vel); const bad = ev.filter(e => !(e.vel >= 0.5 && e.vel <= 1) || !(e.dur > 0) || !(e.start >= 0));
    document.querySelector('#btnPlay').click(); await new Promise(r => setTimeout(r, 2500));
    const playing = !!cur.audio; if (typeof stopAll === 'function') stopAll();
    return { events: ev.length, velMin: Math.min(...v), velMax: Math.max(...v), bad: bad.length, playing };
  });
  /* 연습 보기·난이도·악기·조 옮김도 한 번씩 */
  out.misc = await page.evaluate(() => {
    const r = {};
    try { for (const lv of [1, 2, 3, 4, 5]) { setLevel(lv); gen(true); r['lv' + lv] = cur.solo.bars.length; } } catch (e) { r.levelErr = e.message; }
    try { shiftKey(1); r.key = cur.trUser; shiftKey(-1); } catch (e) { r.keyErr = e.message; }
    return r;
  });
  /* 휴대폰 너비 */
  const m = await mk({ width: 390, height: 844 });
  await m.goto(base + '/app/', { waitUntil: 'load' });
  await m.waitForFunction(() => typeof cur !== 'undefined' && cur.solo && document.querySelector('#paper svg'), null, { timeout: 20000 });
  await m.screenshot({ path: SHOT + '_mobile.png' });
  /* 홈페이지(데모 iframe) */
  const h = await mk({ width: 1280, height: 900 });
  await h.goto(base + '/', { waitUntil: 'load' });
  await h.waitForTimeout(2500);
  out.home = await h.evaluate(() => { const f = document.querySelector('#demoFrame'); try { return { iframe: !!f, demoSvg: f.contentDocument.querySelectorAll('#paper svg').length, embed: f.contentDocument.documentElement.classList.contains('embed') }; } catch (e) { return { iframe: !!f, err: e.message }; } });
  await h.screenshot({ path: SHOT + '_home.png' });
  await browser.close(); srv.close();
  console.log(JSON.stringify(out, null, 1));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '스크립트 오류 0');
  process.exitCode = errors.length ? 1 : 0;
})().catch(e => { console.error('TEST FAIL', e); process.exit(2); });
