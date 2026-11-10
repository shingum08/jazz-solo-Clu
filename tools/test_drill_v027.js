'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const root=require('path').resolve(__dirname,'..');
const eng=['engine_core.js','style_data.js',...fs.readdirSync(root+'/engine').filter(f=>/^songs_part\d+\.js$/.test(f)).sort()].map(f=>fs.readFileSync(root+'/engine/'+f,'utf8')).join('\n');
const html=fs.readFileSync(root+'/app/template.html','utf8');
const part=html.slice(html.indexOf('function guideDrillEvents('),html.indexOf('/* 헤드(리드시트)'));
const ctx=vm.createContext({console});vm.runInContext('"use strict";\n'+eng+'\n'+part+'\nthis.E={guideDrillEvents,drillSheetAbc,barChords,SONGDB};',ctx);
const E=ctx.E;let measures=0,resolutions=0,opportunities=0,maxLeap=0;
for(const [id,s] of Object.entries(E.SONGDB)){
 const bars=E.barChords(s,s.key),bpb=s.bpb||4;
 for(const tr of [0,2,9]){
 const ev=E.guideDrillEvents(bars,tr,bpb);
 for(let b=0;b<bars.length;b++)assert.equal(ev.filter(n=>n.b===b).reduce((a,n)=>a+n.d,0),bpb*6,id+' duration');
 const abc=E.drillSheetAbc(bars,tr,'gt',bpb);assert(!/undefined|NaN/.test(abc),id);
 ev.forEach((n,i)=>{assert(n.gs.includes(((n.midi-n.root)%12+12)%12));assert(n.d<=12);if(!i)return;const p=ev[i-1],leap=Math.abs(n.midi-p.midi);maxLeap=Math.max(maxLeap,leap);
 if(n.first&&((n.root-p.root+12)%12)===5){const possible=n.gs[0]===4&&p.gs[1]===10;if(possible){opportunities++;if(p.degree===7&&n.degree===3&&leap===1)resolutions++;}}
 });measures+=bars.length;
 }
}
console.log({opportunities,resolutions,ratio:resolutions/opportunities,maxLeap});
assert(opportunities>0);assert(resolutions/opportunities>0.75,'7→3 ratio');assert(maxLeap<=7,'guide leap bound');
const two=[{root:2,type:'m7'},{root:7,type:'7'},{root:0,type:'maj7'}].map(c=>[c]);
const seq=E.guideDrillEvents(two,0,4);assert(seq.length===6);assert(seq.every(n=>n.d===12));
console.log(JSON.stringify({test:'guide-drill',songs:Object.keys(E.SONGDB).length,measures,opportunities,resolutions,ratio:resolutions/opportunities,maxLeap}));
