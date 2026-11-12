/* v0.44 곡 불러오기 보강 회귀: node tools/test_import_v044.js
   직접 만든 작은 악보로 D.S.·D.C.·코다·Fine 펼치기, 여러 코러스 연주 악보 줄이기, 코드 없는 인트로 빼기,
   화음 맨 위 음 = 멜로디, 이조 정보 없는 이조 악기, 장·단조 짐작, 형식(AABA·AAB) 추정, iReal 세뇨·코다를 확인한다.
   (실제 녹음 전사 악보는 저장소에 넣지 않는다 — 법적 선) */
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const files=['engine/engine_core.js','engine/style_data.js','engine/licks.js','engine/headabc.js','engine/importers.js',
  ...fs.readdirSync(root+'/engine').filter(f=>/^songs_part\d+\.js$/.test(f)).sort().map(f=>'engine/'+f)];
const ctx={TextDecoder,TextEncoder,Blob,Response,DecompressionStream,CompressionStream};vm.createContext(ctx);
vm.runInContext(files.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')+
  '\nthis.E={musicXmlToSong,irealToSongs,irealUnscramble,generateSolo,SONGDB,parseCh,detectForm,findChoruses};',ctx);
const E=ctx.E;
const eqJ=(a,b,msg)=>assert.strictEqual(JSON.stringify(a),JSON.stringify(b),msg);   /* vm 안 배열은 프로토타입이 달라 JSON으로 비교 */

/* ── 악보 만들기 도우미 ── */
const STEP={C:['C',0],Db:['D',-1],D:['D',0],Eb:['E',-1],E:['E',0],F:['F',0],Gb:['G',-1],G:['G',0],Ab:['A',-1],A:['A',0],Bb:['B',-1],B:['B',0]};
const KIND={'':'major',maj7:'major-seventh',m7:'minor-seventh',m6:'minor-sixth','7':'dominant',m7b5:'half-diminished','6':'major-sixth'};
const H=ch=>{const m=ch.match(/^([A-G]b?)(.*)$/),[st,al]=STEP[m[1]];return `<harmony><root><root-step>${st}</root-step>${al?'<root-alter>'+al+'</root-alter>':''}</root><kind>${KIND[m[2]]}</kind></harmony>`};
const N=(midi,dur,chord)=>{const PC=['C','C','D','D','E','F','F','G','G','A','A','B'],AL=[0,1,0,1,0,0,1,0,1,0,1,0];const pc=midi%12;
  return `<note>${chord?'<chord/>':''}<pitch><step>${PC[pc]}</step>${AL[pc]?'<alter>1</alter>':''}<octave>${Math.floor(midi/12)-1}</octave></pitch><duration>${dur}</duration><voice>1</voice></note>`};
const R=dur=>`<note><rest/><duration>${dur}</duration><voice>1</voice></note>`;
const W=txt=>`<direction placement="above"><direction-type><words>${txt}</words></direction-type></direction>`;
const SEG='<direction placement="above"><direction-type><segno/></direction-type></direction>';
const CODA='<direction placement="above"><direction-type><coda/></direction-type></direction>';
const ATTR=(fifths,mode)=>`<attributes><divisions>1</divisions><key><fifths>${fifths}</fifths>${mode?'<mode>'+mode+'</mode>':''}</key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>`;
const score=(measures,{name='Lead',title='T',fifths=0,mode=''}={})=>`<?xml version="1.0"?><score-partwise version="3.1"><work><work-title>${title}</work-title></work>
<part-list><score-part id="P1"><part-name>${name}</part-name></score-part></part-list><part id="P1">${measures.map((m,i)=>`<measure number="${i+1}">${i===0?ATTR(fifths,mode):''}${m}</measure>`).join('')}</part></score-partwise>`;
const bar=(ch,body)=>{const cs=ch?ch.split(' '):[];if(cs.length===2&&!body)return H(cs[0])+N(72,2)+H(cs[1])+N(74,2);return cs.map(H).join('')+(body||N(72,4))};   /* 코드 둘 = 반 마디씩 */
const read=x=>E.musicXmlToSong(x,'t.musicxml');

/* ── 1. D.S. al Coda (글자 지시) — 1 2 3 4 | 2 3 | 5 6 ── */
{const r=read(score([bar('C6'),SEG+bar('Dm7'),bar('G7')+W('To Coda'),bar('Ab7')+W('D.S. al Coda'),CODA+bar('Fmaj7'),bar('Bb7')]));
  assert.strictEqual(r.song.ch,'C6|Dm7|G7|Ab7|Dm7|G7|Fmaj7|Bb7','D.S. al Coda: '+r.song.ch);
  assert.ok(r.warn.some(w=>/D\.S\.·코다를 따라 펼쳐 8마디/.test(w)),'경고: '+r.warn)}
