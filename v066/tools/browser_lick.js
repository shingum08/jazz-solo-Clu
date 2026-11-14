'use strict';
/* 설정 화면의 「릭 빈도」가 실제로 먹는지: 끔 → 0개, 적게 ≤ 보통 ≤ 많이. 사용: node tools/browser_lick.js <배포 폴더> [스크린샷] */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const ROOT = path.resolve(process.argv[2] || 'dist'), SHOT = process.argv[3];
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
(async () => {
  await new Promise(res => srv.listen(0, '127.0.0.1', res));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await page.goto(`http://127.0.0.1:${srv.address().port}/app/`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof cur !== 'undefined' && cur.solo && document.querySelector('#paper svg'), null, { timeout: 20000 });
  const out = await page.evaluate(() => {
    const sel = document.querySelector('#lickAmt'); if (!sel) return { missing: true };
    const songs = [...document.querySelector('#songSel').options].map(o => o.value).filter(v => SONGDB[v]), res = {};
    for (const amt of ['0', '0.5', '1', '1.7']) {
      let n = 0, bars = 0;
      for (const id of songs) { const s = document.querySelector('#songSel'); s.value = id; s.onchange(); document.querySelector('#chorusSel').value = '4';
        for (const seed of [11, 4242, 777]) { cur.seed = seed; sel.value = amt; sel.dispatchEvent(new Event('change'));
          cur.soloBases.forEach(so => so.bars.forEach(b => { bars++; n += (b.tags || []).filter(t => /^릭: /.test(t)).length; })); } }
      res[amt] = (32 * n / bars).toFixed(2);
    }
    return { level: cur.selLv, perBars32: res, visible: sel.offsetParent !== null };
  });
  if (SHOT && !out.missing) { try { out.why = await page.evaluate(() => { openSet(); document.querySelector('#advPanel').open = true; let e = document.querySelector('#lickAmt'); const r = []; while (e && e !== document.body) { const cs = getComputedStyle(e); if (cs.display === 'none' || e.hidden) r.push((e.id || e.className || e.tagName) + ':' + cs.display); e = e.parentElement; } return r.join(' < '); }); const box = page.locator('#lickAmt').locator('xpath=ancestor::div[contains(@class,"quotebox")]'); await box.scrollIntoViewIfNeeded({ timeout: 3000 }); await box.screenshot({ path: SHOT, timeout: 5000 }); out.shot = SHOT; } catch (e) { out.shot = '찍지 못함: ' + e.message.split('\n')[0]; } }
  console.log(JSON.stringify(out), '오류', errors.length, errors.slice(0, 2).join(' | '));
  await browser.close(); srv.close();
})();
