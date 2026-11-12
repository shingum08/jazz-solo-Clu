/* v0.28 헤드 멜로디(ABC) 파서 + 모티프 조각 추출 — 사용자가 직접 입력한 헤드만 다룬다(앱에 원곡 멜로디는 수록하지 않음).
   지원: X/T/M/L/K 헤더, 음표(A–G a–g, ^ _ =, , '), 길이(2 /2 3/2 …), 쉼표(z), 마디선(|), 붙임줄(-).
   미지원(무시/중단): 화음 [..], 셋잇단 (3, 장식음 {}, 가사. 지원 못 한 음이 있으면 그 지점에서 조각을 끊는다. */
const _KEY_SIG={C:0,G:1,D:2,A:3,E:4,B:5,'F#':6,'C#':7,F:-1,Bb:-2,Eb:-3,Ab:-4,Db:-5,Gb:-6,Cb:-7};
const _SHARP_ORDER=['F','C','G','D','A','E','B'],_FLAT_ORDER=['B','E','A','D','G','C','F'];
function _keyAccidentals(k){
  k=(k||'C').replace(/\s+/g,'');
  let m=k.match(/^([A-G][b#]?)(m|min|minor|maj|major|dor|mix|lyd|phr|loc)?/i);
  if(!m)return {};
  let tonic=m[1][0].toUpperCase()+(m[1][1]||''),mode=(m[2]||'').toLowerCase();
  let n=_KEY_SIG[tonic];if(n===undefined)return {};
  const shift={m:-3,min:-3,minor:-3,dor:-2,phr:-4,lyd:1,mix:-1,loc:-5}[mode]||0;
  n+=shift;
  const acc={};
  if(n>0)for(let i=0;i<Math.min(7,n);i++)acc[_SHARP_ORDER[i]]=1;
  if(n<0)for(let i=0;i<Math.min(7,-n);i++)acc[_FLAT_ORDER[i]]=-1;
  return acc;
}
function parseHeadAbc(text){
  const out={notes:[],bpb:4,errors:[],bars:0};
  if(!text||!String(text).trim())return out;
  let L=1/8,M=[4,4],K='C',body=[];
  for(const raw of String(text).split(/\r?\n/)){
    const line=raw.replace(/%.*$/,'').trim();if(!line)continue;
    const h=line.match(/^([A-Za-z]):\s*(.*)$/);
    if(h&&line.length>1&&line[1]===':'){
      const f=h[1],v=h[2].trim();
      if(f==='L'){const q=v.match(/^(\d+)\/(\d+)$/);if(q)L=+q[1]/+q[2]}
      else if(f==='M'){if(v==='C')M=[4,4];else if(v==='C|')M=[2,2];else{const q=v.match(/^(\d+)\/(\d+)$/);if(q)M=[+q[1],+q[2]]}}
      else if(f==='K')K=v.split(/\s+/)[0]||'C';
      continue;
    }
    body.push(line);
  }
  out.bpb=Math.max(1,Math.round(M[0]*4/M[1]));
  const keyAcc=_keyAccidentals(K),ticksPer=L*4*6;   /* 4분음표 = 6틱 */
  const s=body.join(' ');
  let i=0,t=0,bar=0,barAcc={},pendingTie=false,last=null;
  const NAT={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  const skipTrip=()=>{};
  while(i<s.length){
    const ch=s[i];
    if(ch==='|'||ch===':'){ if(ch==='|'){barAcc={};}i++;continue}
    if(/\s/.test(ch)||ch==='['&&s[i+1]==='|'||ch===']'||ch==='-'&&false){i++;continue}
    if(ch==='('){ /* 셋잇단 (3 → 이 구간 지원 안 함 */
      out.errors.push('셋잇단 미지원 @'+i);
      if(last)last.brk=true;
      const m=s.slice(i).match(/^\(\d/);i+=m?2:1;
      /* 셋잇단 음표 3개를 건너뛰되 시간은 2박자 분량(L 기준)으로 가정하지 않고 끊는다 */
      let skip=3;while(skip>0&&i<s.length){if(/[A-Ga-gz]/.test(s[i])){skip--}i++;while(i<s.length&&/[\d\/,'^_=]/.test(s[i]))i++}
      t=Math.round(t);continue;
    }
    if(ch==='['){ /* 화음 → 첫 음만 받지 않고 건너뜀 */
      const j=s.indexOf(']',i);out.errors.push('화음 미지원 @'+i);if(last)last.brk=true;i=j<0?s.length:j+1;
      while(i<s.length&&/[\d\/]/.test(s[i]))i++;continue;
    }
    if(ch==='{'){const j=s.indexOf('}',i);i=j<0?s.length:j+1;continue}
    if(ch==='"'){const j=s.indexOf('"',i+1);i=j<0?s.length:j+1;continue}
    if(ch==='!'||ch==='+'){const j=s.indexOf(ch,i+1);i=j<0?s.length:j+1;continue}
    if(ch==='>'||ch==='<'){i++;if(last)last.brk=true;continue}
    let acc=null;
    if(ch==='^'||ch==='_'||ch==='='){let a=0;while(s[i]==='^'||s[i]==='_'||s[i]==='='){if(s[i]==='^')a++;else if(s[i]==='_')a--;else a=0;i++}acc=(s[i-1]==='=')?0:a}
    const nc=s[i];
    if(!nc||!/[A-Ga-gz]/.test(nc)){i++;continue}
    i++;
    let oct=0;while(s[i]==="'"||s[i]===','){oct+=s[i]==="'"?1:-1;i++}
    let num='',den='',slash=false;
    while(i<s.length&&/\d/.test(s[i]))num+=s[i++];
    while(i<s.length&&s[i]==='/'){slash=true;i++;let dd='';while(i<s.length&&/\d/.test(s[i]))dd+=s[i++];den=dd||(den?String(2*+den):'2');}
    let mult=num?+num:1;if(slash)mult=mult/(den?+den:2);
    const d=mult*ticksPer;
    const isTie=s[i]==='-';if(isTie)i++;
    if(nc==='z'||nc==='Z'){
      if(last)last.brk=true;
      t+=d;continue;
    }
    const up=nc===nc.toLowerCase(),L0=nc.toUpperCase();
    let a=acc!==null?acc:(barAcc[L0+oct+(up?'u':'l')]!==undefined?barAcc[L0+oct+(up?'u':'l')]:(keyAcc[L0]||0));
    if(acc!==null)barAcc[L0+oct+(up?'u':'l')]=acc;
    const midi=12*(up?6:5)+NAT[L0]+a+12*oct;
    if(pendingTie&&last&&last.midi===midi){last.d+=d;pendingTie=isTie;t+=d;continue}
    const n={t:Math.round(t*100)/100,d:Math.round(d*100)/100,midi};
    out.notes.push(n);last=n;pendingTie=isTie;t+=d;
  }
  for(const n of out.notes)if(!Number.isInteger(n.t)||!Number.isInteger(n.d)){out.errors.push('정수 틱이 아닌 음 (16분 이하·잇단 길이)');break}
  out.bars=Math.ceil(t/(out.bpb*6));
  return out;
}
/* 파싱된 헤드 → 모티프 조각 [{off:[0,..],d:[..],bar}] — 음높이는 첫 음 기준 상대값, 길이는 틱.
   쉼표·미지원 구간에서 끊고, 3~5음을 잘라 쓴다. 쓸 수 있는 길이는 8분(3)~2분(12) 정수 틱만. */
function headFragments(parsed,maxFrag){
  const out=[],ns=parsed&&parsed.notes||[];
  let run=[];
  const flush=()=>{
    const ok=n=>[3,6,9,12].includes(n.d);
    /* 연속 음 중 길이가 쓸 수 있는 구간만 */
    let seg=[];
    const emit=()=>{
      for(const len of [4,3,5]){
        for(let s0=0;s0+len<=seg.length;s0+=2){
          const f=seg.slice(s0,s0+len);
          if(new Set(f.map(n=>n.midi)).size<2)continue;       /* 한 음만 반복하는 조각은 제외 */
          out.push({off:f.map(n=>n.midi-f[0].midi),d:f.map(n=>n.d),bar:Math.floor(f[0].t/(parsed.bpb*6))});
        }
      }
      seg=[];
    };
    for(const n of run){if(ok(n))seg.push(n);else emit()}
    emit();run=[];
  };
  for(let k=0;k<ns.length;k++){
    const n=ns[k],nx=ns[k+1];
    run.push(n);
    if(n.brk||!nx||nx.t!==n.t+n.d)flush();
  }
  flush();
  /* 중복 제거 + 상한 */
  const seen=new Set(),res=[];
  for(const f of out){const key=f.off.join(',')+'|'+f.d.join(',');if(seen.has(key))continue;seen.add(key);res.push(f)}
  return res.slice(0,maxFrag||24);
}

/* ── v0.46 헤드 연주 — 불러온(또는 직접 입력한) 헤드 멜로디를 첫(·마지막) 코러스에 그대로 싣는다 ─────────────
   앱이 멜로디를 지어내지 않는다: 헤드 음이 있는 마디는 입력 그대로, 음이 없는 마디만 일반 솔로 생성을 따른다.
   틱 그리드(8분음표 = 3틱)에 맞춘다: 한 박 안에 0·2·4틱에서 시작하는 2틱 음 셋이면 셋잇단(trip), 나머지는 8분 격자로 반올림.
   반환: {마디번호: [{t,d,midi,tie?,trip?}] (합 = 박 × 6)} — 음이 하나도 없는 마디는 빠진다 */
const HEAD_GRID=3;
function headLockBars(notes,nb,bpb){
  const T=(bpb||4)*6,out={};
  if(!notes||!notes.length)return out;
  const ns=notes.filter(n=>n.midi!==null&&n.d>0).map(n=>({t:n.t,e:n.t+n.d,midi:n.midi})).sort((a,b)=>a.t-b.t);
  /* 셋잇단 박: 박 시작 B에 B·B+2·B+4 시작 음이 있고 앞의 둘이 2틱 */
  const tripBeat=new Set();
  for(let k=0;k+2<ns.length;k++){const a=ns[k],b=ns[k+1],c=ns[k+2];
    if(a.t%6===0&&b.t===a.t+2&&c.t===a.t+4&&a.e===b.t&&b.e===c.t)tripBeat.add(a.t)}
  const inTrip=t=>tripBeat.has(t-t%6);
  const q=[];
  for(const n of ns){
    let s,e;
    if(inTrip(n.t)){s=n.t;e=n.e;if(!inTrip(e)&&e%6!==0)e=Math.round(e/HEAD_GRID)*HEAD_GRID}
    else{s=Math.round(n.t/HEAD_GRID)*HEAD_GRID;e=inTrip(n.e)?n.e:Math.round(n.e/HEAD_GRID)*HEAD_GRID}
    if(e<=s)e=s+(inTrip(s)?2:HEAD_GRID);
    const p=q[q.length-1];
    if(p&&s<p.e){if(s<=p.s)continue;p.e=s}   /* 겹치면 앞 음을 줄인다(같은 자리 둘째 음은 버림) */
    q.push({s,e,midi:n.midi});
  }
  /* 마디 안 칸: 셋잇단 박은 2틱 칸 셋, 나머지 박은 3틱 칸 둘. 칸마다 울리는 음(또는 쉼)을 정해 이어 붙인다 */
  for(let b=0;b<nb;b++){
    const a=b*T,z=a+T;
    if(!q.some(n=>n.s<z&&n.e>a))continue;
    const slots=[];
    for(let bt=a;bt<z;bt+=6){if(tripBeat.has(bt))[0,2,4].forEach(o=>slots.push({t:bt+o,d:2,trip:true}));else[0,3].forEach(o=>slots.push({t:bt+o,d:3}))}
    const bar=[];
    slots.forEach(sl=>{
      const n=q.find(x=>x.s<=sl.t&&x.e>sl.t)||null;
      const prev=bar[bar.length-1],same=prev&&prev._n===n;
      if(same&&!sl.trip&&!prev.trip){prev.d+=sl.d;return}             /* 같은 음·같은 격자면 길이만 늘림 */
      if(same&&n===null&&!sl.trip&&!prev.trip){prev.d+=sl.d;return}
      const o={t:sl.t-a,d:sl.d,midi:n?n.midi:null,_n:n};if(sl.trip)o.trip=true;
      if(same&&n)prev.tie=true;                                         /* 셋잇단 경계를 넘는 같은 음은 붙임줄 */
      bar.push(o);
    });
    if(!bar.some(x=>x.midi!==null))continue;
    /* 마디를 넘어가는 음: 다음 마디 첫 칸이 같은 음이면 붙임줄 */
    const last=bar[bar.length-1];
    if(last._n&&last._n.e>z)last.tie=true;
    bar.forEach(x=>delete x._n);
    out[b]=bar;
  }
  return out;
}
/* 생성한 솔로에 헤드 마디를 끼운다. 헤드는 적힌 옥타브를 지키고, 악기 음역 rg=[낮은,높은]을 많이 벗어날 때만 옥타브를 옮긴다(조는 곡 원조 그대로) */
function spliceHeadBars(solo,lock,rg){
  const T=(solo.bpb||4)*6,ks=Object.keys(lock||{}).map(Number).filter(b=>b>=0&&b<solo.bars.length);
  if(!ks.length)return solo;
  const hs=ks.flatMap(b=>lock[b].filter(n=>n.midi!==null).map(n=>n.midi)),R=rg||[52,86];
  let sh=0,bestOut=1e9;
  [0,-12,12,-24,24].forEach(o=>{const out=hs.filter(m=>m+o<R[0]||m+o>R[1]).length;if(out<bestOut){bestOut=out;sh=o}});
  ks.forEach(b=>{
    const ns=lock[b];if(ns.reduce((s,n)=>s+n.d,0)!==T)return;
    solo.bars[b].notes=ns.map(n=>Object.assign({},n,n.midi===null?{}:{midi:n.midi+sh}));
    solo.bars[b].head=true;solo.bars[b].tags=['헤드'];
  });
  /* 이음매: 붙임줄은 다음 마디 첫 음이 같은 음일 때만 */
  for(let b=0;b<solo.bars.length;b++){
    const ns=solo.bars[b].notes,last=ns[ns.length-1],nx=solo.bars[b+1];
    if(last&&last.tie&&(!nx||nx.notes[0].midi===null||nx.notes[0].midi!==last.midi))delete last.tie;
  }
  solo.head=true;
  return solo;
}
