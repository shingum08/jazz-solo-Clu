/* ═══════════ UI · 재생 · 저장 (v0.27.1) ═══════════ */
'use strict';
const $=s=>document.querySelector(s);
/* ── v0.42 파일 저장·공유 — 브라우저는 내려받기, 안드로이드 앱(AndroidBridge)은 저장 위치를 고르는 창·공유 시트 ── */
function blobToB64(b){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]||'');r.onerror=rej;r.readAsDataURL(b)})}
function saveBlobFile(blob,name){
  if(window.AndroidBridge&&AndroidBridge.saveFile){blobToB64(blob).then(b=>AndroidBridge.saveFile(name,blob.type||'application/octet-stream',b));return}
  const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(u);a.remove()},2000);
}
function shareBlobFile(blob,name){if(window.AndroidBridge&&AndroidBridge.shareFile){blobToB64(blob).then(b=>AndroidBridge.shareFile(name,blob.type||'application/octet-stream',b));return true}return false}
window.saveBlobFile=saveBlobFile;
const KEYNAMES=['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
const GRP={'스윙':'미디엄/업템포 스윙','블루스':'블루스 & 리듬 체인지','라틴':'보사노바 & 라틴','발라드':'재즈 발라드','모달':'모달·쿨·하드밥','비밥·왈츠':'비밥·왈츠·기타 필수곡','연습':'연습용 진행'};
/* v0.44 기본 곡 — 웹 테스트 빌드에는 내장 곡이 없어 연습 진행으로 */
const DEFAULT_PROG=(typeof SONGDB!=='undefined'&&SONGDB['blue-bossa'])?'blue-bossa':(typeof SONGDB!=='undefined'&&SONGDB['form-jazzblues'])?'form-jazzblues':'blues12';
const cur={lyric:10,noteColors:'off',selProg:DEFAULT_PROG,trUser:0,headMode:'inout',selDiff:2,selLv:3,selInst:'wind',selTrans:0,useLicks:true,useGroups:true,style:'all',tone:'clarinet',topic:'auto',themeOn:false,themeCh:'first',feel:'auto',solo:null,abc:'',audio:null,saved:[],view:'solo',playSolo:true,chorus:2};

/* ── 곡 선택 박스 + 검색 ── */
const SONG_MARK={mine:'♪ ',ok:'✓ ',form:'✓ ',practice:'✓ ',book:'■ ',bookq:'□ ',rb:'◆ ',rbq:'◇ ',draft:'□ ',partial:'△ ',wrong:'✕ ',unknown:'? '};
const SONG_STATUS_LABEL={mine:'♪ 내가 불러온 곡 — 이 기기에만 저장',ok:'✓ 코드 진행 확인됨',form:'✓ 형식 확인(블루스·리듬 체인지 등 공통 진행)',practice:'✓ 연습용 진행',partial:'△ 일부 다름 — 원곡과 부분적으로 다른 진행',wrong:'✕ 원곡과 다른 진행 — 수정 전까지 원곡 연습용으로 쓰지 마세요',unknown:'? 미확인 — 원곡과 다를 수 있음',rb:'◆ 새 코드집(v0.37) — 연주자 확인 전',rbq:'◇ 새 코드집(v0.37) — 일부 마디 확인 필요',book:'■ 악보 대조 완료 — 리드시트와 한 마디씩 맞춰 옮긴 진행',bookq:'□ 악보 대조 — 일부 마디는 판독·해석 확인 필요',draft:'□ 퍼블릭 도메인 곡 초안 — 재즈에서 흔히 쓰는 진행으로 적었고 원 악보 대조 전'};
const songSel=$('#songSel');
/* ── v0.42 내 곡(불러온 곡) — 이 기기 localStorage에만. 곡 목록보다 먼저 SONGDB에 올린다 ── */
const MYSONG_KEY='clu.mysongs.v1';
function loadMySongs(){try{const v=JSON.parse(localStorage.getItem(MYSONG_KEY)||'[]');return Array.isArray(v)?v:[]}catch(e){return []}}
function storeMySongs(){try{localStorage.setItem(MYSONG_KEY,JSON.stringify(cur.mySongs))}catch(e){}acctQueue('mysongs')}
function registerMySong(m){
  SONGDB[m.id]={name:m.n,c:m.c,key:m.k,bpm:m.bpm,bpb:m.m||4,form:{phrase:m.f[1],sections:m.f[0]},bars:m.ch.split('|').map(b=>b.trim().split(/\s+/).map(parseCh)),mine:true};
  if(typeof SONG_STATUS!=='undefined')SONG_STATUS[m.id]={s:'mine',n:(m.src||'불러온 곡')+(m.warn&&m.warn.length?' · '+m.warn.join(' · '):''),a:[]};
}
cur.mySongs=loadMySongs().filter(m=>{try{registerMySong(m);return true}catch(e){return false}});
/* ── v0.48 즐겨찾기 · 폴더 · 곡 삭제 — 곡이 천 곡을 넘어도 고르기 쉽게 ── */
const FAV_KEY='clu.fav.v1';
cur.fav=new Set((()=>{try{const v=JSON.parse(localStorage.getItem(FAV_KEY)||'[]');return Array.isArray(v)?v:[]}catch(e){return []}})());
function storeFav(){try{localStorage.setItem(FAV_KEY,JSON.stringify([...cur.fav]))}catch(e){}acctQueue('fav')}
const escH=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function mineOf(id){return (cur.mySongs||[]).find(m=>m.id===id)||null}
function folderCounts(){const c={};(cur.mySongs||[]).forEach(m=>{const f=m.folder||'';c[f]=(c[f]||0)+1});return c}
function folderNames(){return Object.keys(folderCounts()).sort((a,b)=>a===''?1:b===''?-1:a.localeCompare(b))}
function buildViewOptions(){
  const v=$('#songView');if(!v)return;const keep=v.value||'all',fc=folderCounts(),n=(cur.mySongs||[]).length;
  v.innerHTML='<option value="all">전체 곡</option><option value="fav">★ 즐겨찾기 ('+cur.fav.size+')</option><option value="base">기본 곡</option>'+
    (n?'<option value="mine">불러온 곡 전체 ('+n+')</option>':'')+
    folderNames().filter(f=>f).map(f=>'<option value="f:'+encodeURIComponent(f)+'">📁 '+escH(f)+' ('+fc[f]+')</option>').join('')+
    (fc['']&&Object.keys(fc).length>1?'<option value="f:">📁 폴더 없음 ('+fc['']+')</option>':'');
  v.value=[...v.options].some(o=>o.value===keep)?keep:'all';
}
function fillFolderSel(sel,curF){
  sel.innerHTML=folderNames().map(f=>'<option value="'+escH(f)+'">'+(f?escH(f):'(폴더 없음)')+'</option>').join('')+(folderNames().includes('')?'':'<option value="">(폴더 없음)</option>')+'<option value="__new">＋ 새 폴더…</option>';
  sel.value=curF||'';
}
function askText(label,def){try{const v=window.prompt(label,def||'');return v===null?null:v.trim()}catch(e){return null}}
function moveToFolder(ids,f){
  const set=new Set(ids);cur.mySongs.forEach(m=>{if(set.has(m.id))m.folder=f});storeMySongs();
  buildViewOptions();filterSongs();renderMySongs();syncFav();
}
function folderPick(sel,ids){   /* 폴더 고르기 상자 바뀜 */
  let f=sel.value;
  if(f==='__new'){f=askText('새 폴더 이름');if(!f){fillFolderSel(sel,(mineOf(ids[0])||{}).folder||'');return}}
  moveToFolder(ids,f);
}
function deleteSongs(ids){
  const set=new Set(ids);
  cur.mySongs=cur.mySongs.filter(q=>!set.has(q.id));storeMySongs();
  cur.saved=cur.saved.filter(it=>!set.has(it.song));cur.snips=cur.snips.filter(it=>!set.has(it.song));storeSaved();storeSnips();renderSaved();renderSnips();
  ids.forEach(id=>{delete SONGDB[id];if(typeof SONG_STATUS!=='undefined')delete SONG_STATUS[id];cur.fav.delete(id)});storeFav();
  if(set.has(cur.selProg)){cur.selProg=DEFAULT_PROG;buildSongOptions();songSel.value=DEFAULT_PROG;songSel.onchange()}else buildSongOptions();
  buildViewOptions();filterSongs();renderMySongs();syncFav();
}
function savedCount(ids){const set=new Set(ids);return cur.saved.filter(it=>set.has(it.song)).length+cur.snips.filter(it=>set.has(it.song)).length}
function toggleFav(id){
  if(cur.fav.has(id))cur.fav.delete(id);else cur.fav.add(id);storeFav();
  const keep=songSel.value;buildSongOptions();songSel.value=keep;buildViewOptions();filterSongs();syncFav();
  document.querySelectorAll('.srow .star[data-id="'+CSS.escape(id)+'"]').forEach(b=>{const on=cur.fav.has(id);b.textContent=on?'★':'☆';b.classList.toggle('on',on)});
}
function syncFav(){
  const on=cur.fav.has(cur.selProg),bf=$('#btnFav'),tf=$('#topFav');
  if(bf)bf.textContent=on?'★ 즐겨찾기 해제':'☆ 즐겨찾기';
  if(tf){tf.textContent=on?'★':'☆';tf.classList.toggle('on',on)}
  const m=mineOf(cur.selProg),ma=$('#mineActs');if(ma){ma.hidden=!m;if(m)fillFolderSel($('#songFolder'),m.folder||'')}
  const db=$('#btnDelSong');if(db){delete db.dataset.ask;db.textContent='🗑 이 곡 삭제'}
}
function buildSongOptions(){
  songSel.innerHTML='';
  Object.entries(SONGDB)
    .sort((a,b)=>(a[1].name||a[1].n||'').localeCompare(b[1].name||b[1].n||''))
    .forEach(([id,s])=>{
      const o=document.createElement('option');o.value=id;
      const st=(typeof SONG_STATUS!=='undefined'&&SONG_STATUS[id])||{s:'unknown'};
      o.textContent=(cur.fav&&cur.fav.has(id)?'★ ':'')+(SONG_MARK[st.s]||'? ')+(s.name||s.n||id);o.dataset.st=st.s;
      if(id===cur.selProg)o.selected=true;songSel.appendChild(o);
    });
}
buildSongOptions();
/* v0.36 곡 데이터 검증 상태 — 목록 앞 기호와 선택한 곡 안내 */
function songOkLevel(st){return st==='mine'||st==='ok'||st==='form'||st==='practice'||st==='rb'||st==='book'}   /* 「확인 필요 곡 숨기기」: rbq·bookq·일부 다름·틀림·미확인을 숨긴다 */
function filterSongs(){
  const q=$('#songSearch').value.trim().toLowerCase(),only=$('#onlyOk').checked;let vis=0;
  const view=($('#songView')||{}).value||'all',MM=new Map((cur.mySongs||[]).map(m=>[m.id,m]));
  const vf=view.startsWith('f:')?decodeURIComponent(view.slice(2)):null;
  const inView=id=>view==='all'?true:view==='fav'?cur.fav.has(id):view==='base'?!MM.has(id):view==='mine'?MM.has(id):vf!==null?(MM.has(id)&&(MM.get(id).folder||'')===vf):true;
  [...songSel.querySelectorAll('option')].forEach(o=>{
    const hit=inView(o.value)&&(!q||o.textContent.toLowerCase().includes(q))&&(!only||songOkLevel(o.dataset.st));o.hidden=!hit;if(hit)vis++;
  });
  $('#searchCount').textContent=(q||only||view!=='all')?vis+'곡':'';
  const curOpt=songSel.selectedOptions[0];
  if((q||only||view!=='all')&&(!curOpt||curOpt.hidden)){const f=[...songSel.querySelectorAll('option')].find(o=>!o.hidden);if(f){f.selected=true;songSel.onchange()}}
}
$('#songSearch').addEventListener('input',filterSongs);
$('#onlyOk').addEventListener('change',filterSongs);
function updSongStatus(){
  const el=$('#songStatus');if(!el)return;
  const st=(typeof SONG_STATUS!=='undefined'&&SONG_STATUS[cur.selProg])||{s:'unknown',n:'',a:[]};
  el.className='songstatus st-'+st.s;
  const bad=st.s==='partial'||st.s==='wrong'||st.s==='unknown';
  el.innerHTML='<b>'+(SONG_STATUS_LABEL[st.s]||st.s)+'</b>'+(st.n?' — '+st.n:'')+(st.a&&st.a.length&&bad?'<span class="auto"> · 자동 검사: '+st.a.join(' / ')+'</span>':'')+
    (bad?' <span class="ask">원곡 진행을 아시면 💬 피드백으로 알려 주세요.</span>':(st.s==='rb'||st.s==='rbq'||st.s==='book'||st.s==='bookq')?' <span class="ask">원곡과 다른 곳을 찾으시면 💬 피드백으로 알려 주세요.</span>':'');
}

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
function stopIfPlaying(){if(cur.audio||cur.playReq){stopAll();syncPlay()}}
function shiftKey(d){cur.trUser=Math.max(-11,Math.min(11,cur.trUser+d));updTr();stopIfPlaying();if(cur.soloBase){cur.shift=undefined;applyView()}}
$('#btnTrUp').onclick=()=>shiftKey(1);
$('#btnTrDn').onclick=()=>shiftKey(-1);

/* ── 표시 · 재생 모드 ── */
$('#viewSel').onchange=e=>{cur.view=e.target.value;if(cur.view==='drill'&&drillTopic()!==cur.topic){cur.topic='ct';$('#topicSel').value='ct'}if(cur.solo){const was=!!cur.audio;stopIfPlaying();gen(false);if(was){playAll();syncPlay()}}};
$('#chorusSel').onchange=e=>{cur.chorus=Math.max(1,Math.min(12,+e.target.value||1));const was=!!cur.audio;stopIfPlaying();if(cur.soloBase)gen(false);if(was){playAll();syncPlay()}};
$('#playSel').onchange=e=>{cur.playSolo=e.target.value==='1';if(cur.audio){stopAll();playAll();syncPlay()}};

/* ── 난이도 ── */
/* v0.61 난이도 5단계 — 화면의 단계(selLv 1~5) → 엔진 난이도(selDiff 1~3, LEVELS) */
function setLevel(lv){lv=Math.max(1,Math.min(5,+lv||3));cur.selLv=lv;cur.selDiff=LEVELS[lv].diff;$('#diffSel').value=String(lv)}
function lvFromItem(it){return it.lv?it.lv:LEVEL_OF_DIFF[it.diff]||3}   /* v0.60까지 저장한 난이도(1~3) → 단계 */
$('#diffSel').onchange=e=>{setLevel(e.target.value);regen()};
/* v0.39 노래 ↔ 비밥 조절바: 0 = 비밥 라인만 · 100 = 노래 프레이즈만 */
$('#lyric').addEventListener('input',e=>{const v=+e.target.value;$('#lyrVal').textContent='노래 '+v+' · 비밥 '+(100-v)});
$('#lyric').addEventListener('change',e=>{cur.lyric=+e.target.value;const was=!!cur.audio;stopIfPlaying();regen();if(was){playAll();syncPlay()}});

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
$('#toneSel').addEventListener('change',e=>{cur.tone=e.target.value;if(cur.audio){stopAll();playAll();syncPlay()}});
function onSampleStatus(st,miss){
  const n=$('#soundNote');
  if(st==='loading'){n.textContent='⏳ 악기 샘플 불러오는 중…';if(cur.audio===null)$('#btnPlay').textContent='⏳ 준비 중'}
  else if(st==='ok')n.textContent='✓ 실제 악기 샘플로 재생 중';
  else n.textContent='⚠ 일부 샘플을 불러오지 못해 내장 신스로 대체 재생 (인터넷 연결 확인)';
}
/* 반주 스타일 — 자동이면 곡 분류로 판별. 솔로 생성(코드톤 비중·리듬)에도 쓰인다 */
function currentFeel(){return cur.feel&&cur.feel!=='auto'?cur.feel:autoFeel(cur.selProg)}
function updFeelNote(){$('#feelNote').textContent=(cur.feel==='auto'||!cur.feel)?'이 곡: '+FEEL_LABEL[autoFeel(cur.selProg)]:'곡 분류와 무관하게 고정'}
$('#feelSel').addEventListener('change',e=>{cur.feel=e.target.value;updFeelNote();const was=!!cur.audio;stopIfPlaying();regen();if(was){playAll();syncPlay()}});
/* ── 테마 인용: 앱이 코드톤으로 만든 가이드 멜로디(원곡 멜로디 아님)를 솔로에 넣기 ── */
function themeQuoteFor(c,nCh){
  if(!cur.themeOn)return null;
  const t=composeTheme(cur.selProg,origKey());
  const nb=SONGDB[cur.selProg].bars.length;
  /* 테마 멜로디는 곡마다 고정이지만, 들어가는 자리는 생성할 때마다 바뀐다(시드에서 결정) —
     매번 앞부분만 같아 보이는 문제를 없애고 '솔로 중간에 테마가 들린다'는 본래 의도에 맞게 */
  const slotMax=Math.max(0,nb-t.bars);
  const start=Math.min(slotMax,(Math.floor((cur.seed||1)*31+7+c))%(slotMax+1));
  if(cur.themeCh==='all')return {startBar:start,notes:t.notes};
  if(cur.themeCh==='first')return c===0?{startBar:start,notes:t.notes}:null;
  return c===nCh-1?{startBar:start,notes:t.notes}:null;
}
/* ── v0.28 모티프 발전 · 헤드 차용 ── */
cur.motifOn=true;cur.headFrags=[];
/* v0.66 선율 다듬기 스위치 — 끄면 같은 시드로 v0.65 방식(생성·악센트). 번갈아 들어 비교하는 용도 */
cur.naturalOn=true;
/* v0.66.4 릭 빈도 */
cur.lickAmt=1;
if($('#lickAmt'))$('#lickAmt').addEventListener('change',()=>{cur.lickAmt=+$('#lickAmt').value;const was=!!cur.audio;stopIfPlaying();regen();if(was){playAll();syncPlay()}});
if($('#naturalOn'))$('#naturalOn').addEventListener('change',()=>{cur.naturalOn=$('#naturalOn').checked;const was=!!cur.audio;stopIfPlaying();regen();if(was){playAll();syncPlay()}});
$('#motifOn').addEventListener('change',()=>{cur.motifOn=$('#motifOn').checked;const was=!!cur.audio;stopIfPlaying();regen();if(was){playAll();syncPlay()}});
function readHeadAbc(){
  const txt=$('#headAbcIn').value;let msg='';
  try{
    if(!txt.trim()){cur.headFrags=[];msg='헤드 입력 없음 — 모티프는 솔로 안의 앞 프레이즈에서만 가져옵니다.'}
    else{
      const p=parseHeadAbc(txt),fr=headFragments(p);
      cur.headFrags=fr;
      msg=fr.length?('헤드 '+p.notes.length+'음 · '+p.bars+'마디에서 모티프 조각 '+fr.length+'개를 뽑았습니다. 새로 생성하면 일부 프레이즈에 인용됩니다.'):'쓸 수 있는 조각이 없습니다(3음 이상 이어진 8분~2분 음표 필요).';
      if(p.errors.length)msg+=' (건너뜀: '+p.errors.length+'곳)';
    }
  }catch(err){cur.headFrags=[];msg='ABC를 읽지 못했습니다: '+err.message}
  $('#headMsg').textContent=msg;
}
$('#headAbcIn').addEventListener('change',()=>{readHeadAbc();const was=!!cur.audio;stopIfPlaying();regen();if(was){playAll();syncPlay()}});
$('#themeOn').addEventListener('change',()=>{cur.themeOn=$('#themeOn').checked;const was=!!cur.audio;stopIfPlaying();regen();if(was){playAll();syncPlay()}});
$('#themeCh').addEventListener('change',()=>{cur.themeCh=$('#themeCh').value;regen()});
const TOPIC_L={ct:'코드톤 라인',penta:'펜타토닉',scale:'기본 스케일',dom:'활용 스케일',chrom:'크로매틱',alt:'얼터드',gt:'가이드톤 라인'};
$('#topicSel').addEventListener('change',e=>{cur.topic=e.target.value;const was=!!cur.audio;stopIfPlaying();regen();if(was){playAll();syncPlay()}});
/* ── 전체화면: Fullscreen API, 지원 안 되는 기기(iOS 사파리)는 화면 덮기 ── */
function isFs(){return !!(document.fullscreenElement||document.webkitFullscreenElement)||$('#paper').classList.contains('fs')}
function setFsLabel(){const on=isFs();$('#btnFull').textContent=on?'✕ 닫기':'⛶ 전체화면';$('#fsPlay').textContent=cur.playReq&&!cur.paused?'∥':'▶'}
$('#btnFull').addEventListener('click',()=>{
  const p=$('#paper');
  if(isFs()){if(document.fullscreenElement||document.webkitFullscreenElement){(document.exitFullscreen||document.webkitExitFullscreen).call(document)}else{p.classList.remove('fs');document.body.classList.remove('fslock')}}
  else{const rq=p.requestFullscreen||p.webkitRequestFullscreen;
    if(rq){try{const r=rq.call(p);if(r&&r.catch)r.catch(()=>{p.classList.add('fs');document.body.classList.add('fslock');setFsLabel();renderSheet()})}catch(e){p.classList.add('fs');document.body.classList.add('fslock')}}
    else{p.classList.add('fs');document.body.classList.add('fslock')}}
  setTimeout(()=>{setFsLabel();if(cur.solo)renderSheet()},120);
});
['fullscreenchange','webkitfullscreenchange'].forEach(ev=>document.addEventListener(ev,()=>{setFsLabel();if(cur.solo)setTimeout(renderSheet,80)}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#paper').classList.contains('fs')){$('#paper').classList.remove('fs');document.body.classList.remove('fslock');setFsLabel();if(cur.solo)renderSheet()}});
$('#fsPlay').addEventListener('click',()=>{$('#btnPlay').click();setTimeout(setFsLabel,50)});
$('#notSel').addEventListener('change',e=>{cur.selTrans=+e.target.value;if(cur.soloBase)applyView()});
document.querySelectorAll('.bpmstep').forEach(b=>b.addEventListener('click',()=>{const r=$('#bpm');r.value=Math.max(60,Math.min(320,+r.value+(+b.dataset.d)));r.dispatchEvent(new Event('input'));r.dispatchEvent(new Event('change'))}));
$('#bpm').addEventListener('input',e=>{$('#bpmVal').textContent=e.target.value+' BPM'});
$('#bpm').addEventListener('change',()=>{if(!cur.audio)return;
  /* v0.50 재생 중 템포를 바꾸면 처음으로 돌아가지 않고 지금 마디부터(구간 반복은 그 구간 처음부터) */
  const pr=cur.playRange,pp=(cur._pp||'').split(':').map(Number),nb=cur.solo?cur.solo.bars.length:0,nCh=cur.solos?cur.solos.length:1;
  if(pr&&pr.loop||pp.length<2||!nb){stopAll();playAll();syncPlay();return}
  startPlayRange({a0:pp[0]*nb+pp[1],a1:nCh*nb-1,loop:false});
});
/* ── v0.50 탭 템포 — 악보 머리 「♩ 탭」이나 악보의 템포 표시(♩ = 120)를 박자에 맞춰 여러 번 누르면 BPM을 잡는다 ── */
const TAP={RESET_MS:2000,KEEP:6,SETTLE_MS:1500,MIN:60,MAX:320};
function tapTempo(){
  const now=performance.now(),T=cur._taps||(cur._taps=[]);
  if(T.length&&now-T[T.length-1]>TAP.RESET_MS)T.length=0;
  T.push(now);if(T.length>TAP.KEEP+1)T.shift();
  const B=document.querySelectorAll('[data-tap]'),lab=t=>B.forEach(b=>{b.textContent=t;b.classList.add('on')});clearTimeout(cur._tapT);
  if(T.length<2){lab('♩ …');cur._tapT=setTimeout(tapDone,TAP.RESET_MS);return}
  const avg=(T[T.length-1]-T[0])/(T.length-1),bpm=Math.max(TAP.MIN,Math.min(TAP.MAX,Math.round(60000/avg)));
  lab('♩ '+bpm);
  const r=$('#bpm');r.value=bpm;$('#bpmVal').textContent=bpm+' BPM';
  document.querySelectorAll('#chPages svg .abcjs-tempo text').forEach(t=>{const tx=t.textContent;if(/\d/.test(tx))t.textContent=tx.replace(/\d+/,bpm)});   /* 악보 템포 표시도 바로 */
  cur._tapT=setTimeout(tapDone,TAP.SETTLE_MS);
}
function tapDone(){document.querySelectorAll('[data-tap]').forEach(b=>{b.classList.remove('on');b.textContent='♩ 탭'});const T=cur._taps||[];cur._taps=[];if(T.length>=2){$('#bpm').dispatchEvent(new Event('change'))}}
document.querySelectorAll('[data-tap]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();tapTempo()});
  b.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();tapTempo()}})});
