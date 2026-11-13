/* v0.48 어퍼 스트럭처·블루스 비중 회귀: node tools/test_ust_v048.js */
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const files=['engine/engine_core.js','engine/style_data.js','engine/licks.js',...fs.readdirSync(root+'/engine').filter(f=>/^songs_part\d+\.js$/.test(f)).sort().map(f=>'engine/'+f)];
const ctx={};vm.createContext(ctx);
vm.runInContext(files.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')+'\nthis.E={ustChoices,generateSolo,SONGDB,CHORD_TYPES,chordAtBeat};',ctx);
const E=ctx.E;
const PC=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'],nm=t=>E.ustChoices(t).map(c=>PC[c.r]+(c.minor?'m':''));
assert.ok(nm('7#11').includes('D'),'C7#11 위 D(9·#11·13): '+nm('7#11'));
assert.ok(nm('7#9').includes('Ab')&&nm('7#9').includes('Gb'),'C7alt 위 A♭·G♭: '+nm('7#9'));
assert.ok(nm('maj7').includes('G')&&!nm('maj7').includes('Dm'),'Cmaj7: G는 쓰고 11 든 Dm은 안 씀: '+nm('maj7'));
assert.ok(nm('m7').includes('Bb')&&nm('m7').includes('Dm'),'Cm7: B♭·Dm: '+nm('m7'));
assert.ok(!nm('7').some(x=>/^Db/.test(x)),'C7: ♭9 든 3화음 안 씀');
/* 생성: 어퍼 스트럭처 장치가 쓰이고, 그 음은 모두 코드 스케일 안 */
let used=0,bad=0;
for(const id of Object.keys(E.SONGDB).slice(0,120))for(let sd=1;sd<=3;sd++){
  const s=E.SONGDB[id],so=E.generateSolo(id,s.key,3,sd,'wind',{style:'all'});
  so.bars.forEach(b=>{if(!(b.tags||[]).some(x=>/어퍼 스트럭처 /.test(x)))return;used++;if((b.tags||[]).some(x=>/^스케일 색/.test(x)))return;   /* v0.64 스케일 색 마디는 코드 기본 스케일과 다르게 쓰는 게 의도 */
    b.notes.forEach((n,k)=>{if(n.midi===null)return;const nx=b.notes[k+1];if(nx&&nx.midi!==null&&Math.abs(nx.midi-n.midi)===1)return;   /* v0.64 반음으로 바로 풀리는 경과음은 장치 음이 아님(프레이즈가 길어져 같은 마디에 함께 들어옴) */const c=E.chordAtBeat(b.chords,n.t/6,so.bpb||4)||b.chords[0],T=E.CHORD_TYPES[c.type],r=((n.midi-c.root)%12+12)%12;if(!T.iv.includes(r)&&!T.scale.includes(r))bad++})});
}
assert.ok(used>20,'어퍼 스트럭처가 거의 안 쓰임: '+used);
assert.ok(bad<=used*0.15,'어퍼 스트럭처 마디의 스케일 밖 음이 많음: '+bad+'/'+used);
const o=E.generateSolo(Object.keys(E.SONGDB)[0],0,3,1,'wind',{style:'all',ust:false});
assert.ok(!o.bars.some(b=>(b.tags||[]).some(x=>/어퍼/.test(x))),'ust:false면 쓰지 않음');
console.log('v0.48 어퍼 스트럭처 검사 통과 (쓴 마디 '+used+', 스케일 밖 음 '+bad+')');
