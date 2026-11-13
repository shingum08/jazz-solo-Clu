/* v0.46 헤드 연주 회귀: node tools/test_head_v046.js
   헤드 음 → 마디(8분 격자·셋잇단·마디 넘는 붙임줄) · 솔로에 끼우기(음역 밖일 때만 옥타브 이동) · 빈 마디는 생성 그대로 */
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const files=['engine/engine_core.js','engine/style_data.js','engine/licks.js','engine/headabc.js','engine/locks.js',
  ...fs.readdirSync(root+'/engine').filter(f=>/^songs_part\d+\.js$/.test(f)).sort().map(f=>'engine/'+f)];
const ctx={};vm.createContext(ctx);
vm.runInContext(files.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')+'\nthis.E={headLockBars,spliceHeadBars,generateSolo,toAbc,SONGDB,parseHeadAbc};',ctx);
const E=ctx.E,J=x=>JSON.stringify(x);
/* 1마디: 점4분(9)+8분(3)+셋잇단 셋(2·2·2)+4분(6) · 2마디 비움 · 3마디 끝 2분음이 4마디로 넘어감 · 16분 어긋남(1.5틱)은 8분 격자로 */
const notes=[{t:0,d:9,midi:67},{t:9,d:3,midi:65},{t:12,d:2,midi:64},{t:14,d:2,midi:62},{t:16,d:2,midi:60},{t:18,d:6,midi:62},
  {t:48+12.5,d:4.5,midi:70},{t:48+18,d:12,midi:72},{t:72+6,d:6,midi:74}];
const L=E.headLockBars(notes,4,4);
assert.strictEqual(J(Object.keys(L)),J(['0','2','3']),'빈 마디(2마디)는 빠짐: '+Object.keys(L));
Object.values(L).forEach((b,i)=>assert.strictEqual(b.reduce((a,n)=>a+n.d,0),24,'마디 합 24'));
assert.strictEqual(J(L[0].map(n=>[n.t,n.d,n.midi,!!n.trip])),J([[0,9,67,false],[9,3,65,false],[12,2,64,true],[14,2,62,true],[16,2,60,true],[18,6,62,false]]),'1마디: '+J(L[0]));
assert.ok(L[2][L[2].length-1].tie&&L[2][L[2].length-1].midi===72,'3마디 끝 음은 붙임줄로 4마디에: '+J(L[2]));
assert.strictEqual(L[3][0].midi,72,'4마디 첫 칸 = 이어진 음');
assert.ok(L[2].every(n=>n.t%3===0),'16분 어긋남은 8분 격자로');
/* 솔로에 끼우기: 헤드 마디는 그대로(음역 안이면 옥타브 그대로), 나머지는 생성 */
const id='blues12',s=E.SONGDB[id];
const so=E.generateSolo(id,s.key,2,7,'wind',{style:'all'});const before=J(so.bars[1].notes);
E.spliceHeadBars(so,L,[59,82]);
assert.strictEqual(J(so.bars[0].notes.map(n=>n.midi)),J(L[0].map(n=>n.midi)),'음역 안이면 옥타브 그대로');
assert.ok(so.bars[0].head&&!so.bars[1].head&&so.head,'헤드 표시');
/* v0.62 다음 마디가 헤드면 마지막 음의 붙임줄(다음 마디로 이어짐)은 끊는 게 맞다 — 그 하나만 빼고 같아야 */
const noTieEnd=x=>{const a=JSON.parse(x);if(so.bars[2]&&so.bars[2].head&&a.length)delete a[a.length-1].tie;return J(a)};
assert.strictEqual(noTieEnd(J(so.bars[1].notes)),noTieEnd(before),'빈 마디는 생성 그대로');
const lowL=E.headLockBars(notes.map(n=>Object.assign({},n,{midi:n.midi-24})),4,4),so2=E.generateSolo(id,s.key,2,7,'wind',{style:'all'});
E.spliceHeadBars(so2,lowL,[59,82]);assert.strictEqual(so2.bars[0].notes[0].midi,67,'음역 밖이면 옥타브 이동');
so.bars.forEach((b,i)=>assert.strictEqual(b.notes.reduce((a,n)=>a+n.d,0),24,'끼운 뒤 마디 '+i));
const abc=E.toAbc(so,120,0,0);assert.ok(/\(3/.test(abc),'셋잇단 표기');
console.log('v0.46 헤드 연주 검사 통과');
