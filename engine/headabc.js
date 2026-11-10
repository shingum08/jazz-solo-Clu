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
