/* v0.38 리얼북 대조 코드 → 앱 곡 데이터
   입력  tools/data/realbook_chords.txt — 리얼북 1~3권 악보를 보며 옮긴 「코드 진행만」(멜로디·가사 없음)
   출력  engine/songs_part1.js (RAW_SONGS 다시 씀) + tools/data/song_review_v038.json (판정)
   node tools/rb_import.js           → 검사 + 파일 갱신
   node tools/rb_import.js --check   → 검사만(파일을 쓰지 않음)

   입력 형식(곡 하나)
     @id|곡 이름|분류|으뜸음 pc(C=0)|bpm|박자(4·3)|섹션 문자열|프레이즈 마디수|권-쪽
     ch: 마디는 '|', 한 마디 여러 코드는 공백(2개=반마디씩, 3개 이상=박을 고르게 나눔 — 3코드는 4개로 적어 2+1+1박)
     x: 메모 — 표기 변환(13→9, 슬래시 베이스 생략 등)·근사한 곳. 「확인 필요」가 들어 있으면 상태가 bookq가 된다
   섹션·프레이즈가 '-'이면 비정형 곡: 프레이즈는 8(8로 안 나누어지면 4), 섹션은 A를 프레이즈 수만큼 채운다.
   책 곡(b 필드 있음)은 매번 입력 파일로 통째로 교체하고, 책에 없는 기존 곡은 그대로 둔다(상태도 유지). */
