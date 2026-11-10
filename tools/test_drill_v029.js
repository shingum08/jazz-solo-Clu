/* v0.29 연습 악보 검사 — 전곡 × 주제 5 × 기보 3(C·B♭·E♭)
   ① 마디 길이·겹침 ② 주제별 음가(코드톤 4분, 스케일류 8분) ③ 기보 음 상한 B♭5(82) ④ 음이 그 코드의 사다리에 속함
   ⑤ 코드마다 단조 상행 또는 하행 ⑥ 상·하행이 둘 다 나오고 시드에 따라 달라짐 ⑦ 같은 시드는 같은 악보 ⑧ ABC 변환 가능 */
const assert=require('assert'),{loadEngine}=require('./lib_load.js');
const E=loadEngine();let checks=0,solos=0,up=0,down=0;
const mod12=x=>((x%12)+12)%12;
const PENTA={maj:[0,2,4,7,9],min:[0,3,5,7,10],dom:[0,2,4,7,10],domalt:[0,2,4,7,10],hdim:[0,3,5,6,10],dim:[0,3,6,9]};
for(const id of Object.keys(E.SONGDB)){
  const song=E.SONGDB[id],bpb=song.bpb||4,TPB=bpb*6;
  for(const topic of ['ct','penta','scale','dom','gt'])for(const wt of [0,2,9]){
    const seed=1234+wt;
    const d=E.generateDrill(id,song.key,topic,seed,{wt});solos++;
    assert(d.drill&&d.bars.length===song.bars.length,id+' 마디 수');
    assert.strictEqual(JSON.stringify(d.bars),JSON.stringify(E.generateDrill(id,song.key,topic,seed,{wt}).bars),id+' 결정성');
    d.bars.forEach((bar,b)=>{
      let t=0;for(const n of bar.notes){assert(n.t===t,`${id} ${topic} ${b} 겹침/틈`);t+=n.d}
      assert(t===TPB,`${id} ${topic} 마디 ${b} 합 ${t}`);
      const pitched=bar.notes.filter(n=>n.midi!==null);
      assert(pitched.length>0,`${id} ${topic} 마디 ${b} 빈 마디`);
      for(const n of pitched){
        assert(n.midi+wt<=82,`${id} ${topic} 마디 ${b} 기보 상한 초과 ${n.midi+wt}`);
        assert(n.midi+wt>=47,`${id} ${topic} 마디 ${b} 너무 낮음 ${n.midi+wt}`);
        if(topic==='ct')assert(n.d===6,`${id} 코드톤은 4분음표`);
        else if(topic!=='gt')assert(n.d===3,`${id} ${topic} 는 8분음표`);
      }
      if(topic==='gt')return;
      /* 코드 구간별 검사 */
      let ci=-1,seg=[];const segs=[];
      for(const n of pitched){if(n.ci!==undefined){if(seg.length)segs.push([ci,seg]);ci=n.ci;seg=[]}seg.push(n)}
      if(seg.length)segs.push([ci,seg]);
      assert(segs.length===bar.chords.length||bpb<bar.chords.length,`${id} ${topic} 마디 ${b} 코드 구간 수`);
      for(const [k,ns] of segs){
        const c=bar.chords[k],T=E.CHORD_TYPES[c.type],cls=E.TYPE_CLS[c.type]||'dom';
        const rels=ns.map(n=>mod12(n.midi-c.root));
        if(topic==='ct')assert(rels.every(r=>T.iv.includes(r)),`${id} 마디 ${b} 코드톤 아님 ${rels} / ${c.type}`);
        if(topic==='scale')assert(rels.every(r=>T.scale.includes(r)),`${id} 마디 ${b} 스케일 밖 ${rels} / ${c.type}`);
        if(topic==='penta')assert(rels.every(r=>(PENTA[cls]||PENTA.dom).includes(r)),`${id} 마디 ${b} 펜타 밖`);
        const dif=ns.slice(1).map((n,i)=>n.midi-ns[i].midi);
        const asc=dif.every(x=>x>0),desc=dif.every(x=>x<0);
        assert(asc||desc||ns.length<2,`${id} ${topic} 마디 ${b} 상행도 하행도 아님 ${ns.map(n=>n.midi)}`);
        if(asc&&ns.length>1)up++;if(desc&&ns.length>1)down++;
        /* 상행은 뿌리음에서, 하행은 뿌리음으로 */
        if(ns.length>1)assert(mod12((asc?ns[0]:ns[ns.length-1]).midi-c.root)===0,`${id} ${topic} 마디 ${b} 뿌리음 기준 아님`);
      }
      checks++;
    });
    assert(typeof E.toAbc(d,120,wt,0)==='string');
  }
}
assert(up>0&&down>0&&Math.abs(up-down)/(up+down)<0.08,'상·하행 비율이 한쪽으로 치우침 '+up+'/'+down);
{ /* 시드가 다르면 방향 배열이 달라진다 */
  const a=E.generateDrill('all-of-me',E.SONGDB['all-of-me'].key,'ct',1,{wt:2}),b=E.generateDrill('all-of-me',E.SONGDB['all-of-me'].key,'ct',2,{wt:2});
  assert(JSON.stringify(a.bars)!==JSON.stringify(b.bars),'시드별 변화');
  /* 사용자 예시 악보와 같은 자리: D장조(기보) Dmaj7 상행 = D4 F#4 A4 C#5 */
  const bar=[a,b].flatMap(x=>x.bars).find(x=>x.tags[0]==='상행'&&x.chords[0].type==='maj7'&&mod12(x.chords[0].root+2)===2);
  assert(bar&&bar.notes.map(n=>n.midi+2).join()==='62,66,69,73','예시 악보와 같은 배치: '+(bar&&bar.notes.map(n=>n.midi+2)));
}
console.log(JSON.stringify({test:'drill-v029',sheets:solos,barsChecked:checks,up,down}));
