/* v0.61 iReal 박자 읽기 — 12/8·9/8은 겹박자 큰 박으로, 2/4·7/8·5/8은 분명한 안내로 막는다(예전엔 12/8을 막고 9/8·7/8·5/8을 잘못 읽음)
   사용: node tools/test_meter_v061.js */
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const ctx={TextDecoder,TextEncoder};vm.createContext(ctx);
vm.runInContext(['engine/engine_core.js','engine/importers.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')+'\nthis.E={irealToSongs,irealUnscramble};',ctx);
const E=ctx.E;
const one=T=>{const raw='{*A'+T+'C-7 F7 |Bb^7 |Eb^7 |Ah7 D7b9 Z';const url='irealb://'+encodeURIComponent('Meter '+T+'=Me==Medium Swing=C==1r34LbKcu7'+E.irealUnscramble(raw)+'=Medium Swing=0=1===List');return E.irealToSongs('<a href="'+url+'">x</a>')[0]};
const want={T44:4,T34:3,T54:5,T22:4,T12:4,T68:3,T98:3};
for(const T in want){const r=one(T);assert.ok(!r.error,T+' 오류: '+r.error);assert.strictEqual(r.song.m,want[T],T+' → '+r.song.m+'박')}
for(const T of ['T24','T78','T58']){const r=one(T);assert.ok(r.error&&/못 읽어요/.test(r.error),T+'는 막혀야 함: '+JSON.stringify(r.error||r.song.m))}
console.log('v0.61 박자 읽기 검사 통과 (읽음 '+Object.keys(want).join('·')+' / 막음 T24·T78·T58)');