$('#backvol').addEventListener('input',e=>{
  $('#bvVal').textContent=e.target.value+' %';
  if(cur.audio&&cur.audio.rb){try{cur.audio.rb.gain.value=Math.max(0,+e.target.value/100)*BACK_GAIN*(cur.audioBanks&&cur.audioBanks.length?1.15:1)}catch(_){}}
});
$('#soundSet').addEventListener('change',e=>{cur.soundSet=e.target.value;if(cur.audio){stopAll();playAll();syncPlay()}});
$('#leadvol').addEventListener('input',e=>{
  $('#lvVal').textContent=e.target.value+' %';
  if(cur.audio&&cur.audio.lead){try{cur.audio.lead.gain.value=Math.max(0,+e.target.value/100)*LEAD_GAIN}catch(_){}}
});

/* ── 생성 ── */
/* v0.59 노래↔비밥 조절바 → 엔진의 노래 프레이즈 비율(사용자 피드백 11/13). 비밥 100(조절바 0) = 예전 기본(노래 30%)의 결과,
   노래 쪽은 제곱 곡선이라 5~10%를 섞어도 긴 음이 거의 늘지 않고 50% 넘어서 크게 늘어난다. 기본은 노래 10(≈예전 기본) */
const LYRIC_MAP={floor:0.3,curve:2,def:10};
function lyricAmt(v){return LYRIC_MAP.floor+(1-LYRIC_MAP.floor)*Math.pow(Math.max(0,Math.min(100,+v||0))/100,LYRIC_MAP.curve)}
function lyricFromOld(x){x=+x;return x<=LYRIC_MAP.floor*100?0:Math.round(Math.pow((x/100-LYRIC_MAP.floor)/(1-LYRIC_MAP.floor),1/LYRIC_MAP.curve)*20)*5}   /* v0.58까지 저장한 값(직접 비율) → 새 조절바 */
function origKey(){return SONGDB[cur.selProg].key}
function songKeyPc(){return mod12(origKey()+cur.trUser)}
/* v0.46 헤드 연주 계획 — 헤드 입력(불러온 곡의 멜로디 또는 직접 입력)이 있으면 {lock, mode}. 앱이 멜로디를 지어내지 않는다 */
function headPlan(){
  if(cur.view==='drill'||cur.headMode==='off')return null;
  const txt=($('#headAbcIn')||{}).value||'';if(!txt.trim())return null;
  const s=SONGDB[cur.selProg];if(!s)return null;
  let p;try{p=parseHeadAbc(txt)}catch(e){return null}
  if(!p.notes.length||(p.bpb||4)!==(s.bpb||4))return null;
  const lock=headLockBars(p.notes,s.bars.length,s.bpb||4);
  return Object.keys(lock).length?{lock,mode:cur.headMode,rg:{brass:[59,82],wind:[59,82],free:[52,86]}[cur.selInst]||[52,86]}:null;
}
function chorusLabel(c){   /* 코러스 탭·악보 머리 이름 — 헤드 코러스가 있으면 솔로 번호를 따로 센다 */
  const so=cur.solos&&cur.solos[c];
  if(so&&so.head)return c===0?'헤드':'헤드 아웃';
  const h=cur.solos&&cur.solos[0]&&cur.solos[0].head?1:0;return (c-h+1)+'코러스';
}
function gen(newSeed){
  cur.themeOn=false;   /* v0.47 테마 인용 끔(숨김) */
  const keyPc=origKey();
  const sig=[cur.view==='drill'?'drill':'solo',cur.selProg,cur.selDiff,cur.selLv,cur.selInst,cur.useLicks,cur.style,cur.useGroups,cur.feel,cur.topic,cur.themeOn,cur.themeCh,cur.motifOn,(cur.headFrags||[]).length,cur.lyric,cur.headMode,$('#headAbcIn').value.length,cur.naturalOn,cur.lickAmt].join('|');
  if(newSeed||cur.seed===undefined||cur.sig===undefined){cur.seed=Math.floor(Math.random()*1e6);cur.edits={};cur.sel=null}
  else if(sig!==cur.sig){cur.edits={};cur.sel=null}
  cur.sig=sig;
  const nCh=Math.max(1,Math.min(12,+$('#chorusSel').value||1));cur.chorus=nCh;
  const op={useLicks:cur.useLicks!==false,style:cur.style,groups:cur.useGroups,feel:currentFeel(),topic:cur.topic,motif:cur.motifOn!==false,headMotifs:cur.headFrags||[],level:cur.selLv,lyric:lyricAmt(cur.lyric==null?LYRIC_MAP.def:cur.lyric),bpm:+$('#bpm').value,natural:cur.naturalOn!==false,lickAmt:cur.lickAmt};
  const mk=i=>Object.assign({},op,{quote:themeQuoteFor(i,nCh),arc:{i,n:nCh}});   /* v0.27 코러스 곡선 */
  const hp=headPlan(),NT=nCh+(hp?(hp.mode==='inout'?2:1):0);cur.headCh=hp?{first:true,last:hp.mode==='inout'}:null;   /* v0.46 헤드 코러스(코러스 수는 솔로만 셈) */
  if(cur.view==='drill'){cur.soloBase=null;cur.soloBases=[]}   /* 연습 악보는 applyView에서 사용자 조·기보에 맞춰 만든다 */
  else{
    /* v0.30 고정 마디: 새 솔로에 고정한 마디를 끼워 넣고, 이음매 도약이 가장 작은 시드를 고른다 */
    if(cur.lockSong!==cur.selProg){cur.locks={};cur.barSel=new Set();cur.lockSong=cur.selProg}
    const lkAll=cur.locks||{},hasLk=c=>lkAll[c]&&Object.keys(lkAll[c]).length;
    const lk=hasLk(0)?lkAll[0]:null;
    const mkBase=sd=>{const so=generateSolo(cur.selProg,keyPc,cur.selDiff,sd,cur.selInst,hp?Object.assign(mk(0),{quote:null}):mk(0));if(hp)spliceHeadBars(so,hp.lock,hp.rg);if(lk)spliceLockedBars(so,lk);return so};
    if(lk&&newSeed){
      let best=null;
      for(let k=0;k<12;k++){const sd=k===0?cur.seed:Math.floor(Math.random()*1e6);const so=mkBase(sd),c=lockSeamCost(so);if(!best||c<best.c)best={so,sd,c};if(c===0)break}
      cur.seed=best.sd;cur.soloBase=best.so;
    }else cur.soloBase=mkBase(cur.seed);
    cur.soloBases=[cur.soloBase];}
  for(let c=1;c<NT&&cur.view!=='drill';c++){
    const sd=(cur.seed+c*7919)%1000003,isOut=hp&&hp.mode==='inout'&&c===NT-1;
    const cy=carryOf(cur.soloBases[c-1]);   /* v0.66 앞 코러스(헤드·고정 마디를 끼운 뒤)의 끝음·주제를 이어받는다 */
    const so=isOut?spliceHeadBars(generateSolo(cur.selProg,keyPc,cur.selDiff,sd,cur.selInst,Object.assign(mk(nCh-1),{quote:null,carry:cy})),hp.lock,hp.rg)
                  :generateSolo(cur.selProg,keyPc,cur.selDiff,sd,cur.selInst,Object.assign(mk(hp?c-1:c),{carry:cy}));
    if(cur.locks&&cur.locks[c]&&Object.keys(cur.locks[c]).length)spliceLockedBars(so,cur.locks[c]);
    cur.soloBases.push(so);
  }
  cur.shift=undefined;
  applyView();$('#btnPlay').disabled=false;try{syncNow()}catch(e){}$('#btnSave').disabled=false;$('#btnExport').disabled=false;$('#btnShare').disabled=false;$('#btnXml').disabled=false;
}
/* 원조 솔로 + 편집 → 사용자 조로 이동 → 악보·헤드 ABC */
function applyView(){
  const prog=SONGDB[cur.selProg],tr=cur.trUser,wt=cur.selTrans||0;
  setSpelling(prog,songKeyPc(),tr);
  if(cur.view==='drill'){
    /* 연습: 사용자 조에서 바로 생성 — 기보 음(이조 포함) 기준 B♭5 상한·상하행 무작위 */
    cur.soloBase=generateDrill(cur.selProg,songKeyPc(),drillTopic(),cur.seed,{wt,feel:currentFeel()});
    cur.soloBases=[cur.soloBase];cur.shift=0;
    cur.solo=JSON.parse(JSON.stringify(cur.soloBase));cur.solos=[cur.solo];
  }else{
  if(cur.shift===undefined)cur.shift=transposeSolo(cur.soloBase,tr,cur.selInst).shift;
  const edited=applyEdits(JSON.parse(JSON.stringify(cur.soloBase)),cur.edits);
  cur.solo=transposeSolo(edited,tr,cur.selInst,cur.shift);
  cur.solos=[cur.solo].concat((cur.soloBases||[]).slice(1).map(b=>transposeSolo(JSON.parse(JSON.stringify(b)),tr,cur.selInst,cur.shift)));
  }
  {const L=cur.loopSel,nb=cur.solo.bars.length;if(L&&(L.song!==undefined&&L.song!==cur.selProg||L.ch>=cur.solos.length||(L.a!==null&&L.a>=nb)||(L.b!==null&&L.b>=nb)||(L.picks||[]).some(i=>i>=nb)))cur.loopSel=null;   /* v0.36 곡이 바뀌면 구간 해제 */
   if(cur.playRange&&!cur.playRange.loop)cur.playRange=null;else if(cur.playRange&&!cur.loopSel)cur.playRange=null}
  {const _sg=SONGDB[cur.selProg]||{};cur.sheetTitle=_sg.name||_sg.t||_sg.title||'Solo';}
  setSpelling(prog,mod12(songKeyPc()+wt),tr+wt);
  /* 기보 옥타브: 이조 후 기보 음이 오선 위로 과하게 뜨면(E♭ +9 등) 한 옥타브 내려 표기 — 소리(재생)는 그대로 */
  let wmx=-1e9;cur.solos.forEach(so=>so.bars.forEach(b=>b.notes.forEach(n=>{if(n.midi!==null)wmx=Math.max(wmx,n.midi+wt)})));
  cur.wOct=wt&&wmx>86?-12:0;
  cur.abc=toAbc(cur.solo,+$('#bpm').value,wt,cur.wOct);
  cur.bpl=sheetBPL();cur.abcs=cur.solos.map(so=>toAbc(so,+$('#bpm').value,wt,cur.wOct,cur.bpl));
  cur.chartAbc=headAbc(prog,tr+wt);
  setSpelling(prog,songKeyPc(),tr);
  renderSheet();
}
/* v0.59 화면 너비별 한 줄 마디 수 — 좁은 화면(휴대폰 세로)은 2마디씩 크게. 회전·창 크기가 바뀌어 기준을 넘으면 다시 그린다 */
const SHEET_NARROW_PX=560;
function sheetBPL(){return (window.innerWidth||1024)<SHEET_NARROW_PX?2:4}
{let _rt=null;window.addEventListener('resize',()=>{clearTimeout(_rt);_rt=setTimeout(()=>{if(cur.solo&&cur.bpl&&sheetBPL()!==cur.bpl)applyView()},250)})}
/* v0.29 연습 보기 — 솔로 대신 주제별 연습 악보(engine/drill.js)를 같은 악보·재생 경로로 보여 준다 */
function drillTopic(){const t=cur.topic||'auto';return (t==='ct'||t==='penta'||t==='scale'||t==='dom'||t==='gt')?t:'ct'}
const DRILL_WHAT={ct:'코드톤(1·3·5·7음) · 4분음표',penta:'펜타토닉 · 8분음표',scale:'기본 스케일 · 8분음표',dom:'활용 스케일(4마디마다 변형) · 8분음표',gt:'가이드톤(3·7음) 연결 라인 · 2분음표'};
function updDrill(){const dw=$('#drillWrap');if(dw)dw.style.display='none'}
/* 헤드(리드시트) — 형식 표시 + 코드톤 음표 차트(뿌리·3·5·7음), 사용자 조로 이동 */
function chordTone4(rootPc,type){const b=rootPc>6?48+rootPc:60+rootPc;return CHORD_TYPES[type].iv.map(r=>b+r)}
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
      const cst=chordBeats(b.length,bpb),half=cst.map((x,i)=>(i+1<cst.length?cst[i+1]:bpb)-x);   /* v0.38 */
      const exact={},letter={};   /* 마디 안 임시표 지속(v0.27.1 코드톤 음표) */
      let s=' '+lab;
      b.forEach((c,k)=>{
        s+='"'+chordSymbol(c.root,c.type)+'"';
        const T=CHORD_TYPES[c.type];
        const tones=chordTone4(c.root,c.type);
        const n=half[k],d=n>=4?2:1,cnt=Math.min(4,tones.length,2*n),rem=2*n-cnt*d;
        for(let m=0;m<cnt;m++){
          const p=spellParts(tones[m],c.root,T.scale),want=p.acc;
          const c1=exact[p.name]!==undefined?exact[p.name]:'',c2=letter[p.letter]!==undefined?letter[p.letter]:'';
          if(want!==c1||want!==c2)s+=want===''?'=':want;
          exact[p.name]=want;letter[p.letter]=want;
          const dl=m===cnt-1?d+rem:d;
          s+=p.name+(dl>1?dl:'')+' ';
        }
      });
      return s+' ';
    }).join('|')+'|');
  }
  rows[rows.length-1]=rows[rows.length-1].replace(/\|$/,'|]');
  return 'X:2\nM:'+bpb+'/4\nL:1/8\nK:'+K+'\n'+rows.join('\n');
}
function regen(){if(cur.solo)gen(false)}
songSel.onchange=()=>{
  cur.selProg=songSel.value;applyMySongHead();cur.trUser=0;updTr();updFeelNote();updSongStatus();if(typeof fetch==='function')prefetchSamples(currentFeel(),cur.tone);
  const s=SONGDB[cur.selProg];
  $('#bpm').value=s.bpm;$('#bpmVal').textContent=s.bpm+' BPM';
  gen(true);
};
$('#btnGen').onclick=()=>gen(true);
setTimeout(()=>{try{updSongStatus();updFeelNote();if(typeof fetch==='function')prefetchSamples(currentFeel(),cur.tone)}catch(e){console.error(e)}},0);

