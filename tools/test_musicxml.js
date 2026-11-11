/* 독립 실행: node tools/test_musicxml.js (먼저 python3 tools/build.py).
   선택: MUSICXML_XSD=/path/to/musicxml.xsd — 의존 xml.xsd/xlink.xsd는 같은 폴더. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),cp=require('child_process');
const root=path.resolve(__dirname,'..');
const built=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=fs.readFileSync(path.join(root,'engine/musicxml.js'),'utf8');
const scripts=[...built.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
const injected=scripts.filter(s=>/\bid="musicxml"/.test(s[1]));
assert.equal(injected.length,1,'exactly one exporter script');
assert.equal(injected[0][2].trim(),source.trim(),'built exporter is current');
assert.equal((built.match(/function buildMusicXml\(/g)||[]).length,1,'legacy exporter removed');
assert(built.indexOf('<script id="musicxml">')<built.indexOf('</body>'));
const template=fs.readFileSync(path.join(root,'app/template.html'),'utf8');
assert(template.includes('<!--__MUSICXML_MODULE__-->'),'template contains exporter module marker');
const pure=vm.createContext({});vm.runInContext(injected[0][2],pure);
assert.equal(pure.soloMusicXml(),null);
const bar=(notes,chords=[{root:0,type:'maj7'}])=>({notes,chords});
const solo=(bars,bpb=4)=>({bars,bpb});
const note=(t,d,midi=60,extra={})=>({t,d,midi,...extra});
let synthetic=0,generated=0,validated=0,measures=0,notes=0,schemaValidated=0;
const cases=[];
function add(name,options,checks={}){
  const before=JSON.stringify(options),xml=pure.soloMusicXml(options);
  assert.equal(JSON.stringify(options),before,name+': input mutation');
  cases.push({name,options,checks,xml});
}
add('dotted values',{solos:[solo([bar([note(0,9),note(9,4.5,null),note(13.5,10.5,62)])])]}, {types:['quarter','eighth','quarter'],dots:[1,1,2]});
add('decomposed note and rest',{solos:[solo([bar([note(0,15),note(15,9,null)]),bar([note(0,15,null),note(15,9,62)])])]}, {minTies:1});
add('implicit exact rests',{solos:[solo([bar([note(5,2,61,{trip:true})])])]}, {minTuplets:1});
add('explicit triplet rests',{solos:[solo([bar([note(0,2,61,{trip:true}),note(2,2,null,{trip:true}),note(4,2,62,{trip:true}),note(6,18,null)])])]}, {tuplets:1});
add('engine ties across measures',{solos:[solo([bar([note(0,18,null),note(18,6,61,{tie:true})]),bar([note(0,3,61,{tie:true}),note(3,3,61),note(6,18,null)])])]}, {ties:2,carry:true});
add('raw sustained event crossing measures',{solos:[solo([bar([note(0,18,null),note(18,12,64)]),bar([note(6,18,null)])])]}, {ties:1});
add('invalid tie does not attach to different pitch or rest',{solos:[solo([bar([note(0,6,60,{tie:true}),note(6,6,62,{tie:true}),note(12,6,null),note(18,6,64,{tie:true})])])]}, {ties:0});
for(const meter of [3,4,5,6,7])add('harmony meter '+meter,{bpb:meter,solos:[solo([bar([note(0,meter*6,null)],[{root:7,type:'7b9'},{root:0,type:'7#9'}])],meter)]},{offsets:[0,Math.ceil(meter/2)*24],degrees:[-1,1]});
add('all chord kinds',{solos:[solo(['maj7','6','m7','m9','m6','7','9','7b9','7#9','m7b5','dim7'].map(type=>bar([note(0,24,null)],[{root:0,type}])))]});
add('multiple choruses reset ties',{solos:[solo([bar([note(0,24,60,{tie:true})])]),solo([bar([note(0,24,60)])])],title:'A & B <test> "한글"'},{ties:0,title:'A & B <test> "한글"'});
add('accidental natural reset C',{solos:[solo([bar([note(0,6,66),note(6,6,65),note(12,6,65),note(18,6,66)]),bar([note(0,6,66),note(6,18,null)])])]},{accidentals:['sharp','natural',null,'sharp','sharp',null]});
add('key signature and natural G',{concertKey:7,solos:[solo([bar([note(0,6,66),note(6,6,65),note(12,6,66),note(18,6,66)]),bar([note(0,6,66),note(6,18,null)])])]},{accidentals:[null,'natural','sharp',null,null,null],fifths:1});
add('flat key cancellation',{concertKey:5,solos:[solo([bar([note(0,6,70),note(6,6,71),note(12,6,70),note(18,6,71)]),bar([note(0,24,70)])])]},{accidentals:[null,'natural','flat','natural',null],fifths:-1});
add('F sharp key E sharp and octave',{concertKey:6,solos:[solo([bar([note(0,6,65),note(6,6,64),note(12,6,65),note(18,6,60)])])]},{steps:['E','E','E','C'],accidentals:[null,'natural','sharp','natural'],fifths:6});
for(const wt of [0,2,9])for(const oct of [0,-12])add('written transpose '+wt+' octave '+oct,{concertKey:0,writtenTranspose:wt,octaveShift:oct,solos:[solo([bar([note(0,24,60)])])]},{firstMidi:60+wt+oct,fifths:({0:0,2:2,9:3})[wt]});
add('minor written key',{concertKey:9,minor:true,writtenTranspose:2,solos:[solo([bar([note(0,24,69)],[{root:9,type:'m6'}])])]},{fifths:2,mode:'minor'});
for(let key=0;key<12;key++)for(const minor of [false,true])for(const wt of [0,2,9])add('chromatic spelling '+[key,minor,wt],{concertKey:key,minor,writtenTranspose:wt,solos:[solo([bar(Array.from({length:12},(_,i)=>note(i*2,2,60+i,{trip:true})),[{root:key,type:minor?'m6':'6'}])])]});
/* 모든 정수 틱 길이를 쉼표/음표/3연음으로 검사(5/4 포함). */
for(let d=1;d<=30;d++)for(const rest of [false,true])for(const trip of [false,true])add('duration sweep '+[d,rest,trip],{bpb:5,solos:[solo([bar([note(0,d,rest?null:61,{trip})])],5)]});
synthetic=cases.length;
assert.throws(()=>pure.soloMusicXml({solos:[solo([bar([note(0,8),note(6,6)])])]}),/Overlapping/);
assert.throws(()=>pure.soloMusicXml({solos:[solo([bar([note(0,25)])])]}),/exceeds/);
assert.throws(()=>pure.soloMusicXml({solos:[solo([bar([note(0,-1)])])]}),/timing/);
/* DOM 스텁으로 브라우저 래퍼·다운로드·폴백을 실제 실행한다. */
const clicks=[],downloads=[],revoked=[];let handler,alerts=0;
const browser=vm.createContext({cur:{selProg:'test',solo:solo([bar([note(0,24)])]),selTrans:9,wOct:-12,trUser:2,sheetTitle:'A/B'},SONGDB:{test:{key:0,bpb:4,name:'Test'}},songIsMinor:()=>false,
  document:{querySelector:s=>s==='#bpm'?{value:'143'}:s==='#btnXml'?{addEventListener:(event,fn)=>{assert.equal(event,'click');handler=fn}}:null,createElement:()=>{const a={click:()=>{clicks.push(a.href);downloads.push(a.download)},remove:()=>{}};return a},body:{appendChild:()=>{}}},
  Blob:class {constructor(parts,options){assert(parts[0].startsWith('<?xml'));assert.equal(options.type,'application/vnd.recordare.musicxml+xml')}},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:u=>revoked.push(u)},setTimeout:fn=>fn(),alert:()=>alerts++});
