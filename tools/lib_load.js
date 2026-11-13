/* 엔진 로더 — 엔진·곡 DB를 한 번에 올려 테스트/평가 도구가 공유한다 */
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
function loadEngine(coreFile){
  const files=[coreFile||'engine/engine_core.js','engine/style_data.js','engine/licks.js','engine/headabc.js','engine/drill.js','engine/locks.js','engine/song_status.js','engine/importers.js','engine/harmony_v2.js',
    ...fs.readdirSync(root+'/engine').filter(f=>/^songs_part\d+\.js$/.test(f)).sort().map(f=>'engine/'+f)]
    .filter(f=>fs.existsSync(path.join(root,f)));
  const code=files.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')
    +'\nthis.E={RAW_SONGS,generateSolo,SONGDB,STYLE_DATA,barChords,analyzeHarmony,classifySong,LEVELS'+(files.includes('engine/harmony_v2.js')?',analyzeHarmonyV2,hv2LegacyCat':'')+
    (files.includes('engine/headabc.js')?',parseHeadAbc,headFragments':'')+(files.includes('engine/drill.js')?',generateDrill,toAbc,CHORD_TYPES,TYPE_CLS,transposeSolo':'')+(files.includes('engine/locks.js')?',spliceLockedBars,lockSeamCost':'')+(files.includes('engine/song_status.js')?',SONG_STATUS':'')+'};';
  const ctx={};vm.createContext(ctx);vm.runInContext(code,ctx);return ctx.E;
}
module.exports={loadEngine,root};