function renderSheet(){
  const p=$('#paper');
  p.classList.remove('deal');void p.offsetWidth;p.classList.add('deal');
  const s=SONGDB[cur.selProg];
  $('#paperTitle').textContent=s.name;
  const kOrig=keyLabel(origKey(),0),kNow=keyLabel(songKeyPc(),cur.trUser);
  $('#paperMeta').textContent=(cur.trUser?kNow+' (원곡 '+kOrig+')':kNow)+(cur.selTrans?' · '+(cur.selTrans===9?'E♭ 악기 기보':'B♭ 악기 기보'):'')+' · '+s.bpm+' BPM 기본 · '+STYLE_DATA.profiles[cur.style].label+' · 난이도 '+cur.selLv+/* v0.50 악기 분류(목관·금관)는 악보 머리에서 숨김 — 목관·금관 스타일을 따로 만들 때 다시 표시 */(cur.topic&&cur.topic!=='auto'?' · 주제 '+TOPIC_L[cur.topic]:'')+' · 반주 '+FEEL_LABEL[currentFeel()]+(cur.solo&&cur.solo.quote?' · 테마 인용 '+(cur.solo.quote.bar+1)+'~'+(cur.solo.quote.bar+cur.solo.quote.bars)+'마디':'');
  $('#chartWrap').style.display=cur.view==='both'?'block':'none';
  updDrill();
  if(cur.view==='both'&&typeof ABCJS!=='undefined'){
    const cs=$('#chartStaff');cs.innerHTML='';
    ABCJS.renderAbc(cs,cur.chartAbc,{responsive:'resize',paddingtop:0,paddingbottom:0,paddingleft:0,paddingright:0});
  }
  /* 코러스 페이지: 코러스 수만큼 솔로 — 가로 스크롤(스냅)·탭으로 이동 */
  const pages=$('#chPages'),nav=$('#chNav'),N=cur.solos.length;
  const keepIdx=cur.pageIdx||0;
  pages.innerHTML='';nav.innerHTML='';
  cur.solos.forEach((so,c)=>{
    const pg=document.createElement('div');pg.className='chpage';pg.dataset.ch=c;
    pg.innerHTML='<div class="seclab sololab">'+(so.drill?'DRILL · 연습 — '+DRILL_WHAT[so.topic]+' · 상·하행 무작위(새로 만들기로 바뀜)':(so.head?'HEAD · '+chorusLabel(c)+' — 불러온 멜로디 그대로, 빈 마디는 솔로':'SOLO · '+chorusLabel(c))+(c===0?' · 음을 눌러 편집':''))+'</div>'+ZOOMBAR_HTML+'<div class="sheetwrap"><div id="'+(c===0?'staff':'staff'+c)+'"></div></div>';
    pages.appendChild(pg);
    const box=pg.lastChild;
    if(typeof ABCJS!=='undefined'){ABCJS.renderAbc(box,cur.abcs[c],{responsive:'resize',add_classes:true,paddingtop:0,paddingbottom:0,paddingleft:0,paddingright:0});colorNotes(so,box.querySelector('svg'))}
    else box.innerHTML='<div class="fallback">[오프라인 모드 · 음 이름 나열]\n'+so.bars.map(bar=>bar.notes.map(n=>n.midi===null?'쉼':n.midi).join(' ')).join('\n')+'</div>';
    document.querySelectorAll('.zsel').forEach(x=>x.value=cur.noteColors||'off');
    if(N>1){const b=document.createElement('button');b.textContent=chorusLabel(c);b.onclick=()=>goPage(c);nav.appendChild(b)}
  });
  if(N>1){const h=document.createElement('span');h.className='chhint';h.textContent='← 좌우로 스크롤해 다음 코러스 →';nav.appendChild(h)}
  pages.onscroll=()=>{const i=Math.round(pages.scrollLeft/Math.max(1,pages.clientWidth));if(i!==cur.pageIdx){cur.pageIdx=i;markNav();cur.barSel=new Set();renderChips()}};
  cur.pageIdx=Math.min(keepIdx,N-1);markNav();
  pages.style.scrollBehavior='auto';pages.scrollLeft=cur.pageIdx*pages.clientWidth;pages.style.scrollBehavior='';
  renderChips();
  const cnt={};cur.solo.bars.forEach(b=>b.tags.forEach(t=>cnt[t]=(cnt[t]||0)+1));
  const tags=['형식 '+cur.solo.form.sections.join('·')+' · 프레이즈 '+cur.solo.form.phrases+'개',...Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]).map(t=>t+(cnt[t]>1?' ×'+cnt[t]:''))];
  const st=cur.solo.stats;
  $('#analysisBox').style.display=cur.solo.drill?'none':'block';
  $('#tagRow').innerHTML='<div class="statrow" style="width:100%">'
    +'<div class="stat"><div class="v">'+st.targets+'</div><div class="k">코드 전환 타깃음</div></div>'
    +'<div class="stat"><div class="v">'+st.guideHits+'</div><div class="k">가이드톤 착지</div></div>'
    +'<div class="stat"><div class="v">'+st.appr+' / '+st.enc+'</div><div class="k">어프로치 / 인클로저</div></div>'
    +'<div class="stat"><div class="v">'+st.cells+'</div><div class="k">어휘 셀</div></div></div>'
    +tags.map(t=>'<span class="tag"><b>✦</b>'+t+'</span>').join('');
  $('#harmBox').style.display=cur.solo.drill?'none':'block';
  $('#harmList').innerHTML=cur.solo.harm.map(h=>{const p=h.label.split(' · ');return '<div class="harm"><b>'+(h.bar+1)+'마디</b>'+p[0]+' <span>· '+p.slice(1).join(' · ')+'</span></div>'}).join('');
  if(!cur.solo.drill)bindNoteClicks();
}

/* ── v0.30 마디 고정 · 소절 보관함 ── */
function curChorus(){return Math.min(cur.pageIdx||0,(cur.solos?cur.solos.length:1)-1)}
function renderChips(){
  const chips=$('#chips');if(!chips||!cur.solo)return;chips.innerHTML='';
  const ch=curChorus(),lkc=!cur.solo.drill&&cur.locks&&cur.locks[ch]||{};
  cur.solo.bars.forEach((bar,i)=>{
    const c=document.createElement('span');c.className='bar';
    const lockedBar=lkc[i];
    c.textContent=(lockedBar?'🔒 ':'')+(i+1)+'마디 '+bar.chords.map(x=>chordSymbol(x.root,x.type)).join(' ');
    if(lockedBar)c.classList.add('lock');
    if(cur.barSel&&cur.barSel.has(i))c.classList.add('sel');
    if(!cur.lockMode&&!cur.loopOn&&cur.selBar&&cur.selBar.ch===ch&&cur.selBar.bi===i)c.classList.add('pick');
    c.onclick=()=>barPick(ch,i);   /* v0.49 악보 마디를 눌러도 같은 동작(barPick) */
    if(cur.loopSel&&cur.loopSel.ch===ch&&loopBars(cur.loopSel).includes(i))c.classList.add('rng');
    chips.appendChild(c);
  });
  updLockBar();updRangeBar();drawSelBars();try{syncPlay()}catch(e){}
}
/* ── v0.49 마디 고르기 — 악보 마디 ↔ 아래 마디 번호 줄 동기화 · 고른 마디부터 재생 · 재생 중 누르면 그 마디로 건너뛰기 ──
   고정 모드: 고정할 마디 고르기 · 구간 반복: 구간 정하기 · 그 밖: 한 마디 고르기(▶ 재생이 거기서 시작, 맨 처음이 아니면 카운트 없이) */
function barPick(ch,bi){
  if(!cur.solo)return;
  const nb=cur.solo.bars.length,nCh=cur.solos?cur.solos.length:1;
  if(ch!==curChorus())goPage(ch);
  if(cur.lockMode&&!cur.solo.drill){if(!cur.barSel)cur.barSel=new Set();if(cur.barSel.has(bi))cur.barSel.delete(bi);else cur.barSel.add(bi);renderChips();return}
  if(cur.loopOn){loopPick(ch,bi);return}
  const same=cur.selBar&&cur.selBar.ch===ch&&cur.selBar.bi===bi;
  cur.selBar={ch,bi,song:cur.selProg};
  if(cur.playReq)startPlayRange({a0:ch*nb+bi,a1:nCh*nb-1,loop:false});   /* 재생 중 — 그 마디로 바로 건너뜀 */
  else if(same)startPlay();   /* 고른 마디를 한 번 더 누르면 재생 */
  renderChips();
}
function selBarOK(){const s=cur.selBar;return !!(s&&cur.solo&&s.song===cur.selProg&&s.ch<(cur.solos?cur.solos.length:1)&&s.bi<cur.solo.bars.length)}
/* 악보 svg의 마디 영역 — abcjs add_classes(abcjs-lN 줄 · abcjs-mN 줄 안 마디)로 줄·마디별 상자. client=true면 화면 좌표 */
function barGeom(svg,nb,client){
  if(!svg)return null;
  const M=new Map(),Ls=new Map();
  svg.querySelectorAll('[class*="abcjs-l"]').forEach(el=>{
    const c=el.getAttribute('class')||'',l=c.match(/\babcjs-l(\d+)\b/);if(!l)return;
    let b;try{b=client?el.getBoundingClientRect():el.getBBox()}catch(e){return}
    if(!b||(!b.width&&!b.height))return;
    const L=+l[1],ly=Ls.get(L)||{x1:1e9,x2:-1e9,y1:1e9,y2:-1e9};
    ly.x1=Math.min(ly.x1,b.x);ly.x2=Math.max(ly.x2,b.x+b.width);ly.y1=Math.min(ly.y1,b.y);ly.y2=Math.max(ly.y2,b.y+b.height);Ls.set(L,ly);
    const m=c.match(/\babcjs-m(\d+)\b/);if(!m)return;
    const k=L*1000+(+m[1]),g=M.get(k)||{L,x1:1e9,x2:-1e9};g.x1=Math.min(g.x1,b.x);g.x2=Math.max(g.x2,b.x+b.width);M.set(k,g);
  });
  const keys=[...M.keys()].sort((a,b)=>a-b);if(keys.length!==nb)return null;
  return keys.map((k,i)=>{const g=M.get(k),ly=Ls.get(g.L),pv=i>0?M.get(keys[i-1]):null;
    return {x1:pv&&pv.L===g.L?pv.x2:ly.x1,x2:g.x2,y1:ly.y1,y2:ly.y2}});
}
function barAtPoint(ch,x,y){
  const so=cur.solos&&cur.solos[ch];if(!so)return -1;
  const G=barGeom(staffSvg(ch),so.bars.length,true);if(!G)return -1;
  let best=-1,bd=1e9;
  G.forEach((g,i)=>{if(y<g.y1-12||y>g.y2+12)return;const d=x<g.x1?g.x1-x:x>g.x2?x-g.x2:0;if(d<bd){bd=d;best=i}});
  return bd<=24?best:-1;
}
function drawSelBars(){
  document.querySelectorAll('#chPages svg .selbar').forEach(r=>r.remove());
  if(!cur.solo||!cur.solos)return;
  let ch=-1,bars=[];
  if(cur.lockMode&&!cur.solo.drill){ch=curChorus();
    const lk=(cur.locks||{})[ch]||{},rt=fbRatedNow(ch);
    Object.keys(lk).forEach(i=>bars.push([+i,'selbar lockd']));
    Object.keys(rt).forEach(i=>bars.push([+i,rt[i]>0?'selbar liked':'selbar disliked']));
    (cur.barSel||new Set()).forEach(i=>bars.push([i,'selbar cur']))}
  else if(cur.loopOn&&cur.loopSel){const L=cur.loopSel;ch=L.ch;const pk=L.picks||[];
    if(L.a!==null)for(let i=L.a;i<=(L.b===null?L.a:L.b);i++)if(!pk.includes(i))bars.push([i,L.b===null?'selbar rng pend':'selbar rng']);
    pk.forEach(i=>bars.push([i,'selbar pk']))}
  else if(selBarOK()){ch=cur.selBar.ch;bars=[cur.selBar.bi]}
  if(ch<0||!bars.length)return;
  const svg=staffSvg(ch),G=barGeom(svg,cur.solos[ch].bars.length,false);if(!G)return;
  bars.forEach(x=>{const i=Array.isArray(x)?x[0]:x,g=G[i];if(!g)return;
    const r=document.createElementNS('http://www.w3.org/2000/svg','rect');r.setAttribute('class',Array.isArray(x)?x[1]:'selbar');r.setAttribute('rx','6');
    r.setAttribute('x',g.x1+2);r.setAttribute('y',g.y1-4);r.setAttribute('width',Math.max(8,g.x2-g.x1-2));r.setAttribute('height',g.y2-g.y1+8);
    svg.insertBefore(r,svg.firstChild)});
}
/* ── v0.36 마디부터 재생 · 구간 반복 ── */
function startPlayRange(pr){cur.playRange=pr;cur._pp=null;if(cur.audio)stopAll();cur.paused=false;document.querySelectorAll('.paper').forEach(p=>p.classList.remove('paused'));playAll();syncPlay();try{setFsLabel()}catch(e){}}
function chipPlay(i){
  if(!cur.solo)return;
  const ch=curChorus(),nb=cur.solo.bars.length,nCh=cur.solos?cur.solos.length:1;
  if(!cur.loopOn){cur.loopSel=null;startPlayRange({a0:ch*nb+i,a1:nCh*nb-1,loop:false});renderChips();return}
  loopTap(ch,i);
}
/* ── v0.51 구간 반복 — 악보를 눌러 고른다. 한 번씩: 첫 마디 → 끝 마디(노랑) · 두 번 빠르게: 그 마디만 따로(주황, 다시 두 번 누르면 빼기)
   예) 4 → 6마디 + 1·8마디 두 번씩 = 1·4·5·6·8마디를 이어서 반복. cur.loopSel={ch,a,b,picks,song}(a·b 노랑 구간, picks 주황 낱마디) */
