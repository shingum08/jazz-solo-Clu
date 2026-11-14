'use strict';
/* 빠른 비교: node tools/quick.js <engine> <set> <level> <nCh> <seeds> [json opts extra] — 핵심 지표 한 줄 */
const path=require('path');const {loadEngine,addSong,genChoruses}=require('./harness');const {metrics,pct,avg}=require('./metrics');const T=require('./songs_test');
const [, , eng,set,level,nCh,seeds,extra]=process.argv;
const E=loadEngine(path.resolve(eng));Object.keys(T).forEach(id=>addSong(E,id,T[id]));
const SETS={swing:['form-rhythm','form-jazzblues','form-minorblues','pd-i-got-rhythm','pd-honeysuckle-rose','pd-tea-for-two','pd-it-had-to-be-you','p251','t-minor','t-dense'],std:['form-rhythm','pd-honeysuckle-rose','pd-tea-for-two','pd-it-had-to-be-you','t-minor'],blues:['form-jazzblues','form-minorblues','blues12'],ballad:['t-ballad'],latin:['t-calypso'],bossa:['t-bossa'],funk:['t-funk'],modal:['t-modal'],shuffle:['t-shuffle'],waltz:['t-waltz','t-five']};
const list=[];const ex=extra?JSON.parse(extra):{};
for(const id of SETS[set||'swing'])for(let s=1;s<=+(seeds||6);s++)list.push(genChoruses(E,id,{seed:s*101+7,level:+(level||5),nCh:+(nCh||4),inst:process.env.INST||'wind',carry:process.env.CARRY!=='0',extra:ex,feel:ex.feel}));
const M=metrics(E,list);
console.log(`${path.basename(eng)} ${set} L${level} ${extra||''}\n  정박CT ${pct(M.onCT,M.on)} (2·4박 ${pct(M.beat24CT,M.beat24)}) · 밖 ${pct(M.out,M.n)} · 반복 ${pct(M.rep,M.ivN)} · 왕복 ${pct(M.osc,M.oscN)} · 맴돌기 ${pct(M.narrow,M.narrowN)} · 런 ${avg(M.runs).toFixed(2)} · 도약메움 ${pct(M.leapFilled,M.leapN)} · 반음 ${pct(M.iv[11]+M.iv[13],M.ivN)} · 4·5도 ${pct([5,6,7].reduce((a,d)=>a+M.iv[12+d]+M.iv[12-d],0),M.ivN)} · 끊김 ${M.unresolved}/${M.unresolvedN} · 이음매>7 ${pct(M.seamIv.filter(x=>Math.abs(x)>7).length,M.seamIv.length)} · 8분 ${pct(M.eighth,M.n)} · 셋잇단 ${pct(M.trip,M.n)} · 쉼 ${pct(M.restTicks,M.totTicks)} · 음/마디 ${Object.keys(M.densByChorus).map(c=>avg(M.densByChorus[c]).toFixed(2)).join('·')}`);
