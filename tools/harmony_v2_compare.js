/* v0.62 Harmony V2 ↔ 기존 analyzeHarmony 나란히 비교 — 전곡(264곡). 생성에는 아직 V2를 쓰지 않는다.
   보고: 기능 갈래 일치율 · 해결 유형 분포 · 확신 분포 · 곡마다 지역 조가 바뀌는 수 · 서로 다르게 본 사례(갈래 쌍별 수와 예)
   사용: node tools/harmony_v2_compare.js [--md 파일]   (--md 를 주면 마크다운 표로도 쓴다) */
const {loadEngine}=require('./lib_load');const E=loadEngine();const fs=require('fs');
let segN=0,agree=0,cmpN=0;const res={},fnV2={},conf=[0,0,0,0,0],pairs={},ex={},keyCh=[];
for(const id of Object.keys(E.SONGDB)){const s=E.SONGDB[id];
  const segs=E.analyzeHarmony(E.barChords(s,s.key),s.key,s.bpb||4);
  const minor=/m/.test(String(s.c||''))&&false;
  const v2=E.analyzeHarmonyV2(segs,s.key,{bpb:s.bpb||4});
  let kc=0;v2.forEach((x,k)=>{segN++;res[x.res]=(res[x.res]||0)+1;fnV2[x.fn]=(fnV2[x.fn]||0)+1;conf[Math.min(4,Math.floor(x.conf*5))]++;
    if(k&&(x.key.pc!==v2[k-1].key.pc||x.key.mode!==v2[k-1].key.mode))kc++;
    if(x.legacyCat!=='unknown'&&x.fn!=='unknown'){cmpN++;if(x.legacyCat===x.fn)agree++;else{const p=x.legacyCat+' → '+x.fn;pairs[p]=(pairs[p]||0)+1;(ex[p]=ex[p]||[]).length<3&&ex[p].push((s.name||id)+' '+(x.bar+1)+'마디 '+x.sym+' (기존 「'+x.legacy+'」, V2 '+x.deg+' '+x.res+')')}}});
  keyCh.push(kc)}
keyCh.sort((a,b)=>a-b);
const pct=(a,b)=>(a/b*100).toFixed(1)+'%';
const out=[];
out.push('# Harmony V2 ↔ 기존 분석 비교 (곡 '+Object.keys(E.SONGDB).length+'개 · 구간 '+segN+'개)','');
out.push('- 기능 갈래 일치: **'+pct(agree,cmpN)+'** (둘 다 판단한 구간 '+cmpN+'개)');
out.push('- V2 기능 분포: '+Object.entries(fnV2).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+pct(v,segN)).join(' · '));
out.push('- 해결 유형: '+Object.entries(res).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+v).join(' · '));
out.push('- 확신 분포(0~0.2·…·0.8~1): '+conf.map(v=>pct(v,segN)).join(' · ')+' — 0.45 아래는 기존 결과를 쓴다');
out.push('- 곡마다 지역 조가 바뀌는 수(중앙값·90%): '+keyCh[keyCh.length>>1]+' · '+keyCh[Math.floor(keyCh.length*0.9)],'');
out.push('## 서로 다르게 본 사례 (많은 순)','','| 기존 → V2 | 수 | 예 |','|---|---:|---|');
Object.entries(pairs).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([p,v])=>out.push('| '+p+' | '+v+' | '+ex[p].join('<br>')+' |'));
const txt=out.join('\n');console.log(txt);
const mi=process.argv.indexOf('--md');if(mi>0)fs.writeFileSync(process.argv[mi+1],txt+'\n');
