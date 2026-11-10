/* ── v0.29 연습 악보 생성 — 「연습」 보기에서는 솔로 대신 주제별 연습 음형을 만든다 ──
   · 코드톤: 4분음표로 1·3·5·7음        · 스케일/펜타토닉/활용 스케일: 8분음표
   · 코드마다 상행·하행을 시드 난수로 고른다(같은 시드 → 같은 악보)
   · 기보 음 기준 상한(기본 B♭5=82)을 넘는 음형은 한 옥타브 낮춰 시작한다
   결과는 generateSolo와 같은 모양({bars:[{chords,notes,tags}]})이라 악보·재생·MusicXML을 그대로 쓴다.
   음높이는 실음(콘서트)으로 돌려준다. opts.wt = 기보 이조(B♭ 악기 +2, E♭ 악기 +9). */
const DRILL_CEIL=82,DRILL_ROOT_LO=59,DRILL_FLOOR=54;   /* 기보: 상한 B♭5 · 뿌리음 자리 B3~B♭4 · 하한 F♯3 */
const DRILL_PENTA={maj:[0,2,4,7,9],min:[0,3,5,7,10],dom:[0,2,4,7,10],domalt:[0,2,4,7,10],hdim:[0,3,5,6,10],dim:[0,3,6,9]};
const DRILL_VAR={maj:[[0,2,4,5,7,9,11],[0,2,4,6,7,9,11]],min:[[0,2,3,5,7,9,10],[0,2,3,5,7,9,11]],dom:[[0,2,4,5,7,9,10],[0,2,4,6,7,9,10],[0,1,3,4,6,8,10]],domalt:[[0,1,3,4,6,8,10],[0,2,4,6,7,9,10]],hdim:[[0,1,3,5,6,8,10],[0,2,3,5,6,8,10]],dim:[[0,2,3,5,6,8,9,11]]};
const DRILL_VAR_NAME={maj:['이오니안','리디안'],min:['도리안','멜로딕 마이너'],dom:['믹소리디안','리디안 ♭7','얼터드'],domalt:['얼터드','리디안 ♭7'],hdim:['로크리안','로크리안 ♮2'],dim:['디미니시드']};
const DRILL_TOPICS=['ct','penta','scale','dom','gt'];
function drillLadder(type,topic,ph){
  const T=CHORD_TYPES[type],cls=TYPE_CLS[type]||'dom';
  if(topic==='ct')return T.iv.slice(0,4);
  if(topic==='penta')return (DRILL_PENTA[cls]||DRILL_PENTA.dom).slice();
  if(topic==='dom'){const L=DRILL_VAR[cls]||DRILL_VAR.dom;return L[ph%L.length].slice()}
  return T.scale.slice();
}
/* 사다리(한 옥타브 음정 목록)를 위로 n음 펼친다. 7음 스케일 반 마디(4음)는 1-2-3-5 음형 */
function drillPattern(ladder,n,topic){
  if(n===4&&ladder.length===7&&topic!=='ct')return [ladder[0],ladder[1],ladder[2],ladder[4]];
  const out=[];for(let k=0;k<n;k++)out.push(ladder[k%ladder.length]+12*Math.floor(k/ladder.length));
  return out;
}
function drillPlace(rootPcW,rel,ceil,floor){
  let base=DRILL_ROOT_LO+mod12(rootPcW-DRILL_ROOT_LO);
  const mx=Math.max(...rel),mn=Math.min(...rel);
  while(base+mx>ceil)base-=12;                   /* 상한을 넘으면 한 옥타브 아래에서 시작 */
  if(base+mn<floor&&base+12+mx<=ceil)base+=12;
  return base;
}
function generateDrill(progId,keyPc,topic,seed,opts){
  opts=opts||{};
  const prog=SONGDB[progId],bpb=prog.bpb||4,TPBAR=bpb*6;
  const wt=opts.wt||0,ceil=opts.ceil||DRILL_CEIL,floor=opts.floor||DRILL_FLOOR;
  if(!DRILL_TOPICS.includes(topic))topic='ct';
  const rng=mulberry32((seed>>>0)^0x9e3779b9);
  const bars=barChords(prog,keyPc);
  const result=bars.map(bar=>({chords:bar,notes:[],tags:[]}));
  const stats={targets:0,guideHits:0,enc:0,appr:0,chrom:0,cells:0,motif:0,headQuote:0,up:0,down:0};
  const segBeats=bar=>{const n=bar.length,q=Math.floor(bpb/n),r=bpb-q*n;return bar.map((_,k)=>q+(k<r?1:0))};
  if(topic==='gt'){
    drillGuideLine(bars,bpb,wt,ceil,floor).forEach(n=>{const nn={t:n.t,d:n.d,midi:n.midi-wt,deg:n.degree};if(n.first)nn.ci=bars[n.b].indexOf(n.c);result[n.b].notes.push(nn)});
    result.forEach(b=>{if(!b.notes.length)b.notes.push({t:0,d:TPBAR,midi:null})});
  }else{
    const unit=topic==='ct'?6:3;                 /* 코드톤 4분 · 나머지 8분 */
    bars.forEach((bar,b)=>{
      const beats=segBeats(bar);let t=0;const dirs=[];
      bar.forEach((c,k)=>{
        const n=beats[k]*6/unit;
        if(n<=0)return;
        const ladder=drillLadder(c.type,topic,Math.floor(b/4));
        let rel=drillPattern(ladder,n,topic);
        const down=rng()<0.5;if(down)rel=rel.slice().reverse();
        const base=drillPlace(mod12(c.root+wt),rel,ceil,floor);
        rel.forEach((r,q)=>{const nn={t,d:unit,midi:base+r-wt};if(q===0)nn.ci=k;result[b].notes.push(nn);t+=unit});
        dirs.push(down?'하행':'상행');if(down)stats.down++;else stats.up++;
      });
      if(t<TPBAR)result[b].notes.push({t,d:TPBAR-t,midi:null});
      result[b].tags.push(dirs.join('·'));
    });
  }
  const P=(prog.form&&prog.form.phrase)||8,secs=String((prog.form&&prog.form.sections)||'');
  return {progId,keyPc,diff:0,style:'all',bpb,bars:result,ts:Date.now(),harm:[],stats,feel:opts.feel||'swing',topic,drill:true,quote:null,motifs:[],
    form:{phrase:P,sections:secs.split(''),licks:0,phrases:0}};
}
/* 가이드톤(3·7음) 연결 라인 — 2분음표 기본, 7→3 반음 해결을 우선하는 최단 경로. 기보 음으로 계산 */
function drillGuideLine(bars,bpb,wt,ceil,floor){
  const GM={maj7:[4,11],'6':[4,9],m7:[3,10],m9:[3,10],m6:[3,9],'7':[4,10],'9':[4,10],'7b9':[4,10],'7#9':[4,10],m7b5:[3,10],dim7:[3,9]};
  const slots=[];
  bars.forEach((bar,b)=>{
    const lens=bar.length===1?[bpb]:[Math.ceil(bpb/2),Math.floor(bpb/2)];
    let t=0;
    bar.slice(0,2).forEach((c,ci)=>{
      let rem=lens[ci]*6;
      while(rem>0){const d=Math.min(12,rem);slots.push({b,t,d,c,root:mod12(c.root+wt),gs:GM[c.type]||[4,10],first:rem===lens[ci]*6});t+=d;rem-=d}
    });
  });
  let states=[];
  slots.forEach((s,i)=>{
    const next=[];
    s.gs.forEach((g,j)=>{for(let m=Math.max(55,floor);m<=Math.min(81,ceil);m++)if(mod12(m-s.root)===g){
      const degree=j===0?3:7;
      let cost=i===0?Math.abs(m-67)*0.15+(degree===7?0:0.2):Infinity,from=-1;
      states.forEach((p,k)=>{
        const leap=Math.abs(m-p.m),prev=slots[i-1];
        if(leap>7)return;
        let v=p.cost+leap+(leap>4?(leap-4)*3:0);
        if(s.first&&mod12(s.root-prev.root)===5&&p.degree===7&&degree===3&&leap===1)v-=40;
        if(s.c===prev.c&&p.degree===degree)v+=0.8;
        if(v<cost){cost=v;from=k}
      });
      next.push({m,degree,cost,from});
    }});
    s.states=next;states=next;
  });
  if(!slots.length)return [];
  let k=states.reduce((best,p,i)=>p.cost<states[best].cost?i:best,0);
  for(let i=slots.length-1;i>=0;i--){const p=slots[i].states[k];slots[i].midi=p.m;slots[i].degree=p.degree;k=p.from;delete slots[i].states}
  return slots;
}
