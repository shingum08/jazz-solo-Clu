/* PWA 아이콘 PNG 만들기 — app/pwa/icon.svg → app/pwa/icons/*.png (Playwright 크로미움으로 렌더)
   node tools/make_icons.js   · 아이콘 SVG를 바꾸면 다시 돌리고 python3 tools/build.py */
const {chromium}=require('playwright'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'app/pwa/icons');
const svg=fs.readFileSync(path.join(root,'app/pwa/icon.svg'),'utf8');
(async()=>{
  fs.mkdirSync(dir,{recursive:true});
  const b=await chromium.launch();
  const jobs=[['icon-192.png',192,1],['icon-512.png',512,1],['apple-touch-icon.png',180,1],['icon-maskable-512.png',512,0.78]];
  for(const [name,px,scale] of jobs){
    const p=await b.newPage({viewport:{width:px,height:px}});
    const inner=Math.round(px*scale),off=Math.round((px-inner)/2);
    await p.setContent('<html><body style="margin:0;background:#10161f"><div style="position:absolute;left:'+off+'px;top:'+off+'px;width:'+inner+'px;height:'+inner+'px">'+svg.replace('<svg ','<svg width="'+inner+'" height="'+inner+'" ')+'</div></body></html>');
    await p.screenshot({path:path.join(dir,name)});await p.close();
  }
  await b.close();console.log('icons →',dir);
})();
