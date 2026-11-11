/* v0.42 곡 불러오기 회귀: node tools/test_import_v042.js
   직접 만든 작은 MusicXML(반복·엔딩·이조·텐션·못갖춘마디)과 iReal 링크를 읽어 앱 곡으로 바꾸고, 그 곡으로 솔로를 만든다. */
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const files=['engine/engine_core.js','engine/style_data.js','engine/licks.js','engine/headabc.js','engine/importers.js',
  ...fs.readdirSync(root+'/engine').filter(f=>/^songs_part\d+\.js$/.test(f)).sort().map(f=>'engine/'+f)];
const ctx={TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream};vm.createContext(ctx);
vm.runInContext(files.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')+
  '\nthis.E={xmlParse,musicXmlToSong,irealToSongs,irealUnscramble,notesToAbc,mxlToXml,parseHeadAbc,headFragments,generateSolo,SONGDB,parseCh};',ctx);
const E=ctx.E;
/* ── MusicXML: Bb 악기(이조 +(-2)) · 픽업 · 반복 + 1·2번 엔딩 · 7(b9) · m7(b5) · 6/8 아님 ── */
const H=(st,al,kind,deg)=>`<harmony><root><root-step>${st}</root-step>${al?'<root-alter>'+al+'</root-alter>':''}</root><kind>${kind}</kind>${deg||''}</harmony>`;
const N=(st,oct,dur,al)=>`<note><pitch><step>${st}</step>${al?'<alter>'+al+'</alter>':''}<octave>${oct}</octave></pitch><duration>${dur}</duration><voice>1</voice></note>`;
const R=dur=>`<note><rest/><duration>${dur}</duration><voice>1</voice></note>`;
const xml=`<?xml version="1.0"?><!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "x.dtd">
<score-partwise version="3.1"><work><work-title>Test &amp; Tune</work-title></work><part-list><score-part id="P1"><part-name>Tenor</part-name></score-part></part-list>
<part id="P1">
<measure number="0" implicit="yes"><attributes><divisions>2</divisions><key><fifths>2</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><transpose><chromatic>-2</chromatic></transpose></attributes>${N('E',5,2)}</measure>
<measure number="1"><barline location="left"><repeat direction="forward"/></barline>${H('E','','minor-seventh')}${N('F',5,4,1)}${H('A','','dominant','<degree><degree-value>9</degree-value><degree-alter>-1</degree-alter><degree-type>add</degree-type></degree>')}${N('E',5,4)}</measure>
<measure number="2">${H('D','','major-seventh')}${N('D',5,8)}</measure>
<measure number="3"><barline location="left"><ending number="1" type="start"/></barline>${H('F','1','minor-seventh','<degree><degree-value>5</degree-value><degree-alter>-1</degree-alter><degree-type>alter</degree-type></degree>')}${N('A',4,2)}${R(6)}<barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline></measure>
<measure number="4"><barline location="left"><ending number="2" type="start"/></barline>${H('D','','major')}${N('D',5,8)}<barline location="right"><ending number="2" type="discontinue"/></barline></measure>
</part></score-partwise>`;
const r=E.musicXmlToSong(xml,'x.musicxml');
assert.strictEqual(r.song.n,'Test & Tune');
/* Bb 악기 기보(+2 위로 적힘) → 실음은 -2: Em7→Dm7, A7b9→G7b9, Dmaj7→Cmaj7, F#m7b5→Em7b5, D→C6. 펼친 순서: 1 2 3 | 1 2 4 */
assert.strictEqual(r.song.ch,'Dm7 G7b9|Cmaj7|Em7b5|Dm7 G7b9|Cmaj7|C6','코드: '+r.song.ch);
assert.strictEqual(r.song.k,0,'조: D(♯2) - 2 = C');
assert.ok(r.warn.some(w=>/픽업/.test(w))&&r.warn.some(w=>/펼쳐/.test(w)),'경고: '+r.warn);
assert.strictEqual(r.head.notes[0].midi,76,'멜로디: 기보 F#5(78) - 2 = 실음 E5(76) → '+r.head.notes[0].midi);
const abc=E.notesToAbc(r.head.notes,4),back=E.parseHeadAbc(abc);
assert.deepStrictEqual(back.notes.map(n=>[n.t,n.d,n.midi]),r.head.notes.map(n=>[n.t,n.d,n.midi]),'ABC 왕복');
/* ── iReal: 반복 + N1/N2 + x(한 마디 반복) + 품질 표기 ── */
const raw='{*AT44C-7 F7 |Bb^7 |Eb^7 |Ah7 D7b9 |N1G-6 |G-6 }|N2G-6 |G-6 Z[*BAh7 |D7alt |G-7 |G-7 |Kcl|C7sus C7 |F^7 |sEb^7 D7 Z';
const url='irealb://'+encodeURIComponent('Test Tune=Me==Bossa Nova=G-==1r34LbKcu7'+E.irealUnscramble(raw)+'=Bossa Nova=0=1===List');
const ir=E.irealToSongs('<a href="'+url+'">x</a>');
assert.strictEqual(ir.length,1);
assert.strictEqual(ir[0].song.ch,'Cm7 F7|Bbmaj7|Ebmaj7|Am7b5 D7b9|Gm6|Gm6|Cm7 F7|Bbmaj7|Ebmaj7|Am7b5 D7b9|Gm6|Gm6|Am7b5|D7#9|Gm7|Gm7|Gm7|C7sus4 C7|Fmaj7|Ebmaj7 D7','iReal: '+ir[0].song.ch);
assert.strictEqual(ir[0].song.c,'라틴');assert.strictEqual(ir[0].song.k,7);
/* ── 불러온 곡으로 솔로 생성(마디 길이·음역) ── */
let n=0;
for(const [i,s] of [r.song,ir[0].song].entries()){
  const id='u_t'+i;E.SONGDB[id]={name:s.n,c:s.c,key:s.k,bpm:s.bpm,bpb:s.m,form:{phrase:s.f[1],sections:s.f[0]},bars:s.ch.split('|').map(b=>b.trim().split(/\s+/).map(E.parseCh)),mine:true};
  for(const diff of [1,2,3])for(const inst of ['wind','brass','free'])for(let sd=1;sd<=3;sd++){
    const so=E.generateSolo(id,s.k,diff,sd*31+diff,inst,{style:'all'});n++;
    so.bars.forEach((b,bi)=>{const sum=b.notes.reduce((a,x)=>a+x.d,0);assert.strictEqual(sum,(s.m||4)*6,id+' 마디 '+bi+' 합 '+sum)});
  }
}
/* ── .mxl(압축) — 압축을 만들어 다시 푼다 ── */
(async()=>{
  const enc=new TextEncoder(),data=enc.encode(xml);
  const comp=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const name=enc.encode('score.xml'),u=[],push=(...a)=>a.forEach(x=>u.push(x));
  const le16=v=>[v&255,v>>8&255],le32=v=>[v&255,v>>8&255,v>>16&255,v>>>24&255];
  const local=[...le32(0x04034b50),...le16(20),...le16(0),...le16(8),...le16(0),...le16(0),...le32(0),...le32(comp.length),...le32(data.length),...le16(name.length),...le16(0),...name,...comp];
  const cd=[...le32(0x02014b50),...le16(20),...le16(20),...le16(0),...le16(8),...le16(0),...le16(0),...le32(0),...le32(comp.length),...le32(data.length),...le16(name.length),...le16(0),...le16(0),...le16(0),...le16(0),...le32(0),...le32(0),...name];
  const eocd=[...le32(0x06054b50),...le16(0),...le16(0),...le16(1),...le16(1),...le32(cd.length),...le32(local.length),...le16(0)];
  push(...local,...cd,...eocd);
  const back2=await E.mxlToXml(new Uint8Array(u).buffer);
  assert.strictEqual(E.musicXmlToSong(back2,'x.mxl').song.ch,r.song.ch,'mxl 왕복');
  console.log(JSON.stringify({musicxml:r.song.ch,ireal:ir[0].song.ch.split('|').length+'마디',solos:n}));
  console.log('v0.42 불러오기 검사 통과');
})().catch(e=>{console.error(e);process.exit(1)});
