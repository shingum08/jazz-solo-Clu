/* ── 곡 불러오기 v0.42(v0.44 보강) — MusicXML(.musicxml/.xml/.mxl) · iReal Pro 링크 → 앱 곡 데이터 ─────────────
   사용자가 「자기 기기에서」 연 파일만 읽는다. 결과는 그 기기의 「내 곡」에만 저장되고 어디로도 보내지 않는다.
   DOM 없이 Node에서도 돈다(작은 XML 파서 · DecompressionStream으로 .mxl 압축 해제).
   결과 형식: {song:{n,c,k,bpm,m,f:[섹션,프레이즈],ch}, head:{notes:[{t,d,midi}],bpb}|null, warn:[..]}
   v0.44: D.S.·D.C.·코다·Fine 펼치기 · 형식(AABA 등) 추정 · 여러 코러스 연주 악보는 한 코러스로 · 코드 없는 인트로 빼기 ·
          화음 맨 위 음 = 멜로디 · 이조 정보 없는 이조 악기 짐작 · 장·단조 짐작
   코드 표기는 앱 어휘(maj7·m7·7·m7b5·7b9·7#9·6·m6·9·m9·dim7·7sus4·mmaj7·7#11·maj7#11)로 단순화한다. */
'use strict';
const IMP_NOTE=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const imod=x=>((x%12)+12)%12;

