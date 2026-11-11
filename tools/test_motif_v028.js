/* v0.28 회귀 검사 — ABC 파서 단위 검사 + 모티프/헤드 차용이 켜진 전수 불변식 검사 */
const assert=require('assert'),{loadEngine}=require('./lib_load.js');
const E=loadEngine();let checks=0;
const ok=(v,m)=>{assert(v,m);checks++};
/* 1) ABC 파서 */
{
  const p=E.parseHeadAbc("M:4/4\nL:1/8\nK:G\nF2 G A B2 c2|");           /* G장조: F는 F♯ */
  ok(p.notes[0].midi===66,'키 시그니처 F♯ → 66, got '+p.notes[0].midi);
  ok(p.notes[0].d===6&&p.notes[1].d===3,'L:1/8 길이');
  const q=E.parseHeadAbc("L:1/4\nK:C\nc d- d e z f|");
  ok(q.notes.length===4&&q.notes[1].d===12,'붙임줄 합산: '+JSON.stringify(q.notes));
  ok(q.notes[3].midi===77&&q.notes[3].t===30,'쉼표 뒤 시각: '+JSON.stringify(q.notes[3]));
  ok(q.notes[2].brk===true,'쉼표 앞 음에 끊김 표시');
  const r=E.parseHeadAbc("K:C\n^c _B =F c' C,|");
  ok(r.notes.map(n=>n.midi).join()==='73,70,65,84,48','임시표·옥타브: '+r.notes.map(n=>n.midi));
  const e=E.parseHeadAbc('');ok(e.notes.length===0&&e.errors.length===0,'빈 입력');
  const g=E.parseHeadAbc('L:1/8\nK:C\n(3cde f g a b|');ok(g.errors.length>0,'셋잇단은 건너뜀을 보고');
  const f=E.headFragments(E.parseHeadAbc('L:1/8\nK:C\nc e g c|e g c e|'));
  ok(f.length>0&&f.every(x=>x.off[0]===0&&x.off.length===x.d.length&&x.d.every(d=>[3,6,9,12].includes(d))),'조각 형식');
  ok(E.headFragments(E.parseHeadAbc('L:1/8\nK:C\nc c c c|')).length===0,'한 음 반복 조각 제외');
}
/* 2) 전수: 모든 곡 × 난이도 2,3 × 헤드 조각 포함 */
const frags=E.headFragments(E.parseHeadAbc("M:4/4\nL:1/8\nK:C\nE2 G c2 B A|G2 E D2 C D|E G c e d2 B G|A2 c B4|c2 e g2 e c|d2 f a2 f d|e g b d' c'2 g e|c8|"));
let solos=0,headSolos=0,motifTotal=0,v={bar:0,range:0,leap:0,overlap:0};
for(const id of Object.keys(E.SONGDB)){
  const song=E.SONGDB[id],TPB=song.bpb*6;
  for(const d of [2,3]){
    /* v0.39: 모티프 장치만 따로 보기 위해 노래 프레이즈(자체 동기 시퀀스를 씀)는 끈다 */
    const s1=E.generateSolo(id,song.key,d,31337+d,'wind',{headMotifs:frags,headRate:0.6,lyric:0});
    const s2=E.generateSolo(id,song.key,d,31337+d,'wind',{headMotifs:frags,headRate:0.6,lyric:0});
    ok(JSON.stringify(s1.bars)===JSON.stringify(s2.bars),'같은 시드·옵션은 같은 악보 '+id);
    solos++;motifTotal+=s1.stats.motif;if(s1.motifs.some(m=>m.from==='head'))headSolos++;
    let pv=null;
    s1.bars.forEach(b=>{
      if(b.notes.reduce((a,n)=>a+n.d,0)!==TPB)v.bar++;
      let t=0;for(const n of b.notes){if(n.t!==t)v.overlap++;t+=n.d;
        if(n.midi!==null){if(n.midi<59||n.midi>82)v.range++;if(pv!==null&&Math.abs(n.midi-pv)>7&&!(n.disp&&n.midi>pv&&n.midi-pv<=12))v.leap++;pv=n.midi}}
    });
  }
}
ok(Object.values(v).every(x=>x===0),'위반 '+JSON.stringify(v));
/* 3) motif:false 는 모티프를 전혀 만들지 않고, diff 1 도 만들지 않는다 */
{
  const s=E.generateSolo('autumn-leaves',E.SONGDB['autumn-leaves'].key,3,5,'wind',{motif:false,headMotifs:frags});
  ok(s.stats.motif===0&&s.motifs.length===0,'motif:false');
  const s1=E.generateSolo('autumn-leaves',E.SONGDB['autumn-leaves'].key,1,5,'wind',{headMotifs:frags});
  ok(s1.stats.motif===0,'난이도 1 비적용');
}
ok(motifTotal>solos*0.8,'모티프가 충분히 사용됨 '+motifTotal+'/'+solos);
ok(headSolos>solos*0.2,'헤드 차용이 간헐적으로 나타남 '+headSolos+'/'+solos);
console.log(JSON.stringify({test:'motif-v028',checks,solos,motifTotal,headSolos,violations:v}));