const LOOP_DBL_MS=320;
function loopBars(L){if(!L)return [];const S=new Set(L.picks||[]);if(L.a!==null&&L.b!==null)for(let i=L.a;i<=L.b;i++)S.add(i);return [...S].sort((x,y)=>x-y)}
function loopReady(L){return !!(L&&(L.a===null||L.b!==null)&&loopBars(L).length)}
function loopRange(L){
  const nb=cur.solo.bars.length,bs=loopBars(L).map(i=>L.ch*nb+i);
  return bs.every((x,k)=>k===0||x===bs[k-1]+1)?{a0:bs[0],a1:bs[bs.length-1],loop:true}:{list:bs,loop:true};
}
function loopApply(){const L=cur.loopSel;if(loopReady(L))startPlayRange(loopRange(L));else stopIfPlaying();renderChips()}
function loopTap(ch,i){
  const L=cur.loopSel;
  if(!L||L.ch!==ch){cur.loopSel={ch,a:i,b:null,picks:[],song:cur.selProg};stopIfPlaying();renderChips();return}   /* 첫 마디 */
  if(L.a===null||L.b!==null){L.a=i;L.b=null;stopIfPlaying();renderChips();return}   /* 새 구간의 첫 마디(주황 낱마디는 그대로) */
  const a=Math.min(L.a,i),b=Math.max(L.a,i);L.a=a;L.b=b;loopApply();   /* 끝 마디 */
}
function loopDbl(ch,i){
  let L=cur.loopSel;
  if(!L||L.ch!==ch)L=cur.loopSel={ch,a:null,b:null,picks:[],song:cur.selProg};
  const P=L.picks||(L.picks=[]),k=P.indexOf(i);if(k>=0)P.splice(k,1);else P.push(i);
  if(L.a===null&&!P.length){cur.loopSel=null;if(cur.playRange&&cur.playRange.loop){cur.playRange=null;stopIfPlaying()}renderChips();return}
  loopApply();
}
function loopPick(ch,bi){   /* 한 번 누름은 잠깐 기다렸다가(두 번 누름인지 보고) 처리 */
  const now=performance.now(),P=cur._lt;
  if(P&&P.ch===ch&&P.bi===bi&&now-P.t<LOOP_DBL_MS){clearTimeout(P.timer);cur._lt=null;loopDbl(ch,bi);return}
  if(P){clearTimeout(P.timer);cur._lt=null;loopTap(P.ch,P.bi)}
  cur._lt={ch,bi,t:now,timer:setTimeout(()=>{const Q=cur._lt;cur._lt=null;if(Q)loopTap(Q.ch,Q.bi)},LOOP_DBL_MS)};
}
function updRangeBar(){
  const h=$('#rangeHint');if(!h)return;
  const rb=$('#rangeBar');rb.style.display=(!cur.solo||cur.lockMode)?'none':'flex';
  const L=cur.loopSel,pfx=L&&cur.solos&&cur.solos.length>1?(L.ch+1)+'코러스 ':'',LB=loopBars(L),lbl=LB.length?barRangeLabel(LB)+'마디':'';
  const pp=$('#paper');if(pp){pp.classList.toggle('loopon',!!cur.loopOn);pp.classList.toggle('pickon',!!(cur.lockMode&&cur.solo&&!cur.solo.drill))}   /* v0.51 구간 반복 중엔 아래 마디 번호 줄을 숨기고 악보로 고른다 */
  const SB=selBarOK()?cur.selBar:null,spf=SB&&cur.solos&&cur.solos.length>1?(SB.ch+1)+'코러스 ':'';
  if(!cur.loopOn)h.textContent=SB?spf+(SB.bi+1)+'마디 고름 · ▶ 재생은 여기서'+(SB.ch||SB.bi?' 카운트 없이 바로':'')+' 시작 · 재생 중에 마디를 누르면 그 마디로 건너뜁니다':'악보의 마디를 눌러 고르면 ▶ 재생이 그 마디부터 · 재생 중에 누르면 그 마디로 건너뜁니다';
  else if(!L)h.textContent='악보에서 첫 마디 → 끝 마디를 누르면 그 구간(노랑)을 반복 · 마디를 두 번 빠르게 누르면 그 마디만 따로 골라(주황) 이어서 반복';
  else if(L.a!==null&&L.b===null)h.textContent=pfx+(L.a+1)+'마디부터 — 끝 마디를 누르세요 (같은 마디를 한 번 더 누르면 한 마디 반복)'+((L.picks||[]).length?' · 따로 고른 마디 '+barRangeLabel([...L.picks].sort((x,y)=>x-y)):'');
  else h.textContent=pfx+lbl+' 반복 중 · 두 번 누르면 낱마디 넣기·빼기 · ▶ 재생도 이 마디들을 반복';
  $('#btnRangeClr').style.display=(L||(!cur.loopOn&&SB))?'':'none';
  h.hidden=!cur.loopOn&&!SB;   /* v0.62 고른 마디도 구간 반복도 없을 때는 안내 줄을 숨겨 악보를 넓게 */
  $('#btnRangeClr').textContent=L?'구간 지우기':'고른 마디 지우기';
  /* v0.43.0 악보 위 도구줄의 구간 반복 버튼 — 상태를 글자로 보여 준다 */
  const lab=!cur.loopOn?'🔁 구간 반복':!L?'🔁 첫 마디 고르기':(L.a!==null&&L.b===null)?'🔁 '+pfx+(L.a+1)+'마디~ 끝 마디?':'🔁 '+pfx+lbl+' 반복';
  document.querySelectorAll('.loopmode').forEach(b=>{b.classList.toggle('on',!!cur.loopOn);b.textContent=lab;b.style.display=(cur.solo&&cur.solo.drill)?'none':''});
}
function setLoopOn(on){
  cur.loopOn=on;const cb=$('#loopOn');if(cb)cb.checked=on;
  if(!on){cur.loopSel=null;if(cur.playRange&&cur.playRange.loop){cur.playRange=null;stopIfPlaying()}}
}
$('#loopOn').addEventListener('change',e=>{setLoopOn(e.target.checked);renderChips()});
/* v0.43.0 악보 위 🔁 구간 반복 버튼 — 켜면 마디 고정 모드는 끄고 마디 번호 줄로 내려 준다 */
document.addEventListener('click',e=>{
  const b=e.target.closest('.loopmode');if(!b)return;
  setLoopOn(!cur.loopOn);
  if(cur.loopOn&&cur.lockMode){cur.lockMode=false;cur.barSel=new Set();renderSheet()}else renderChips();
  if(cur.loopOn){const el=$('#chPages');if(el)el.scrollIntoView({behavior:'smooth',block:'start'})}
});
$('#btnRangeClr').onclick=()=>{if(!cur.loopOn)cur.selBar=null;cur.loopSel=null;if(cur.playRange&&cur.playRange.loop){cur.playRange=null;stopIfPlaying()}renderChips()};
function updLockBar(){
  const lb=$('#lockBar');if(!lb)return;
  document.querySelectorAll('.lockmode').forEach(b=>{b.classList.toggle('on',!!cur.lockMode);b.style.display=(cur.solo&&cur.solo.drill)?'none':''});
  if(!cur.solo||cur.solo.drill||!cur.lockMode){lb.style.display='none';return}
  lb.style.display='flex';
  const ch=curChorus(),nSel=cur.barSel?cur.barSel.size:0;
  let nLock=0;Object.values(cur.locks||{}).forEach(m=>nLock+=Object.keys(m).length);
  const pfx=(cur.solos&&cur.solos.length>1)?(ch+1)+'코러스 · ':'';
  $('#lockHint').textContent=pfx+(nSel?barRangeLabel(selBars())+'마디 고름':'악보에서 마디를 눌러 고르세요(여러 마디 가능)')+(nLock?' · 🔒 남겨 둔 마디 '+nLock+'개(파랑)':'');
  $('#btnSnip').disabled=!nSel;$('#btnLike').disabled=!nSel;$('#btnDislike').disabled=!nSel;
  $('#btnRegenRest').disabled=!nSel&&!nLock;$('#btnRegenRest').textContent=nSel?'↻ 고른 마디만 남기고 새로 생성':'↻ 남겨 둔 마디는 두고 새로 생성';
  $('#btnUnlock').style.display=nLock?'':'none';$('#btnUnlock').textContent=nSel&&selBars().some(i=>(cur.locks[ch]||{})[i])?'고른 마디 고정 풀기':'고정 모두 풀기';
  fbSyncCount();
}
function barNotesNow(ch,i){   /* 편집이 반영된 원조(실음) 마디 — 편집은 1코러스에만 있다 */
  const base=ch===0?applyEdits(JSON.parse(JSON.stringify(cur.soloBase)),cur.edits):cur.soloBases[ch];
  return JSON.parse(JSON.stringify(base.bars[i].notes));
}
function selBars(){return [...(cur.barSel||[])].sort((a,b)=>a-b)}
/* ── v0.52 마디 평가(좋아요·싫어요) — 이 기기 localStorage에 쌓고 「📤 마디 평가 내보내기」로 파일을 받아 개발자에게 보낸다.
   한 기록 = 곡·생성 설정(시드 등)·코러스·마디·코드·음(실음 midi, 틱)·앞뒤 음·기법 태그 → tools/feedback_report.js 로 모아 엔진에 반영.
   헤드(불러온 원곡 멜로디) 마디는 음을 남기지 않는다(원곡 멜로디가 파일로 나가지 않게). 비밀번호·토큰 없이 파일로만 오간다 ── */
const FB_KEY='clu.barfb.v1',FB_BATCH=100,FB_MAX=3000;
/* v0.53 자동 보내기 — 수신 주소(Cloudflare Worker)가 빌드에 들어 있으면 👍·👎를 누르는 즉시 익명으로 보낸다(못 보내면 다음에 다시).
   cid = 이 기기의 무작위 번호(이름·연락처 아님). 「⚙ 설정 → 저장·내보내기」에서 끌 수 있다. 주소가 없으면 파일 내보내기 방식 */
const FB_ENDPOINT=/*__FB_ENDPOINT__*/'https://clu-feedbacks.shingum08.workers.dev';
const FB_SEND_KEY='clu.fbsend.v1',FB_CID_KEY='clu.cid.v1';
function fbAuto(){if(!FB_ENDPOINT)return false;try{return localStorage.getItem(FB_SEND_KEY)!=='0'}catch(e){return true}}
function fbCid(){try{let c=localStorage.getItem(FB_CID_KEY);if(!c){c=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12));localStorage.setItem(FB_CID_KEY,c)}return c}catch(e){return cur._cid||(cur._cid='t'+Date.now().toString(36)+'-tmp')}}
function fbUnsent(){return (cur.fb||[]).filter(x=>!x.s)}
async function fbSend(){
  if(!fbAuto()||cur._fbBusy)return;
  const q=fbUnsent();if(!q.length)return;
  cur._fbBusy=true;
  try{
    for(let i=0;i<q.length;i+=50){
      const part=q.slice(i,i+50);
      const res=await fetch(FB_ENDPOINT+'/v1/feedback',{method:'POST',headers:{'content-type':'text/plain'},keepalive:true,
        body:JSON.stringify({cid:fbCid(),v:APP_VER,records:part.map(({x,s,...r})=>r)})});
      if(!res.ok)throw new Error('HTTP '+res.status);
      part.forEach(r=>r.s=1);fbStore();
    }
    cur._fbErr='';
  }catch(e){cur._fbErr='지금은 보내지 못했어요 — 연결되면 다시 보냅니다'}
  finally{cur._fbBusy=false;fbSyncCount()}
}
function fbLoad(){try{const v=JSON.parse(localStorage.getItem(FB_KEY)||'[]');return Array.isArray(v)?v:[]}catch(e){return []}}
function fbStore(){try{localStorage.setItem(FB_KEY,JSON.stringify(cur.fb.slice(-FB_MAX)))}catch(e){}}
function fbSolKey(ch){return [cur.selProg,cur.seed,cur.selLv,cur.style,cur.selInst,cur.lyric,cur.topic,ch].join('|')}
function fbRatedNow(ch){const k=fbSolKey(ch),o={};(cur.fb||[]).forEach(r=>{if(r.sk===k)o[r.bar]=r.r});return o}
function fbRecord(ch,i,r){
  const base=ch===0?applyEdits(JSON.parse(JSON.stringify(cur.soloBase)),cur.edits):cur.soloBases[ch],B=base.bars,b=B[i],sg=SONGDB[cur.selProg]||{};
  const isMy=/^u_/.test(cur.selProg),head=!!b.head;
  const nn=x=>x?x.notes.filter(n=>n.midi!==null&&n.midi!==undefined):[];
  const pv=nn(B[i-1]),nx=nn(B[i+1]);
  return {id:Date.now().toString(36)+'-'+ch+'-'+i,sk:fbSolKey(ch),ts:new Date().toISOString(),v:APP_VER,r,
    song:{id:cur.selProg,n:sg.name||'',my:isMy,cls:sg.c||'',keyPc:base.keyPc,form:base.form||null},
    set:{seed:cur.seed,diff:cur.selDiff,lv:cur.selLv,style:cur.style,inst:cur.selInst,lyric:cur.lyric,topic:cur.topic||null,feel:base.feel||null,bpm:+$('#bpm').value,choruses:cur.solos?cur.solos.length:1},
    ch,bar:i,nb:B.length,bpb:base.bpb,chords:b.chords||[],tags:b.tags||[],head,edited:ch===0&&!!(cur.edits&&Object.keys(cur.edits).some(k=>+String(k).split(':')[0]===i)),
    notes:head?null:b.notes.map(n=>[n.t,n.d,n.midi===undefined?null:n.midi].concat(n.trip?['t']:[])),
    prev:head||!pv.length?null:pv[pv.length-1].midi,next:head||!nx.length?null:nx[0].midi};
}
function fbRate(r){
  const bs=selBars();if(!bs.length||!cur.solo)return;
  const ch=curChorus(),k=fbSolKey(ch);
  bs.forEach(i=>{cur.fb=cur.fb.filter(x=>!(x.sk===k&&x.bar===i));cur.fb.push(fbRecord(ch,i,r))});   /* 같은 솔로 같은 마디는 마지막 평가로 */
  fbStore();cur.barSel=new Set();renderChips();
  if(fbAuto()){fbToast((r>0?'👍 ':'👎 ')+barRangeLabel(bs)+'마디 — 고마워요! 보내는 중…');fbSend();return}
  const n=fbPending();if(n&&n%FB_BATCH===0)fbToast(n+'개 모였어요! 📤 평가 내보내기로 파일을 받아 보내 주세요');else fbToast((r>0?'👍 ':'👎 ')+barRangeLabel(bs)+'마디 평가 저장');
}
function fbPending(){return (cur.fb||[]).filter(x=>!x.x).length}
function fbToast(t){const el=$('#fbCount');if(!el)return;cur._fbMsg=t;fbSyncCount();clearTimeout(cur._fbT);cur._fbT=setTimeout(()=>{cur._fbMsg='';fbSyncCount()},2600)}
function fbSyncCount(){
  const el=$('#fbCount');if(!el)return;const all=(cur.fb||[]).length,n=fbPending(),up=(cur.fb||[]).filter(x=>!x.x&&x.r>0).length;
  el.innerHTML='';
  if(fbAuto()){   /* v0.53 자동 보내기 */
    const sent=all-fbUnsent().length,un=fbUnsent().length,sp=document.createElement('span');
    sp.textContent=cur._fbMsg||(cur._fbErr&&un?cur._fbErr+' ('+un+'개 대기)':sent?'보낸 평가 '+sent+'개 · 고마워요! 솔로 생성 개선에 씁니다':'좋은 마디·아쉬운 마디에 👍·👎를 눌러 주세요 — 익명으로 개발팀에 보내져 솔로 생성 개선에 쓰입니다');
    el.appendChild(sp);
    const nt=document.createElement('span');nt.className='fbnote2';nt.textContent='보내는 것: 곡·설정·마디의 코드와 음 · 이 기기 무작위 번호(이름·연락처 없음) · 설정에서 끌 수 있어요';el.appendChild(nt);
    const eb=$('#btnFbExport');if(eb)eb.textContent='📤 마디 평가 내보내기(파일)';
    return;
  }
  const sp=document.createElement('span');sp.textContent=cur._fbMsg||(n?'보내지 않은 평가 '+n+'개(👍 '+up+' · 👎 '+(n-up)+')'+(n>=FB_BATCH?' — 내보내 보내 주세요':' · '+FB_BATCH+'개 모이면 알려 드려요'):all?'평가는 모두 내보냈어요':'고른 마디에 👍·👎를 누르면 이 기기에 쌓입니다');
  if(n>=FB_BATCH&&!cur._fbMsg)sp.className='full';el.appendChild(sp);
  if(n){const b=document.createElement('button');b.type='button';b.textContent='📤 내보내기';b.onclick=fbExport;el.appendChild(b)}
  const eb=$('#btnFbExport');if(eb)eb.textContent='📤 마디 평가 내보내기'+(n?' ('+n+')':'');
}
function fbExport(){
  const recs=(cur.fb||[]).filter(x=>!x.x);
  if(!recs.length){fbToast('보낼 평가가 없어요');return}
  const now=new Date(),pad=x=>String(x).padStart(2,'0'),stamp=now.getFullYear()+pad(now.getMonth()+1)+pad(now.getDate())+'-'+pad(now.getHours())+pad(now.getMinutes());
  const data={app:'Clu',kind:'bar-feedback',format:1,v:APP_VER,exported:now.toISOString(),count:recs.length,records:recs.map(({x,...r})=>r)};
  const name='ezimprovjazz-마디평가-'+stamp+'-'+recs.length+'개.json',blob=new Blob([JSON.stringify(data)],{type:'application/json'});
  const mark=()=>{recs.forEach(r=>r.x=1);fbStore();fbSyncCount();fbToast(recs.length+'개 내보냄 — 받은 파일을 개발자에게 보내 주세요')};
  try{const f=new File([blob],name,{type:'application/json'});
    if(navigator.canShare&&navigator.canShare({files:[f]})&&/Android|iPhone|iPad/i.test(navigator.userAgent)){navigator.share({files:[f],title:'EzImprovJazz 마디 평가'}).then(mark,()=>{});return}}catch(e){}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);mark();
}
const SNIP_KEY='clu.snips.v1';
function loadSnips(){try{const v=JSON.parse(localStorage.getItem(SNIP_KEY)||'[]');return Array.isArray(v)?v:[]}catch(e){return []}}
function storeSnips(){try{localStorage.setItem(SNIP_KEY,JSON.stringify(cur.snips))}catch(e){}acctQueue('snips')}
function barRangeLabel(bs){const out=[];let s=null,p=null;bs.forEach(b=>{if(s===null){s=p=b}else if(b===p+1){p=b}else{out.push(s===p?(s+1)+'':(s+1)+'–'+(p+1));s=p=b}});if(s!==null)out.push(s===p?(s+1)+'':(s+1)+'–'+(p+1));return out.join(', ')}
function renderSnips(){
  const el=$('#snipList');if(!el)return;
  if(!cur.snips.length){el.innerHTML='<div class="none">아직 보관한 소절이 없습니다. 「✋ 마디 고르기」에서 악보의 마디를 고른 뒤 보관하세요.</div>';return}
  el.innerHTML='';
  cur.snips.forEach((sn,idx)=>{
    const d=document.createElement('div');d.className='sitem';
    d.innerHTML='<span class="nm">♡ <b>'+sn.name+'</b></span>';
    const b=document.createElement('button');b.textContent='불러와 고정';
    b.onclick=()=>{
      if(!SONGDB[sn.song])return;
      if(cur.selProg!==sn.song){cur.selProg=sn.song;cur.trUser=0;songSel.value=sn.song;updTr();const s=SONGDB[sn.song];$('#bpm').value=s.bpm;$('#bpmVal').textContent=s.bpm+' BPM'}
      if(cur.view==='drill'){cur.view='solo';$('#viewSel').value='solo'}
      const same=cur.lockSong===sn.song;cur.lockSong=sn.song;if(!same||!cur.locks)cur.locks={};cur.locks[0]=Object.assign({},cur.locks[0]||{},JSON.parse(JSON.stringify(sn.notes)));cur.barSel=new Set();
      stopIfPlaying();gen(true);window.scrollTo({top:0,behavior:'smooth'});
    };
    const x=document.createElement('button');x.textContent='삭제';
    x.onclick=()=>{cur.snips.splice(idx,1);storeSnips();renderSnips()};
    d.appendChild(b);d.appendChild(x);el.appendChild(d);
  });
}
cur.snips=loadSnips();cur.locks={};cur.barSel=new Set();cur.lockMode=false;renderSnips();
cur.fb=fbLoad();
/* v0.53 평가 자동 보내기 켜기·끄기(설정) · 안 보낸 평가는 열릴 때·다시 연결될 때 보냄 */
{const cb=$('#fbSendOn');if(cb){cb.closest('label').style.display=FB_ENDPOINT?'':'none';cb.checked=fbAuto();
  cb.addEventListener('change',()=>{try{localStorage.setItem(FB_SEND_KEY,cb.checked?'1':'0')}catch(e){}fbSyncCount();if(cb.checked)fbSend()})}}
