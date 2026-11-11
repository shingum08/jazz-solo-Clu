/* v0.27 회귀: node tools/test_engine_v027.js — 빌드/파일 생성 없이 실행 */
'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),cp=require('child_process');
const root=require('path').resolve(__dirname,'..');
const extra=['style_data.js','licks.js',...fs.readdirSync(root+'/engine').filter(f=>/^songs_part\d+\.js$/.test(f)).sort()]
  .map(f=>fs.readFileSync(root+'/engine/'+f,'utf8')).join('\n');
function load(core,helpers=false){
  const ctx={};vm.createContext(ctx);
  vm.runInContext(core+'\n'+extra+'\nthis.E={generateSolo,SONGDB,PROGS,barChords,analyzeHarmony'+
    (helpers?',classifySong,RHY_TPL,fitRhythmTemplate,ALLOWED,FEEL_PROFILE,mulberry32,rhythmBeatRow,sectionIndex':'')+'};',ctx);
  return ctx.E;
}
const E=load(fs.readFileSync(root+'/engine/engine_core.js','utf8'),true);
/* 이후 커밋에도 비교 기준이 바뀌지 않도록 고정한다. */
const old=load(fs.readFileSync(root+'/tools/baseline/engine_core_v0.27.0.js','utf8'));
let checks=0,solos=0;
function check(v,msg){assert(v,msg);checks++}
function solo(id,diff,seed,inst,opts={}){solos++;return E.generateSolo(id,E.SONGDB[id].key,diff,seed,inst,opts)}
function flat(s){return s.bars.flatMap((b,i)=>b.notes.map(n=>({...n,t:i*s.bpb*6+n.t})))}
function valid(s,inst,diff){
  let prev=null,tied=false;
  for(const b of s.bars){
    let t=0,tr=0;
    for(const n of b.notes){
      check(n.t===t&&n.d>0&&Number.isInteger(n.d),'마디 그리드');t+=n.d;
      if(n.trip){tr++;check(diff===3,'금지 3연음')}else{check(tr%3===0,'3연음 그룹');tr=0}
      if(n.midi!==null){
        const [lo,hi]=inst==='free'?[52,86]:[59,82];check(n.midi>=lo&&n.midi<=hi,'음역');
        if(prev!==null&&!tied)check(Math.abs(n.midi-prev)<=(inst==='free'?12:7)||(n.disp&&n.midi>prev&&n.midi-prev<=12),'도약');   /* v0.34 반전 도약은 위로 옥타브까지 허용 */
        prev=n.midi;
      }
      tied=!!n.tie;
    }
    check(tr%3===0&&t===s.bpb*6,'마디 완결');
  }
}
const types={oleo:'rhythm','i-got-rhythm':'rhythm',anthropology:'rhythm','rhythm-a-ning':'rhythm',
  blues12:'blues','blue-monk':'blues','so-what':'modal',impressions:'modal','take-five':'modal',
  'giant-steps':'standard',four:'standard','soul-eyes':'standard','all-of-me':'standard',
  'crazy-rhythm':'standard','scrapple-from-the-apple':'standard'};
