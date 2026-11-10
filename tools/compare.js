const fs=require('fs');
function load(f,extra){const code=fs.readFileSync(f,'utf8')+'\n'+(extra||'')+'\nmodule.exports={generateSolo,PROGS,KEY_ROOTS};';const p='/tmp/opencode_'+f.replace(/\W/g,'')+'.js';fs.writeFileSync(p,code);return require(p)}
const NEW=load('engine_core.js',fs.readFileSync('style_data.js','utf8'));
const OLD=load('engine_old.js');
const H=require('/tmp/opencode_eng.js');
function metrics(E,diff,opt){
  const m={ctStrong:0,strong:0,notes:0,guide:0,chg:0,land:0,chrom:0,step:0,rep:0,leap:0,ivs:0,rests:0,dirChg:0,dirN:0,uniq:0,uniqN:0};
  for(const prog of Object.keys(E.PROGS))for(const [kn,kp] of E.KEY_ROOTS)for(const inst of ['brass','wind'])for(let sd=1;sd<=4;sd++){
    const solo=E.generateSolo(prog,kp,diff,sd*104729+diff,inst,opt);
    const harm=H.analyzeHarmony(H.barChords(H.PROGS[prog],kp),kp);
    const segAt=t=>{for(let i=harm.length-1;i>=0;i--)if(harm[i].t0<=t)return harm[i];return harm[0]};
    let pv=null,pd=0,lastTie=false;const seen=new Set();let grams=0;
    const seq=[];
    solo.bars.forEach((bar,b)=>bar.notes.forEach((n,k)=>{
      const prevTie=lastTie;lastTie=!!n.tie;
      if(n.midi===null){m.rests++;return}if(prevTie)return;
      m.notes++;seq.push(n.midi);
      const T=b*24+n.t,sg=segAt(T),rel=((n.midi-sg.root)%12+12)%12,ct=sg.ct.includes(rel);
      if(n.t%6===0){m.strong++;if(ct)m.ctStrong++}
      if(!ct&&!sg.scale.includes(rel))m.chrom++;
      if(T===sg.t0&&T>0){m.chg++;if(ct)m.land++;if(sg.guide.includes(rel))m.guide++}
      if(pv!==null){const d=n.midi-pv,a=Math.abs(d);m.ivs++;if(a>0&&a<=2)m.step++;if(a===0)m.rep++;if(a>=6)m.leap++;
        if(d!==0){if(pd!==0){m.dirN++;if(Math.sign(d)!==pd)m.dirChg++}pd=Math.sign(d)}}
      pv=n.midi;
    }));
    for(let i=0;i+4<=seq.length;i++){const g=seq.slice(i+1,i+4).map((x,j)=>x-seq[i+j]).join(',');m.uniqN++;if(!seen.has(g)){seen.add(g);m.uniq++}}
  }
  const r=(a,b)=>+(100*a/Math.max(1,b)).toFixed(1);
  return {강박코드톤:r(m.ctStrong,m.strong),코드전환착지_코드톤:r(m.land,m.chg),코드전환_가이드톤:r(m.guide,m.chg),크로매틱:r(m.chrom,m.notes),순차진행:r(m.step,m.ivs),같은음반복:r(m.rep,m.ivs),도약6반음이상:r(m.leap,m.ivs),방향전환율:r(m.dirChg,m.dirN),음형다양성:r(m.uniq,m.uniqN),쉼표비중:r(m.rests,m.rests+m.notes)};
}
const out={};
for(const d of [1,2,3]){out['v0.11 난이도'+d]=metrics(OLD,d,{});out['v0.12 난이도'+d]=metrics(NEW,d,{style:'all'})}
console.table(out);
fs.writeFileSync('compare.json',JSON.stringify(out));