window.addEventListener('online',()=>fbSend());setTimeout(()=>fbSend(),1500);
$('#btnLike').onclick=()=>fbRate(1);$('#btnDislike').onclick=()=>fbRate(-1);
$('#btnFbExport').onclick=fbExport;
/* 마디 고정 모드 토글 — 켜면 마디 선택과 고정 도구가 나타난다 */
document.addEventListener('click',e=>{
  const b=e.target.closest('.lockmode');if(!b)return;
  cur.lockMode=!cur.lockMode;
  if(!cur.lockMode)cur.barSel=new Set();else setLoopOn(false);
  renderSheet();
  if(cur.lockMode){const el=$('#chPages');if(el)el.scrollIntoView({behavior:'smooth',block:'start'})}
});
document.addEventListener('pointerdown',e=>{if(e.target.closest&&e.target.closest('#chPages .abcjs-tempo')){e.preventDefault();tapTempo()}});
/* v0.49 악보 마디를 누르면 그 마디를 고른다(아래 마디 번호 줄도 같이 표시) · 재생 중이면 그 마디로 건너뜀.
   (v0.31~0.48의 「악보 누르면 일시정지」는 상단 ∥ 일시정지 버튼으로. 1코러스 음표 편집은 멈춰 있을 때 그대로) */
document.addEventListener('click',e=>{
  const sw=e.target.closest('.sheetwrap');if(!sw)return;
  const pg=sw.closest('.chpage');if(!pg||!cur.solo)return;
  if(e.target.closest('.abcjs-tempo'))return;   /* v0.50 템포 표시는 탭 템포(pointerdown에서 처리) */
  const ch=+pg.dataset.ch||0,bi=barAtPoint(ch,e.clientX,e.clientY);
  if(bi>=0)barPick(ch,bi);
});
function lockSelected(){if(!cur.locks)cur.locks={};cur.lockSong=cur.selProg;const ch=curChorus(),m=cur.locks[ch]||(cur.locks[ch]={});selBars().forEach(i=>{m[i]=barNotesNow(ch,i)});cur.barSel=new Set()}
$('#btnUnlock').onclick=()=>{const ch=curChorus(),m=cur.locks[ch]||{};const bs=selBars().filter(i=>m[i]);if(bs.length)bs.forEach(i=>delete m[i]);else cur.locks[ch]={};cur.barSel=new Set();renderChips()};
$('#btnRegenRest').onclick=()=>{const was=!!cur.audio;stopIfPlaying();if(cur.barSel&&cur.barSel.size)lockSelected();gen(true);if(was){playAll();syncPlay()}};   /* v0.52 고른 마디를 고정하고 바로 새로 생성 */
$('#btnSnip').onclick=()=>{
  const bs=selBars();if(!bs.length)return;
  const ch=curChorus();
  const sg=SONGDB[cur.selProg],notes={};bs.forEach(i=>{notes[i]=barNotesNow(ch,i)});
  cur.snips.unshift({id:Date.now(),song:cur.selProg,bars:bs,notes,name:sg.name+' · '+barRangeLabel(bs)+'마디'});
  storeSnips();askPersist();renderSnips();cur.barSel=new Set();renderSheet();
};
function markNav(){[...$('#chNav').querySelectorAll('button')].forEach((b,i)=>b.classList.toggle('on',i===cur.pageIdx))}
/* v0.27.1 초심자 음표 색상 — 코드톤=노랑 · 스케일음=파랑 · 코드 밖=빨강 */
const ZOOMBAR_HTML='';   /* v0.45 확대·마디 고정·구간 반복은 ⚙ 설정 「연습 도구」, 음표색은 상단 막대로 */
const NOTE_CSS=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
/* 코러스 c의 악보 svg — abcjs는 .sheetwrap 바로 안에 svg를 그린다(#staff 안이 아님) */
function staffSvg(c){
  const pg=document.querySelector('#chPages .chpage[data-ch="'+(c||0)+'"]');
  if(!pg)return null;
  const svgs=[...pg.querySelectorAll('.sheetwrap svg')];
  return svgs.find(x=>x.querySelector('.abcjs-notehead'))||svgs[0]||null;
}
function colorNotes(solo,svg){
  if(!svg||!solo)return;
  const mode=cur.noteColors||'off';   /* off|role|pitch */
  svg.classList.toggle('lgoff',mode==='off');
  svg.querySelectorAll('.abcjs-notehead').forEach(el=>{el.classList.remove('ct','out','pc0','pc1','pc2','pc3','pc4','pc5','pc6','pc7','pc8','pc9','pc10','pc11')});
  if(mode==='off')return;
  const heads=[...svg.querySelectorAll('.abcjs-notehead:not([class*="rest"])')];
  const seq=[];solo.bars.forEach((bar,b)=>bar.notes.forEach((n,i)=>{if(n.midi!==null)seq.push({b,i,n})}));
  if(heads.length!==seq.length)return;
  heads.forEach((el,k)=>{
    const q=seq[k],n=q.n,bar=solo.bars[q.b];
    const ch=chordAtBeat(bar.chords,n.t/6,solo.bpb||4)||bar.chords[0];
    if(!ch)return;
    const rel=((n.midi-ch.root)%12+12)%12;
    if(mode==='pitch'){el.classList.add('pc'+rel)}
    else{
      el.classList.toggle('ct',CHORD_TYPES[ch.type].iv.includes(rel));
      el.classList.toggle('out',!CHORD_TYPES[ch.type].iv.includes(rel)&&!CHORD_TYPES[ch.type].scale.includes(rel));
    }
  });
}
function colorAll(){if(cur.solos)cur.solos.forEach((so,c)=>colorNotes(so,staffSvg(c)))}
/* 확대(페이지 배율) — − / + 10%씩, 80~300%. CSS transform으로 악보를 확대하고 좌우 스크롤 */
function applyZoom(){
  const z=cur.zoom||1;
  document.querySelectorAll('.zval').forEach(el=>el.textContent=Math.round(z*100)+'%');
  document.querySelectorAll('.chpage .sheetwrap > div').forEach(el=>{
    el.style.transform=z>1?'scale('+z+')':'';
    el.style.width=z>1?(100/z)+'%':'100%';
  });
}
document.addEventListener('click',e=>{
  const b=e.target.closest('.zbtn[data-z]');if(!b)return;
  const z0=cur.zoom||1;cur.zoom=b.getAttribute('data-z')==='+'?Math.min(3,z0+0.1):Math.max(0.8,Math.round((z0-0.1)*10)/10);
  applyZoom();
});
window.__setNoteColor=function(v){
  cur.noteColors=v;
  document.querySelectorAll('.zsel').forEach(x=>x.value=v);
  if(!cur.solos)return;
  cur.solos.forEach((so,c)=>{const svg=staffSvg(c);if(svg)colorNotes(so,svg)});
};
document.addEventListener('change',e=>{const sel=e.target.closest('select[data-color]');if(sel)window.__setNoteColor(sel.value)});
function goPage(i){const pg=$('#chPages');const chg=i!==cur.pageIdx;cur.pageIdx=i;markNav();if(chg){cur.barSel=new Set();renderChips()}const x=i*pg.clientWidth;if(typeof pg.scrollTo==='function'){try{pg.scrollTo({left:x,behavior:'smooth'});return}catch(_){}}pg.scrollLeft=x}
/* 재생 위치 콜백(playback.js) — 마디 칩 강조 + 재생 중 코러스 페이지 자동 이동 */
function onPlayPos(cr,bi,frac){
  if(cur._pp===cr+':'+bi)return;cur._pp=cr+':'+bi;
  [...$('#chips').children].forEach((c,i)=>c.classList.toggle('lit',i===bi));
  [...$('#chNav').querySelectorAll('button')].forEach((b,i)=>b.classList.toggle('playing',i===cr));
  if(cur._pc!==cr){cur._pc=cr;if(cur.solos&&cur.solos.length>1)goPage(cr)}
  highlightBar(cr,bi);
}
/* v0.31 노래방식 위치 표시 — 지금 연주 중인 마디를 악보 위에서 칠하고, 화면 밖이면 따라 내려간다 */
function barHeadMap(svg,solo){
  if(svg._barMap&&svg._barMapSolo===solo)return svg._barMap;
  const heads=[...svg.querySelectorAll('.abcjs-notehead:not([class*="rest"])')];
  const seq=[];solo.bars.forEach((bar,b)=>bar.notes.forEach(n=>{if(n.midi!==null)seq.push(b)}));
  if(heads.length!==seq.length)return svg._barMap=null;
  const map={};heads.forEach((el,k)=>{(map[seq[k]]||(map[seq[k]]=[])).push(el)});
  svg._barMap=map;svg._barMapSolo=solo;return map;
}
const USER_SCROLL_HOLD_MS=5000;
['wheel','touchstart','touchmove'].forEach(ev=>window.addEventListener(ev,()=>{cur._userScrollT=performance.now()},{passive:true}));
window.addEventListener('keydown',e=>{if(['PageUp','PageDown','ArrowUp','ArrowDown','Home','End'].includes(e.key))cur._userScrollT=performance.now()});
window.addEventListener('mousedown',e=>{if(e.target===document.documentElement||e.clientX>=document.documentElement.clientWidth)cur._userScrollT=performance.now()});   /* 스크롤바 끌기 */
function highlightBar(cr,bi){
  const svg=staffSvg(cr);
  if(cur._hl&&cur._hl.svg!==svg)clearPlayHl();
  if(!svg||!cur.solos||!cur.solos[cr])return;
  const map=barHeadMap(svg,cur.solos[cr]);
  let rect=cur._hl&&cur._hl.svg===svg?cur._hl.rect:null;
  const els=map&&map[bi]||[];
  if(els.length){
    try{
      let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
      els.forEach(el=>{const b=el.getBBox();x1=Math.min(x1,b.x);y1=Math.min(y1,b.y);x2=Math.max(x2,b.x+b.width);y2=Math.max(y2,b.y+b.height)});
      if(!rect){rect=document.createElementNS('http://www.w3.org/2000/svg','rect');rect.setAttribute('class','playcursor');rect.setAttribute('rx','6');svg.insertBefore(rect,svg.firstChild)}
      rect.setAttribute('x',x1-6);rect.setAttribute('y',y1-14);rect.setAttribute('width',(x2-x1)+12);rect.setAttribute('height',(y2-y1)+28);
      const r=els[0].getBoundingClientRect();
      const idle=performance.now()-(cur._userScrollT||-1e9)>USER_SCROLL_HOLD_MS;   /* v0.36 사용자가 스크롤하면 잠시 따라가지 않는다 */
      if(idle&&(r.top<70||r.bottom>window.innerHeight-60))window.scrollBy({top:r.top-window.innerHeight*0.38,behavior:'smooth'});
    }catch(e){}
  }else if(rect)rect.setAttribute('width','0');
  cur._hl={svg,els,rect};
}
function clearPlayHl(){
  if(!cur._hl)return;
  try{if(cur._hl.rect)cur._hl.rect.remove()}catch(e){}
  cur._hl=null;
}

