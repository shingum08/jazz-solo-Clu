/* MusicXML 내보내기: 엔진 1틱=1/6박, MusicXML 1박=24 divisions. */
'use strict';
function soloMusicXml({solos,title='Solo',bpb,bpm=120,writtenTranspose=0,octaveShift=0,concertKey=0,minor=false}={}){
  const list=Array.isArray(solos)?solos:(solos?[solos]:[]);
  if(!list.length)return null;
  bpb=bpb||list[0].bpb||4;
  if(!Number.isInteger(bpb)||bpb<1)throw new Error('Invalid beats per bar');
  const mod=n=>((n%12)+12)%12,esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  if(!Number.isInteger(writtenTranspose)||!Number.isInteger(octaveShift)||octaveShift%12||!Number.isInteger(concertKey))throw new Error('Invalid transposition');
  const fifths=[0,-5,2,-3,4,-1,6,1,-4,3,-2,5][mod(concertKey+writtenTranspose+(minor?3:0))];
  const steps=['C','D','E','F','G','A','B'],nat=[0,2,4,5,7,9,11],signature={};
  steps.forEach(s=>signature[s]=0);
  const order=fifths>=0?['F','C','G','D','A','E','B']:['B','E','A','D','G','C','F'];
  for(let i=0;i<Math.abs(fifths);i++)signature[order[i]]=Math.sign(fifths);
  function spell(m){
    const pc=mod(m),candidates=[];
    for(let i=0;i<7;i++)for(let a=-1;a<=1;a++)if(mod(nat[i]+a)===pc){
      const cost=(a===signature[steps[i]]?0:4)+Math.abs(a)+(a&&Math.sign(a)!==Math.sign(fifths||1)?1:0);
      candidates.push({step:steps[i],alter:a,oct:(m-nat[i]-a)/12-1,cost});
    }
    return candidates.sort((a,b)=>a.cost-b.cost)[0];
  }
  /* 점음표를 우선하고 나머지는 정확한 길이의 여러 음표로 나눈다. */
  const durationCache=new Map();
  const types=['whole','half','quarter','eighth','16th','32nd','64th'];
  function decompose(units,trip){
    const cacheKey=units+':'+trip;
    if(durationCache.has(cacheKey))return durationCache.get(cacheKey);
    const table=[];
    types.forEach((type,i)=>{
      const base=96/2**i*(trip?2/3:1);
      for(let dots=0;dots<=2;dots++){
        const u=base*(2-1/2**dots);
        if(Number.isInteger(u)&&u>=1)table.push({u,type,dots,trip});
      }
    });
    table.sort((a,b)=>b.u-a.u||a.dots-b.dots);
    const dp=Array(units+1).fill(null);dp[0]=[];
    for(let u=1;u<=units;u++)for(const d of table)if(d.u<=u&&dp[u-d.u]&&(!dp[u]||dp[u-d.u].length+1<dp[u].length))dp[u]=[d,...dp[u-d.u]];
    if(!dp[units]&&!trip)return decompose(units,true);
    if(!dp[units])throw new Error('Unrepresentable duration');
    durationCache.set(cacheKey,dp[units]);
    return dp[units];
  }
  const kinds={maj7:'major-seventh','6':'major-sixth',m7:'minor-seventh',m9:'minor-ninth',m6:'minor-sixth','7':'dominant','9':'dominant-ninth','7b9':'dominant-ninth','7#9':'dominant-ninth',m7b5:'half-diminished',dim7:'diminished-seventh','7sus4':'suspended-fourth',mmaj7:'major-minor','7#11':'dominant','maj7#11':'major-seventh'};
  let out='<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="3.1"><work><work-title>'+esc(title)+'</work-title></work><identification><creator type="composer">Jazz Solo Generator</creator></identification><part-list><score-part id="P1"><part-name>Solo</part-name></score-part></part-list><part id="P1">\n';
  const size=bpb*24,shift=writtenTranspose+octaveShift;
  let measure=0;
  for(const solo of list){
    if(solo.bpb&&solo.bpb!==bpb)throw new Error('Mixed meters are not supported');
    const bars=solo.bars||[],events=[];
    /* 원본 객체를 변경하지 않고, 마디 밖으로 지속되는 음도 실제 경계에서 나눈다. */
    bars.forEach((bar,b)=>(bar.notes||[]).forEach(n=>{
      if(!Number.isFinite(n.t)||!Number.isFinite(n.d)||n.t<0||n.t>=bpb*6||n.d<=0||!Number.isInteger(n.t*4)||!Number.isInteger(n.d*4))throw new Error('Invalid event timing');
      if(n.midi!==null&&!Number.isInteger(n.midi))throw new Error('Invalid MIDI pitch');
      const start=b*size+n.t*4,end=start+n.d*4;
      if(end>bars.length*size)throw new Error('Event exceeds chorus');
      events.push({start,end,midi:n.midi,trip:!!n.trip,tie:!!n.tie});
    }));
    events.sort((a,b)=>a.start-b.start);
    for(let i=1;i<events.length;i++)if(events[i].start<events[i-1].end)throw new Error('Overlapping events');
    for(let i=0;i<events.length;i++){
      const e=events[i],next=events[i+1];
      e.link=!!(e.tie&&e.midi!==null&&next&&next.midi===e.midi&&next.start===e.end);
      e.stop=!!(i&&events[i-1].link);
    }
    let ei=0;
    for(let b=0;b<bars.length;b++){
      measure++;
      const begin=b*size,end=begin+size,bar=bars[b],pieces=[];
      out+='<measure number="'+measure+'">\n';
      if(measure===1){
        let trans='';
        if(shift){
          const wdia=Math.sign(writtenTranspose)*(Math.floor(Math.abs(writtenTranspose)/12)*7+[0,1,1,2,2,3,3,4,5,5,6,6][mod(Math.abs(writtenTranspose))])+octaveShift/12*7;
          const dia=-wdia,oct=Math.trunc(dia/7);
          trans='<transpose><diatonic>'+(dia-oct*7)+'</diatonic><chromatic>'+(-shift-oct*12)+'</chromatic>'+(oct?'<octave-change>'+oct+'</octave-change>':'')+'</transpose>';
        }
        out+='<attributes><divisions>24</divisions><key><fifths>'+fifths+'</fifths><mode>'+(minor?'minor':'major')+'</mode></key><time><beats>'+bpb+'</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef>'+trans+'</attributes>\n';
        const tempo=Number.isFinite(+bpm)&&+bpm>0?+bpm:120;
        out+='<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>'+tempo+'</per-minute></metronome></direction-type><sound tempo="'+tempo+'"/></direction>\n';
      }
      /* analyzeHarmony 관례: 두 번째 코드는 5/4에서 3박 뒤, 그 외에는 2박 뒤. */
      /* 현재 엔진도 세 번째 이후 코드는 사용하지 않는다(일부 수록 진행에 존재). */
      const chords=bar.chords||[],n=chords.length,cst=n<=1?[0]:n===2?[0,Math.ceil(bpb/2)]:chords.map((_,i)=>Math.round(i*bpb/n));   /* v0.38 한 마디 여러 코드(engine_core chordBeats와 같은 규칙 — 이 파일은 단독으로도 쓰인다) */
      chords.forEach((ch,i)=>{
        const p=spell(mod(ch.root+writtenTranspose)+60),kind=kinds[ch.type];
        if(!kind)throw new Error('Unsupported chord: '+ch.type);
        const offset=cst[i]*24;
        if(offset>=size)throw new Error('Harmony outside measure');
        out+='<harmony><root><root-step>'+p.step+'</root-step>'+(p.alter?'<root-alter>'+p.alter+'</root-alter>':'')+'</root><kind>'+kind+'</kind>';
        const deg=(v,a,t)=>'<degree><degree-value>'+v+'</degree-value><degree-alter>'+a+'</degree-alter><degree-type>'+t+'</degree-type></degree>';
        if(ch.type==='7sus4')out+=deg(7,-1,'add');
        if(ch.type==='7#11'||ch.type==='maj7#11')out+=deg(11,1,'add');
        if(ch.type==='7b9'||ch.type==='7#9')out+='<degree><degree-value>9</degree-value><degree-alter>'+(ch.type==='7b9'?-1:1)+'</degree-alter><degree-type>alter</degree-type></degree>';
        out+='<offset sound="yes">'+offset+'</offset></harmony>\n';
      });
      function add(start,finish,e){
        const ds=decompose(finish-start,!!(e&&e.trip));let t=start;
        ds.forEach((d,i)=>{
          pieces.push({...d,t,midi:e?e.midi:null,stop:!!(e&&e.midi!==null&&(i>0||start>e.start||e.stop)),start:!!(e&&e.midi!==null&&(i<ds.length-1||finish<e.end||e.link)),carry:!!(e&&start>e.start||e&&e.stop&&start===begin)});t+=d.u;
        });
      }
      let cursor=begin;
      while(ei<events.length&&events[ei].end<=begin)ei++;
      for(let k=ei;k<events.length&&events[k].start<end;k++){
        const e=events[k],s=Math.max(begin,e.start),f=Math.min(end,e.end);
        if(s>cursor)add(cursor,s,null);
        add(s,f,e);cursor=f;
      }
      if(cursor<end)add(cursor,end,null);
      /* 연속 3연음 구간은 박 경계마다 괄호를 닫는다(쉼표 포함). */
      pieces.forEach((p,i)=>{
        if(!p.trip)return;
        const prev=pieces[i-1],next=pieces[i+1];
        p.tupleStart=!prev||!prev.trip||p.t%24===0;
        p.tupleStop=!next||!next.trip||(p.t+p.u)%24===0;
      });
      const accidental={};
      pieces.forEach(p=>{
        out+='<note>';
        if(p.midi===null)out+='<rest/>';
        else{
          const s=spell(p.midi+shift);p.sp=s;
          out+='<pitch><step>'+s.step+'</step>'+(s.alter?'<alter>'+s.alter+'</alter>':'')+'<octave>'+s.oct+'</octave></pitch>';
        }
        out+='<duration>'+p.u+'</duration>'+(p.stop?'<tie type="stop"/>':'')+(p.start?'<tie type="start"/>':'')+'<voice>1</voice><type>'+p.type+'</type>'+'<dot/>'.repeat(p.dots);
        if(p.sp){
          const s=p.sp,k=s.step+s.oct,was=accidental[k]===undefined?signature[s.step]:accidental[k];
          if(was!==s.alter&&!(p.stop&&p.carry))out+='<accidental>'+({0:'natural',1:'sharp','-1':'flat'}[s.alter])+'</accidental>';
          if(!(p.stop&&p.carry))accidental[k]=s.alter;
        }
        if(p.trip)out+='<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';
        const notation=(p.stop?'<tied type="stop"/>':'')+(p.start?'<tied type="start"/>':'')+(p.tupleStart?'<tuplet type="start" number="1" bracket="yes"/>':'')+(p.tupleStop?'<tuplet type="stop" number="1"/>':'');
        if(notation)out+='<notations>'+notation+'</notations>';
        out+='</note>\n';
      });
      out+='</measure>\n';
    }
  }
  return out+'</part></score-partwise>';
}
/* 브라우저 어댑터: 순수 함수는 앱 전역 상태 및 DOM에 의존하지 않는다. */
function buildMusicXml(){
  const sg=SONGDB[cur.selProg];
  const solos=cur.solos&&cur.solos.length?cur.solos:(cur.solo?[cur.solo]:[]);
  if(!solos.length)return null;
  const tempo=typeof document!=='undefined'?document.querySelector('#bpm'):null;
  return soloMusicXml({solos,title:cur.sheetTitle||sg.name||'Solo',bpb:sg.bpb||4,bpm:tempo?+tempo.value:120,writtenTranspose:cur.selTrans||0,octaveShift:cur.wOct||0,concertKey:sg.key+(cur.trUser||0),minor:songIsMinor(sg)});
}
if(typeof document!=='undefined'){
  const xmlButton=document.querySelector('#btnXml');
  if(xmlButton)xmlButton.addEventListener('click',()=>{
    const xml=buildMusicXml();
    if(!xml){alert('먼저 악보를 생성해 주세요');return}
    const blob=new Blob([xml],{type:'application/vnd.recordare.musicxml+xml'}),name=((cur.sheetTitle||'solo')+'.musicxml').replace(/[\\/:*?"<>|]/g,'_');
    if(typeof window!=='undefined'&&typeof window.saveBlobFile==='function'){window.saveBlobFile(blob,name);return}   /* v0.42 안드로이드 앱에서도 저장되게 */
    const a=document.createElement('a'),url=URL.createObjectURL(blob);
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  });
}
