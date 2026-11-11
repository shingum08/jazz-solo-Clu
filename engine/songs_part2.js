/* ── 파서 + SONGDB 구성 ── */
function parseCh(ch){
  const m=/^([A-G])([b#\u266d\u266f]?)((?:maj7#11|maj7|mmaj7|m7b5|m7|m6|m9|dim7|7sus4|7b9|7#9|7#11|7|6|9))$/.exec(ch.trim());
  if(!m)throw new Error('bad chord: '+ch);
  const base={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1]];
  const r=(base+(m[2]==='b'||m[2]==='\u266d'?-1:(m[2]==='#'||m[2]==='\u266f')?1:0)+12)%12;
  return {root:r,type:m[3]};
}
const SONGDB={};
RAW_SONGS.forEach(s=>{SONGDB[s.id]={name:s.n,c:s.c,key:s.k,bpm:s.bpm,bpb:s.m||4,
  form:{phrase:s.f[1],sections:s.f[0]},
  bars:s.ch.split('|').map(b=>b.trim().split(/\s+/).map(parseCh))}});
/* 연습용 진행(v0.3 유지) */
SONGDB.p251={name:'메이저 Ⅱ-Ⅴ-Ⅰ (연습)',c:'연습',key:0,bpm:120,bpb:4,form:PROGS.p251.form,bars:PROGS.p251.bars};
SONGDB.blues12={name:'블루스 12마디 (연습)',c:'연습',key:0,bpm:120,bpb:4,form:PROGS.blues.form,bars:PROGS.blues.bars};
SONGDB.m25={name:'마이너 Ⅱ-Ⅴ 연쇄 (연습)',c:'연습',key:0,bpm:120,bpb:4,form:PROGS.autumn.form,bars:PROGS.autumn.bars};
