/* v0.62 Harmony V2 단위 시험 — Ⅱ-Ⅴ-Ⅰ · 마이너 Ⅱ-Ⅴ-ⅰ · 트라이톤 대리와 반음 경과 사슬 구분 · 백도어 · 기만 종지 ·
   같은 코드 반복(한 구간 · 길이) · 첫/마지막 코드 경계(한 바퀴 이음 켬/끔) · 기존 분석과 같은 수의 구간
   사용: node tools/test_harmony_v2.js */
'use strict';
const assert=require('assert');const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const ctx={};vm.createContext(ctx);
vm.runInContext(['engine/engine_core.js','engine/harmony_v2.js',...fs.readdirSync(path.join(root,'engine')).filter(f=>/^songs_part\d+\.js$/.test(f)).sort().map(f=>'engine/'+f)].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')+'\nthis.E={analyzeHarmony,analyzeHarmonyV2,parseCh};',ctx);
const E=ctx.E;
/* "Dm7 G7|Cmaj7" → 마디 배열 */
const prog=s=>s.split('|').map(b=>b.trim().split(/\s+/).map(E.parseCh));
const run=(s,key,o)=>{const segs=E.analyzeHarmony(prog(s),key,4);return {segs,v2:E.analyzeHarmonyV2(segs,key,o)}};
let n=0;const ok=(c,m)=>{assert.ok(c,m);n++};
/* 1. Ⅱ-Ⅴ-Ⅰ (C) */
{const {v2}=run('Dm7|G7|Cmaj7|Cmaj7',0);
 ok(v2.length===3,'같은 코드 이어짐은 한 구간: '+v2.length);
 ok(v2[0].fn==='predominant'&&v2[1].fn==='dominant'&&v2[2].fn==='tonic','기능 '+v2.map(x=>x.fn));
 ok(v2[1].res==='authentic'&&v2[1].conf>=0.8,'G7 정격 해결 '+v2[1].res);
 ok(v2.every(x=>x.key.pc===0&&x.key.mode==='major'),'조 C 장조');
 ok(v2[2].dur===48,'Cmaj7 두 마디 = 48틱: '+v2[2].dur);
 /* Dm7(F·C) → G7(B·F): C→B 반음 아래, F→F 그대로 */
 const g=v2[0].gt;ok(g.some(x=>x.from===0&&x.to===11&&x.step===-1)&&g.some(x=>x.from===5&&x.to===5&&x.step===0),'가이드톤 잇기 '+JSON.stringify(g));}
/* 2. 마이너 Ⅱ-Ⅴ-ⅰ (C 단조) */
{const {v2}=run('Dm7b5|G7b9|Cm6|Cm6',0,{minor:true});
 ok(v2[0].fn==='predominant'&&v2[1].fn==='dominant'&&v2[2].fn==='tonic','마이너 기능 '+v2.map(x=>x.fn));
 ok(v2[1].res==='authentic'&&v2[0].key.mode==='minor','마이너 해결·조 '+v2[1].res+' '+v2[0].key.mode);}
/* 3. 트라이톤 대리 */
{const {v2}=run('Dm7|Db7|Cmaj7|Cmaj7',0);ok(v2[1].res==='tritone'&&v2[1].fn==='dominant','D♭7 → C = 트라이톤 대리 '+v2[1].res);}
/* 4. 반음씩 내려가는 도미넌트 사슬 — 트라이톤 대리로 단정하지 않는다 */
{const {v2}=run('E7|Eb7|D7|Db7|Cmaj7|Cmaj7',0,{wrap:false});
 ok(v2[0].res==='chromatic'&&v2[1].res==='chromatic'&&v2[0].conf<=0.5,'반음 사슬은 chromatic·낮은 확신 '+v2.slice(0,3).map(x=>x.res+x.conf));
 ok(v2[3].res==='tritone','마지막 D♭7 → C는 트라이톤 대리 '+v2[3].res);}
/* 5. 백도어 · 기만 종지 */
{const {v2}=run('Fm7|Bb7|Cmaj7|Cmaj7',0);ok(v2[1].res==='backdoor','B♭7 → C = 백도어 '+v2[1].res);}
{const {v2}=run('Dm7|G7|Am7|Am7',0,{wrap:false});ok(v2[1].res==='deceptive','G7 → Am = 기만 '+v2[1].res);}
/* 6. 경계: 마지막 G7 → (한 바퀴) 첫 Cmaj7 */
{const a=run('Cmaj7|Am7|Dm7|G7',0),b=run('Cmaj7|Am7|Dm7|G7',0,{wrap:false});
 ok(a.v2[3].res==='authentic','한 바퀴 이음: 끝 G7 → 첫 C '+a.v2[3].res);ok(b.v2[3].res==='none'&&b.v2[3].gt.length===0,'이음 끔: 끝 G7은 해결 없음 '+b.v2[3].res);}
/* 7. 기존 분석과 구간 수·순서 같음, 확신 0~1 */
{const {segs,v2}=run('Cmaj7 A7|Dm7 G7|Em7 A7|Dm7 G7|Cmaj7',0);ok(segs.length===v2.length&&v2.every((x,i)=>x.t0===segs[i].t0&&x.conf>=0&&x.conf<=1),'구간 일치·확신 범위');}
console.log('v0.62 Harmony V2 단위 시험 통과 ('+n+'항목)');
