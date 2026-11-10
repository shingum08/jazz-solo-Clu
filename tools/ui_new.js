/* ═══════════ UI · 재생 · 저장 (v0.14) ═══════════ */
'use strict';
const $=s=>document.querySelector(s);
const KEYNAMES=['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
const GRP={'스윙':'미디엄/업템포 스윙','블루스':'블루스 & 리듬 체인지','라틴':'보사노바 & 라틴','발라드':'재즈 발라드','모달':'모달·쿨·하드밥','비밥·왈츠':'비밥·왈츠·기타 필수곡','연습':'연습용 진행'};
const cur={selProg:'blue-bossa',trUser:0,selDiff:2,selInst:'wind',selTrans:0,useLicks:true,useGroups:true,style:'all',tone:'flugel',solo:null,abc:'',audio:null,saved:[],view:'both',playSolo:true,chorus:2};

/* ── 곡 선택 박스 + 검색 ── */
const songSel=$('#songSel');
(function(){
  const groups={};
  Object.entries(SONGDB).forEach(([id,s])=>{(groups[s.c]=groups[s.c]||[]).push([id,s])});
  const order=Object.keys(GRP);
  Object.keys(groups).sort((a,b)=>order.indexOf(a)-order.indexOf(b)).forEach(c=>{
    const og=document.createElement('optgroup');og.label=GRP[c]||c;
    groups[c].sort((x,y)=>(x[1].name||x[1].n||'').localeCompare(y[1].name||y[1].n||'')).forEach(([id,s])=>{
      const o=document.createElement('option');o.value=id;o.textContent=s.name||s.n||id;
      if(id===cur.selProg)o.selected=true;og.appendChild(o);
    });
    songSel.appendChild(og);
  });
})();
$('#songSearch').addEventListener('input',e=>{
  const q=e.target.value.trim().toLowerCase();let vis=0;
  [...songSel.querySelectorAll('option')].forEach(o=>{
    const hit=!q||o.textContent.toLowerCase().includes(q);o.hidden=!hit;if(hit)vis++;
  });
  [...songSel.querySelectorAll('optgroup')].forEach(og=>{og.hidden=![...og.children].some(o=>!o.hidden)});
  $('#searchCount').textContent=q?vis+'곡 일치':'';
  if(q){const f=[...songSel.querySelectorAll('option')].find(o=>!o.hidden);if(f&&f.value!==cur.selProg){f.selected=true;songSel.onchange()}}
});

/* ── 아티스트 스타일 박스 ── */
const styleSel=$('#styleSel');
Object.entries(STYLE_DATA.profiles).forEach(([k,p])=>{
  const o=document.createElement('option');o.value=k;o.textContent=p.label;
  if(k===cur.style)o.selected=true;styleSel.appendChild(o);
});
styleSel.onchange=()=>{cur.style=styleSel.value;updStyleDesc();regen()};
const STYLE_NOTE={all:'WJD 전체 347개 스윙 솔로의 평균 — 무난한 출발점',parker:'비밥 · 코드톤 강박 최고(67%), 짧고 촘촘한 프레이즈',cbrown:'하드밥 · 8분음표 라인이 가장 길게 이어짐(79%)',rollins:'하드밥 · 짧은 프레이즈와 넉넉한 쉼',dgordon:'하드밥 · 뒤로 눕는 스윙(레이백)',baker:'쿨 · 크로매틱 최소(14%), 노래하는 긴 호흡',getz:'쿨 · 매끄러운 8분 라인',miles:'여백 · 쉼이 가장 긴 유형(중앙값 3.2박)',lyoung:'스윙 · 긴 프레이즈, 여유로운 레이백'};
function updStyleDesc(){const p=STYLE_DATA.profiles[cur.style];$('#styleDesc').textContent=(STYLE_NOTE[cur.style]||'')+' — 근거: 솔로 '+p.solos+'개 · 음 '+(p.name||0).toLocaleString()+'개'}
updStyleDesc();

/* ── 조 변환 (반음 단위) ── */
function keyLabel(pc,trDir){const s=SONGDB[cur.selProg];setSpelling(s,pc,trDir);return pcName(pc)+(songIsMinor(s)?'m':'')}
function updTr(){
  const s=SONGDB[cur.selProg];
  const kn=keyLabel(songKeyPc(),cur.trUser);
  $('#trVal').textContent=kn+(cur.trUser?' ('+(cur.trUser>0?'+':'')+cur.trUser+')':' (원조)');
  $('#btnTrDn').disabled=cur.trUser<=-11;$('#btnTrUp').disabled=cur.trUser>=11;
}
function stopIfPlaying(){if(cur.audio){stopAll();$('#btnPlay').textContent='▶ 재생'}}
function shiftKey(d){cur.trUser=Math.max(-11,Math.min(11,cur.trUser+d));updTr();stopIfPlaying();if(cur.soloBase){cur.shift=undefined;applyView()}}
$('#btnTrUp').onclick=()=>shiftKey(1);
$('#btnTrDn').onclick=()=>shiftKey(-1);

/* ── 표시 · 재생 모드 ── */
$('#viewSel').onchange=e=>{cur.view=e.target.value;if(cur.solo)renderSheet()};
$('#chorusSel').onchange=e=>{cur.chorus=+e.target.value;if(cur.audio){stopAll();playAll();$('#btnPlay').textContent='■ 정지'}};
$('#playSel').onchange=e=>{cur.playSolo=e.target.value==='1';if(cur.audio){stopAll();playAll();$('#btnPlay').textContent='■ 정지'}};

/* ── 난이도 ── */
$('#diffSel').onchange=e=>{cur.selDiff=+e.target.value;regen()};

/* ── 세부 설정 ── */
function buildSeg(el,items,onPick){
  items.forEach((it,i)=>{
    const b=document.createElement('button');
    b.textContent=it.label;b.onclick=()=>{[...el.children].forEach(c=>c.classList.remove('on'));b.classList.add('on');onPick(i)};
    if(it.init)b.classList.add('on');
    el.appendChild(b);
  });
}
buildSeg($('#segInst'),[{label:'목관',init:true},{label:'금관'}],i=>{cur.selInst=i===0?'wind':'brass';regen()});
buildSeg($('#segTone'),[{label:'플뤼겔혼',init:true},{label:'클라리넷'},{label:'신스'}],i=>{cur.tone=['flugel','clarinet','default'][i]});
buildSeg($('#segNot'),[{label:'콘서트(C)',init:true},{label:'B♭ 악기용'}],i=>{cur.selTrans=i===1?2:0;if(cur.soloBase)applyView()});
buildSeg($('#segLick'),[{label:'사용',init:true},{label:'끔'}],i=>{cur.useLicks=i===0;regen()});
buildSeg($('#segGroup'),[{label:'켬',init:true},{label:'끔'}],i=>{cur.useGroups=i===0;regen()});
$('#bpm').addEventListener('input',e=>{$('#bpmVal').textContent=e.target.value+' BPM'});
$('#backvol').addEventListener('input',e=>{$('#bvVal').textContent=e.target.value+' %'});

/* ── 생성 ── */
function origKey(){return SONGDB[cur.selProg].key}
function songKeyPc(){return mod12(origKey()+cur.trUser)}
function gen(newSeed){
  const keyPc=origKey();
  const sig=[cur.selProg,cur.selDiff,cur.selInst,cur.useLicks,cur.style,cur.useGroups].join('|');
  if(newSeed||cur.seed===undefined||cur.sig===undefined){cur.seed=Math.floor(Math.random()*1e6);cur.edits={};cur.sel=null}
  else if(sig!==cur.sig){cur.edits={};cur.sel=null}
  cur.sig=sig;
  cur.soloBase=generateSolo(cur.selProg,keyPc,cur.selDiff,cur.seed,cur.selInst,{useLicks:cur.useLicks!==false,style:cur.style,groups:cur.useGroups});
  cur.shift=undefined;
  applyView();$('#btnPlay').disabled=false;$('#btnSave').disabled=false;
}
/* 원조 솔로 + 편집 → 사용자 조로 이동 → 악보·헤드 ABC */
function applyView(){
  const prog=SONGDB[cur.selProg],tr=cur.trUser,wt=cur.selTrans||0;
  setSpelling(prog,songKeyPc(),tr);
  if(cur.shift===undefined)cur.shift=transposeSolo(cur.soloBase,tr,cur.selInst).shift;
  const edited=applyEdits(JSON.parse(JSON.stringify(cur.soloBase)),cur.edits);
  cur.solo=transposeSolo(edited,tr,cur.selInst,cur.shift);
  setSpelling(prog,mod12(songKeyPc()+wt),tr+wt);
  cur.abc=toAbc(cur.solo,+$('#bpm').value,wt);
  cur.chartAbc=headAbc(prog,tr+wt);
  setSpelling(prog,songKeyPc(),tr);
  renderSheet();
}
/* 헤드(리드시트) — 형식 표시 + 슬래시 코드 차트, 사용자 조로 이동 */
function abcKey(prog,tr){
  setSpelling(prog,mod12(prog.key+tr),tr);
  const k=pcName(mod12(prog.key+tr)).replace('♭','b').replace('♯','#')+(songIsMinor(prog)?'m':'');
  return k;
}
function headAbc(prog,tr){
  const K=abcKey(prog,tr),bpb=prog.bpb||4;
  const bars=barChords(prog,prog.key).map(b=>b.map(c=>({root:mod12(c.root+tr),type:c.type})));
  const secs=String((prog.form&&prog.form.sections)||'');const P=(prog.form&&prog.form.phrase)||8;
  const rows=[];
  for(let i=0;i<bars.length;i+=4){
    rows.push(bars.slice(i,i+4).map((b,j)=>{
      const bi=i+j;let lab='';
      if(bi%P===0&&secs[bi/P])lab='"^['+secs[bi/P]+']"';
      const half=b.length>1?(bpb===5?[3,2]:[Math.ceil(bpb/2),Math.floor(bpb/2)]):[bpb];
      return ' '+lab+b.map((c,k)=>'"'+chordSymbol(c.root,c.type)+'"'+Array(half[k]).fill('B').join(' ')).join(' ')+' ';
    }).join('|')+'|');
  }
  rows[rows.length-1]=rows[rows.length-1].replace(/\|$/,'|]');
  return 'X:2\nM:'+bpb+'/4\nL:1/4\nK:'+K+'\nV:1 style=rhythm\n'+rows.join('\n');
}
function regen(){if(cur.solo)gen(false)}
songSel.onchange=()=>{
  cur.selProg=songSel.value;cur.trUser=0;updTr();
  const s=SONGDB[cur.selProg];
  $('#bpm').value=s.bpm;$('#bpmVal').textContent=s.bpm+' BPM';
  gen(true);
};
$('#btnGen').onclick=()=>gen(true);

function renderSheet(){
  const p=$('#paper');
  p.classList.remove('deal');void p.offsetWidth;p.classList.add('deal');
  const s=SONGDB[cur.selProg];
  $('#paperTitle').textContent=s.name;
  const kOrig=keyLabel(origKey(),0),kNow=keyLabel(songKeyPc(),cur.trUser);
  $('#paperMeta').textContent=(cur.trUser?kNow+' (원곡 '+kOrig+')':kNow)+(cur.selTrans?' · B♭ 악기 기보':'')+' · '+s.bpm+' BPM 기본 · '+STYLE_DATA.profiles[cur.style].label+' · 난이도 '+cur.selDiff+' · '+INSTRUMENTS.find(x=>x.id===cur.selInst).name;
  $('#chartWrap').style.display=cur.view==='solo'?'none':'block';
  $('#soloWrap').style.display=cur.view==='chart'?'none':'block';
  if(cur.view!=='solo'&&typeof ABCJS!=='undefined'){
    const cs=$('#chartStaff');cs.innerHTML='';
    ABCJS.renderAbc(cs,cur.chartAbc,{responsive:'resize',paddingtop:0,paddingbottom:0,paddingleft:0,paddingright:0});
  }
  const box=$('#staff');
  if(typeof ABCJS!=='undefined'){
    box.innerHTML='';
    ABCJS.renderAbc(box,cur.abc,{responsive:'resize',paddingtop:0,paddingbottom:0,paddingleft:0,paddingright:0});
  }else{
    box.innerHTML='<div class="fallback">[오프라인 모드 · 음 이름 나열]\n'+cur.solo.bars.map(bar=>bar.notes.map(n=>n.midi===null?'쉼':n.midi).join(' ')).join('\n')+'</div>';
  }
  const chips=$('#chips');chips.innerHTML='';
  cur.solo.bars.forEach((bar,i)=>{
    const c=document.createElement('span');c.className='bar';
    c.textContent=(i+1)+'마디 '+bar.chords.map(ch=>chordSymbol(ch.root,ch.type)).join(' ');
    chips.appendChild(c);
  });
  const cnt={};cur.solo.bars.forEach(b=>b.tags.forEach(t=>cnt[t]=(cnt[t]||0)+1));
  const tags=['형식 '+cur.solo.form.sections.join('·')+' · 프레이즈 '+cur.solo.form.phrases+'개',...Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]).map(t=>t+(cnt[t]>1?' ×'+cnt[t]:''))];
  const st=cur.solo.stats;
  $('#analysisBox').style.display='block';
  $('#tagRow').innerHTML='<div class="statrow" style="width:100%">'
    +'<div class="stat"><div class="v">'+st.targets+'</div><div class="k">코드 전환 타깃음</div></div>'
    +'<div class="stat"><div class="v">'+st.guideHits+'</div><div class="k">가이드톤 착지</div></div>'
    +'<div class="stat"><div class="v">'+st.appr+' / '+st.enc+'</div><div class="k">어프로치 / 인클로저</div></div>'
    +'<div class="stat"><div class="v">'+st.cells+'</div><div class="k">어휘 셀</div></div></div>'
    +tags.map(t=>'<span class="tag"><b>✦</b>'+t+'</span>').join('');
  $('#harmBox').style.display='block';
  $('#harmList').innerHTML=cur.solo.harm.map(h=>{const p=h.label.split(' · ');return '<div class="harm"><b>'+(h.bar+1)+'마디</b>'+p[0]+' <span>· '+p.slice(1).join(' · ')+'</span></div>'}).join('');
  bindNoteClicks();
}