vm.runInContext(injected[0][2],browser);assert.equal(typeof handler,'function');
const wrapped=browser.buildMusicXml();assert(wrapped.includes('<fifths>5</fifths>'));assert(wrapped.includes('<per-minute>143</per-minute>'));
handler();assert.deepEqual(downloads,['A_B.musicxml']);assert.deepEqual(revoked,['blob:test']);
browser.cur.solos=[browser.cur.solo,browser.cur.solo];assert.equal((browser.buildMusicXml().match(/<measure /g)||[]).length,2);
browser.cur.solos=[];assert(browser.buildMusicXml());browser.cur.solo=null;assert.equal(browser.buildMusicXml(),null);handler();assert.equal(alerts,1);
/* 실제 엔진은 별도 VM: 변경하지 않고 현재 소스에서 로드한다. */
const engineFiles=['engine_core.js','style_data.js',...fs.readdirSync(path.join(root,'engine')).filter(f=>/^songs_part\d+\.js$/.test(f)).sort()];
const engine=vm.createContext({});vm.runInContext(engineFiles.map(f=>fs.readFileSync(path.join(root,'engine',f),'utf8')).join('\n')+'\nthis.E={generateSolo,transposeSolo,SONGDB,songIsMinor,analyzeHarmony,barChords};',engine);
const E=engine.E,ids=Object.keys(E.SONGDB),meters=new Set();
for(const id of ids){
  const song=E.SONGDB[id];meters.add(song.bpb||4);
  for(const diff of [1,2,3]){
    const s=E.generateSolo(id,song.key,diff,7919+diff,'wind',{style:'all'}),wt=[0,2,9][diff-1],oct=wt===9?-12:0;
    const options={solos:[s],title:song.name,bpb:song.bpb||4,bpm:song.bpm,concertKey:song.key,minor:E.songIsMinor(song),writtenTranspose:wt,octaveShift:oct};
    /* expected harmony positions are checked independently against analyzeHarmony. */
    const harm=E.analyzeHarmony(E.barChords(song,song.key),song.key,song.bpb);
    /* v0.38 한 마디 N코드: 2개는 ceil(박/2)에서, 3개 이상은 박을 고르게 나눈 자리에서 바뀐다(엔진 chordBeats와 같은 규칙) */
    const bpb=song.bpb||4,beatsOf=n=>n<=1?[0]:n===2?[0,Math.ceil(bpb/2)]:[...Array(n)].map((_,i)=>Math.round(i*bpb/n));
    const expectedOffsets=s.bars.map((bar,bi)=>{const st=beatsOf(bar.chords.length);return bar.chords.map((ch,ci)=>{
      const offset=st[ci]*24,time=bi*bpb*6+st[ci]*6;
      const segment=harm.filter(h=>h.t0<=time).pop();
      assert.equal(segment.root,ch.root);assert.equal(segment.type,ch.type);
      return offset;
    })});
    add(id+' difficulty '+diff,options,{expectedOffsets});generated++;
  }
}
const special=ids.find(id=>E.SONGDB[id].bpb===5)||ids[0],sg=E.SONGDB[special];
const multi=[1,2,3].map(seed=>E.transposeSolo(E.generateSolo(special,sg.key,3,seed,'free',{style:'all'}),2,'free'));
add('generated multi chorus transposed concert',{solos:multi,bpb:sg.bpb,concertKey:sg.key+2,writtenTranspose:9,octaveShift:-12,minor:E.songIsMinor(sg)});generated++;
/* 구조/스키마/음가/실음/붙임줄을 독립 Python 파서로 확인한다. */
const python=String.raw`
import sys,json,os
from fractions import Fraction as F
try:
 from lxml import etree as ET
 lxml=True
except ImportError:
 import xml.etree.ElementTree as ET
 lxml=False
schema=None
xsd=os.environ.get('MUSICXML_XSD','/tmp/opencode/musicxml.xsd')
if lxml and os.path.exists(xsd):
 class Resolver(ET.Resolver):
  def resolve(self,url,pubid,context):
   local=os.path.join(os.path.dirname(xsd),url.rsplit('/',1)[-1])
   if os.path.exists(local): return self.resolve_filename(local,context)
 parser=ET.XMLParser(no_network=True);parser.resolvers.add(Resolver())
 schema=ET.XMLSchema(ET.parse(xsd,parser))
metrics={'validated':0,'measures':0,'notes':0,'schemaValidated':0}
natural={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
types={'whole':96,'half':48,'quarter':24,'eighth':12,'16th':6,'32nd':3,'64th':F(3,2)}
for case in json.load(sys.stdin):
 try:
  opts=case['options'];check=case['checks'];doc=ET.fromstring(case['xml'].encode())
  if schema is not None: schema.assertValid(doc);metrics['schemaValidated']+=1
  ms=doc.findall('./part/measure');bpb=opts.get('bpb') or opts['solos'][0].get('bpb',4);size=bpb*24
  shift=opts.get('writtenTranspose',0)+opts.get('octaveShift',0)
  expected=[];attacks=set();base=0
  for so in opts['solos']:
   count=len(so['bars'])*size;timeline=[None]*count;events=[]
   for bi,bar in enumerate(so['bars']):
    for n in bar['notes']:
     start=bi*size+round(n['t']*4);end=start+round(n['d']*4)
     events.append((start,end,n['midi'],n.get('tie',False)))
     for t in range(start,end):timeline[t]=None if n['midi'] is None else n['midi']+shift
   events.sort();prev=None
   for start,end,midi,tie in events:
    if midi is not None and not(prev and prev[1]==start and prev[2]==midi and prev[3]):attacks.add(base+start)
    prev=(start,end,midi,tie)
   expected.extend(timeline);base+=count
  assert len(ms)*size==len(expected)
  actual=[];actual_attacks=set();tie_pending=None;tie_count=0;tuplets=0;tuplet_open=False;allnotes=[]
  input_bars=[bar for so in opts['solos'] for bar in so['bars']]
  for mi,m in enumerate(ms):
   assert int(m.get('number'))==mi+1
   harmonies=m.findall('harmony');chords=input_bars[mi].get('chords',[])
   assert len(harmonies)==len(chords)
   for harmony,chord in zip(harmonies,chords):
    root=harmony.find('root')
    root_pc=(natural[root.findtext('root-step')]+int(root.findtext('root-alter','0')))%12
    assert root_pc==(chord['root']+opts.get('writtenTranspose',0))%12
    if chord['type']=='6':assert harmony.findtext('kind')=='major-sixth'
    if chord['type'] in ('7b9','7#9'):
     degree=harmony.find('degree');assert degree.findtext('degree-value')=='9'
     assert degree.findtext('degree-type')=='alter'
     assert degree.findtext('degree-alter')==('-1' if chord['type']=='7b9' else '1')
   cursor=0
   for n in m.findall('note'):
    allnotes.append(n);duration=int(n.findtext('duration'));assert duration>0
    nominal=types[n.findtext('type')]*(2-F(1,2**len(n.findall('dot'))))
    tm=n.find('time-modification')
    if tm is not None:nominal*=F(int(tm.findtext('normal-notes')),int(tm.findtext('actual-notes')))
    assert nominal==duration,(nominal,duration)
    p=n.find('pitch');midi=None if p is None else (int(p.findtext('octave'))+1)*12+natural[p.findtext('step')]+int(p.findtext('alter','0'))
    ts=[t.get('type') for t in n.findall('tie')];nts=[t.get('type') for t in n.findall('./notations/tied')];assert ts==nts
    if 'stop' in ts:assert tie_pending==midi and midi is not None
    else:
     assert tie_pending is None
     if midi is not None:actual_attacks.add(mi*size+cursor)
    tie_pending=midi if 'start' in ts else None
    tie_count+=('start' in ts)
    for t in n.findall('./notations/tuplet'):
     if t.get('type')=='start':
      assert not tuplet_open;tuplet_open=True;tuplets+=1;assert t.get('bracket')=='yes'
     else:assert tuplet_open;tuplet_open=False
    children=[c.tag for c in n]
    if 'accidental' in children and 'time-modification' in children:assert children.index('accidental')<children.index('time-modification')
    actual.extend([midi]*duration);cursor+=duration
   assert cursor==size,(mi,cursor,size)
   assert not tuplet_open
   offsets=[int(h.findtext('offset')) for h in m.findall('harmony')]
   if 'expectedOffsets' in check:assert offsets==check['expectedOffsets'][mi]
  assert tie_pending is None
  assert actual==expected,'pitch/rest timeline mismatch'
  assert actual_attacks==attacks,('attack mismatch',actual_attacks^attacks)
  assert doc.findtext('./part/measure/attributes/divisions')=='24'
  assert doc.findtext('./part/measure/attributes/time/beats')==str(bpb)
  assert doc.findtext('./part/measure/attributes/time/beat-type')=='4'
  tr=doc.find('./part/measure/attributes/transpose')
  inverse=0 if tr is None else int(tr.findtext('chromatic'))+12*int(tr.findtext('octave-change','0'))
  assert inverse==-shift
  wt=opts.get('writtenTranspose',0);octave=opts.get('octaveShift',0)
  if wt in (0,2,9):
   expected_dia=-({0:0,2:1,9:5}[wt]+octave//12*7)
   actual_dia=0 if tr is None else int(tr.findtext('diatonic'))+7*int(tr.findtext('octave-change','0'))
   assert actual_dia==expected_dia
  if 'ties' in check:assert tie_count==check['ties']
  if 'minTies' in check:assert tie_count>=check['minTies']
  if 'tuplets' in check:assert tuplets==check['tuplets']
  if 'minTuplets' in check:assert tuplets>=check['minTuplets']
  if 'types' in check:assert [n.findtext('type') for n in allnotes]==check['types']
  if 'dots' in check:assert [len(n.findall('dot')) for n in allnotes]==check['dots']
  if 'accidentals' in check:assert [n.findtext('accidental') for n in allnotes]==check['accidentals']
  if 'steps' in check:assert [n.findtext('./pitch/step') for n in allnotes]==check['steps']
  if 'carry' in check:assert ms[1].find('note').find('accidental') is None
  if 'fifths' in check:assert doc.findtext('./part/measure/attributes/key/fifths')==str(check['fifths'])
  if 'mode' in check:assert doc.findtext('./part/measure/attributes/key/mode')==check['mode']
  if 'title' in check:assert doc.findtext('./work/work-title')==check['title']
  if 'firstMidi' in check:assert actual[0]==check['firstMidi']
  if 'offsets' in check:assert [int(h.findtext('offset')) for h in ms[0].findall('harmony')]==check['offsets']
  if 'degrees' in check:assert [int(d.findtext('degree-alter')) for d in ms[0].findall('./harmony/degree')]==check['degrees']
  metrics['validated']+=1;metrics['measures']+=len(ms);metrics['notes']+=len(allnotes)
 except Exception as e:
  raise AssertionError(case['name']+': '+str(e)) from e
print(json.dumps(metrics))
`;
for(let i=0;i<cases.length;i+=30){
  const result=cp.spawnSync('python3',['-c',python],{input:JSON.stringify(cases.slice(i,i+30)),encoding:'utf8',maxBuffer:8*1024*1024});
  assert.equal(result.status,0,result.stderr||result.error);
  const m=JSON.parse(result.stdout);validated+=m.validated;measures+=m.measures;notes+=m.notes;schemaValidated+=m.schemaValidated;
}
console.log(JSON.stringify({songs:ids.length,meters:[...meters].sort(),synthetic,generated,validated,measures,notes,schemaValidated,browserWrapper:'passed',buildExtraction:'passed',errors:0},null,2));
if(!schemaValidated)console.log('SKIP: XSD validation unavailable; install lxml and set MUSICXML_XSD to official schema with dependencies.');