/* ── 저장 ── */
const APP_VER=(document.title.match(/v(\d+\.\d+\.\d+)/)||[])[1]||'?';
$('#btnSave').onclick=()=>{
  const s=cur.solo,sg=SONGDB[cur.selProg];
  /* v0.42 악보 그대로 저장 — 시드뿐 아니라 실제 음표(코러스별 원본 + 편집)도 담아, 엔진이 바뀌어도 같은 악보로 돌아온다 */
  const snap=cur.view!=='drill'&&cur.soloBases&&cur.soloBases.length?{bases:JSON.parse(JSON.stringify(cur.soloBases)),edits:JSON.parse(JSON.stringify(cur.edits||{})),nCh:cur.soloBases.length}:null;
  cur.saved.unshift({v:APP_VER,snap,id:s.ts,seed:cur.seed,song:cur.selProg,tr:cur.trUser,diff:cur.selDiff,lv:cur.selLv,inst:cur.selInst,licks:cur.useLicks!==false,groups:cur.useGroups,style:cur.style,lyric:cur.lyric,lm:2,
    name:sg.name+' · '+keyLabel(songKeyPc(),cur.trUser)+' · '+STYLE_DATA.profiles[cur.style].label+' · 난이도 '+cur.selLv});
  storeSaved();askPersist();renderSaved();
};
function renderSaved(){
  const el=$('#savedList');
  if(!cur.saved.length){el.innerHTML='<div class="none">아직 저장한 솔로가 없습니다.</div>';return}
  el.innerHTML='';
  cur.saved.forEach(item=>{
    const d=document.createElement('div');d.className='sitem';
    d.innerHTML='<span class="nm">♡ <b>'+item.name+'</b>'+(item.snap?'<span class="old">악보 그대로 저장'+(item.snap.nCh>1?' · '+item.snap.nCh+'코러스':'')+'</span>':item.v&&item.v!==APP_VER?'<span class="old">v'+item.v+'에서 저장 — 악보가 조금 다를 수 있음</span>':'')+'</span>';
    const acts=document.createElement('span');acts.className='acts';
    const b=document.createElement('button');b.textContent='불러오기';
    b.onclick=()=>{
      cur.selProg=item.song;cur.trUser=item.tr||0;setLevel(lvFromItem(item));cur.selInst=item.inst||'wind';
      cur.useLicks=item.licks!==false;cur.useGroups=item.groups!==false;cur.style=item.style||'all';
      cur.seed=item.seed;cur.edits={};cur.sel=null;
      cur.sig=[cur.selProg,cur.selDiff,cur.selLv,cur.selInst,cur.useLicks,cur.style,cur.useGroups].join('|');
      styleSel.value=cur.style;updStyleDesc();updTr();
      const s=SONGDB[cur.selProg];$('#bpm').value=s.bpm;$('#bpmVal').textContent=s.bpm+' BPM';
      songSel.value=cur.selProg;
      [...$('#segInst').children].forEach((c,i)=>c.classList.toggle('on',(i===0)===(cur.selInst==='wind')));
      $('#diffSel').value=String(cur.selLv);
      cur.lyric=item.lyric==null?LYRIC_MAP.def:item.lm===2?item.lyric:lyricFromOld(item.lyric);$('#lyric').value=cur.lyric;$('#lyrVal').textContent='노래 '+cur.lyric+' · 비밥 '+(100-cur.lyric);
      if(item.snap&&cur.view==='drill'){cur.view='solo';$('#viewSel').value='solo'}
      if(item.snap){$('#chorusSel').value=item.snap.nCh;cur.chorus=item.snap.nCh}
      gen(false);
      if(item.snap&&cur.view!=='drill'){   /* 저장한 음표로 바꿔 끼운다 */
        cur.soloBases=JSON.parse(JSON.stringify(item.snap.bases));cur.soloBase=cur.soloBases[0];cur.edits=JSON.parse(JSON.stringify(item.snap.edits||{}));cur.sel=null;cur.shift=undefined;applyView();
      }
      window.scrollTo({top:0,behavior:'smooth'});
    };
    const x=document.createElement('button');x.textContent='삭제';
    x.onclick=()=>{cur.saved=cur.saved.filter(q=>q!==item);storeSaved();renderSaved()};
    acts.appendChild(b);acts.appendChild(x);d.appendChild(acts);el.appendChild(d);
  });
}
/* ── v0.41 저장 영속화 · 백업 · 앱 설치 ── */
const SAVE_KEY='clu.saved.v1';
function loadSaved(){try{const v=JSON.parse(localStorage.getItem(SAVE_KEY)||'[]');return Array.isArray(v)?v:[]}catch(e){return []}}
function storeSaved(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(cur.saved))}catch(e){}acctQueue('saved')}
/* 브라우저가 공간이 부족할 때 지우지 않도록 요청(지원·허용 여부는 브라우저가 정한다) */
function askPersist(){try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{})}catch(e){}}
cur.saved=loadSaved().filter(it=>it&&SONGDB[it.song]);renderSaved();
$('#btnBackup').onclick=()=>{
  const data={app:'clu',kind:'backup',ver:APP_VER,date:new Date().toISOString(),saved:cur.saved,snips:cur.snips,mySongs:cur.mySongs};
  const d=new Date(),ymd=d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
  saveBlobFile(new Blob([JSON.stringify(data)],{type:'application/json'}),'ezimprovjazz-backup-'+ymd+'.json');
};
$('#btnRestore').onclick=()=>$('#restoreFile').click();
$('#restoreFile').onchange=e=>{
  const f=e.target.files&&e.target.files[0];if(!f)return;
  f.text().then(t=>{
    const d=JSON.parse(t);if(!d||d.app!=='clu')throw new Error('이 앱의 백업 파일이 아닙니다');
    const merge=(cur0,add,key)=>{const seen=new Set(cur0.map(x=>x[key]));return cur0.concat((add||[]).filter(x=>x&&!seen.has(x[key])))};
    /* v0.42 내 곡 먼저(저장 솔로가 내 곡을 가리킬 수 있으므로) */
    const nm0=cur.mySongs.length;cur.mySongs=merge(cur.mySongs,(d.mySongs||[]).filter(m=>{try{registerMySong(m);return true}catch(e){return false}}),'id');
    if(cur.mySongs.length>nm0){storeMySongs();buildSongOptions();renderMySongs()}
    const ns=merge(cur.saved,(d.saved||[]).filter(it=>SONGDB[it.song]),'id'),nn=merge(cur.snips,(d.snips||[]).filter(it=>SONGDB[it.song]),'id');
    const add=(ns.length-cur.saved.length)+(nn.length-cur.snips.length)+(cur.mySongs.length-nm0);
    cur.saved=ns;cur.snips=nn;storeSaved();storeSnips();askPersist();renderSaved();renderSnips();
    $('#btnRestore').textContent='⬆ 백업 불러오기 — '+add+'개 추가됨';
  }).catch(err=>{$('#btnRestore').textContent='⬆ 백업 불러오기 — 실패: '+err.message}).finally(()=>{e.target.value=''});
};
/* ── v0.42 곡 불러오기 — MusicXML · iReal Pro (engine/importers.js). 결과는 이 기기의 「내 곡」에만 ── */
function myHash(x){let h=2166136261;for(let i=0;i<x.length;i++){h^=x.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)}
function applyMySongHead(){
  const m=cur.mySongs.find(x=>x.id===cur.selProg),ta=$('#headAbcIn');if(!ta)return;
  if(m&&m.head){ta.value=m.head;cur.headAuto=true;readHeadAbc()}
  else if(cur.headAuto){ta.value='';cur.headAuto=false;readHeadAbc()}
}
function addMySong(r,src,batch){   /* batch: 여러 곡을 한꺼번에 — 저장은 끝에 한 번(v0.48) */
  const cat=$('#impCat').value;
  const m=Object.assign({},r.song,{c:cat==='auto'?r.song.c:cat});
  m.id='u_'+myHash(m.n+'|'+m.ch);m.src=src;m.folder=($('#impFolder').value||'').trim()||((cur.mySongs.find(x=>x.id===m.id)||{}).folder)||r.playlist||'';   /* 폴더: 입력 → (다시 불러오면) 원래 폴더 → iReal 목록 이름 */m.warn=r.warn||[];m.head=r.head&&r.head.notes.length?notesToAbc(r.head.notes,r.head.bpb):null;m.added=Date.now();
  try{registerMySong(m);generateSolo(m.id,m.k,2,1,'wind',{style:'all'})}   /* 코드·형식 검사 겸 시험 생성 */
  catch(e){delete SONGDB[m.id];throw new Error('앱이 쓸 수 없는 진행이에요 ('+e.message+')')}
  const at=cur.mySongs.findIndex(x=>x.id===m.id);if(at>=0)cur.mySongs[at]=m;else cur.mySongs.push(m);
  if(!batch){storeMySongs();askPersist()}
  return m;
}
function impReport(lines,lastId){
  storeMySongs();askPersist();
  const L=l=>'<span class="'+(l.ok?'ok':'bad')+'">'+(l.ok?'✓ ':'✕ ')+escH(l.t)+'</span>',ok=lines.filter(l=>l.ok).length,bad=lines.length-ok;
  $('#impMsg').innerHTML=lines.length<=12?lines.map(L).join('\n'):   /* v0.48 많이 불러오면 요약 + 펼쳐 보기 */
    '<span class="ok">✓ '+ok+'곡 불러옴</span>'+(bad?'\n<span class="bad">✕ '+bad+'곡은 못 읽음</span>':'')+'\n<details class="impsum"><summary>곡별 결과 보기</summary>'+lines.map(L).join('\n')+'</details>';
  buildSongOptions();buildViewOptions();renderMySongs();syncFav();
  if(lastId){songSel.value=lastId;filterSongs();songSel.onchange()}
}
async function importFiles(files){
  const lines=[];let lastId=null;
  for(const f of files){
    try{
      const nm=f.name||'파일',ext=(nm.split('.').pop()||'').toLowerCase();
      let rs;
      if(ext==='mxl')rs=[musicXmlToSong(await mxlToXml(await f.arrayBuffer()),nm)].map(r=>Object.assign(r,{src:'MusicXML'}));
      else{
        const txt=await f.text();
        if(/irealb(ook)?:\/\//.test(txt))rs=irealToSongs(txt).map(r=>Object.assign(r,{src:'iReal Pro'}));
        else if(/<score-(partwise|timewise)/.test(txt))rs=[Object.assign(musicXmlToSong(txt,nm),{src:'MusicXML'})];
        else throw new Error('MusicXML도 iReal Pro 링크도 아니에요');
      }
      for(const r of rs){
        if(r.error){lines.push({ok:false,t:(r.title||nm)+' — '+r.error});continue}
        try{const m=addMySong(r,r.src,true);lastId=m.id;lines.push({ok:true,t:m.n+' — '+m.ch.split('|').length+'마디 · '+m.c+(m.head?' · 멜로디 있음(헤드 차용)':'')+(m.warn.length?' · '+m.warn.join(' · '):'')})}
        catch(e){lines.push({ok:false,t:(r.song&&r.song.n||nm)+' — '+e.message})}
      }
    }catch(e){lines.push({ok:false,t:(f.name||'파일')+' — '+e.message})}
  }
  impReport(lines,lastId);
}
function renderMySongs(){
  const el=$('#mySongList');if(!el)return;
  const n=cur.mySongs.length,head=$('#myListHead');
  if(head){head.hidden=!n;$('#myListTitle').textContent='불러온 곡 '+n+'곡'+(n?' · 폴더 '+folderNames().filter(f=>f).length+'개':'')}
  if(!n){el.innerHTML='<div class="none">아직 불러온 곡이 없습니다.</div>';return}
  const fc=folderCounts(),names=folderNames(),open=new Set([...el.querySelectorAll('details.fold[open]')].map(d=>d.dataset.f));
  el.innerHTML='';
  names.forEach(f=>{
    const d=document.createElement('details');d.className='fold';d.dataset.f=f;
    const sm=document.createElement('summary');sm.innerHTML='<span class="fname">📁 '+escH(f||'폴더 없음')+'</span><span class="fcnt">'+fc[f]+'곡</span>';
    const acts=document.createElement('span');acts.className='facts';
    const mk=(t,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.onclick=e=>{e.preventDefault();e.stopPropagation();fn(b)};return b};
    if(f)acts.appendChild(mk('이름 바꾸기',()=>{const nm=askText('새 폴더 이름',f);if(nm&&nm!==f)moveToFolder(cur.mySongs.filter(m=>(m.folder||'')===f).map(m=>m.id),nm)}));
    acts.appendChild(mk('폴더째 삭제',b=>{const ids=cur.mySongs.filter(m=>(m.folder||'')===f).map(m=>m.id),ns=savedCount(ids);
      if(!b.dataset.ask){b.dataset.ask=1;b.textContent=ids.length+'곡'+(ns?'·저장 '+ns+'개':'')+' 모두 지움 — 다시 누르기';return}deleteSongs(ids)}));
    sm.appendChild(acts);d.appendChild(sm);
    const body=document.createElement('div');body.className='fbody';d.appendChild(body);
    const fill=()=>{if(body.dataset.done)return;body.dataset.done='1';
      cur.mySongs.filter(m=>(m.folder||'')===f).sort((a,b)=>a.n.localeCompare(b.n)).forEach(m=>body.appendChild(songRow(m)))};
    d.addEventListener('toggle',()=>{if(d.open)fill()});
    if(open.has(f)||(names.length===1&&fc[f]<=30)){d.open=true;fill()}
    el.appendChild(d);
  });
}
function songRow(m){
  const r=document.createElement('div');r.className='srow';
  const st=document.createElement('button');st.type='button';st.className='star'+(cur.fav.has(m.id)?' on':'');st.dataset.id=m.id;st.textContent=cur.fav.has(m.id)?'★':'☆';st.title='즐겨찾기';st.onclick=()=>toggleFav(m.id);
  const nm=document.createElement('span');nm.className='sn';nm.innerHTML='<b>'+escH(m.n)+'</b><small>'+m.ch.split('|').length+'마디 · '+escH(m.c)+' · '+escH(m.src||'')+(m.head?' · 멜로디':'')+'</small>';
  const pick=document.createElement('button');pick.type='button';pick.textContent='선택';pick.onclick=()=>{songSel.value=m.id;if(songSel.selectedOptions[0]&&songSel.selectedOptions[0].hidden){$('#songView').value='all';$('#songSearch').value=''}filterSongs();songSel.onchange();const t=$('#songSel');if(t)t.scrollIntoView({behavior:'smooth',block:'center'})};
  const fs=document.createElement('select');fs.title='폴더 옮기기';fillFolderSel(fs,m.folder||'');fs.onchange=()=>folderPick(fs,[m.id]);
  const x=document.createElement('button');x.type='button';x.textContent='삭제';
  x.onclick=()=>{const ns=savedCount([m.id]);if(!x.dataset.ask){x.dataset.ask=1;x.textContent=ns?'저장 '+ns+'개도 지움 — 다시 누르기':'다시 누르면 삭제';return}deleteSongs([m.id])};
  r.append(st,nm,pick,fs,x);return r;
}
$('#myFoldAll').onclick=()=>document.querySelectorAll('#mySongList details.fold[open]').forEach(d=>d.open=false);
$('#myListToggle').onclick=()=>{const l=$('#mySongList'),b=$('#myListToggle');l.hidden=!l.hidden;b.textContent=l.hidden?'▼ 목록 펼치기':'▲ 목록 접기';if(l.hidden)$('#myListHead').scrollIntoView({block:'nearest'})};
$('#songView').addEventListener('change',filterSongs);
$('#btnFav').onclick=()=>toggleFav(cur.selProg);
$('#topFav').onclick=()=>toggleFav(cur.selProg);
$('#songFolder').onchange=()=>folderPick($('#songFolder'),[cur.selProg]);
$('#btnDelSong').onclick=()=>{const b=$('#btnDelSong'),m=mineOf(cur.selProg);if(!m)return;const ns=savedCount([m.id]);
  if(!b.dataset.ask){b.dataset.ask=1;b.textContent=ns?'저장 '+ns+'개도 지움 — 다시 누르기':'다시 누르면 삭제';return}deleteSongs([m.id])};
$('#fsNew').addEventListener('click',()=>{$('#btnNew').click();setTimeout(setFsLabel,50)});
songSel.addEventListener('change',()=>setTimeout(syncFav,0));
buildViewOptions();syncFav();
$('#btnImport').onclick=()=>{const p=$('#impPanel');p.hidden=!p.hidden;if(!p.hidden)p.scrollIntoView({behavior:'smooth',block:'start'})};
$('#impFileBtn').onclick=()=>$('#impFile').click();
$('#impFile').onchange=e=>{const fs=[...(e.target.files||[])];e.target.value='';if(fs.length)importFiles(fs)};
$('#impLinkBtn').onclick=()=>{
  const t=$('#impLink').value.trim();if(!t)return;
  $('#impMsg').innerHTML='<span class="ok">⏳ 불러오는 중… 곡이 많으면 몇 초 걸립니다</span>';$('#impLinkBtn').disabled=true;
  setTimeout(()=>{try{impLinkRun(t)}finally{$('#impLinkBtn').disabled=false}},40);   /* v0.48 안내가 먼저 보이게 */
};
function impLinkRun(t){
  const lines=[];let lastId=null;
  try{for(const r of irealToSongs(t)){
    if(r.error){lines.push({ok:false,t:(r.title||'곡')+' — '+r.error});continue}
    try{const m=addMySong(r,'iReal Pro',true);lastId=m.id;lines.push({ok:true,t:m.n+' — '+m.ch.split('|').length+'마디 · '+m.c+(m.warn.length?' · '+m.warn.join(' · '):'')})}catch(e){lines.push({ok:false,t:r.song.n+' — '+e.message})}
  }}catch(e){lines.push({ok:false,t:e.message})}
  if(lastId)$('#impLink').value='';
  impReport(lines,lastId);
}
renderMySongs();
/* v0.43.0 앱 기능(설치·오프라인·업데이트)은 테스트용 앱 빌드(--app)에서만 켠다 — GitHub에 올라가는 index.html에서는 꺼짐 */
const PWA_BUILD=/*__PWA_BUILD__*/false;
/* 앱 설치: 크롬·엣지·안드로이드는 설치 창, 아이폰·아이패드는 「홈 화면에 추가」 안내. 이미 앱으로 실행 중이면 숨김 */
(function(){
  const standalone=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
  const btn=$('#btnInstall'),help=$('#instHelp');if(!PWA_BUILD||!btn||standalone)return;
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  let ev=null;
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();ev=e;btn.hidden=false});
  window.addEventListener('appinstalled',()=>{btn.hidden=true;help.hidden=true});
  if(ios)btn.hidden=false;
  btn.onclick=()=>{
    if(ev){ev.prompt();ev.userChoice.finally(()=>{ev=null;btn.hidden=true});return}
    help.innerHTML='<b>아이폰·아이패드에서 앱으로 설치</b><br>① 사파리 아래(또는 위) <b>공유 버튼</b>(네모에 위쪽 화살표)을 누르고<br>② <b>「홈 화면에 추가」</b>를 고른 뒤 「추가」<br>홈 화면 아이콘으로 열면 주소창 없이 앱처럼 실행되고, 한 번 연 뒤에는 인터넷 없이도 열립니다(악기 음원은 한 번 재생한 것만).';
    help.hidden=!help.hidden;
  };
})();
/* 서비스 워커 — 앱 빌드에서만 등록. 새 버전이 오면 바로 바꾸지 않고 「업데이트할까요?」를 묻는다.
   공개 빌드에서는 혹시 v0.43.0에서 등록된 서비스 워커·캐시가 남아 있으면 지운다 */
