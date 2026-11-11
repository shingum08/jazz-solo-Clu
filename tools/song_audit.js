/* v0.36 곡 데이터 점검 — 자동 검사 + 사람 판정(tools/data/song_review_v037.json, v0.37에서 곡 정리 후 갱신)을 합쳐 engine/song_status.js를 만든다.
   node tools/song_audit.js            → engine/song_status.js 갱신 + 요약 출력
   node tools/song_audit.js --csv out  → 검증 시트용 CSV
   곡 데이터 자체는 고치지 않는다(출처 없이 고치면 또 틀린 데이터를 만들 수 있으므로). */
const fs=require('fs'),path=require('path'),{loadEngine,root}=require('./lib_load.js');
const E=loadEngine();
const N=['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
const review=JSON.parse(fs.readFileSync(path.join(root,'tools/data/song_review_v037.json'),'utf8'));
const PRACTICE=['p251','blues12','m25'];
const rel=(s,b)=>b.map(c=>((c.root-s.key+12)%12)+c.type).join(' ');
const sig=(s,n)=>s.bars.slice(0,n||s.bars.length).map(b=>rel(s,b)).join('|');
const groupsFull={},groups8={};
for(const [id,s] of Object.entries(E.SONGDB)){if(PRACTICE.includes(id))continue;(groupsFull[sig(s)]=groupsFull[sig(s)]||[]).push(id);(groups8[sig(s,8)]=groups8[sig(s,8)]||[]).push(id)}
const out={},rows=[];
for(const r of E.RAW_SONGS.concat(PRACTICE.map(id=>({id,n:E.SONGDB[id].name,k:E.SONGDB[id].key,f:[E.SONGDB[id].form.sections,E.SONGDB[id].form.phrase],ch:''})))){
  const id=r.id,s=E.SONGDB[id],auto=[];
  if(!PRACTICE.includes(id)){
    const gF=groupsFull[sig(s)],g8=groups8[sig(s,8)];
    if(gF.length>1)auto.push('진행 전체가 다른 '+(gF.length-1)+'곡과 같음');
    else if(g8.length>1)auto.push('첫 8마디가 다른 '+(g8.length-1)+'곡과 같음');
    /* 조 표기 vs 첫·끝 화음 */
    const first=s.bars[0][0],last=s.bars[s.bars.length-1].slice(-1)[0],lastB=s.bars[s.bars.length-1][0];
    const tonicLike=c=>c&&c.root===s.key;
    const iiV=c=>c&&((c.root-s.key+12)%12===2||(c.root-s.key+12)%12===7);   /* ii·V로 시작/끝나는 곡 허용 */
    if(!tonicLike(first)&&!tonicLike(last)&&!tonicLike(lastB)&&!(iiV(first)&&(tonicLike(s.bars[2]&&s.bars[2][0])||tonicLike(s.bars[3]&&s.bars[3][0]))))auto.push('조 표기('+N[s.key]+')와 첫·끝 화음이 맞지 않음');
    const want=String(s.form.sections).length*s.form.phrase;
    if(want&&want!==s.bars.length)auto.push('형식 '+s.form.sections+'×'+s.form.phrase+'='+want+'마디인데 '+s.bars.length+'마디');
  }
  const rv=PRACTICE.includes(id)?['practice','앱 연습용 진행']:review[id]||['unknown',''];
  out[id]={s:rv[0],n:rv[1]||'',a:auto};
  rows.push({id,name:s.name,key:N[s.key],meter:(s.bpb||4)+'/4',form:s.form.sections+'·'+s.form.phrase,bars:s.bars.length,status:rv[0],note:rv[1]||'',auto:auto.join(' / '),chords:s.bars.map(b=>b.map(c=>N[c.root]+c.type).join(' ')).join(' | ')});
}
const js='/* v0.36 곡 데이터 검증 상태 — tools/song_audit.js 산출물(손으로 고치지 말 것. 판정 변경은 tools/data/song_review_v037.json)\n'+
 '   s: ok(아는 진행과 일치) · form(공통 형식으로는 맞음) · rb(v0.37 새로 작성, 연주자 확인 전) · rbq(새로 작성, 일부 마디 확인 필요) · practice(앱 연습용)\n'+
 '   n: 메모 · a: 자동 검사 경고 · v: 연주자 확인(검증 시트 반영 시) */\nconst SONG_STATUS='+JSON.stringify(out)+';\n';
fs.writeFileSync(path.join(root,'engine/song_status.js'),js);
const cnt={};rows.forEach(r=>cnt[r.status]=(cnt[r.status]||0)+1);
const autoN=rows.filter(r=>r.auto).length;
console.log(JSON.stringify({songs:rows.length,status:cnt,autoFlagged:autoN}));
const ci=process.argv.indexOf('--csv');
if(ci>0){
  const q=v=>'"'+String(v).replace(/"/g,'""')+'"';
  const head=['id','제목','저장된 조','박자','형식','마디 수','1차 판정','판정 메모','자동 검사','저장된 코드 진행'];
  const csv=[head.map(q).join(',')].concat(rows.map(r=>[r.id,r.name,r.key,r.meter,r.form,r.bars,r.status,r.note,r.auto,r.chords].map(q).join(','))).join('\n');
  fs.writeFileSync(process.argv[ci+1],'﻿'+csv);console.log('csv',process.argv[ci+1]);
}
module.exports={};