/* ── 저장 ── */
$('#btnSave').onclick=()=>{
  const s=cur.solo,sg=SONGDB[cur.selProg];
  cur.saved.unshift({id:s.ts,seed:cur.seed,song:cur.selProg,tr:cur.trUser,diff:cur.selDiff,inst:cur.selInst,licks:cur.useLicks!==false,groups:cur.useGroups,style:cur.style,
    name:sg.name+' · '+keyLabel(songKeyPc(),cur.trUser)+' · '+STYLE_DATA.profiles[cur.style].label+' · 난이도 '+cur.selDiff});
  renderSaved();
};
function renderSaved(){
  const el=$('#savedList');
  if(!cur.saved.length){el.innerHTML='<div class="none">아직 저장한 솔로가 없습니다.</div>';return}
  el.innerHTML='';
  cur.saved.forEach(item=>{
    const d=document.createElement('div');d.className='sitem';
    d.innerHTML='<span class="nm">♡ <b>'+item.name+'</b></span>';
    const b=document.createElement('button');b.textContent='불러오기';
    b.onclick=()=>{
      cur.selProg=item.song;cur.trUser=item.tr||0;cur.selDiff=item.diff;cur.selInst=item.inst||'wind';
      cur.useLicks=item.licks!==false;cur.useGroups=item.groups!==false;cur.style=item.style||'all';
      cur.seed=item.seed;cur.edits={};cur.sel=null;
      cur.sig=[cur.selProg,cur.selDiff,cur.selInst,cur.useLicks,cur.style,cur.useGroups].join('|');
      styleSel.value=cur.style;updStyleDesc();updTr();
      const s=SONGDB[cur.selProg];$('#bpm').value=s.bpm;$('#bpmVal').textContent=s.bpm+' BPM';
      songSel.value=cur.selProg;
      [...$('#segInst').children].forEach((c,i)=>c.classList.toggle('on',(i===0)===(cur.selInst==='wind')));
      [...$('#segLick').children].forEach((c,i)=>c.classList.toggle('on',(i===0)===cur.useLicks));
      [...$('#segGroup').children].forEach((c,i)=>c.classList.toggle('on',(i===0)===cur.useGroups));
      $('#diffSel').value=cur.selDiff;
      gen(false);window.scrollTo({top:0,behavior:'smooth'});
    };
    d.appendChild(b);el.appendChild(d);
  });
}

