/* 링크 미리보기 그림 만들기(v0.57) — 웹 빌드 앱의 엔진으로 Tea for Two(퍼블릭 도메인 · 코드 진행만) 솔로 앞 12마디를 그려
   app/landing/og.jpg(1200×630)로 저장. v0.56의 홈 예시 솔로(demo.json)는 v0.57부터 홈에서 앱을 직접 띄우는 데모로 바뀌어 없앰.
   엔진이 바뀌면: python3 tools/build.py --web → node tools/make_og.js → python3 tools/build.py --web
   · 솔로는 엔진 산출물 — 원곡 멜로디·녹음 전사 없음 */
const {chromium}=require('playwright'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const SONG='pd-tea-for-two',BPM=120,STAFF_W=720,STAFF_N=440,OG_BARS=12;
const PICKS=[[2,22002]];   /* [난이도, 시드] — 앱 데모(EMB_DEMOS) 2번과 같은 설정 */
(async()=>{
  const b=await chromium.launch(),p=await b.newPage({viewport:{width:900,height:900}});
  const app=[path.join(root,'dist','web','app','index.html'),path.join(root,'dist','web','index.html')].find(f=>fs.existsSync(f)&&/generateSolo/.test(fs.readFileSync(f,'utf8')));
  if(!app)throw new Error('먼저 python3 tools/build.py --web');
  await p.route(/^https?:/,r=>r.abort());await p.goto('file://'+app);await p.waitForFunction(()=>typeof generateSolo==='function'&&window.ABCJS);
  /* 넓은 화면: 한 줄 4마디(3줄) · 좁은 화면: 한 줄 3마디(4줄) — 홈페이지가 화면 너비에 맞춰 골라 보여 준다 */
  const out=await p.evaluate(([SONG,BPM,OG_BARS,LAYOUTS,PICKS])=>{
    const draw=(abc,w,d)=>{
      const box=document.createElement('div');document.body.appendChild(box);
      ABCJS.renderAbc(box,abc,{staffwidth:w,paddingtop:4,paddingbottom:4,paddingleft:2,paddingright:2,responsive:'resize'});
      const svg=box.querySelector('svg');svg.removeAttribute('style');svg.setAttribute('role','img');svg.setAttribute('aria-label','난이도 '+d+' 예시 솔로 악보 — Tea for Two');
      svg.querySelectorAll('title,style').forEach(t=>t.remove());svg.querySelectorAll('[class]').forEach(e=>e.removeAttribute('class'));
      const s=svg.outerHTML.replace(/ style=""/g,'').replace(/-?\d+\.\d{2,}/g,m=>String(Math.round(+m*10)/10));box.remove();return s};
    return PICKS.map(([d,sd])=>{
      const so=generateSolo(SONG,SONGDB[SONG].key,d,sd,'wind',{style:'all',topic:'auto',bpm:BPM});
      const lines=toAbc(so,BPM,0).split('\n'),headr=lines.filter(l=>/^[A-Z]:/.test(l)&&!/^[TQ]:/.test(l));
      const bars=lines.filter(l=>!/^[A-Z]:/.test(l)).join(' ').split('|').map(x=>x.trim()).filter(Boolean);
      if(bars.length<OG_BARS||bars.some(x=>x.startsWith(']')))throw new Error('마디 수가 이상함: '+bars.length);bars.length=OG_BARS;
      const lay=([per,w])=>{const rows=[];for(let i=0;i<bars.length;i+=per)rows.push(bars.slice(i,i+per).join(' | ')+' |');return draw(headr.concat(rows).join('\n'),w,d)};
      return {diff:d,seed:sd,svg:lay(LAYOUTS[0]),svgN:lay(LAYOUTS[1])};
    });
  },[SONG,BPM,OG_BARS,[[4,STAFF_W],[3,STAFF_N]],PICKS]);
  /* 링크 미리보기 그림(og.png, 1200×630) — 심볼 + 이름 + 첫 예시 악보 */
  const mark=fs.readFileSync(path.join(root,'app','brand','mark.svg'),'utf8').replace(/<!--[\s\S]*?-->/g,'');
  const og=await b.newPage({viewport:{width:1200,height:630}});
  await og.setContent(`<html><body style="margin:0;width:1200px;height:630px;overflow:hidden;background:#10161f;font-family:'Noto Serif CJK KR',serif;color:#f6f2e8">
    <div style="position:absolute;inset:0;background:radial-gradient(55% 70% at 78% 40%,rgba(209,165,69,.16),transparent 70%)"></div>
    <div style="position:absolute;left:72px;top:96px;width:470px">
      <div style="display:flex;align-items:center;gap:16px;font-size:44px;font-weight:700;letter-spacing:-.01em">${mark.replace('<svg ','<svg style="height:68px;width:auto" ')}EzImprovJazz</div>
      <div style="margin-top:56px;font-size:40px;line-height:1.35;font-weight:700">코드 진행만 고르세요.<br>솔로는 매번<br>새로 써 드려요.</div>
      <div style="margin-top:28px;font-size:22px;color:#97a3b3;font-family:'Noto Sans CJK KR',sans-serif">재즈 즉흥연주 연습용 솔로 악보 생성기</div>
    </div>
    <div style="position:absolute;left:600px;top:70px;width:680px;background:#f3eee2;color:#1b2230;border-radius:8px;padding:24px 26px;box-shadow:0 30px 60px -20px rgba(0,0,0,.7)">${out[0].svg}</div>
  </body></html>`);
  await og.screenshot({path:path.join(root,'app','landing','og.jpg'),type:'jpeg',quality:86});
  await b.close();console.log('og →',path.join(root,'app','landing','og.jpg'));
})();
