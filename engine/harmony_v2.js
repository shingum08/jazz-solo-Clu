/* ── Harmony V2 (v0.62) — 기존 analyzeHarmony() 결과 위에 앞뒤 문맥을 더한 「병렬」 분석 ─────────────────
   GPT 설계서(Module A)의 첫 단계: 생성에는 아직 쓰지 않고, 기존 분석과 나란히 비교한다(tools/harmony_v2_compare.js).
   · 입력: analyzeHarmony(bars,keyPc,bpb)의 구간 배열(같은 코드가 이어지면 한 구간, dur = 틱). 기존 결과는 바꾸지 않는다.
   · 출력(구간마다): {i, sym, key:{pc,mode}, fn:'tonic'|'predominant'|'dominant'|'passing'|'modal'|'unknown', deg(로마 숫자),
       res:'authentic'|'deceptive'|'backdoor'|'tritone'|'chromatic'|'secondary'|'none', conf(0~1), gt:[{from,to,step}](3·7음 → 다음 코드 가이드톤),
       legacy(기존 fn 문자열), legacyCat(기존 fn을 같은 갈래로 옮긴 것)}
   · 판단이 불확실하면 fn='unknown'·conf<0.45 — 그때는 기존 결과를 쓴다(fallback)
   · DOM·난수 없음(엔진 원칙 1·2). TYPE_CLS·mod12·chordSymbol 은 engine_core.js 것을 쓴다 */
'use strict';
const HV2={ROMAN:['Ⅰ','♭Ⅱ','Ⅱ','♭Ⅲ','Ⅲ','Ⅳ','♯Ⅳ','Ⅴ','♭Ⅵ','Ⅵ','♭Ⅶ','Ⅶ'],LOW_CONF:0.45,MODAL_TPB:8};   /* MODAL_TPB: 이 마디 수 넘게 한 코드면 모달로 본다 */

/* 기존 fn 문자열 → 같은 갈래 */
function hv2LegacyCat(fn){
  if(!fn)return 'unknown';
  if(/^Ⅱ$|ⅱø|Ⅳ\(리디안\)/.test(fn))return 'predominant';
  if(/Ⅴ|트라이톤|도미넌트|얼터드/.test(fn))return 'dominant';
  if(/Ⅰ|토닉|ⅰ/.test(fn))return 'tonic';
  if(/경과 디미니시/.test(fn))return 'passing';
  return 'unknown';
}
/* 3음·7음(가이드톤) 음높이 종류 */
function hv2Guides(sg){const c=TYPE_CLS[sg.type]||'dom',iv=CHORD_TYPES[sg.type].iv;
  const g=iv.filter(x=>x===3||x===4||x===10||x===11||((sg.type==='6'||sg.type==='m6'||sg.type==='dim7')&&x===9));
  return (g.length?g:iv.slice(1,3)).map(x=>mod12(sg.root+x))}
