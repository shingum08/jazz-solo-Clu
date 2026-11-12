/* v0.49 코드 릭(해결 없음 · 사용자 제공 릭 아이디어) 회귀: node tools/test_lick_v049.js */
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const files=['engine/engine_core.js','engine/style_data.js','engine/licks.js',...fs.readdirSync(root+'/engine').filter(f=>/^songs_part\d+\.js$/.test(f)).sort().map(f=>'engine/'+f)];
const ctx={};vm.createContext(ctx);
vm.runInContext(files.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')+'\nthis.E={generateSolo,SONGDB,CURATED_LICKS};',ctx);
const E=ctx.E;
/* 사전 형식: 코드 릭은 to·tr·t 모두 null, 마디 합 24틱 */
const CH=E.CURATED_LICKS.filter(L=>L.to===null);
assert.strictEqual(CH.length,4,'코드 릭 4종');
CH.forEach(L=>{assert.ok(L.tr===null&&L.t===null,L.id);const e=L.n[L.n.length-1];assert.strictEqual(e[0]+e[1],24,L.id+' 마디 24틱')});
/* 생성: 코드 릭이 쓰이고(난이도 2·3), 해결 릭도 계속 쓰인다. 같은 시드 → 같은 결과 */
const names=new Set(CH.map(L=>'릭: '+L.name)),res=new Set(E.CURATED_LICKS.filter(L=>L.to).map(L=>'릭: '+L.name));
let ch=0,rs=0;const ids=Object.keys(E.SONGDB).slice(0,150);
for(const id of ids)for(const d of [2,3])for(let sd=1;sd<=3;sd++){
  const s=E.SONGDB[id],so=E.generateSolo(id,s.key,d,sd,'wind',{style:'all'});
  so.bars.forEach(b=>(b.tags||[]).forEach(x=>{if(names.has(x))ch++;if(res.has(x))rs++}));
}
assert.ok(ch>20,'코드 릭이 거의 안 쓰임: '+ch);
assert.ok(rs>20,'해결 릭이 줄어듦: '+rs);
const a=JSON.stringify(E.generateSolo(ids[0],0,3,7,'wind',{style:'all'}).bars),b=JSON.stringify(E.generateSolo(ids[0],0,3,7,'wind',{style:'all'}).bars);
assert.strictEqual(a,b,'시드 재현');
const off=E.generateSolo(ids[0],0,3,7,'wind',{style:'all',useLicks:false});
assert.ok(!off.bars.some(b=>(b.tags||[]).some(x=>names.has(x))),'useLicks:false면 쓰지 않음');
console.log('v0.49 코드 릭 검사 통과 (코드 릭 '+ch+'마디 · 해결 릭 '+rs+'마디 / 솔로 '+ids.length*6+'개)');