/* ── 1b. 재생 지시(sound) 방식 — MuseScore 내보내기 형태 ── */
{const S=a=>`<direction><direction-type><words>x</words></direction-type><sound ${a}/></direction>`;
  const r=read(score([bar('C6'),S('segno="s1"')+bar('Dm7'),bar('G7')+S('tocoda="c1"'),bar('Ab7')+S('dalsegno="s1"'),S('coda="c1"')+bar('Fmaj7')]));
  assert.strictEqual(r.song.ch,'C6|Dm7|G7|Ab7|Dm7|G7|Fmaj7','sound 길잡이: '+r.song.ch)}
/* ── 2. D.C. al Fine — 1 2 3 4 | 1 2 ── */
{const r=read(score([bar('C6'),bar('F6')+W('Fine'),bar('G7'),bar('Ab7')+W('D.C. al Fine')]));
  assert.strictEqual(r.song.ch,'C6|F6|G7|Ab7|C6|F6','D.C. al Fine: '+r.song.ch)}
/* ── 3. 반복+엔딩 뒤 D.S. — 돌아온 뒤에는 반복 없이 마지막 엔딩 ── */
{const FWD='<barline location="left"><repeat direction="forward"/></barline>',E1='<barline location="left"><ending number="1" type="start"/></barline>',
   E1E='<barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline>',E2='<barline location="left"><ending number="2" type="start"/></barline>',
   E2E='<barline location="right"><ending number="2" type="discontinue"/></barline>';
  const r=read(score([SEG+FWD+bar('C6'),E1+bar('G7')+E1E,E2+bar('F6')+E2E+W('Fine'),bar('Ab7')+W('D.S. al Fine')]));
  assert.strictEqual(r.song.ch,'C6|G7|C6|F6|Ab7|C6|F6','반복 뒤 D.S. al Fine: '+r.song.ch)}

/* ── 4. 여러 코러스 연주 악보: 코드 없는 인트로 2마디 + 12마디 블루스 × 3(둘째 코러스 한 곳은 전사 실수) ── */
{const blues='F7 Bb7 F7 F7 Bb7 Bb7 F7 D7 Gm7 C7 F7 C7'.split(' ');
  const ms=[R(4),R(4)];
  for(let k=0;k<3;k++)blues.forEach((c,j)=>ms.push(bar(k===1&&j===4?'Db7':c,N(k===0?60+j:84,4))));   /* 첫 코러스(헤드)는 C4부터 한 음씩, 솔로는 C6 */
  const r=read(score(ms,{fifths:-1}));
  assert.strictEqual(r.song.ch,blues.join('|'),'여러 코러스 → 한 코러스: '+r.song.ch);
  eqJ(r.song.f,['AAB',4],'12마디 = 블루스 형식');
  assert.strictEqual(r.head.notes.length,12,'멜로디는 첫 코러스만');
  assert.strictEqual(r.head.notes[0].t,0);assert.strictEqual(r.head.notes[0].midi,60);assert.ok(r.head.notes.every(n=>n.midi<84),'솔로 음은 버림');
  assert.ok(r.warn.some(w=>/인트로/.test(w))&&r.warn.some(w=>/12마디 × 3코러스/.test(w)),'경고: '+r.warn)}

/* ── 5. 피아노처럼 화음으로 적힌 멜로디 → 맨 위 음 ── */
{const r=read(score([bar('C6',N(60,2)+N(64,2,1)+N(67,2,1)+N(62,2)+N(65,2,1)+N(69,2,1))],{name:'Piano'}));
  eqJ(r.head.notes.map(n=>n.midi),[67,69],'화음 맨 위 음: '+r.head.notes.map(n=>n.midi))}

/* ── 6. 이조 정보 없는 테너 색소폰 파트(기보 D장조 · Em7) → 실음 C장조 · Dm7, 음은 장9도 아래 ── */
{const r=read(score([H('Em7')+N(76,2)+H('A7')+N(74,2),bar('Dmaj7',N(74,4))],{name:'Saxophone Ténor',fifths:2}));
  assert.strictEqual(r.song.ch,'Dm7 G7|Cmaj7','테너 실음: '+r.song.ch);assert.strictEqual(r.song.k,0);
  assert.strictEqual(r.head.notes[0].midi,62,'E5(76) - 14 = D4(62)');
  assert.ok(r.warn.some(w=>/테너 색소폰/.test(w)))}
/* ── 6b. <transpose>가 있으면 이름으로 짐작하지 않는다 ── */
{const x=score([bar('Em7',N(76,4))],{name:'Tenor Saxophone',fifths:2}).replace('</time>','</time><transpose><diatonic>-8</diatonic><chromatic>-14</chromatic></transpose>');
  const r=read(x);assert.strictEqual(r.song.ch,'Dm7');assert.ok(!r.warn.some(w=>/이조 정보가 없어/.test(w)))}

/* ── 7. 조표만 있고 장·단 표시가 없을 때: 으뜸 단화음이 더 자주 오면 단조 ── */
{const r=read(score([bar('Cm6'),bar('Fm7'),bar('Dm7b5 G7'),bar('Cm6')],{fifths:-3}));
  assert.strictEqual(r.song.k,0,'E♭ 조표 + Cm 중심 → C단조(0): '+r.song.k)}
{const r=read(score([bar('Ebmaj7'),bar('Fm7 Bb7'),bar('Ebmaj7')],{fifths:-3}));
  assert.strictEqual(r.song.k,3,'E♭ 장조 그대로: '+r.song.k)}