for(const [id,type] of Object.entries(types))check(E.classifySong(id,E.SONGDB[id]||{bars:[],c:'스윙'})===type,id+' 분류');
check(E.classifySong('blues',E.PROGS.blues)==='blues','내장 블루스');
for(const chord of ['7','maj7','m7'])for(const raw of [true,false]){
  const p={bars:Array.from({length:32},()=>[raw?{o:0,t:chord}:{root:0,type:chord}])};
  check(E.classifySong('unknown-rhythm',p)==='standard','코드 비율/이름 추정 금지');
  p.songType='modal';check(E.classifySong('custom',p)==='modal','명시적 메타데이터');
}
function stable(s){delete s.ts;return JSON.stringify(s)}
for(const seed of [0,1,123456])check(stable(solo('oleo',2,seed,'wind'))===stable(solo('oleo',2,seed,'wind')),'시드 재현 '+seed);
for(const diff of [1,2,3])for(const feel of Object.keys(E.FEEL_PROFILE))for(const src of E.RHY_TPL)for(const need of [4,5,7,8,13,19]){
  const toks=E.fitRhythmTemplate(src,need,diff,E.FEEL_PROFILE[feel],E.mulberry32(73),0.65);
  check(toks.length===need&&toks[need-1]==='H','템플릿 길이/종지');
  toks.forEach((k,i)=>{
    check(E.ALLOWED[diff][k],'허용 토큰');check(!(k==='H'&&['R','T'].includes(toks[i-1])),'잘못된 지속');
    check(!(k==='Uh'&&(i===0||['R','T'].includes(toks[i-1]))),'잘못된 당김');
  });
}
check(E.fitRhythmTemplate(E.RHY_TPL[1],7,2,E.FEEL_PROFILE.swing,E.mulberry32(1),1)[0]==='Ur','초기 Uh → Ur');
check(E.rhythmBeatRow(5)===1&&E.rhythmBeatRow(7)===3,'박 전이표 안전 매핑');
for(const bpb of [2,3,4,5,6,7]){
  check(E.sectionIndex(16*bpb*6,8,bpb)===2,'브리지 시간 인덱스');
  check(E.sectionIndex(8*bpb*6-1,8,bpb)===0,'섹션 경계 직전');
}
/* 수록된 모든 박자와 2~7박 합성 진행: 2코드, 템플릿/회상, 실측 전이표 포함. */
for(const bpb of [2,3,4,5,6,7]){
  const id='meter-'+bpb;
  E.SONGDB[id]={...E.SONGDB.oleo,bpb};
  for(const diff of [1,2,3])for(const inst of ['wind','brass','free'])for(const seed of [7,29])valid(solo(id,diff,seed,inst,{style:'parker'}),inst,diff);
}
for(const [id,p] of Object.entries(E.SONGDB))if(p.bpb!==4&&!id.startsWith('meter-')){
  for(const diff of [1,2,3])valid(solo(id,diff,79,'wind',{style:'all'}),'wind',diff);
}
/* 카탈로그 전체 난이도 2: 템플릿의 T 누출과 박자 오류 방지. */
for(const id of Object.keys(E.SONGDB))valid(solo(id,2,197,'wind'),'wind',2);
/* 전체 곡의 가이드톤 주제: 난이도 2, 셀 사용 설정 켬, 모든 지속 조각 검사. */
let catalogGuideNotes=0;
for(const [id,p] of Object.entries(E.SONGDB)){
  const s=solo(id,2,997,'wind',{topic:'gt',style:'all'});
  valid(s,'wind',2);
  const segs=E.analyzeHarmony(E.barChords(p,p.key),p.key,p.bpb);
  for(const n of flat(s))if(n.midi!==null){
    let sg=segs[0];for(const q of segs)if(q.t0<=n.t)sg=q;
    check(sg.guide.includes(((n.midi-sg.root)%12+12)%12),'전체 곡 가이드톤 '+id);catalogGuideNotes++;
  }
}
function guideMetric(engine){
  let notes=0,bad=0,possible=0,resolved=0;
  for(const id of ['p251','oleo','giant-steps','blues12','take-five','my-favorite-things','so-what','stella-by-starlight'].filter(x=>engine.SONGDB[x]))for(const diff of [1,2,3])for(const inst of ['wind','brass','free'])for(let seed=1;seed<=6;seed++){
    const p=engine.SONGDB[id],s=engine.generateSolo(id,p.key,diff,seed*7919,inst,{topic:'gt',style:'parker'});
    const segs=engine.analyzeHarmony(engine.barChords(p,p.key),p.key,p.bpb);
    const at=t=>{for(let j=segs.length-1;j>=0;j--)if(segs[j].t0<=t)return segs[j]};
    let prev=null,from=null,tie=false;
    for(const n of flat(s)){
      if(n.midi===null){tie=false;continue}
      const sg=at(n.t),rel=((n.midi-sg.root)%12+12)%12;
      notes++;if(!sg.guide.includes(rel))bad++;
      if(!tie&&prev!==null&&from!==sg&&[10,11].includes(((prev-from.root)%12+12)%12)){
        const cand=[];for(let m=inst==='free'?52:59;m<=(inst==='free'?86:82);m++)if(sg.guide.includes(((m-sg.root)%12+12)%12)&&[3,4].includes(((m-sg.root)%12+12)%12)&&Math.abs(m-prev)===1)cand.push(m);
        if(cand.length){possible++;if(cand.includes(n.midi))resolved++}
      }
      prev=n.midi;from=sg;tie=!!n.tie;
    }
    if(engine===E){solos++;valid(s,inst,diff)}
  }
  return {notes,nonGuide:bad,semitoneOpportunities:possible,semitoneResolutions:resolved};
}
const guides={before:guideMetric(old),after:guideMetric(E)};
check(guides.after.nonGuide===0,'가이드톤 전 경로 불변식');
check(guides.after.semitoneResolutions===guides.after.semitoneOpportunities,'가능한 7→3 반음 해결 '+JSON.stringify(guides));
function arcMetric(engine,inst){
  const rows=[0,1,2].map(()=>({n:0,pitch:0,onsets:0,beats:0,tail:0,tailN:0,body:0,bodyN:0}));
  for(const id of ['all-of-me','oleo','so-what'])for(let seed=1;seed<=24;seed++)for(let i=0;i<3;i++){
    const p=engine.SONGDB[id],s=engine.generateSolo(id,p.key,3,seed*7919,inst,{arc:{i,n:3},style:'all'}),r=rows[i];
    let tie=false;
    for(const n of flat(s)){
      if(n.midi!==null&&!tie){
        r.n++;r.pitch+=n.midi;r.onsets++;
        if(n.t>=(s.bars.length-2)*s.bpb*6){r.tail+=n.midi;r.tailN++}else{r.body+=n.midi;r.bodyN++}
      }
      tie=!!n.tie;
    }
    r.beats+=s.bars.length*s.bpb;
    if(engine===E){solos++;valid(s,inst,3)}
  }
  return rows.map(r=>({meanMidi:+(r.pitch/r.n).toFixed(3),onsetsPerBeat:+(r.onsets/r.beats).toFixed(3),
    bodyMidi:+(r.body/r.bodyN).toFixed(3),finalTwoBarsMidi:+(r.tail/r.tailN).toFixed(3)}));
}
const arcs={};
for(const inst of ['wind','brass','free']){
  arcs[inst]={before:arcMetric(old,inst),after:arcMetric(E,inst)};
  const a=arcs[inst].after;
  check(a[1].meanMidi>a[0].meanMidi+0.5&&a[2].meanMidi>a[1].meanMidi+0.5,inst+' 음역 곡선');
  check(a[1].onsetsPerBeat>a[0].onsetsPerBeat&&a[2].onsetsPerBeat>a[1].onsetsPerBeat,inst+' 밀도 곡선');
  check(a[2].finalTwoBarsMidi<a[2].bodyMidi-2,inst+' 최종 이완');
}
/* 모달 활용 스케일이 기본형에 고정되지 않는지 여러 시드의 태그로 검증. */
const variants=new Set();
for(let seed=1;seed<=12;seed++)for(const b of solo('so-what',2,seed,'wind',{topic:'dom'}).bars)for(const tag of b.tags)if(tag.includes('활용 스케일'))variants.add(tag);
check(variants.size>1,'모달 스케일 변형');
console.log(JSON.stringify({checks,solos,catalogGuideNotes,guides,arcs,modalVariants:[...variants]},null,2));