'use strict';
const fs=require('fs'),path=require('path'),{loadEngine,root}=require('./lib_load.js');
const CH_RE=/^([A-G])([b#]?)(maj7#11|maj7|mmaj7|m7b5|m7|m6|m9|dim7|7sus4|7b9|7#9|7#11|7|6|9)$/;
const SRC=path.join(root,'tools/data/realbook_chords.txt');
const REV_OLD=path.join(root,'tools/data/song_review_v037.json'),REV=path.join(root,'tools/data/song_review_v038.json');
const VOL={1:'RB1',2:'RB2',3:'RB3'};

function parseSrc(){
  const out=[],errs=[];let cur=null;
  fs.readFileSync(SRC,'utf8').split('\n').forEach((ln,i)=>{
    ln=ln.replace(/\s+$/,'');if(!ln||ln.startsWith('//'))return;
    if(ln.startsWith('@')){
      const f=ln.slice(1).split('|');
      if(f.length!==9){errs.push((i+1)+'행: 머리줄 칸 수 '+f.length);return}
      const [id,n,c,k,bpm,m,sec,ph,src]=f;const [v,p]=src.split('-');
      cur={id,n,c,k:+k,bpm:+bpm,m:+m,sec,ph,b:VOL[v]+' '+p,ch:'',x:'',line:i+1};out.push(cur);return;
    }
    if(!cur){errs.push((i+1)+'행: 곡 머리줄 앞의 내용');return}
    if(ln.startsWith('ch:'))cur.ch=ln.slice(3).trim();
    else if(ln.startsWith('x:'))cur.x=ln.slice(2).trim();
    else errs.push((i+1)+'행: 알 수 없는 줄');
  });
  out.forEach(s=>{
    const bars=s.ch.split('|').map(b=>b.trim().split(/\s+/));
    bars.forEach((b,j)=>b.forEach(c=>{if(!CH_RE.test(c))errs.push(s.id+' '+(j+1)+'마디: 코드 표기 '+c)}));
    bars.forEach((b,j)=>{if(b.length>s.m)errs.push(s.id+' '+(j+1)+'마디: 코드 '+b.length+'개 > '+s.m+'박')});
    s.nb=bars.length;
    let P=s.ph==='-'?(s.nb%8===0||s.nb%4!==0?8:4):+s.ph;
    let sec=s.sec==='-'?'A'.repeat(Math.max(1,Math.floor(s.nb/P))):s.sec;
    /* 마지막 섹션 뒤 꼬리(프레이즈보다 짧은 태그·턴어라운드)는 허용 */
    if(s.sec!=='-'&&s.ph!=='-'&&(s.nb<sec.length*P||s.nb-sec.length*P>=P))errs.push(s.id+': 형식 '+sec+'×'+P+'='+(sec.length*P)+'마디인데 '+s.nb+'마디');
    if(!(s.k>=0&&s.k<12))errs.push(s.id+': 으뜸음 '+s.k);
    if(![3,4].includes(s.m))errs.push(s.id+': 박자 '+s.m);
    s.f=[sec,P];
  });
  const seen={};out.forEach(s=>{if(seen[s.id])errs.push('중복 id '+s.id);seen[s.id]=1});
  return {songs:out,errs};
}

const q=s=>"'"+String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"'";
function songJs(s){
  return '{id:'+q(s.id)+',n:'+q(s.n)+',c:'+q(s.c)+',k:'+s.k+',bpm:'+s.bpm+((s.m&&s.m!==4)?',m:'+s.m:'')+',f:['+q(s.f[0])+','+s.f[1]+']'+(s.b?',b:'+q(s.b):'')+','+
    (s.x?'\n x:'+q(s.x)+',':'')+'\n ch:'+q(s.ch)+'}';
}
const HEAD=`/* ── 곡 데이터베이스 v0.38 ─────────────────────────────────────────
   v0.38: 리얼북 1~3권(사용자가 준 스캔본)을 한 장씩 보며 옮긴 코드 진행으로 바꿨다 — b 필드(권·쪽)가 있는 곡.
   이 파일은 tools/rb_import.js 산출물이다. 책 곡을 고치려면 tools/data/realbook_chords.txt를 고치고 다시 돌린다.
   책에 없거나(또는 판독이 애매해 보류한) 기존 곡은 v0.37 데이터와 상태를 그대로 둔다. v0.37 판은 claude/checkpoint-2 브랜치.
   수록 원칙 (기획안 7장 법적 프레임 준수):
   · 코드 진행만 수록 — 원곡 멜로디·가사 없음. 판본(리얼북 판·연주자별 악보)에 따라 세부가 다를 수 있다.
   · ch 문법: '|' = 마디 구분, ' ' = 한 마디 여러 코드(2개=반마디씩, 3개 이상=박을 고르게).
     maj7·m7·7·m7b5·7b9·7#9·6·m6·9·m9·dim7·7sus4·mmaj7·7#11·maj7#11 만 사용.
   · k = 원곡 조(으뜸음 pc, C=0) · bpm = 기본 템포 · m = 박자(기본 4/4) · f = [형식, 프레이즈 마디수] · c = 분류
     b = 리얼북 권·쪽 · x = 메모(표기 변환·근사·확인 필요)
   · 정렬: 곡 이름 알파벳 순 */
'use strict';

const RAW_SONGS = [
`;

function main(){
  const {songs,errs}=parseSrc();
  const check=process.argv.includes('--check');
  if(errs.length){console.error('입력 오류 '+errs.length+'건\n'+errs.join('\n'));process.exit(1)}
  const E=loadEngine();
  const bookIds=new Set(songs.map(s=>s.id));
  const kept=E.RAW_SONGS.filter(s=>!s.b&&!bookIds.has(s.id));
  const replaced=E.RAW_SONGS.filter(s=>!s.b&&bookIds.has(s.id)).map(s=>s.id);
  const all=songs.map(s=>({id:s.id,n:s.n,c:s.c,k:s.k,bpm:s.bpm,m:s.m,f:s.f,b:s.b,x:s.x,ch:s.ch})).concat(kept.map(s=>Object.assign({},s)));
  all.sort((a,b)=>a.n.localeCompare(b.n,'en'));
  const oldRev=JSON.parse(fs.readFileSync(fs.existsSync(REV)?REV:REV_OLD,'utf8'));
  const rev={_legend:{ok:'아는 진행과 일치(확신)',form:'공통 형식(블루스·리듬 체인지·모달 뱀프)으로는 맞음 — 곡 고유의 세부 코드는 다를 수 있음',
    rb:'v0.37 리얼북 계열로 새로 작성 — 마디 단위까지 확신, 연주자 확인 전',rbq:'v0.37 새로 작성 — 일부 마디는 확인 필요(메모 참고)',
    book:'v0.38 리얼북 악보(1~3권)와 한 마디씩 대조해 옮김',bookq:'v0.38 리얼북 악보와 대조 — 일부 마디는 판독·해석 확인 필요(메모 참고)',practice:'앱 연습용 진행'}};
  all.forEach(s=>{
    if(s.b)rev[s.id]=[/확인 필요/.test(s.x)?'bookq':'book',s.x||s.b];
    else rev[s.id]=oldRev[s.id]||['unknown',''];
  });
  const cnt={};Object.entries(rev).forEach(([k,v])=>{if(k!=='_legend')cnt[v[0]]=(cnt[v[0]]||0)+1});
  console.log(JSON.stringify({book:songs.length,replacedOld:replaced.length,keptOld:kept.length,total:all.length,status:cnt}));
  console.log('교체된 기존 곡: '+replaced.join(', '));
  console.log('그대로 둔 기존 곡: '+kept.map(s=>s.id).join(', '));
  if(check)return;
  fs.writeFileSync(path.join(root,'engine/songs_part1.js'),HEAD+all.map(songJs).join(',\n')+'\n];\n');
  fs.writeFileSync(REV,'{'+Object.entries(rev).map(([k,v])=>JSON.stringify(k)+':'+JSON.stringify(v)).join(',\n')+'}\n');
}
main();
