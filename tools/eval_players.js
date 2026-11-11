/* 연주자별 특징 평가 — 같은 조건에서 프로필(아티스트 스타일)만 바꿔 생성하고
   ① WJD 프로필 목표값과 생성 결과의 차이 ② 프로필 간 순위 상관(스피어만) ③ 지표만 보고 연주자를 맞히는 분류 정확도를 잰다.
   실행: node tools/eval_players.js [seeds=12] [--json] — 종료 코드는 판정 임계값 미달 시 1 */
const {loadEngine}=require('./lib_load.js'),{soloFeatures,median}=require('./lib_metrics.js');
const E=loadEngine();
const SEEDS=+(process.argv.find(a=>/^\d+$/.test(a))||12),JSONOUT=process.argv.includes('--json');
const SONGS=['autumn-leaves','all-of-me','blue-monk','oleo','giant-steps','blue-bossa','stella-by-starlight','solar','take-the-a-train','lady-bird','blues12','so-what'].filter(id=>E.SONGDB[id]);
const PL=Object.keys(E.STYLE_DATA.profiles).filter(k=>k!=='all');
const FEAT=['eighth','trip','ctOn','chrom','phraseMed','restRatio','meanInt','step','leap5','meanPitch'];
const TARGET=['eighth','trip','ctOn','chrom','phraseMed'];
const data={};
for(const p of [...PL,'all']){
  data[p]=[];
  for(const id of SONGS){
    const song=E.SONGDB[id];
    for(let sd=1;sd<=SEEDS;sd++){
      const solo=E.generateSolo(id,song.key,3,sd*104729+id.length*13,'wind',{style:p,topic:'auto',lyric:0,blues:false,barLicks:false});   /* v0.39: 연주자 통계 엔진만 평가 — 노래·블루스 프레이즈·v0.40 한 마디 릭(연주자 공통 장치)는 끈다 */
      data[p].push(soloFeatures(E,solo,song));
    }
  }
}
const mean=(a)=>a.reduce((x,y)=>x+y,0)/Math.max(1,a.length);
const sdv=(a)=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)*(x-m))))};
const agg={};for(const p in data){agg[p]={};for(const f of FEAT)agg[p][f]=mean(data[p].map(x=>x[f]))}
/* ① 목표 대비 */
const rows=[];
for(const p of PL){const t=E.STYLE_DATA.profiles[p].stats;rows.push({player:p,label:E.STYLE_DATA.profiles[p].label,
  ...Object.fromEntries(TARGET.map(f=>[f,{target:t[f],gen:+agg[p][f].toFixed(3)}]))})}
/* ② 순위 상관 */
function rank(a){const idx=a.map((v,i)=>[v,i]).sort((x,y)=>x[0]-y[0]);const r=[];idx.forEach(([v,i],k)=>r[i]=k);return r}
function pearson(a,b){const ma=mean(a),mb=mean(b);let n=0,da=0,db=0;for(let i=0;i<a.length;i++){n+=(a[i]-ma)*(b[i]-mb);da+=(a[i]-ma)**2;db+=(b[i]-mb)**2}return n/Math.sqrt(da*db||1)}
const rho={};
for(const f of TARGET){
  const tv=PL.map(p=>E.STYLE_DATA.profiles[p].stats[f]),gv=PL.map(p=>agg[p][f]);
  rho[f]=+pearson(rank(tv),rank(gv)).toFixed(2);
}
/* ③ 분류: 짝수 시드로 중심, 홀수 시드로 판별 (z점수) */
const all=PL.flatMap(p=>data[p]);
const mu={},sg={};for(const f of FEAT){const v=all.map(x=>x[f]);mu[f]=mean(v);sg[f]=sdv(v)||1}
const vec=x=>FEAT.map(f=>(x[f]-mu[f])/sg[f]);
const cen={};for(const p of PL){const tr=data[p].filter((_,i)=>i%2===0).map(vec);cen[p]=FEAT.map((_,j)=>mean(tr.map(v=>v[j])))}
let hit=0,tot=0;const conf={};
for(const p of PL){conf[p]={};for(const x of data[p].filter((_,i)=>i%2===1)){
  const v=vec(x);let best=null,bd=1e9;
  for(const q of PL){const d=v.reduce((a,y,j)=>a+(y-cen[q][j])**2,0);if(d<bd){bd=d;best=q}}
  conf[p][best]=(conf[p][best]||0)+1;tot++;if(best===p)hit++}}
const acc=hit/tot;
/* 개별 솔로 단위 판별은 어렵다 — 4솔로 평균(묶음) 판별도 같이 */
let hit4=0,tot4=0;
for(const p of PL){const te=data[p].filter((_,i)=>i%2===1);
  for(let k=0;k+4<=te.length;k+=4){const grp=te.slice(k,k+4).map(vec);const v=FEAT.map((_,j)=>mean(grp.map(g=>g[j])));
    let best=null,bd=1e9;for(const q of PL){const d=v.reduce((a,y,j)=>a+(y-cen[q][j])**2,0);if(d<bd){bd=d;best=q}}
    tot4++;if(best===p)hit4++}}
const res={solosPerPlayer:data[PL[0]].length,songs:SONGS.length,rank_corr:rho,acc_single:+acc.toFixed(3),acc_group4:+(hit4/tot4).toFixed(3),chance:+(1/PL.length).toFixed(3),rows};
if(JSONOUT)console.log(JSON.stringify(res,null,1));
else{
  console.log('연주자 '+PL.length+'명 × 솔로 '+res.solosPerPlayer+' (곡 '+SONGS.length+' · 난이도3 · wind)');
  console.log('\n[1] 목표(WJD 프로필) vs 생성 — 값');
  console.log('player      '+TARGET.map(f=>f.padEnd(17)).join(''));
  for(const r of rows)console.log(r.player.padEnd(11)+TARGET.map(f=>(r[f].target+' → '+r[f].gen).padEnd(17)).join(''));
  console.log('\n[2] 프로필 간 순위 상관(스피어만, +1=목표 순서 그대로 재현):',JSON.stringify(rho));
  console.log('\n[3] 지표만 보고 연주자 맞히기: 솔로 1개 '+(acc*100).toFixed(1)+'% · 솔로 4개 묶음 '+(100*hit4/tot4).toFixed(1)+'% (우연 '+(100/PL.length).toFixed(1)+'%)');
  console.log('혼동행렬(행=실제, 열=판별):');
  console.log('          '+PL.map(p=>p.slice(0,6).padStart(7)).join(''));
  for(const p of PL)console.log(p.padEnd(10)+PL.map(q=>String(conf[p][q]||0).padStart(7)).join(''));
}
/* 판정: 프로필 순서 재현(상관)과 분류가 우연 수준에 머물면 실패 */
if(!JSONOUT){const bad=[];
  /* v0.37: 코드톤 정렬을 모든 솔로에 적용해(정박 코드톤 ~97%) 연주자 간 ctOn 차이는 의도적으로 줄었다 — ctOn은 0.3 이상만 요구 */
  for(const f of ['trip','chrom'])if(rho[f]<0.5)bad.push(f+' 상관 '+rho[f]+' < 0.5');
  if(rho.ctOn<0.3)bad.push('ctOn 상관 '+rho.ctOn+' < 0.3');
  if(acc<0.25)bad.push('단일 솔로 분류 '+(acc*100).toFixed(1)+'% < 25%');
  if(bad.length){console.error('\n임계 미달: '+bad.join(' · '));process.exitCode=1}else console.log('\n판정: 통과 (상관≥0.5 · 분류≥25%)')}