/* ── 음 편집 ── */
const NOTE_NAME=['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
function noteName(m){return NOTE_NAME[((m%12)+12)%12]+(Math.floor(m/12)-1)}
function noteSeq(){const seq=[];cur.solo.bars.forEach((bar,b)=>bar.notes.forEach((n,i)=>seq.push({b,i,n})));return seq}
function clearSel(){(cur.bind||[]).forEach(el=>el.classList.remove('notehead-sel'))}
function bindNoteClicks(){
  const svg=$('#staff svg');cur.bind=[];
  if(svg&&cur.solo){
    const seq=noteSeq();
    const restSel='[class*="rest"]';
    const els=[...svg.querySelectorAll('.abcjs-notehead,'+restSel)];
    const heads=[...svg.querySelectorAll('.abcjs-notehead:not('+restSel+')')];
    const notesOnly=seq.filter(x=>x.n.midi!==null);
    let pairs=null;
    if(els.length===seq.length)pairs=els.map((el,k)=>[el,seq[k]]);
    else if(heads.length===notesOnly.length)pairs=heads.map((el,k)=>[el,notesOnly[k]]);
    if(pairs)pairs.forEach(([el,seqItem])=>{
      cur.bind.push(el);el.style.cursor='pointer';
      el.addEventListener('click',ev=>{ev.stopPropagation();cur.sel={b:seqItem.b,i:seqItem.i};clearSel();el.classList.add('notehead-sel');cur.selEl=el;showPop()});
    });
  }
  if(cur.sel){
    const seq=noteSeq();const k=seq.findIndex(x=>x.b===cur.sel.b&&x.x===cur.sel.i);
    const k2=seq.findIndex(x=>x.b===cur.sel.b&&x.i===cur.sel.i);
    if(k2>=0&&cur.bind[k2]){cur.selEl=cur.bind[k2];cur.selEl.classList.add('notehead-sel');showPop()}
    else{cur.sel=null;showPop()}
  }
}
function showPop(){
  const pop=$('#editPop');
  if(!cur.sel||!cur.selEl){pop.style.display='none';return}
  const {b,i}=cur.sel,bar=cur.solo.bars[b],n=bar.notes[i];
  const ch=bar.chords[(n.t>=12&&bar.chords.length>1)?1:0];
  const isRest=n.midi===null;
  const flat=[];cur.solo.bars.forEach(bb=>bb.notes.forEach(nn=>flat.push(nn.midi)));
  const idx=cur.solo.bars.slice(0,b).reduce((a,bb)=>a+bb.notes.length,0)+i;
  let warn='';
  if(!isRest){
    let pf=null;for(let k=idx-1;k>=0;k--)if(flat[k]!==null){pf=flat[k];break}
    let nf=null;for(let k=idx+1;k<flat.length;k++)if(flat[k]!==null){nf=flat[k];break}
    if(pf!==null&&Math.abs(n.midi-pf)>7)warn='⚠ 앞 음과 5도를 넘는 도약';
    else if(nf!==null&&Math.abs(nf-n.midi)>7)warn='⚠ 뒤 음과 5도를 넘는 도약';
  }
  pop.innerHTML='<div class="popinfo">마디 '+(b+1)+' · '+chordSymbol(ch.root,ch.type)+' · '+(isRest?'쉼표':noteName(n.midi))+'</div>'
    +(warn?'<div class="warn">'+warn+'</div>':'')
    +'<div class="popbtns">'
    +(isRest?'':'<button data-act="dn">반음↓</button><button data-act="up">반음↑</button><button data-act="ocd">옥타브↓</button><button data-act="ocu">옥타브↑</button><button data-act="rest">쉼표로</button><button data-act="reset">원래대로</button>')
    +(isRest?'<button data-act="tone">음으로</button><button data-act="reset">원래대로</button>':'')
    +'<button data-act="close">닫기</button></div>';
  pop.style.display='block';
  const pr=$('#paper').getBoundingClientRect(),er=cur.selEl.getBoundingClientRect();
  let L=er.left-pr.left+er.width/2-pop.offsetWidth/2,T=er.top-pr.top-pop.offsetHeight-10;
  if(T<2)T=er.top-pr.top+er.height+10;
  L=Math.max(6,Math.min(L,pr.width-pop.offsetWidth-6));
  pop.style.left=L+'px';pop.style.top=T+'px';
  pop.querySelectorAll('button').forEach(bt=>bt.onclick=()=>popAct(bt.dataset.act));
}
function popAct(act){
  const {b,i}=cur.sel,k=b+':'+i;
  if(act==='close'){cur.sel=null;clearSel();showPop();return}
  if(act==='reset')delete cur.edits[k];
  else if(act==='rest')cur.edits[k]={rest:true};
  else if(act==='tone'){
    const bar=cur.soloBase.bars[b],n=bar.notes[i];
    const ch=bar.chords[(n.t>=12&&bar.chords.length>1)?1:0];
    const RG={brass:[59,82],wind:[59,82],free:[48,88]}[cur.selInst]||[48,88];
    const ct=chordToneMidis(ch.root,ch.type,RG[0],RG[1]);
    let ref=null;cur.soloBase.bars.forEach(bb=>bb.notes.forEach(nn=>{if(nn.midi!==null)ref=nn.midi}));
    cur.edits[k]={midi:ct.length?nearest(ct,ref===null?(RG[0]+RG[1])/2:ref):64};
  }else{
    const n=cur.solo.bars[b].notes[i];if(n.midi===null)return;
    const d=act==='up'?1:act==='dn'?-1:act==='ocu'?12:-12;
    const m=Math.max(36,Math.min(96,n.midi+d))-(cur.shift||0);
    if(m===cur.soloBase.bars[b].notes[i].midi)delete cur.edits[k];else cur.edits[k]={midi:m};
  }
  applyView();
}



/* ── 피드백: GitHub 이슈 자동 작성(곡·설정·환경 자동 첨부) ── */
$('#btnFeedback').onclick=()=>{
  const msg=prompt('피드백 내용을 입력하세요 (곡·설정·환경은 자동으로 첨부됩니다)');
  if(!msg)return;
  const so=$('#songSel')&&$('#songSel').selectedOptions&&$('#songSel').selectedOptions[0]?$('#songSel').selectedOptions[0].textContent:'미생성';
  const info=['버전: v0.17','곡: '+so,'시드: '+(cur.seed||'-'),'BPM: '+$('#bpm').value,'코러스: '+($('#chorusSel')?$('#chorusSel').value:'-'),'조 이조: '+cur.selTrans,'악기/톤: '+cur.selInst+'/'+cur.tone,'브라우저: '+navigator.userAgent,'날짜: '+new Date().toISOString()].join('\n');
  window.open('https://github.com/shingum08/jazz-solo-generator/issues/new?title='+encodeURIComponent('[피드백] '+msg.slice(0,40))+'&body='+encodeURIComponent(msg+'\n\n--- 자동 정보 ---\n'+info),'_blank');
};
$('#btnPlay').onclick=()=>{
  if($('#btnPlay').textContent.indexOf('정지')>=0){stopAll();$('#btnPlay').textContent='▶ 재생'}
  else if(typeof playAll==='function'){playAll();$('#btnPlay').textContent='■ 정지'}
};
gen();