if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){
  if(!PWA_BUILD){
    navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{});
    try{caches.keys().then(ks=>ks.filter(k=>/^clu-/.test(k)).forEach(k=>caches.delete(k)))}catch(e){}
  }else window.addEventListener('load',()=>{
    let asked=false,reloading=false;
    const ask=w=>{
      if(asked||!w||!navigator.serviceWorker.controller)return;asked=true;
      const ch=new MessageChannel();ch.port1.onmessage=ev=>{const nv=ev.data&&ev.data.ver;
        const bar=document.createElement('div');bar.className='updbar';
        bar.innerHTML='<span>🔄 새 버전'+(nv?'(<b>v'+nv+'</b>)':'')+'이 준비됐어요 · 지금 v'+APP_VER+'</span>';
        const go=document.createElement('button');go.textContent='지금 업데이트';
        const later=document.createElement('button');later.textContent='나중에';later.className='ghost';
        go.onclick=()=>{go.disabled=true;go.textContent='업데이트 중…';w.postMessage({type:'SKIP_WAITING'})};
        later.onclick=()=>bar.remove();
        bar.appendChild(go);bar.appendChild(later);document.body.appendChild(bar);
      };
      w.postMessage({type:'VER'},[ch.port2]);
    };
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloading)return;reloading=true;location.reload()});
    navigator.serviceWorker.register('sw.js').then(reg=>{
      if(reg.waiting)ask(reg.waiting);
      reg.addEventListener('updatefound',()=>{const w=reg.installing;if(w)w.addEventListener('statechange',()=>{if(w.state==='installed')ask(w)})});
      const check=()=>{reg.update().catch(()=>{})};
      setInterval(check,30*60*1000);
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
    }).catch(e=>console.warn('서비스 워커 등록 실패',e));
  });
}
/* v0.27.1 내보내기 — PNG 저장(PC 다운로드·휴대폰 갤러리) · 공유·메일 */
function sheetPng(cb){
  /* v0.42 고침: abcjs는 svg를 #staff가 아니라 .sheetwrap 바로 안에 그린다 — 예전 선택자로는 PNG 저장·공유가 「먼저 악보를 생성」으로 막혀 있었다 */
  const svg=(typeof staffSvg==='function'&&(staffSvg(typeof curChorus==='function'?curChorus():0)||staffSvg(0)))||$('#staff svg');if(!svg){alert('먼저 악보를 생성해 주세요');return}
  const clone=svg.cloneNode(true);
  const bb=svg.getBBox?svg.getBBox():{x:0,y:0,width:1200,height:800};
  const pad=40,W=Math.max(800,Math.ceil(bb.width+pad*2)),H=Math.ceil(bb.height+pad*2);
  clone.setAttribute('viewBox',(bb.x-pad)+' '+(bb.y-pad)+' '+W+' '+H);
  const bg=(getComputedStyle(document.body).getPropertyValue('--paper')||'#ffffff').trim();
  const xml='<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'"><rect width="100%" height="100%" fill="'+bg+'"/>'+new XMLSerializer().serializeToString(clone)+'</svg>';
  const img=new Image();
  img.onload=()=>{
    const cv=document.createElement('canvas'),scale=2;
    cv.width=W*scale;cv.height=H*scale;
    const cx=cv.getContext('2d');cx.scale(scale,scale);
    cx.fillStyle=bg;cx.fillRect(0,0,W,H);
    cx.drawImage(img,0,0,W,H);
    cb(cv);
  };
  img.onerror=()=>alert('악보 이미지 변환에 실패했습니다');
  img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml);
}
function dl(canvas,name){
  canvas.toBlob(b=>saveBlobFile(b,name),'image/png');
}
$('#btnExport').onclick=()=>{
  if(!cur.solo){alert('먼저 악보를 생성해 주세요');return}
  const fn=(SONGDB[cur.selProg].name||cur.selProg).replace(/[\\/:*?"<>|]/g,'_');
  sheetPng(cv=>dl(cv,fn+'.png'));
};
$('#btnShare').onclick=()=>{
  if(!cur.solo){alert('먼저 악보를 생성해 주세요');return}
  const fn=(SONGDB[cur.selProg].name||cur.selProg).replace(/[\\/:*?"<>|]/g,'_');
  sheetPng(cv=>{
    cv.toBlob(b=>{
      if(shareBlobFile(b,fn+'.png'))return;   /* 안드로이드 앱: 공유 시트 */
      const f=new File([b],fn+'.png',{type:'image/png'});
      const meta=(SONGDB[cur.selProg].name||'')+' · 재즈 솔로 생성기';
      const mail='mailto:?subject='+encodeURIComponent('[재즈 솔로] '+meta)+'&body='+encodeURIComponent('재즈 솔로 생성기에서 만든 악보를 첨부합니다 — '+meta);
      if(navigator.canShare&&navigator.canShare({files:[f]})){
        navigator.share({files:[f],title:meta}).catch(()=>{location.href=mail});
      }else if(confirm('이 브라우저는 이미지 공유를 지원하지 않습니다.\n메일 앱으로 보내시겠습니까? (PC에서는 PNG 저장 버튼을 이용해 주세요)')){
        location.href=mail;
      }
    },'image/png');
  });
};

/* ── 음 편집 ── */
const NOTE_NAME=['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
function noteName(m){return NOTE_NAME[((m%12)+12)%12]+(Math.floor(m/12)-1)}
function noteSeq(){const seq=[];cur.solo.bars.forEach((bar,b)=>bar.notes.forEach((n,i)=>seq.push({b,i,n})));return seq}
function clearSel(){(cur.bind||[]).forEach(el=>el.classList.remove('notehead-sel'))}
function bindNoteClicks(){
  const svg=staffSvg(0);cur.bind=[];
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
      el.addEventListener('click',ev=>{if(cur.playReq||cur.loopOn||cur.lockMode)return;ev.stopPropagation();cur.sel={b:seqItem.b,i:seqItem.i};clearSel();el.classList.add('notehead-sel');cur.selEl=el;showPop();
        if(!cur.lockMode&&!cur.loopOn){cur.selBar={ch:0,bi:seqItem.b,song:cur.selProg};renderChips()}});   /* v0.49 음을 눌러 편집해도 그 마디를 같이 고른다 */
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
  const ch=chordAtBeat(bar.chords,n.t/6,cur.solo.bpb||4);
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
  pop.innerHTML='<div class="popinfo">마디 '+(b+1)+' · '+chordSymbol(ch.root+(cur.selTrans||0),ch.type)+' · '+(isRest?'쉼표':noteName(n.midi+(cur.selTrans||0))+(cur.selTrans?' (실음 '+noteName(n.midi)+')':''))+'</div>'
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
    const ch=chordAtBeat(bar.chords,n.t/6,cur.soloBase.bpb||4);
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


/* ── 피드백: 입력창 → GitHub 이슈(곡·설정 자동 첨부) 또는 내용 복사 ── */
function fbInfo(){
  const so=songSel.selectedOptions&&songSel.selectedOptions[0]?songSel.selectedOptions[0].textContent:'-';
  return ['버전: v'+APP_VER,'곡: '+so,'시드: '+(cur.seed||'-'),'BPM: '+$('#bpm').value,'코러스: '+(cur.chorus||1),'악보 표시: '+cur.view,'조 이조: '+cur.trUser,'난이도: '+cur.selLv+'단계(엔진 '+cur.selDiff+')','스타일: '+cur.style,'노래↔비밥: '+cur.lyric,'오디오: '+(typeof SHARED_AC!=='undefined'&&SHARED_AC?SHARED_AC.state:'없음')+(typeof IS_IOS!=='undefined'&&IS_IOS?' · iOS'+(navigator.audioSession?' · 세션 '+navigator.audioSession.type:' · 세션 API 없음'):''),'악기/톤: '+cur.selInst+'/'+cur.tone,'반주: '+currentFeel(),'주제: '+(TOPIC_L[cur.topic]||'자동'),'테마 인용: '+(cur.themeOn?cur.themeCh:'끔'),'브라우저: '+navigator.userAgent].join('\n');
}
$('#btnFeedback').onclick=()=>{$('#fbModal').style.display='flex';$('#fbText').focus();$('#fbMsg').textContent=''};
$('#fbClose').onclick=()=>{$('#fbModal').style.display='none'};
$('#fbModal').addEventListener('click',e=>{if(e.target.id==='fbModal')$('#fbModal').style.display='none'});
function fbBody(){return $('#fbText').value.trim()+'\n\n--- 자동 정보 ---\n'+fbInfo()}
$('#fbSend').onclick=()=>{
  const t=$('#fbText').value.trim();if(!t){$('#fbMsg').textContent='내용을 입력해 주세요.';return}
  const kind=$('#fbKind').value;
  const url='https://github.com/shingum08/jazz-solo-Clu/issues/new?title='+encodeURIComponent('['+kind+'] '+t.split('\n')[0].slice(0,50))+'&body='+encodeURIComponent(fbBody());
  const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';document.body.appendChild(a);a.click();a.remove();
  $('#fbMsg').textContent='GitHub 이슈 작성 창을 열었습니다. 창이 안 열리면 「내용 복사」 후 개발자에게 전달해 주세요.';
};
$('#fbCopy').onclick=()=>{
  const t=$('#fbText').value.trim();if(!t){$('#fbMsg').textContent='내용을 입력해 주세요.';return}
  const txt='['+$('#fbKind').value+'] '+fbBody();
  const done=()=>{$('#fbMsg').textContent='복사했습니다. 카톡·메일 등으로 붙여넣어 보내 주세요.'};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(done,()=>{fallbackCopy(txt);done()});else{fallbackCopy(txt);done()}
};
function fallbackCopy(t){const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(_){}ta.remove()}

/* v0.45 상단 막대 재생 — ▶ 재생 → ∥ 일시정지 → ▶ 이어서, ■ 정지는 처음으로 */
function syncPlay(){
  const b=$('#btnPlay');if(!b)return;const on=!!cur.playReq;
  b.textContent=!on?'▶ 재생':cur.paused?'▶ 이어서':'∥ 일시정지';
  const st=$('#btnStop');if(st)st.disabled=!on&&!selBarOK();
  try{setFsLabel()}catch(e){}
}
function startPlay(){
  if(!cur.solo||typeof playAll!=='function')return;
  const L=cur.loopOn&&loopReady(cur.loopSel)?cur.loopSel:null,nb=cur.solo.bars.length;
  const nCh=cur.solos?cur.solos.length:1,SB=!L&&!cur.loopOn&&selBarOK()?cur.selBar:null;
  cur.playRange=L?loopRange(L):SB?{a0:SB.ch*nb+SB.bi,a1:nCh*nb-1,loop:false}:null;   /* ▶ = 처음부터 · 반복 구간이 있으면 그 구간 · v0.49 고른 마디가 있으면 거기서(카운트 없이) */
  cur._pp=null;
  playAll();syncPlay();
}
$('#btnPlay').onclick=()=>{
  if(cur.playReq){if(cur.audio){togglePause();document.querySelectorAll('.paper').forEach(p=>p.classList.toggle('paused',!!cur.paused))}syncPlay();return}
  startPlay();
};
/* ── v0.54 화면 테마 — 미드나잇 클럽(기본)·화이트 스튜디오·빈티지 페이퍼·블라썸 핑크·스카이 블루·에메랄드 ── */
const THEMES=[
  {id:'midnight',n:'미드나잇 클럽',sw:['#10161f','#d1a545','#f6f2e8']},
  {id:'studio',n:'화이트 스튜디오',sw:['#f4f5f7','#2f5bd3','#ffffff']},
  {id:'vintage',n:'빈티지 페이퍼',sw:['#e8dcc2','#8f3422','#f8f1df']},
  {id:'blossom',n:'블라썸 핑크',sw:['#fbeef2','#c13a6c','#fffafb']},
  {id:'sky',n:'스카이 블루',sw:['#eaf4fb','#1f6fae','#ffffff']},
  {id:'emerald',n:'에메랄드',sw:['#0d2620','#2fbf8f','#f3f8f4']}];
const THEME_KEY='clu.theme.v1';
const THEME_ON=false;   /* v0.55.0 잠시 닫음 — 기본(미드나잇 클럽)만. 테마 CSS·목록은 남겨 둠 */
function themeNow(){const t=document.documentElement.getAttribute('data-theme');return THEMES.some(x=>x.id===t)?t:'midnight'}
function setTheme(id){
  if(!THEMES.some(x=>x.id===id))id='midnight';
  if(id==='midnight')document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme',id);
  try{localStorage.setItem(THEME_KEY,id)}catch(e){}
  renderThemes();
}
function renderThemes(){
  const g=$('#themeGrid');if(!g)return;const now=themeNow();g.innerHTML='';
  THEMES.forEach(t=>{const b=document.createElement('button');b.type='button';b.className='themebtn';b.setAttribute('aria-pressed',t.id===now?'true':'false');
    const sw=document.createElement('span');sw.className='sw';sw.setAttribute('aria-hidden','true');t.sw.forEach(c=>{const i=document.createElement('i');i.style.background=c;sw.appendChild(i)});
    const nm=document.createElement('span');nm.textContent=t.n;b.appendChild(sw);b.appendChild(nm);b.onclick=()=>setTheme(t.id);g.appendChild(b)});
}
if(THEME_ON){$('#themeSec').hidden=false;renderThemes()}else document.documentElement.removeAttribute('data-theme');
/* ── v0.55 계정(테스트) — Supabase 이메일 로그인 + 내 곡·즐겨찾기·저장한 솔로·보관한 마디를 계정에 동기화 ──
   · 개인정보처리방침 게시 전이라 테스트 계정 전용: 주소에 ?beta=1 을 붙여 한 번 열면 그 기기에서 「계정」 칸이 보인다.
   · 공개 키(publishable)만 쓴다. 보안은 DB의 RLS(본인 줄만 읽기·쓰기 — server/supabase/schema_v1.sql)로 지킨다.
   · 이 기기에서 그 계정과 처음 만나면 기기 자료와 계정 자료를 합치고(같은 id는 하나로), 그 뒤로는 바뀐 쪽을 따른다.
   · 마디 평가(👍·👎)는 계정에 잇지 않는다 — 익명 수집과 분리(젠팀 11/13: 연결은 별도 동의 뒤) */
const SB=/*__SB_CONFIG__*/{"url": "https://cbepzelupdhcgtvbpzvd.supabase.co", "key": "sb_publishable_JA4auJ9znqwjciscEprluA_x_708z39"};
const ACCT_KEY='clu.auth.v1',ACCT_SYNC_KEY='clu.acctsync.v1',BETA_KEY='clu.beta.v1';
const ACCT_STORES={mysongs:MYSONG_KEY,fav:FAV_KEY,saved:SAVE_KEY,snips:SNIP_KEY};
var acctTimers={},acctBusy=false;
function lsGet(k,d){try{const v=localStorage.getItem(k);return v===null?d:JSON.parse(v)}catch(e){return d}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function acctOn(){return !!(SB&&SB.url&&SB.key)}
function acctBeta(){try{if(/[?&]beta=1(&|$)/.test(location.search))localStorage.setItem(BETA_KEY,'1');return localStorage.getItem(BETA_KEY)==='1'}catch(e){return false}}
function acctSess(){return lsGet(ACCT_KEY,null)}
function acctErr(e){const m=String(e&&e.message||e);
  return /Invalid login credentials/i.test(m)?'이메일이나 비밀번호가 맞지 않아요':/Email not confirmed/i.test(m)?'메일 인증이 아직 안 됐어요 — 받은 메일의 링크를 눌러 주세요':/already registered/i.test(m)?'이미 가입된 이메일이에요 — 로그인해 주세요':/Password should be/i.test(m)?'비밀번호는 8자 이상으로 해 주세요':/rate limit/i.test(m)?'잠시 뒤 다시 해 주세요(요청이 많아요)':/Failed to fetch|NetworkError/i.test(m)?'인터넷 연결을 확인해 주세요':m}
async function sbFetch(path,opt,auth){
  opt=opt||{};const h=Object.assign({'apikey':SB.key,'content-type':'application/json'},opt.headers||{});
  if(auth!==false){const s=await acctFresh();if(!s)throw new Error('로그인이 필요해요');h.authorization='Bearer '+s.access_token}
  const r=await fetch(SB.url+path,Object.assign({},opt,{headers:h}));
  const t=await r.text();let j=null;try{j=t?JSON.parse(t):null}catch(e){}
  if(!r.ok)throw new Error((j&&(j.msg||j.error_description||j.message||j.error))||('HTTP '+r.status));
  return j;
}
function acctSave(j,keep){const u=j.user||{},s={access_token:j.access_token,refresh_token:j.refresh_token,expires_at:Date.now()+((+j.expires_in||3600)-60)*1000,email:u.email||(keep&&keep.email)||'',uid:u.id||(keep&&keep.uid)||''};lsSet(ACCT_KEY,s);return s}
async function acctFresh(){
  const s=acctSess();if(!s)return null;
  if(Date.now()<s.expires_at)return s;
  try{const j=await sbFetch('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:s.refresh_token})},false);return acctSave(j,s)}
  catch(e){try{localStorage.removeItem(ACCT_KEY)}catch(_){}cur._acctMsg='로그인이 끝났어요. 다시 로그인해 주세요.';acctUI();return null}
}
function acctBack(){return location.origin&&location.origin!=='null'?location.origin+location.pathname:''}
async function acctLogin(){
  const em=$('#acctEmail').value.trim(),pw=$('#acctPw').value;if(!em||!pw){acctUI('이메일과 비밀번호를 넣어 주세요.');return}
  acctUI('로그인하는 중…');
  try{const j=await sbFetch('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:em,password:pw})},false);acctSave(j);$('#acctPw').value='';await acctPull()}
  catch(e){acctUI('로그인 실패: '+acctErr(e))}
}
async function acctSignup(){
  const em=$('#acctEmail').value.trim(),pw=$('#acctPw').value;if(!em||!pw){acctUI('이메일과 비밀번호(8자 이상)를 넣어 주세요.');return}
  if(pw.length<8){acctUI('비밀번호는 8자 이상으로 해 주세요.');return}
  acctUI('가입하는 중…');
  try{const back=acctBack(),j=await sbFetch('/auth/v1/signup'+(back?'?redirect_to='+encodeURIComponent(back):''),{method:'POST',body:JSON.stringify({email:em,password:pw})},false);
    if(j&&j.access_token){acctSave(j);$('#acctPw').value='';await acctPull()}
    else acctUI('확인 메일을 보냈어요. 메일의 링크를 누르면 이 화면으로 돌아와 로그인돼요.')}
  catch(e){acctUI('가입 실패: '+acctErr(e))}
}
async function acctReset(){
  const em=$('#acctEmail').value.trim();if(!em){acctUI('비밀번호를 찾을 이메일을 넣어 주세요.');return}
  try{const back=acctBack();await sbFetch('/auth/v1/recover'+(back?'?redirect_to='+encodeURIComponent(back):''),{method:'POST',body:JSON.stringify({email:em})},false);acctUI('비밀번호 재설정 메일을 보냈어요. 링크를 누르면 로그인되고, 여기서 새 비밀번호를 정할 수 있어요.')}
  catch(e){acctUI('보내지 못했어요: '+acctErr(e))}
}
async function acctLogout(){try{await sbFetch('/auth/v1/logout',{method:'POST'})}catch(e){}try{localStorage.removeItem(ACCT_KEY)}catch(e){}acctUI('로그아웃했어요. 이 기기의 자료는 그대로 남아 있어요.')}
async function acctNewPw(){
  const pw=$('#acctNewPw').value;if(pw.length<8){acctUI('새 비밀번호는 8자 이상으로 해 주세요.');return}
  try{await sbFetch('/auth/v1/user',{method:'PUT',body:JSON.stringify({password:pw})});$('#acctNewPw').value='';cur._acctRecovery=false;acctUI('비밀번호를 바꿨어요.')}
  catch(e){acctUI('바꾸지 못했어요: '+acctErr(e))}
}
function acctFromHash(){
  const h=location.hash||'';if(!/access_token=|error_description=/.test(h))return;
  const p=new URLSearchParams(h.slice(1));try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}
  if(p.get('error_description')){cur._acctMsg='로그인 링크 오류: '+p.get('error_description').replace(/\+/g,' ');return}
  acctSave({access_token:p.get('access_token'),refresh_token:p.get('refresh_token'),expires_in:p.get('expires_in')});
  if(p.get('type')==='recovery'){cur._acctRecovery=true;cur._acctMsg='새 비밀번호를 정해 주세요(설정 → 계정).'}
  sbFetch('/auth/v1/user').then(u=>{const s=acctSess();if(s&&u){s.email=u.email||'';s.uid=u.id||'';lsSet(ACCT_KEY,s)}return acctPull()}).catch(e=>acctUI('로그인 확인 실패: '+acctErr(e)));
}
function acctSyncMap(){const m=lsGet(ACCT_SYNC_KEY,{}),s=acctSess();return s&&m.uid===s.uid&&m.keys?m.keys:{}}
function acctMark(k,at){const s=acctSess();if(!s)return;let m=lsGet(ACCT_SYNC_KEY,{});if(m.uid!==s.uid)m={uid:s.uid,keys:{}};m.keys=m.keys||{};m.keys[k]=at;lsSet(ACCT_SYNC_KEY,m)}
function acctMerge(k,a,b){
  if(k==='fav')return [...new Set([...(a||[]),...(b||[])])];
  const seen=new Set(),out=[];[...(a||[]),...(b||[])].forEach(x=>{const id=x&&x.id;if(id===undefined||id===null){out.push(x);return}const key=String(id);if(seen.has(key))return;seen.add(key);out.push(x)});return out;
}
async function acctPushNow(k){
  const s=acctSess();if(!s||!s.uid)return;
  const j=await sbFetch('/rest/v1/user_store?on_conflict=user_id,key',{method:'POST',headers:{prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify([{user_id:s.uid,key:k,value:lsGet(ACCT_STORES[k],[])}])});
  acctMark(k,(j&&j[0]&&j[0].updated_at)||new Date().toISOString());
}
function acctQueue(k){
  try{if(!acctOn()||!acctSess()||acctBusy)return;clearTimeout(acctTimers[k]);
    acctTimers[k]=setTimeout(()=>{acctPushNow(k).then(()=>{cur._acctMsg='계정에 저장됨 '+acctClock()}).catch(e=>{cur._acctMsg='계정 저장 실패: '+acctErr(e)}).finally(()=>acctUI())},1500)}catch(e){}
}
function acctClock(){return new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}
async function acctPull(){
  if(!acctOn()||!acctSess()||acctBusy)return;acctBusy=true;acctUI('계정과 맞추는 중…');
  try{
    const rows=await sbFetch('/rest/v1/user_store?select=key,value,updated_at'),R={};(rows||[]).forEach(r=>{R[r.key]=r});
    const st=acctSyncMap();let changed=false;
    for(const k of Object.keys(ACCT_STORES)){
      const r=R[k],loc=lsGet(ACCT_STORES[k],[]);
      if(!st[k]){   /* 이 기기에서 이 계정과 처음 — 합친다 */
        const m=r?acctMerge(k,loc,r.value):loc;
        if(JSON.stringify(m)!==JSON.stringify(loc)){lsSet(ACCT_STORES[k],m);changed=true}
        if(!r||JSON.stringify(m)!==JSON.stringify(r.value))await acctPushNow(k);else acctMark(k,r.updated_at);
      }else if(r&&r.updated_at>st[k]){lsSet(ACCT_STORES[k],r.value);acctMark(k,r.updated_at);changed=true}   /* 다른 기기에서 바뀜 */
      else if(!r)await acctPushNow(k);
    }
    if(changed)acctReload();
    cur._acctMsg='계정과 맞춤 '+acctClock();
  }catch(e){cur._acctMsg='동기화 실패: '+acctErr(e)}
  finally{acctBusy=false;acctUI()}
}
function acctReload(){
  try{cur.mySongs=loadMySongs().filter(m=>{try{registerMySong(m);return true}catch(e){return false}})}catch(e){}
  try{cur.fav=new Set(lsGet(FAV_KEY,[]))}catch(e){}
  try{cur.saved=loadSaved().filter(it=>it&&SONGDB[it.song])}catch(e){}
  try{cur.snips=loadSnips()}catch(e){}
  [renderMySongs,renderSaved,renderSnips,buildViewOptions,syncFav].forEach(f=>{try{f()}catch(e){}});
}
function acctUI(msg){
  if(msg!==undefined)cur._acctMsg=msg;
  const sec=$('#acctSec');if(!sec)return;const s=acctSess();
  sec.hidden=!(acctOn()&&(acctBeta()||s));
  $('#acctOut').hidden=!!s;$('#acctIn').hidden=!s;
  if(s)$('#acctWho').textContent=s.email||'(이메일 확인 중)';
  $('#acctMsg').textContent=cur._acctMsg||'';
}
if(acctOn()&&location.hash!=='#embed-demo'){
  $('#acctLoginBtn').onclick=acctLogin;$('#acctSignupBtn').onclick=acctSignup;$('#acctResetBtn').onclick=acctReset;
  $('#acctLogoutBtn').onclick=acctLogout;$('#acctSyncBtn').onclick=()=>acctPull();$('#acctPwBtn').onclick=acctNewPw;
  acctFromHash();acctUI();if(acctSess())acctPull();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&acctSess())acctPull()});
}
/* v0.50 기법·화성 분석 접기 상태 — 이 기기에만 기억 */
document.querySelectorAll('details.fold2').forEach(d=>{const k='clu.fold.'+d.id;try{d.open=localStorage.getItem(k)==='1'}catch(e){}d.addEventListener('toggle',()=>{try{localStorage.setItem(k,d.open?'1':'0')}catch(e){}})});
$('#btnStop').onclick=()=>{stopAll();cur.selBar=null;if(cur.solo)renderChips();syncPlay()};   /* v0.50 ■ = 처음으로(고른 마디도 지움) · 마디부터는 ∥ 일시정지 뒤 마디 누르기 */
/* v0.45 설정 패널 열고 닫기 */
function openSet(){const sh=$('#setSheet');sh.hidden=false;document.body.classList.add('setopen');setTimeout(()=>{try{$('#setClose').focus()}catch(e){}},30)}
function closeSet(){const sh=$('#setSheet');if(sh.hidden)return;sh.hidden=true;document.body.classList.remove('setopen');try{$('#btnSettings').focus({preventScroll:true})}catch(e){}}
function toPaper(){const t=$('#paper');if(t)t.scrollIntoView({behavior:'smooth',block:'start'})}
$('#btnSettings').onclick=openSet;$('#setClose').onclick=closeSet;
$('#setSheet').addEventListener('click',e=>{if(e.target.id==='setSheet')closeSet()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#setSheet').hidden)closeSet()});
$('#btnGen').onclick=()=>{const was=!!cur.playReq;stopIfPlaying();gen(true);closeSet();toPaper();if(was)startPlay()};
$('#btnGenPlay').onclick=()=>{stopIfPlaying();gen(true);closeSet();toPaper();startPlay()};
/* 설정 안에서 마디 고정·구간 반복을 켜거나, 저장한 솔로·소절을 불러오면 설정을 닫고 악보로 */
document.addEventListener('click',e=>{
  const sh=$('#setSheet');if(sh.hidden||!sh.contains(e.target))return;
  const t=e.target.closest('.lockmode,.loopmode');
  if(t){setTimeout(()=>{closeSet();const el=$('#chPages');if(el)el.scrollIntoView({behavior:'smooth',block:'start'})},0);return}
  const b=e.target.closest('#savedList button,#snipList button');
  if(b&&/불러/.test(b.textContent))setTimeout(()=>{closeSet();toPaper()},0);
});
/* v0.46 상단 막대 「↻ 새 솔로」— 재생 중이면 새 솔로로 바로 이어서 재생 */
$('#btnNew').onclick=()=>{const was=!!cur.playReq;stopIfPlaying();gen(true);if(was)startPlay()};
/* v0.46 헤드 연주(처음과 끝 · 처음만 · 끔) */
$('#headSel').onchange=e=>{cur.headMode=e.target.value;const was=!!cur.playReq;stopIfPlaying();if(cur.soloBase)gen(false);if(was)startPlay()};
/* 상단 막대의 지금 곡 이름 */
function syncNow(){
  const s=SONGDB[cur.selProg];if(!s)return;
  $('#nowSong').textContent=s.name||s.n||cur.selProg;
  const o=$('#songSel').selectedOptions[0],tv=$('#trVal');
  $('#nowMeta').textContent=[tv&&tv.textContent&&tv.textContent!=='—'?tv.textContent:'',$('#bpm').value+' BPM',(cur.headCh?'헤드 + ':'')+$('#chorusSel').value+'코러스'].filter(Boolean).join(' · ');
}
['#songSel','#bpm','#chorusSel'].forEach(q=>$(q).addEventListener('change',()=>setTimeout(syncNow,0)));
['#btnTrDn','#btnTrUp'].forEach(q=>$(q).addEventListener('click',()=>setTimeout(syncNow,0)));
gen();syncNow();syncPlay();
/* ── v0.57 홈페이지 연주 데모 — 홈 첫 화면 iframe(app/#embed-demo) 안에서 돈다 ──
   Tea for Two(퍼블릭 도메인 · 코드 진행만) 120 BPM 1코러스, 반주 포함. 데모 5개(난이도 × 연습 주제, 시드 고정)를 넘겨 보고,
   v0.58: 3번 가이드톤 라인 → 활용 스케일(가이드톤은 같은 음 되풀이가 45%라 첫인상에 맞지 않음 — 엔진 과제로 남김),
   한 곡이 끝나면 다음 데모로 이어서 재생(BGM처럼). 기기 저장소는 건드리지 않는다(설정은 저장되지 않음 · 계정 동기화 끔) */
const EMB_SONG='pd-tea-for-two',EMB_BPM=120,EMB_TONE='tenor',EMB_GAP_MS=900;
const EMB_DEMOS=[{lv:1,tp:'ct',sd:12001},{lv:3,tp:'auto',sd:22002},{lv:3,tp:'dom',sd:33001},{lv:3,tp:'penta',sd:42004},{lv:5,tp:'auto',sd:52005}];   /* v0.61 단계(1~5) */
const EMB_TP_L={auto:'자유',ct:'코드톤 라인',gt:'가이드톤 라인',penta:'펜타토닉',scale:'기본 스케일',dom:'활용 스케일'};
if(location.hash==='#embed-demo'&&SONGDB[EMB_SONG]){
  document.documentElement.classList.add('embed');
  $('#paper').classList.add('fs');document.body.classList.add('fslock');
  songSel.value=EMB_SONG;songSel.onchange();
  $('#bpm').value=EMB_BPM;$('#bpmVal').textContent=EMB_BPM+' BPM';$('#chorusSel').value='1';
  cur.headMode='off';$('#headSel').value='off';cur.tone=EMB_TONE;$('#toneSel').value=EMB_TONE;
  try{prefetchSamples(currentFeel(),cur.tone)}catch(e){}
  let embI=0,embOn=false,embStop=false;
  const embShow=i=>{embI=(i+EMB_DEMOS.length)%EMB_DEMOS.length;const D=EMB_DEMOS[embI];
    setLevel(D.lv);cur.topic=D.tp;$('#topicSel').value=D.tp;cur.seed=D.sd;gen(false);
    $('#embLab').textContent='난이도 '+D.lv+' · '+EMB_TP_L[D.tp]+' · '+EMB_BPM+' BPM';$('#embNo').textContent=(embI+1)+'/'+EMB_DEMOS.length};
  const _syncPlay=syncPlay;
  syncPlay=function(){_syncPlay();   /* 끝까지 재생돼 멈추면(■·다른 솔로가 아니면) 다음 데모를 이어서 */
    if(cur.playReq){embOn=true;return}
    if(embOn&&!embStop){embOn=false;setTimeout(()=>{if(cur.playReq)return;embShow(embI+1);startPlay()},EMB_GAP_MS)}
    else embOn=false;embStop=false};
  $('#embNext').onclick=()=>{const was=!!cur.playReq&&!cur.paused;embStop=true;stopIfPlaying();embOn=false;embShow(embI+1);if(was)startPlay();setFsLabel()};
  embShow(0);setFsLabel();
}
/* v0.56 로딩 화면 걷기 — 첫 악보를 그렸고 글꼴이 준비되면(최대 BOOT_MAX_MS). 너무 빨리 사라져 깜빡이지 않게 페이지 연 뒤 최소 BOOT_MIN_MS */
(function(){const b=$('#boot');if(!b)return;const BOOT_MIN_MS=600,BOOT_MAX_MS=2500;let done=false;
  const fin=()=>{if(done)return;done=true;setTimeout(()=>{b.classList.add('done');setTimeout(()=>{try{b.remove()}catch(e){}},600)},Math.max(0,BOOT_MIN_MS-performance.now()))};
  const fr=document.fonts&&document.fonts.ready;Promise.race([fr||Promise.resolve(),new Promise(r=>setTimeout(r,BOOT_MAX_MS))]).then(fin,fin)})();