/* ── 작은 XML 파서(요소·속성·텍스트·주석·CDATA·DOCTYPE) ── */
function xmlParse(src){
  const root={name:'#root',attrs:{},children:[],text:''},st=[root],n=src.length;let i=0;
  const ent=s=>s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(m,e)=>e[0]==='#'?String.fromCodePoint(/^#x/i.test(e)?parseInt(e.slice(2),16):+e.slice(1)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[e.toLowerCase()]);
  const tagEnd=p=>{let q=null;for(let k=p;k<n;k++){const c=src[k];if(q){if(c===q)q=null}else if(c==='"'||c==="'")q=c;else if(c==='>')return k}return n};
  while(i<n){
    const lt=src.indexOf('<',i);if(lt<0)break;
    if(lt>i){const t=src.slice(i,lt);if(t.trim())st[st.length-1].text+=ent(t)}
    if(src.startsWith('<!--',lt)){const e=src.indexOf('-->',lt);i=e<0?n:e+3;continue}
    if(src.startsWith('<![CDATA[',lt)){const e=src.indexOf(']]>',lt);st[st.length-1].text+=src.slice(lt+9,e<0?n:e);i=e<0?n:e+3;continue}
    if(src[lt+1]==='?'||src[lt+1]==='!'){
      let e=src.indexOf('>',lt);const b=src.indexOf('[',lt);
      if(src.startsWith('<!DOCTYPE',lt)&&b>=0&&b<e){const c=src.indexOf(']>',b);if(c>=0)e=c+1}
      i=e<0?n:e+1;continue;
    }
    const gt=tagEnd(lt+1),raw=src.slice(lt+1,gt).trim();i=gt+1;
    if(raw[0]==='/'){const nm=raw.slice(1).trim();for(let k=st.length-1;k>0;k--)if(st[k].name===nm){st.length=k;break}continue}
    const self=raw.endsWith('/'),body=self?raw.slice(0,-1):raw,m=body.match(/^[^\s/>]+/);if(!m)continue;
    const el={name:m[0],attrs:{},children:[],text:''};
    body.slice(m[0].length).replace(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,(_,k,a,b)=>{el.attrs[k]=ent(a!==undefined?a:b);return ''});
    st[st.length-1].children.push(el);if(!self)st.push(el);
  }
  return root;
}
const xkids=(e,nm)=>e?e.children.filter(c=>c.name===nm):[];
const xkid=(e,nm)=>e?e.children.find(c=>c.name===nm)||null:null;
const xtxt=(e,nm)=>{const k=xkid(e,nm);return k?k.text.trim():''};
function xfind(e,nm){if(!e)return null;for(const c of e.children){if(c.name===nm)return c;const r=xfind(c,nm);if(r)return r}return null}

/* ── .mxl(압축 MusicXML) — ZIP 중앙 디렉터리를 읽고 deflate는 DecompressionStream으로 푼다 ── */
async function unzipEntries(buf){
  const u8=new Uint8Array(buf),dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  let eocd=-1;for(let p=u8.length-22;p>=Math.max(0,u8.length-66000);p--)if(dv.getUint32(p,true)===0x06054b50){eocd=p;break}
  if(eocd<0)throw new Error('압축 파일(.mxl)을 읽지 못했어요');
  const cnt=dv.getUint16(eocd+10,true);let p=dv.getUint32(eocd+16,true);const out={};
  const dec=new TextDecoder('utf-8');
  for(let k=0;k<cnt;k++){
    if(dv.getUint32(p,true)!==0x02014b50)break;
    const meth=dv.getUint16(p+10,true),csz=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),xl=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),lo=dv.getUint32(p+42,true);
    const name=dec.decode(u8.subarray(p+46,p+46+nl));p+=46+nl+xl+cl;
    const ds=lo+30+dv.getUint16(lo+26,true)+dv.getUint16(lo+28,true),data=u8.subarray(ds,ds+csz);
    out[name]={meth,data};
  }
  const read=async nm=>{const e=out[nm];if(!e)return null;
    if(e.meth===0)return dec.decode(e.data);
    if(e.meth!==8)throw new Error('지원하지 않는 압축 방식');
    const s=new Blob([e.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return dec.decode(await new Response(s).arrayBuffer());};
  return {names:Object.keys(out),read};
}
async function mxlToXml(buf){
  const z=await unzipEntries(buf);
  const cont=await z.read('META-INF/container.xml');
  let main=null;if(cont){const r=xfind(xmlParse(cont),'rootfile');if(r)main=r.attrs['full-path']}
  if(!main)main=z.names.find(n=>/\.(xml|musicxml)$/i.test(n)&&!/^META-INF\//.test(n));
  const x=main&&await z.read(main);if(!x)throw new Error('압축 안에 악보(MusicXML)가 없어요');
  return x;
}

/* ── 코드 이름 → 앱 어휘 ── */
const MXL_KIND={major:'6','major-sixth':'6',minor:'m7','minor-seventh':'m7','minor-sixth':'m6','minor-ninth':'m9','minor-11th':'m7','minor-13th':'m9',
  dominant:'7','dominant-seventh':'7','dominant-ninth':'9','dominant-11th':'7sus4','dominant-13th':'9','major-seventh':'maj7','major-ninth':'maj7','major-11th':'maj7','major-13th':'maj7',
  'half-diminished':'m7b5',diminished:'dim7','diminished-seventh':'dim7',augmented:'7#9','augmented-seventh':'7#9','major-minor':'mmaj7',
  'suspended-fourth':'7sus4','suspended-second':'7sus4',power:'6'};
function mxlChord(h,shift){
  const rs=xtxt(xkid(h,'root'),'root-step');if(!rs)return null;   /* N.C.·function 표기는 건너뜀 */
  const ra=+xtxt(xkid(h,'root'),'root-alter')||0,kindEl=xkid(h,'kind'),kind=kindEl?kindEl.text.trim():'major';
  if(kind==='none'||kind==='pedal')return null;
  let t=MXL_KIND[kind]||(/dominant/.test(kind)?'7':/minor/.test(kind)?'m7':/major/.test(kind)?'maj7':'6');
  const txt=(kindEl&&kindEl.attrs.text||'').toLowerCase();
  const alt=xkids(h,'degree').map(d=>({v:+xtxt(d,'degree-value'),a:+xtxt(d,'degree-alter')||0,ty:xtxt(d,'degree-type')}));
  const has=(v,a)=>alt.some(d=>d.v===v&&d.a===a&&d.ty!=='subtract');
  if(t==='7'||t==='9'){
    if(has(9,1)||has(5,1)||has(13,-1)||/alt|\+/.test(txt))t='7#9';
    else if(has(9,-1))t='7b9';
    else if(has(11,1)||has(5,-1))t='7#11';
  }else if(t==='maj7'&&(has(11,1)||has(5,-1)))t='maj7#11';
  else if(t==='m7'&&has(5,-1))t='m7b5';
  return {root:imod({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[rs]+ra+(shift||0)),type:t};
}
/* iReal 품질 문자열 → 앱 어휘 */
function irealQual(q){
  q=q.replace(/\(.*?\)/g,'');
  if(/^\^7?#11|^\^9#11|^\^13#11/.test(q))return 'maj7#11';
  if(/^\^/.test(q))return 'maj7';
  if(/^-\^/.test(q))return 'mmaj7';
  if(/^-6/.test(q))return 'm6';
  if(/^-(9|11|13)/.test(q))return /^-9|^-13/.test(q)?'m9':'m7';
  if(/^-/.test(q))return /^-7b5/.test(q)?'m7b5':'m7';
  if(/^h/.test(q))return 'm7b5';
  if(/^o/.test(q))return 'dim7';
  if(/sus/.test(q))return '7sus4';
  if(/^(6|69|2|add9)?$/.test(q))return '6';
  if(/^(\+|7#5|7b13|7alt|7#9|7b9#9|9#5|7#5#9|7b9b13|alt)/.test(q))return /^7b9(?!#)/.test(q)?'7b9':'7#9';
  if(/^7b9|^13b9|^9b9/.test(q))return '7b9';
  if(/^(7#11|9#11|13#11|7b5)/.test(q))return '7#11';
  if(/^(9|13|11)/.test(q))return /^11/.test(q)?'7sus4':'9';
  if(/^7/.test(q))return '7';
  return '6';
}
/* 한 마디의 박별 코드 → 토큰(1개·반마디 2개·박마다) */
function barTokens(beats,bpb){
  const nm=c=>IMP_NOTE[c.root]+c.type;
  if(beats.every(c=>nm(c)===nm(beats[0])))return [nm(beats[0])];
  const half=Math.ceil(bpb/2);
  if(beats.every((c,b)=>nm(c)===nm(beats[b<half?0:half])))return [nm(beats[0]),nm(beats[half])];
  return beats.map(nm);
}
function formOf(nb){const P=(nb%8===0||nb%4!==0)?8:4;return ['A'.repeat(Math.max(1,Math.floor(nb/P))),P]}
const KEY_FIFTHS_PC=f=>imod(f*7);

/* ── v0.44 마디 코드 비교 — 같은 뿌리·같은 계열(장·단·속·반감·감)이면 거의 같은 마디로 본다 ── */
const IMP_FAM={'6':'M',maj7:'M','maj7#11':'M',m7:'m',m6:'m',m9:'m',mmaj7:'m','7':'7','9':'7','7b9':'7','7#9':'7','7#11':'7','7sus4':'7',m7b5:'h',dim7:'o'};
const barSig=tok=>String(tok).split(' ').map(c=>{const m=c.match(/^([A-G]b?)(.*)$/);return m?m[1]+(IMP_FAM[m[2]]||m[2]):c}).join(' ');
const barSim=(a,b)=>{if(a===b)return 1;const A=barSig(a),B=barSig(b);if(A===B)return 0.9;return A.split(' ')[0]===B.split(' ')[0]?0.5:0};
const IMP_FORM={chorusMin:0.6,introTol:0.15,sameBlock:0.7,divisorKeep:0.9};   /* 코러스 반복 인정 · 인트로 판단 여유 · 같은 섹션 인정 · 짧은 주기 우선(점수 90% 이상이면) */

/* v0.44 형식 추정 — 8마디(64마디 이상은 16마디) 블록끼리 코드가 얼마나 같은지로 AABA·ABAC 등을 붙인다. 12마디는 블루스 AAB/4 */
function detectForm(bars){
  const nb=bars.length;
  if(nb===12)return ['AAB',4];
  const P=nb>=64&&nb%16===0?16:(nb%8===0?8:0);
  if(!P||nb<16)return formOf(nb);
  const blocks=[];for(let i=0;i<nb;i+=P)blocks.push(bars.slice(i,i+P));
  const cmp=(x,y)=>{const n=P-2;let s=0;for(let j=0;j<n;j++)s+=barSim(x[j],y[j]);return s/n};   /* 끝 2마디(턴어라운드·엔딩)는 빼고 비교 */
  const reps=[],lab=[];
  for(const b of blocks){let best=-1,bs=0;reps.forEach((r,ri)=>{const s=cmp(b,r);if(s>bs){bs=s;best=ri}});
    if(best>=0&&bs>=IMP_FORM.sameBlock)lab.push(String.fromCharCode(65+best));else{reps.push(b);lab.push(String.fromCharCode(64+reps.length))}}
  return [lab.join(''),P];
}

/* v0.44 여러 코러스가 적힌 연주 악보(헤드+솔로 전사 등) — 코드가 P마디마다 되풀이되면 한 코러스로 줄인다.
   코러스마다 같은 자리 코드를 모아 가장 많이 나온 것을 고른다(전사 실수·리하모니 완화). 반환 {P,o,n,bars}|null */
function findChoruses(bars){
  const nb=bars.length,sc={};
  for(const P of [12,16,24,32,36,40,48,64]){if(nb<P*2)continue;let s=0,n=0;for(let i=0;i+P<nb;i++){s+=barSim(bars[i],bars[i+P]);n++}sc[P]=s/n}
  const Ps=Object.keys(sc).map(Number);if(!Ps.length)return null;
  let P=Ps.reduce((a,b)=>sc[b]>sc[a]?b:a);
  const smaller=Ps.filter(q=>q<P&&P%q===0&&sc[q]>=sc[P]*IMP_FORM.divisorKeep).sort((a,b)=>a-b);if(smaller.length)P=smaller[0];
  if(sc[P]<IMP_FORM.chorusMin)return null;
  const win=o=>{let s=0;for(let j=0;j<P;j++)s+=barSim(bars[o+j],bars[o+j+P]);return s/P};
  let o=0;for(let q=0;q<P&&q+2*P<=nb;q++)if(win(q)>=Math.max(IMP_FORM.chorusMin,sc[P]-IMP_FORM.introTol)){o=q;break}
  const n=Math.floor((nb-o)/P);if(n<2)return null;
  const out=[];
  /* 자리마다 계열(뿌리+장·단·속…)로 먼저 표를 모으고, 이긴 계열 안에서 가장 많은 표기를 고른다. 동점이면 첫 코러스(헤드) 쪽 */
  const pick=(arr,key)=>{const c={};arr.forEach(x=>{const q=key(x);c[q]=(c[q]||0)+1});const mx=Math.max(...Object.values(c));return arr.find(x=>c[key(x)]===mx)};
  for(let j=0;j<P;j++){const col=[];for(let k=0;k<n;k++)col.push(bars[o+j+k*P]);const fam=barSig(pick(col,barSig));out.push(pick(col.filter(t=>barSig(t)===fam),t=>t))}
  return {P,o,n,bars:out};
}

/* v0.44 반복·엔딩·D.S.·D.C.·코다·Fine 펼치기(MusicXML·iReal 공통).
   마디: {fwd,bwd(반복 횟수),ending:[번호],segno,codaSign,codaTgt,toCoda,ds,dc,fine}
   D.S./D.C. 뒤에는 반복을 다시 돌지 않고 엔딩은 마지막 번호를 탄다(관례). 코다: 마지막 코다 표시가 도착점, 그 앞의 표시는 「To Coda」 */
function navUnroll(L){
  const out=[],done=new Set(),n=L.length,segI=L.findIndex(m=>m.segno);
  let tgt=-1;for(let i=n-1;i>=0;i--)if(L[i].codaTgt){tgt=i;break}
  if(tgt<0)for(let i=n-1;i>=0;i--)if(L[i].codaSign){tgt=i;break}
  const toC=i=>i!==tgt&&(L[i].toCoda||(L[i].codaSign&&i<tgt));
  const gMax=[];for(let i=0;i<n;i++)if(L[i].ending){let j=i;while(j<n&&L[j].ending)j++;const mx=Math.max(...L.slice(i,j).flatMap(m=>m.ending));for(let q=i;q<j;q++)gMax[q]=mx;i=j-1}
  let i=0,start=0,pass=1,jumped=false,guard=0;out.nav=false;
  while(i<n&&out.length<1500&&guard++<20000){
    const m=L[i];
    if(!jumped&&m.fwd&&start!==i){start=i;pass=1}
    if(m.ending&&!m.ending.includes(jumped?gMax[i]:pass)){i++;continue}
    out.push(m);
    if(jumped&&m.fine)break;
    if(jumped&&tgt>i&&toC(i)){i=tgt;continue}
    if(!jumped&&m.bwd&&!done.has(i)){if(pass<m.bwd){pass++;i=start;continue}done.add(i);start=i+1;pass=1}
    if(!jumped&&(m.ds||m.dc)){jumped=true;out.nav=true;i=m.ds&&segI>=0?segI:0;continue}
    i++;
  }
  return out;
}
/* 악보 글자(words)로 적힌 길잡이 */
function navWords(M,w){
  const s=String(w).toLowerCase().replace(/\s+/g,' ').trim();
  if(/(^|[^a-z])d\.? ?s\.?($|[^a-z])|dal segno/.test(s))M.ds=true;
  else if(/(^|[^a-z])d\.? ?c\.?($|[^a-z])|da capo/.test(s))M.dc=true;
  else if(/to coda/.test(s))M.toCoda=true;
  else if(/^fine\.?$/.test(s))M.fine=true;
  else if(/^coda\.?$/.test(s))M.codaSign=true;
}
/* v0.44 이조 정보(<transpose>)가 빠진 이조 악기 파트 — 파트 이름으로 실음 이동량을 짐작한다 */
function guessTransp(name){
  const s=String(name||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  if(/sax/.test(s)){if(/tenor/.test(s))return [-14,'테너 색소폰'];if(/alto/.test(s))return [-9,'알토 색소폰'];if(/bari/.test(s))return [-21,'바리톤 색소폰'];if(/soprano/.test(s))return [-2,'소프라노 색소폰'];return null}
  if(/\bin c\b|\(c\)|c trumpet/.test(s))return null;
  if(/clarinet|clarinette|klarinette|clarinetto/.test(s))return /\bin a\b/.test(s)?[-3,'A 클라리넷']:[-2,'B♭ 클라리넷'];
  if(/trumpet|trompete|trompette|tromba|cornet|flugel/.test(s))return [-2,'B♭ 트럼펫'];
  if(/horn|corno|\bcor\b/.test(s)&&!/english|anglais/.test(s))return [-7,'F 호른'];
  return null;
}

/* ── MusicXML → 곡 ── */
function musicXmlToSong(xml,fileName){
  const root=xmlParse(xml),warn=[];
  const sp=xkid(root,'score-partwise');
  if(!sp)throw new Error(xkid(root,'score-timewise')?'score-timewise 형식은 아직 못 읽어요(악보 프로그램에서 일반 MusicXML로 다시 내보내 주세요)':'MusicXML 악보가 아니에요');
  /* 제목: work-title → movement-title → 악보 위 글자(credit, 제목 표시 우선) → 파일 이름 */
  const cred=xkids(sp,'credit'),credT=(cred.find(c=>xtxt(c,'credit-type')==='title')||cred.find(c=>xkid(c,'credit-words')));
  const title=(xtxt(xkid(sp,'work'),'work-title')||xtxt(sp,'movement-title')||(credT?xtxt(credT,'credit-words'):'')||String(fileName||'').replace(/\.(musicxml|xml|mxl)$/i,'')||'불러온 곡').trim();
  const parts=xkids(sp,'part');if(!parts.length)throw new Error('악보에 파트가 없어요');
  const hasNotes=p=>xkids(p,'measure').some(m=>xkids(m,'note').some(n=>xkid(n,'pitch')));
  const hasHarm=p=>xkids(p,'measure').some(m=>xkid(m,'harmony'));
  const melP=parts.find(hasNotes)||parts[0],harP=hasHarm(melP)?melP:(parts.find(hasHarm)||null);
  if(!harP)throw new Error('코드 기호(화음 이름)가 없는 악보예요 — 코드가 적힌 리드시트를 불러와 주세요');
  /* v0.44 이조 정보가 없는 이조 악기 파트는 이름으로 짐작해 실음으로 옮긴다 */
  const spl=xkids(xkid(sp,'part-list')||{children:[]},'score-part');
  const partName=p=>{const s=spl.find(x=>x.attrs.id===p.attrs.id);return s?(xtxt(s,'part-name')||xtxt(s,'part-abbreviation')):''};
  const hasTr=p=>xkids(p,'measure').some(m=>xkids(m,'attributes').some(a=>xkid(a,'transpose')));
  const shift0=p=>{if(hasTr(p))return 0;const g=guessTransp(partName(p));if(!g)return 0;
    const w='악보에 이조 정보가 없어 「'+g[1]+'」 파트로 보고 실음으로 옮겼어요(이미 실음 악보라면 조를 다시 고르세요)';if(!warn.includes(w))warn.push(w);return g[0]};
  const midiOf=(pi,sh)=>12*((+xtxt(pi,'octave'))+1)+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[xtxt(pi,'step')]+(+xtxt(pi,'alter')||0)+sh;
  /* 파트를 마디 목록으로: 박자·조·이조·반복·엔딩·길잡이(D.S.·코다)·코드 위치·음 */
  function readPart(p,wantNotes){
    let div=1,beats=4,bt=4,fifths=null,mode='major',shift=shift0(p),tempo=null,melVoice=null,ending=null;
    return xkids(p,'measure').map(m=>{
      const M={num:m.attrs.number,implicit:m.attrs.implicit==='yes',harm:[],notes:[],fwd:false,bwd:0,ending:null};
      let pos=0,maxPos=0;
      for(const c of m.children){
        if(c.name==='attributes'){
          if(xtxt(c,'divisions'))div=+xtxt(c,'divisions')||div;
          const ti=xkid(c,'time');if(ti&&xtxt(ti,'beats')){beats=+xtxt(ti,'beats').split('+').reduce((a,b)=>+a+ +b,0);bt=+xtxt(ti,'beat-type')||4}
          const ke=xkid(c,'key');if(ke&&fifths===null&&xtxt(ke,'fifths')!==''){fifths=+xtxt(ke,'fifths');mode=xtxt(ke,'mode')||'major'}
          const tr=xkid(c,'transpose');if(tr)shift=+xtxt(tr,'chromatic')||0;
        }else if(c.name==='harmony'){
          const ch=mxlChord(c,shift);const off=+xtxt(c,'offset')||0;
          if(ch)M.harm.push({tk:Math.round((pos+off)*6/div),ch});
        }else if(c.name==='note'){
          if(xkid(c,'grace'))continue;
          const du=+xtxt(c,'duration')||0;
          const v=xtxt(c,'voice')||'1';
          if(xkid(c,'chord')){   /* v0.44 화음으로 적힌 곳(피아노 오른손 등)은 맨 위 음을 멜로디로 */
            const pi=xkid(c,'pitch'),L=M.notes[M.notes.length-1];
            if(wantNotes&&pi&&v===(melVoice||'1')&&L&&L.midi!==null){const mi=midiOf(pi,shift);if(mi>L.midi)L.midi=mi}
            continue;
          }
          if(wantNotes){
            if(melVoice===null&&xkid(c,'pitch'))melVoice=v;
            if(v===(melVoice||'1')){
              const pi=xkid(c,'pitch'),ties=xkids(c,'tie').map(t=>t.attrs.type);
              const midi=pi?midiOf(pi,shift):null;
              M.notes.push({tk:Math.round(pos*6/div),d:Math.round(du*6/div),midi,tieStop:ties.includes('stop')});
            }
          }
          pos+=du;
        }else if(c.name==='backup')pos-=+xtxt(c,'duration')||0;
        else if(c.name==='forward')pos+=+xtxt(c,'duration')||0;
        else if(c.name==='barline'){
          const r=xkid(c,'repeat');if(r){if(r.attrs.direction==='forward')M.fwd=true;else M.bwd=+r.attrs.times||2}
          const e=xkid(c,'ending');if(e){const ns=String(e.attrs.number||'1').split(/[ ,]+/).map(Number).filter(Boolean);
            if(e.attrs.type==='start'){ending=ns;M.ending=ns}else{M.ending=M.ending||ending||ns;ending=null}}
          if(xkid(c,'segno'))M.segno=true;if(xkid(c,'coda'))M.codaSign=true;
        }else if(c.name==='direction'||c.name==='sound'){
          const s=c.name==='sound'?c:xfind(c,'sound');if(s&&s.attrs.tempo&&!tempo)tempo=+s.attrs.tempo;
          const pm=xfind(c,'per-minute');if(pm&&!tempo)tempo=+pm.text||null;
          /* v0.44 길잡이: 세뇨·코다 기호, 「D.S. al Coda」 같은 글자, 재생 지시(sound) */
          for(const d of xkids(c,'direction-type')){if(xkid(d,'segno'))M.segno=true;if(xkid(d,'coda'))M.codaSign=true;const w=xkids(d,'words').map(x=>x.text).join(' ');if(w.trim())navWords(M,w)}
          if(s){const a=s.attrs;if(a.segno)M.segno=true;if(a.coda)M.codaTgt=true;if(a.tocoda)M.toCoda=true;if(a.dalsegno)M.ds=true;if(a.dacapo==='yes')M.dc=true;if(a.fine)M.fine=true}
        }
        if(pos>maxPos)maxPos=pos;
      }
      if(ending&&!M.ending)M.ending=ending;
      M.len=Math.round(maxPos*6/div);M.bpbRaw=beats*4/bt;M.full=Math.round(beats*4/bt*6);M.fifths=fifths;M.mode=mode;M.tempo=tempo;M.shift=shift;
      return M;
    });
  }
  let H=readPart(harP,harP===melP),N=harP===melP?H:readPart(melP,true);
  /* 못갖춘마디(픽업) — 첫 마디가 짧으면 빼고(멜로디도) 알린다 */
  if(H.length>1&&H[0].len<H[0].full&&!H[0].harm.length){H=H.slice(1);if(N!==H){N=N.slice(1)}else N=H;warn.push('못갖춘마디(픽업)는 빼고 읽었어요')}
  /* 반복·엔딩·D.S.·코다 펼치기 — 길잡이는 멜로디 파트에만 적혀 있을 수도 있어 두 파트를 합쳐 본다 */
  const NAVK=['segno','codaSign','codaTgt','toCoda','ds','dc','fine'];
  const order=navUnroll(H.map((m,k)=>{const o=Object.assign({},m,{k});if(N!==H&&N[k])NAVK.forEach(f=>{if(N[k][f])o[f]=true});return o}));
  const Nk=N===H?null:N;
  /* 박자 */
  let bpb=Math.round(H[0].bpbRaw);let merge=1;
  if(Math.abs(H[0].bpbRaw-bpb)>0.01||![2,3,4,5].includes(bpb))throw new Error(H[0].bpbRaw+'박(4분음표 기준) 마디는 아직 못 읽어요 — 4/4·3/4·5/4·2/2·6/8을 지원해요');
  if(bpb===2){merge=2;bpb=4;warn.push('2박 마디를 두 마디씩 묶어 4/4로 읽었어요')}
  if(H.some(m=>Math.abs(m.bpbRaw-H[0].bpbRaw)>0.01))warn.push('중간에 박자가 바뀌는 곳은 첫 박자 기준으로 읽었어요');
  /* 마디별 박 단위 코드 */
  let last=null,intro=0;const bars=[],head=[];let tick=0;
  const beatOf=(m,k)=>{const off=k*m.full;return m.harm.map(h=>({b:Math.floor((h.tk+off)/6),ch:h.ch}))};
  for(let q=0;q<order.length;q+=merge){
    const grp=order.slice(q,q+merge),beats=[];const hs=[];grp.forEach((m,k)=>beatOf(m,k).forEach(x=>hs.push(x)));
    if(!last&&!hs.length){intro+=grp.length;continue}   /* v0.44 첫 코드 전의 마디(코드 없는 인트로)는 뺀다 */
    for(let b=0;b<bpb;b++){const h=hs.filter(x=>x.b<=b).pop();if(h)last=h.ch;if(!last)last=hs[0].ch;beats.push(last)}
    bars.push(barTokens(beats,bpb).join(' '));
    grp.forEach((m,k)=>{const src=Nk?Nk[m.k]:m;if(src)src.notes.forEach(n=>head.push({t:tick+k*m.full+n.tk,d:n.d,midi:n.midi,tieStop:n.tieStop}))});
    tick+=bpb*6;
  }
  if(!bars.length)throw new Error('코드를 읽지 못했어요');
  if(order.nav||order.length>H.length)warn.push((order.nav?'반복·D.S.·코다를 따라 ':'반복·엔딩을 ')+'펼쳐 '+order.length+'마디로 읽었어요');
  if(intro)warn.push('코드가 없는 앞 '+intro+'마디는 인트로로 보고 뺐어요');
  /* 멜로디: 붙임줄 합치기 · 쉼표 제외 */
  let notes=[];for(const n of head){if(n.midi===null)continue;const p=notes[notes.length-1];if(n.tieStop&&p&&p.midi===n.midi&&p.t+p.d===n.t){p.d+=n.d;continue}notes.push({t:n.t,d:n.d,midi:n.midi})}
  /* v0.44 여러 코러스(헤드+솔로 전사 등)면 한 코러스로 줄이고 멜로디는 첫 코러스(헤드)만 남긴다 */
  let B=bars;const cr=bars.length>=24?findChoruses(bars):null;
  if(cr){const T=bpb*6,a=cr.o*T,b=(cr.o+cr.P)*T;B=cr.bars;notes=notes.filter(n=>n.t>=a&&n.t<b).map(n=>({t:n.t-a,d:Math.min(n.d,b-n.t),midi:n.midi}));
    warn.push(cr.P+'마디 × '+cr.n+'코러스가 적힌 연주 악보로 보여요 — 코드는 코러스들을 모아 한 코러스로 정하고, 멜로디는 첫 코러스만 헤드로 남겼어요'+(cr.o?'(그 앞 '+cr.o+'마디는 인트로로 보고 뺐어요)':''))}
  else if(bars.length>64)warn.push('곡이 '+bars.length+'마디로 길어요 — 한 코러스만 담긴 악보인지 확인해 주세요');
  const f0=H[0].fifths,sh=H[0].shift;
  let k=f0===null?null:imod(KEY_FIFTHS_PC(f0)+(H[0].mode==='minor'?9:0)+sh);
  if(k===null){const lastC=B[B.length-1].split(' ').pop();k=IMP_NOTE.indexOf(lastC.match(/^[A-G]b?/)[0]);warn.push('조표가 없어 마지막 코드로 조를 정했어요')}
  else if(H[0].mode!=='minor'){   /* v0.44 조표만으로는 장·단조를 모른다 — 마지막(또는 첫) 코드가 나란한조 단화음이면 단조 */
    const rel=imod(k+9),root=t=>{const m=String(t).split(' ')[0].match(/^([A-G]b?)(.*)$/);return m?[IMP_NOTE.indexOf(m[1]),IMP_FAM[m[2]]]:[-1,'']};
    let mi=0,ma=0;B.forEach(t=>{const [r,f]=root(t);if(r===rel&&f==='m')mi++;else if(r===k&&f==='M')ma++});   /* 으뜸화음이 장·단 중 어느 쪽으로 더 자주 오나 */
    const [lr,lf]=root(B[B.length-1]);
    if(mi>ma||(mi===ma&&lr===rel&&lf==='m'))k=rel;
  }
  const bpm=Math.max(40,Math.min(320,Math.round(H.find(m=>m.tempo)?.tempo||120)));
  return {song:{n:title,c:'스윙',k,bpm,m:bpb,f:detectForm(B),ch:B.join('|')},head:notes.length?{notes,bpb}:null,warn};
}

/* ── iReal Pro 링크(irealb:// · irealbook://) 또는 그 링크가 든 HTML ── */
function irealUnscramble(s){
  const swap50=p=>{const a=p.split('');for(let i=0;i<5;i++){a[49-i]=p[i];a[i]=p[49-i]}for(let i=10;i<24;i++){a[49-i]=p[i];a[i]=p[49-i]}return a.join('')};
  let r='';while(s.length>50){const p=s.slice(0,50);s=s.slice(50);r+=s.length<2?p:swap50(p)}
  return (r+s).replace(/Kcl/g,'| x').replace(/LZ/g,' |').replace(/XyQ/g,'   ');
}
const IREAL_STYLE=[[/ballad/i,'발라드'],[/bossa|samba|latin|afro|cuban|salsa|mambo|cha/i,'라틴'],[/funk|soul|rock|pop|rnb|r&b|groove|fusion/i,'펑키'],[/blues|shuffle/i,'블루스']];
function irealToSongs(text){
  let s=String(text||'');
  const m=s.match(/irealb(?:ook)?:\/\/[^"'<>\s]+/);if(!m)throw new Error('iReal Pro 링크(irealb://…)를 찾지 못했어요');
  s=m[0];const book=/^irealbook:/.test(s);
  try{s=decodeURIComponent(s.replace(/^irealb(?:ook)?:\/\//,''))}catch(e){throw new Error('링크가 깨졌어요(일부만 복사됐을 수 있어요)')}
  const chunks=s.split('===').filter(x=>x.trim());
  const out=[];
  const last=chunks[chunks.length-1];let playlist='';if(chunks.length>1&&!/=/.test(last)){playlist=chunks.pop().trim()}   /* 끝의 플레이리스트 이름(v0.48 폴더 이름으로 씀) */
  for(const ch of chunks){
    try{out.push(Object.assign(irealOne(ch,book),{playlist}))}catch(e){out.push({error:e.message,title:ch.split('=')[0]})}
  }
  return out;
}
function irealOne(str,book){
  const f=str.split('=');const warn=[];
  let mi=f.findIndex(x=>/^1r34LbKcu7/.test(x)),music;
  if(mi>=0)music=irealUnscramble(f[mi].slice(10));
  else{mi=book?5:6;music=f[mi]||'';if(!music)throw new Error('곡 내용을 찾지 못했어요')}
  const title=(f[0]||'불러온 곡').replace(/\s*,\s*The$/,'').trim(),style=f[3]||'',keyS=f[4]||'C';
  const bpmF=+f[mi+2]||0;
  /* 박자 */
  const ts=music.match(/T(\d)(\d)/);let bpb=4;
  if(ts){const a=+ts[1],b=+ts[2];bpb=a===1&&b===2?12:Math.round(a*4/b);if(a===6&&b===8)bpb=3}
  if(![3,4,5].includes(bpb))throw new Error('박자 T'+(ts?ts[1]+ts[2]:'')+'는 아직 못 읽어요');
  /* 토큰화: 마디·반복·엔딩·코드 */
  /* v0.44 글자 지시(<D.S. al Coda>·<D.C. al Fine>·<Fine>)는 길잡이 표시로 바꿔 두고 나머지 글자는 지운다 */
  const src=music.replace(/<([^>]*)>/g,(m0,w)=>{const M={};navWords(M,w);return M.ds?' ¶DS ':M.dc?' ¶DC ':M.fine?' ¶FN ':' '})
    .replace(/\([^)]*\)/g,' ').replace(/T\d\d/g,' ').replace(/\*([A-Za-z])/g,' ¶S$1 ');   /* v0.47 섹션 표시(*A·*B·*i 인트로·*v 버스)는 남긴다 */
  const bars=[];let curB={ch:[],fwd:false,bwd:false,end:null},ending=null,pend={},sec=null;
  const push=()=>{if(curB.ch.length||curB.rep){curB.end=curB.end||ending;Object.assign(curB,pend);pend={};curB.sec=sec;bars.push(curB)}curB={ch:[],fwd:false,bwd:false,end:null}};
  /* 코드: 뿌리 + 품질(- ^ h o + 숫자 sus alt add, 숫자 앞 #·b) + /베이스. S(세뇨)·Q(코다)·글자 지시는 길잡이로, 그 밖의 표시(Y·U·f·s·l 등)는 건너뜀 */
  const re=/(\{|\}|\[|\]|\||Z|¶DS|¶DC|¶FN|¶S[A-Za-z]|S|Q|N(\d)|x|r|n|p|W(?:\/[A-G][b#]?)?|([A-G][b#]?)((?:[-^ho+]|\d|sus|alt|add|[#b](?=\d))*)(?:\/[A-G][b#]?)?)/g;let t;
  while((t=re.exec(src))){
    const k=t[0];
    if(k.startsWith('¶S'))sec=k[2];
    else if(k==='S')pend.segno=true;
    else if(k==='Q')pend.codaSign=true;
    else if(k==='¶DS')pend.ds=true;
    else if(k==='¶DC')pend.dc=true;
    else if(k==='¶FN')pend.fine=true;
    else if(k==='{'){push();ending=null;curB.fwd=true}
    else if(k==='}'){curB.bwd=true;push();ending=null}
    else if(k==='['||k===']'||k==='Z'){push();ending=null}
    else if(k==='|')push();
    else if(t[2]){ending=[+t[2]];curB.end=ending}
    else if(k==='x'){curB.rep=1}
    else if(k==='r'){curB.rep=2}
    else if(k==='n'||k==='p'||k[0]==='W'){curB.ch.push(null)}
    else if(t[3]){const base={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[t[3][0]]+(t[3][1]==='b'?-1:t[3][1]==='#'?1:0);curB.ch.push({root:imod(base),type:irealQual(t[4]||'')})}
  }
  push();
  /* x(한 마디 반복)·r(두 마디 반복) 채우기 */
  const nv=b=>({segno:b.segno,codaSign:b.codaSign,ds:b.ds,dc:b.dc,fine:b.fine,sec:b.sec});   /* 반복 마디는 코드만 베끼고 길잡이는 제 것 */
  const flat=[];for(const b of bars){if(b.rep===1&&!b.ch.length&&flat.length){flat.push(Object.assign({},flat[flat.length-1],{fwd:b.fwd,bwd:b.bwd,end:b.end},nv(b)));continue}
    if(b.rep===2&&!b.ch.length&&flat.length>=2){flat.push(Object.assign({},flat[flat.length-2],{fwd:b.fwd,bwd:false,end:b.end},nv(b)));flat.push(Object.assign({},flat[flat.length-2],{fwd:false,bwd:b.bwd,end:b.end},nv({})));continue}
    flat.push(b)}
  /* 반복·엔딩·D.S.·코다 펼치기(v0.44 공통 navUnroll) */
  const order=navUnroll(flat.map(b=>Object.assign({},b,{bwd:b.bwd?2:0,ending:b.end})));
  /* v0.47 인트로(*i)·버스(*v) 구간은 곡 형식에서 뺀다(솔로는 형식 위에서 돈다). 남는 마디가 너무 적으면 그대로 둔다 */
  const isX=b=>b.sec==='i'||b.sec==='v',nI=order.filter(b=>b.sec==='i').length,nV=order.filter(b=>b.sec==='v').length;
  const drop=(nI||nV)&&order.length-nI-nV>=4;
  let lastC=null;const out=[],outSec=[];
  for(const b of order){
    if(drop&&isX(b))continue;
    const cs=b.ch.map(c=>c||lastC);const real=cs.filter(Boolean);
    if(!real.length&&!lastC)continue;
    const n=Math.max(1,cs.length),beats=[];
    for(let q=0;q<bpb;q++){const c=cs[Math.min(n-1,Math.floor(q*n/bpb))]||lastC;beats.push(c)}
    beats.forEach(c=>{if(c)lastC=c});
    out.push(barTokens(beats.map(c=>c||lastC),bpb).join(' '));outSec.push(b.sec);
  }
  if(!out.length)throw new Error('코드를 읽지 못했어요');
  if(drop&&nI)warn.push('인트로 '+nI+'마디는 곡 형식에서 뺐어요(iReal 「인트로」 구간)');
  if(drop&&nV)warn.push('버스(verse) '+nV+'마디는 곡 형식에서 뺐어요');
  const km=keyS.match(/^([A-G][b#]?)(-)?/);let k=0;
  if(km){k=imod({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[km[1][0]]+(km[1][1]==='b'?-1:km[1][1]==='#'?1:0))}
  let c='스윙';for(const [re2,cc] of IREAL_STYLE)if(re2.test(style)){c=cc;break}
  const bpm=bpmF>=40?bpmF:(c==='발라드'?70:c==='라틴'?140:c==='펑키'?100:/up/i.test(style)?220:150);
  if(order.nav||order.length!==flat.length)warn.push((order.nav?'반복·D.S.·코다를 따라 ':'반복·엔딩을 ')+'펼쳐 '+order.length+'마디로 읽었어요');
  /* 형식: 코드 비교로 섹션이 하나뿐(A만)으로 나오면 iReal 섹션 표시(A·B·C·D)를 따른다 */
  let fm=detectForm(out);
  const marks=[...new Set(outSec.filter(x=>/^[A-D]$/.test(x||'')))];
  if(/^(.)\1*$/.test(fm[0])&&marks.length>=2){const P=out.length%8===0?8:4;let lab='',last='A';for(let i=0;i<out.length;i+=P){const x=outSec[i];if(/^[A-D]$/.test(x||''))last=x;lab+=last}fm=[lab,P]}
  return {song:{n:title,c,k,bpm,m:bpb,f:fm,ch:out.join('|')},head:null,warn,style};
}

/* ── 멜로디 → ABC(헤드 입력란 형식). 붙임줄로 마디를 넘긴다 ── */
function notesToAbc(notes,bpb){
  const BAR=bpb*6,PC=['C','_D','D','_E','E','F','_G','G','_A','A','_B','B'],NAT={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  const nm=m=>{const s=PC[imod(m)],L=s.replace('_',''),acc=s[0]==='_'?'_':'=';
    const o=Math.floor((m-(acc==='_'?-1:0)-NAT[L]-60)/12);let out=acc+(o>=1?L.toLowerCase():L);
    if(o>=2)out+="'".repeat(o-1);if(o<0)out+=','.repeat(-o);return out};
  const dur=d=>d===3?'':(d%3===0?String(d/3):d+'/3');
  let s='',t=0;const end=notes.length?Math.ceil((notes[notes.length-1].t+notes[notes.length-1].d)/BAR)*BAR:0;
  const emit=(tok,d,tie)=>{while(d>0){const room=BAR-(t%BAR),dd=Math.min(d,room);s+=tok+dur(dd)+(tie&&d>dd?'-':'')+' ';t+=dd;d-=dd;if(t%BAR===0)s+='| '}};
  for(const n of notes){if(n.t>t)emit('z',n.t-t,false);if(n.t<t)continue;emit(nm(n.midi),n.d,true)}
  if(t<end)emit('z',end-t,false);
  return 'M:'+bpb+'/4\nL:1/8\nK:C\n'+s.trim();
}
