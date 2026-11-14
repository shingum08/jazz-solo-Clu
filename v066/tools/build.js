'use strict';
/* 빌드: 원본 v0.65 app/index.html의 세 스크립트 블록(재생·엔진·UI)을 work/의 수정본으로 갈아 끼우고 버전 문자열을 올린다.
   사용: node tools/build.js <새 버전>   → dist/ 에 배포 폴더 생성 */
const fs = require('fs'), path = require('path');
const VER = process.argv[2] || '0.66.0', OLD = '0.65.0';
const ROOT = path.resolve(__dirname, '..'), SRC = path.join(ROOT, 'src_v065'), OUT = path.join(ROOT, 'dist');
const lines = fs.readFileSync(path.join(SRC, 'app/index.html'), 'utf8').split('\n');
const blocks = [ /* [첫 줄(1부터), 마지막 줄, 파일] — 뒤에서부터 갈아 끼운다 */
  [4305, 5768, 'work/ui.js'], [1467, 4301, 'work/engine.js'], [18, 609, 'work/audio.js']];
const chk = (n, s) => { if (lines[n - 1].trim() !== s) throw new Error(`줄 ${n} 예상과 다름: ${lines[n - 1].slice(0, 60)}`); };
chk(17, '<script>'); chk(610, '</script>'); chk(1466, '<script id="engine">'); chk(4302, '</script>'); chk(4304, '<script>'); chk(5769, '</script>');
for (const [a, b, f] of blocks) {
  let body = fs.readFileSync(path.join(ROOT, f), 'utf8'); if (body.endsWith('\n')) body = body.slice(0, -1);
  if (/<\/script/i.test(body)) throw new Error(f + ' 안에 </script 문자열이 있음');
  lines.splice(a - 1, b - a + 1, ...body.split('\n'));
}
let html = lines.join('\n');
const rep = (from, to, count) => { const n = html.split(from).length - 1; if (n !== count) throw new Error(`"${from}" ${n}회(예상 ${count})`); html = html.split(from).join(to); };
rep(`<title>EzImprovJazz v${OLD} `, `<title>EzImprovJazz v${VER} `, 1);
rep(`베타 v${OLD}<`, `베타 v${VER}<`, 1);
/* v0.66 설정 화면: 「선율 다듬기」 스위치(모티프 발전 상자 바로 위) */
rep(`    <div class="quotebox">\n      <div class="qhead"><label><input type="checkbox" id="motifOn" checked>`,
  `    <div class="quotebox">\n      <div class="qhead"><label><input type="checkbox" id="naturalOn" checked> 선율 다듬기(v0.66 · 기본 켬) — 코러스 이음매 · 두 음 왕복 줄이기 · 셋잇단 모양 · 해결 착지 · 2·4박 텐션(단계 4·5) · 악센트</label><span class="advnote">끄면 같은 시드로 v0.65 방식의 솔로와 악센트가 나옵니다. 「새 솔로」를 누르지 말고 이 스위치만 켰다 껐다 하면서 같은 곡·같은 자리를 번갈아 들어 비교해 보세요.</span></div>\n      <div class="qrow"><div class="qcol"><label class="qlab" for="lickAmt">릭 빈도 — 릭 사전의 한 마디 릭(비밥 스케일 · 7→3 해결 · 3→♭9 아르페지오 등)이 나오는 정도. 단계 3 이상에서만 쓰입니다.</label><select id="lickAmt" class="advsel" style="max-width:240px"><option value="0">끔</option><option value="0.5">적게</option><option value="1" selected>보통</option><option value="1.7">많이</option></select></div></div>\n    </div>\n    <div class="quotebox">\n      <div class="qhead"><label><input type="checkbox" id="motifOn" checked>`, 1);
fs.rmSync(OUT, { recursive: true, force: true });
const copy = (rel) => { const s = path.join(SRC, rel), d = path.join(OUT, rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); };
['_headers', 'favicon.svg', 'index.html', 'og.jpg', 'robots.txt', 'icons/icon-192.png', 'icons/apple-touch-icon.png'].forEach(copy);
fs.mkdirSync(path.join(OUT, 'app'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'app/index.html'), html);
console.log('built', VER, '→', OUT, (html.length / 1024).toFixed(0) + 'KB');