/* ── 8. 형식 추정 ── */
{const A='C6 A7 Dm7 G7 C6 A7 Dm7 G7'.split(' '),A2='C6 A7 Dm7 G7 C6 A7 Dm7 C6'.split(' '),B='E7 E7 A7 A7 D7 D7 G7 G7'.split(' ');
  eqJ(E.detectForm([...A,...A2,...B,...A2]),['AABA',8],'AABA');
  eqJ(E.detectForm([...A,...B,...A,...'Dm7 Dm7 F6 F6 Em7 A7 Dm7 G7'.split(' ')]),['ABAC',8],'ABAC');
  eqJ(E.detectForm(A.concat(A)),['AA',8],'16마디 같은 두 블록');
  assert.strictEqual(E.findChoruses([...A,...A2,...B,...A2]),null,'AABA 한 코러스뿐이면 줄이지 않음')}

/* ── 9. iReal: 세뇨(S)·코다(Q)·글자 지시 <D.S. al Coda> ── */
{const raw='[T44C^7 |SD-7 |G7 Q|Ab7<D.S. al Coda> Z Q F^7 |Bb7 Z';
  const url='irealb://'+encodeURIComponent('Nav Test=Me==Medium Swing=C==1r34LbKcu7'+E.irealUnscramble(raw)+'=Medium Swing=0=1===');
  const ir=E.irealToSongs(url)[0];
  assert.strictEqual(ir.song.ch,'Cmaj7|Dm7|G7|Ab7|Dm7|G7|Fmaj7|Bb7','iReal D.S. al Coda: '+ir.song.ch)}
/* ── 9b. iReal D.C. al Fine ── */
{const raw='[T44C^7 |F^7<Fine> |G7 |Ab7<D.C. al Fine> Z';
  const url='irealb://'+encodeURIComponent('Fine Test=Me==Medium Swing=C==1r34LbKcu7'+E.irealUnscramble(raw)+'=Medium Swing=0=1===');
  assert.strictEqual(E.irealToSongs(url)[0].song.ch,'Cmaj7|Fmaj7|G7|Ab7|Cmaj7|Fmaj7','iReal D.C. al Fine')}

/* ── 10. 불러온 곡으로 솔로 생성(마디 길이) ── */
let n=0;
{const blues='F7 Bb7 F7 F7 Bb7 Bb7 F7 D7 Gm7 C7 F7 C7'.split(' '),ms=[];for(let k=0;k<3;k++)blues.forEach(c=>ms.push(bar(c,N(65,4))));
  const songs=[read(score(ms,{fifths:-1})).song,read(score([bar('C6'),SEG+bar('Dm7'),bar('G7')+W('To Coda'),bar('Ab7')+W('D.S. al Coda'),CODA+bar('Fmaj7'),bar('Bb7')])).song];
  songs.forEach((s,i)=>{const id='u_v044_'+i;E.SONGDB[id]={name:s.n,c:s.c,key:s.k,bpm:s.bpm,bpb:s.m,form:{phrase:s.f[1],sections:s.f[0]},bars:s.ch.split('|').map(b=>b.trim().split(/\s+/).map(E.parseCh)),mine:true};
    for(const diff of [1,2,3])for(let sd=1;sd<=3;sd++){const so=E.generateSolo(id,s.k,diff,sd*17+diff,'wind',{style:'all'});n++;
      so.bars.forEach((b,bi)=>assert.strictEqual(b.notes.reduce((a,x)=>a+x.d,0),(s.m||4)*6,id+' 마디 '+bi))}})}
console.log('v0.44 불러오기 보강 검사 통과 (솔로 '+n+'개)');
/* ── 11. v0.47 iReal 인트로(*i)·버스(*v) 빼기 + 섹션 표시로 형식 ── */
{const raw='[*iT44C^7 |F^7 |C^7 |F^7 ][*AD-7 |G7 |C^7 |A7 |D-7 |G7 |C^7 |C^7 ][*BE-7 |A7 |D-7 |G7 |E-7 |A7 |D-7 |G7 ][*AD-7 |G7 |C^7 |A7 |D-7 |G7 |C^7 |C^7 Z';
  const url='irealb://'+encodeURIComponent('Intro Test=Me==Medium Swing=C==1r34LbKcu7'+E.irealUnscramble(raw)+'=Medium Swing=0=1===');
  const ir=E.irealToSongs(url)[0];
  assert.strictEqual(ir.song.ch.split('|').length,24,'인트로 4마디 빼고 24마디: '+ir.song.ch.split('|').length);
  assert.ok(ir.warn.some(w=>/인트로 4마디/.test(w)),'경고: '+ir.warn);
  assert.strictEqual(ir.song.ch.split('|')[0],'Dm7','첫 마디는 A 섹션');
  eqJ(ir.song.f,['ABA',8],'형식: '+ir.song.f)}
console.log('v0.47 iReal 인트로 검사 통과');