/* 가이드톤 잇기 — 이 코드의 3·7음에서 다음 코드 가이드톤까지 가장 가까운 길(반음 수, 부호 = 방향) */
function hv2GuidePath(a,b){
  if(!b)return [];
  const A=hv2Guides(a),B=hv2Guides(b);
  return A.map(f=>{let best=null;for(const t of B){let st=mod12(t-f);if(st>6)st-=12;if(!best||Math.abs(st)<Math.abs(best.step))best={from:f,to:t,step:st}}return best});
}
/* 지역 조(키 센터) — Ⅱ-Ⅴ-Ⅰ·Ⅴ-Ⅰ·Ⅱ-Ⅴ를 찾아 그 구간의 조를 정하고, 나머지는 가까운 종지의 조(없으면 곡의 조) */
function hv2KeyCenters(S,keyPc,songMinor){
  const n=S.length,key=new Array(n).fill(null),cls=k=>TYPE_CLS[S[k].type]||'dom',isDom=k=>/^dom/.test(cls(k));
  const set=(k,pc,mode,w)=>{if(k>=0&&k<n&&(!key[k]||key[k].w<w))key[k]={pc:mod12(pc),mode,w}};
  for(let k=0;k+1<n;k++){
    const a=S[k],b=S[k+1],c=S[k+2];
    if(isDom(k)&&mod12(b.root-a.root)===5&&(cls(k+1)==='maj'||cls(k+1)==='min')){   /* Ⅴ→Ⅰ */
      const mode=cls(k+1)==='min'?'minor':'major';set(k,b.root,mode,2);set(k+1,b.root,mode,2);
      if(k>0&&(cls(k-1)==='min'||cls(k-1)==='hdim')&&mod12(a.root-S[k-1].root)===5)set(k-1,b.root,mode,3);   /* Ⅱ-Ⅴ-Ⅰ */
    }else if(isDom(k)&&mod12(b.root-a.root)===2&&cls(k+1)==='maj'){   /* 백도어 ♭Ⅶ7 → Ⅰ (앞이 Ⅳm이면 함께) */
      set(k,b.root,'major',2);set(k+1,b.root,'major',2);
      if(k>0&&cls(k-1)==='min'&&mod12(a.root-S[k-1].root)===5)set(k-1,b.root,'major',3);
    }else if((cls(k)==='min'||cls(k)==='hdim')&&isDom(k+1)&&mod12(b.root-a.root)===5){   /* Ⅱ-Ⅴ (해결 없음) */
      const mode=cls(k)==='hdim'?'minor':'major',pc=b.root+5;set(k,pc,mode,1);set(k+1,pc,mode,1);
      if(c&&mod12(c.root-b.root)===5)set(k+2,pc,mode,1);
    }
  }
  /* 빈 곳: 앞뒤로 가까운 조 → 곡의 조 */
  /* 곡의 조 으뜸화음은 곡의 조로(종지 사이에 끼어 있어도) */
  for(let k=0;k<n;k++)if(!key[k]&&mod12(S[k].root-keyPc)===0&&(cls(k)==='maj'&&!songMinor||cls(k)==='min'&&songMinor))key[k]={pc:keyPc,mode:songMinor?'minor':'major',w:1};
  for(let k=0;k<n;k++)if(!key[k]){let L=null,R=null;for(let j=k-1;j>=0;j--)if(key[j]){L={k:j,v:key[j]};break}for(let j=k+1;j<n;j++)if(key[j]){R={k:j,v:key[j]};break}
    const pick=L&&R?(k-L.k<=R.k-k?L.v:R.v):(L||R||{v:{pc:keyPc,mode:songMinor?'minor':'major',w:0}}).v;key[k]={pc:pick.pc,mode:pick.mode,w:0}}
  return key;
}
function analyzeHarmonyV2(segs,keyPc,opts){
  opts=opts||{};const wrap=opts.wrap!==false,bpb=opts.bpb||4,TPB=bpb*6,songMinor=!!opts.minor;
  const S=segs,n=S.length,keys=hv2KeyCenters(S,keyPc,songMinor);
  const nextOf=k=>k+1<n?S[k+1]:(wrap&&n>1?S[0]:null),prevOf=k=>k>0?S[k-1]:(wrap&&n>1?S[n-1]:null);
  return S.map((sg,k)=>{
    const nx=nextOf(k),pv=prevOf(k),c=TYPE_CLS[sg.type]||'dom',K=keys[k],deg=mod12(sg.root-K.pc);
    const toNx=nx?mod12(nx.root-sg.root):null,nxCls=nx?(TYPE_CLS[nx.type]||'dom'):null,isDom=/^dom/.test(c);
    let fn='unknown',res='none',conf=0.4;
    if(isDom){
      fn='dominant';
      if(toNx===5&&(nxCls==='maj'||nxCls==='min')){res=mod12(nx.root-K.pc)===0?'authentic':'secondary';conf=0.9}
      else if(toNx===5&&/^dom/.test(nxCls)){res='secondary';conf=0.75}   /* 도미넌트 사슬(Ⅵ7-Ⅱ7-Ⅴ7…) */
      else if(toNx===11){   /* 반음 아래로 — 트라이톤 대리인가, 반음씩 내려가는 경과 사슬인가 */
        const nn=k+2<n?S[k+2]:(wrap?S[(k+2)%n]:null),chain=/^dom/.test(nxCls)&&nn&&mod12(nn.root-nx.root)===11&&/^dom/.test(TYPE_CLS[nn.type]||'');
        const pvChain=pv&&/^dom/.test(TYPE_CLS[pv.type]||'')&&mod12(sg.root-pv.root)===11;
        if(chain||pvChain&&/^dom/.test(nxCls)){res='chromatic';fn='passing';conf=0.5}
        else if(nxCls==='maj'||nxCls==='min'){res='tritone';conf=0.8}
        else{res='chromatic';conf=0.45}
      }
      else if(toNx===2&&nxCls==='maj'){res='backdoor';conf=mod12(nx.root-K.pc)===0?0.75:0.55}   /* ♭Ⅶ7 → Ⅰ */
      else if(toNx===2&&nxCls==='min'){res='deceptive';conf=0.65}   /* Ⅴ → Ⅵm */
      else{res='none';conf=sg.dur>=TPB*2?0.6:0.45}   /* 해결 없는 도미넌트(블루스·정지) */
    }else if(c==='maj'){
      if(deg===0){fn='tonic';conf=0.85}else if(deg===5||deg===8){fn='predominant';conf=0.7}else{fn='unknown';conf=0.4}
    }else if(c==='min'){
      if(toNx===5&&nx&&/^dom/.test(nxCls)){fn='predominant';conf=0.9}
      else if(deg===0&&K.mode==='minor'){fn='tonic';conf=0.85}
      else if(deg===9||deg===4){fn='tonic';conf=0.55}   /* Ⅵm·Ⅲm — 토닉 대리 */
      else if(deg===5){fn='predominant';conf=0.6}
      else{fn='unknown';conf=0.4}
    }else if(c==='hdim'){fn=toNx===5?'predominant':'unknown';conf=toNx===5?0.85:0.4}
    else if(c==='dim'){   /* 감7은 대칭 — 네 음 중 어느 것에서든 반음 위·아래로 가거나, 다음 코드 뿌리가 감7 안의 음이면(공통음 감7) 경과 */
      const pass=nx&&([0,3,6,9].some(o=>{const d=mod12(nx.root-sg.root-o);return d===1||d===11})||[0,3,6,9].includes(toNx));   /* 반음 진행 또는 공통음 감7(다음 뿌리가 감7 안의 음) */
      fn=pass?'passing':'dominant';conf=pass?0.7:0.45}
    if(sg.dur>=TPB*HV2.MODAL_TPB&&res!=='authentic'){fn='modal';conf=0.6}
    return {i:k,bar:sg.bar,t0:sg.t0,dur:sg.dur,sym:chordSymbol(sg.root,sg.type),key:{pc:K.pc,mode:K.mode},deg:HV2.ROMAN[deg],fn,res,conf,
      gt:hv2GuidePath(sg,nx),legacy:sg.fn||'',legacyCat:hv2LegacyCat(sg.fn)};
  });
}
