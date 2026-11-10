import sqlite3, collections, json, re, math
c=sqlite3.connect('wjazzd.db')
NOTE={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
def parse_chord(s):
    if not s or s=='NC': return None
    m=re.match(r'^([A-G])([b#]?)(.*)$',s)
    if not m: return None
    r=(NOTE[m.group(1)]+(-1 if m.group(2)=='b' else 1 if m.group(2)=='#' else 0))%12
    q=m.group(3).split('/')[0]
    if q.startswith('m7b5'): cls='hdim'
    elif q.startswith('o'): cls='dim'
    elif q.startswith('-'): cls='min'
    elif q.startswith('j7') or q.startswith('6') or q=='' or q.startswith('69') or q.startswith('+j'): cls='maj'
    elif 'alt' in q or '9b' in q or '9#' in q or '13b' in q: cls='domalt'
    elif q.startswith('7') or q.startswith('sus') or q.startswith('9') or q.startswith('13') or q.startswith('+'): cls='dom'
    else: cls='maj'
    return (r,cls)

solos=c.execute("select melid,performer,style,instrument,avgtempo from solo_info where rhythmfeel='SWING' and signature='4/4'").fetchall()
info={m:(p,s,i,t) for m,p,s,i,t in solos}

# chord per (melid,bar,beat) forward-filled; plus beat onsets
beatrows=c.execute("select melid,bar,beat,chord,onset from beats order by melid,onset").fetchall()
chordAt={}; beatList=collections.defaultdict(list)
cur=None;lastm=None
for melid,bar,beat,ch,on in beatrows:
    if melid!=lastm: cur=None;lastm=melid
    if ch: cur=parse_chord(ch)
    chordAt[(melid,bar,beat)]=cur
    beatList[melid].append((bar,beat,on))
# next distinct chord for dom classification
nextChord={}
for melid,bl in beatList.items():
    seq=[chordAt[(melid,b,bt)] for b,bt,_ in bl]
    nxt=None
    for idx in range(len(bl)-1,-1,-1):
        ch=seq[idx]
        nextChord[(melid,bl[idx][0],bl[idx][1])]=nxt
        if idx>0 and seq[idx-1]!=ch: nxt=ch
def ctx(melid,bar,beat):
    ch=chordAt.get((melid,bar,beat))
    if not ch: return None
    r,cls=ch
    if cls=='dom':
        n=nextChord.get((melid,bar,beat))
        if n and (n[0]-r)%12==5 and n[1] in('min','hdim'): cls='domalt'
    return r,cls

phr=collections.defaultdict(list)
for melid,s,e in c.execute("select melid,start,end from sections where type='PHRASE'"): phr[melid].append((s,e))

notes=c.execute("select m.melid,m.eventid,m.onset,m.pitch,m.duration,m.bar,m.beat,m.tatum,m.division,m.beatdur from melody m order by m.melid,m.eventid").fetchall()
bymel=collections.defaultdict(list)
for r in notes:
    if r[0] in info: bymel[r[0]].append(r)

def pos_tick(tat,div,others):
    p=(tat-1)/div
    return p
# quantize a beat's onset set into token
def beat_token(ps,held):
    s=set()
    for p in ps:
        if p<0.12: s.add(0)
        elif abs(p-1/3)<0.06: s.add(2)
        elif abs(p-0.5)<0.06: s.add(3)
        elif abs(p-2/3)<0.06: s.add(4)
        elif abs(p-0.25)<0.05: s.add('q1')
        elif abs(p-0.75)<0.05: s.add(3)
        else: s.add('x')
    if not s: return 'H' if held else 'R'
    trip=2 in s and 4 in s
    if trip and 0 in s: return 'T'
    if trip: return 'Tr' if not held else 'Tr'
    has0=0 in s
    late= (3 in s) or (4 in s) or (2 in s) or ('x' in s and not has0) or ('q1' in s)
    if has0 and (3 in s or 4 in s or 'x' in s or 'q1' in s or 2 in s): return 'E'
    if has0: return 'Q'
    return 'Uh' if held else 'Ur'

GROUPS={'all':lambda p,s:True,'bebop':lambda p,s:s=='BEBOP','hardbop':lambda p,s:s=='HARDBOP','cool':lambda p,s:s=='COOL','swing':lambda p,s:s=='SWING','postbop':lambda p,s:s=='POSTBOP'}
PERF={'parker':'Charlie Parker','cbrown':'Clifford Brown','baker':'Chet Baker','rollins':'Sonny Rollins','dgordon':'Dexter Gordon','miles':'Miles Davis','getz':'Stan Getz','coltrane':'John Coltrane','lyoung':'Lester Young','dorham':'Kenny Dorham','jj':'J.J. Johnson','cannon':'Cannonball Adderley','henderson':'Joe Henderson','morgan':'Lee Morgan','hubbard':'Freddie Hubbard','konitz':'Lee Konitz'}
for k,v in PERF.items(): GROUPS[k]=(lambda vv: (lambda p,s:p==vv))(v)

TOK=['R','H','Q','E','Ur','Uh','T','Tr']
CLS=['maj','min','dom','domalt','hdim','dim']
def new_prof():
    return {'rhy':collections.Counter(),'pc':{c:{'on':[0]*12,'off':[0]*12} for c in CLS},'iv':[0]*25,'n':0,'phraseLen':[],'solos':set(),
            'ctOn':[0,0],'chrom':[0,0],'eighth':[0,0],'trip':[0,0],'dirRun':collections.Counter()}
profs={g:new_prof() for g in GROUPS}
CT={'maj':{0,4,7,11,9},'min':{0,3,7,10,9},'dom':{0,4,7,10},'domalt':{0,4,7,10},'hdim':{0,3,6,10},'dim':{0,3,6,9}}
SC={'maj':{0,2,4,5,7,9,11},'min':{0,2,3,5,7,9,10},'dom':{0,2,4,5,7,9,10},'domalt':{0,1,3,4,7,8,10,5},'hdim':{0,2,3,5,6,8,10,1},'dim':{0,2,3,5,6,8,9,11}}

# lick mining structures
lickC=collections.defaultdict(lambda:{'n':0,'perf':set()})
pairC=collections.defaultdict(lambda:{'n':0,'perf':set()})

for melid,ns in bymel.items():
    perf,style,inst,tempo=info[melid]
    gs=[g for g,f in GROUPS.items() if f(perf,style)]
    # build per-beat tokens
    bl=beatList[melid]
    # notes grouped by (bar,beat)
    nb=collections.defaultdict(list)
    for r in ns: nb[(r[5],r[6])].append(r)
    lastEnd=-1
    toks=[]
    for (bar,beat,on) in bl:
        if bar<1: continue
        rs=nb.get((bar,beat),[])
        held = lastEnd>on+0.02
        ps=[(r[7]-1)/r[8] for r in rs]
        t=beat_token(ps,held)
        toks.append((bar,beat,t))
        for r in rs: lastEnd=max(lastEnd if rs.index(r)>0 else -1, r[2]+r[4]) if False else r[2]+r[4]
    # rhythm transitions (beatpos, prev, tok)
    for i in range(1,len(toks)):
        if toks[i][0]-toks[i-1][0]>1: continue
        for g in gs: profs[g]['rhy'][(toks[i][1],toks[i-1][2],toks[i][2])]+=1
    # pitch stats
    ph=phr[melid]; inPh={}
    idx=0
    evid=[r[1] for r in ns]
    base=min(evid)
    for pi,(s,e) in enumerate(ph):
        for k in range(s,e+1): inPh[k]=pi
    prev=None;prevph=None
    for k,r in enumerate(ns):
        _,eid,on,pitch,dur,bar,beat,tat,div,bd=r
        cx=ctx(melid,bar,beat)
        p=int(pitch); rel_k=k
        phi=inPh.get(k)
        metric='on' if tat==1 else 'off'
        for g in gs:
            P=profs[g];P['n']+=1;P['solos'].add(melid)
            if cx:
                rel=(p-cx[0])%12
                P['pc'][cx[1]][metric][rel]+=1
                if metric=='on' and div<=2:
                    P['ctOn'][0]+=rel in CT[cx[1]];P['ctOn'][1]+=1
                P['chrom'][0]+=rel not in SC[cx[1]];P['chrom'][1]+=1
            if prev is not None and phi==prevph and phi is not None:
                d=p-prev
                if -12<=d<=12: P['iv'][d+12]+=1
        prev=p;prevph=phi
    for g in gs:
        for (s,e) in ph: profs[g]['phraseLen'].append(e-s+1)
        for t in toks:
            profs[g]['eighth'][0]+= t[2] in('E','Uh','Ur');profs[g]['eighth'][1]+= t[2] not in('R','H')
            profs[g]['trip'][0]+= t[2] in('T','Tr');profs[g]['trip'][1]+= t[2] not in('R','H')
    # ---- lick mining: chains of swung eighths (beat onsets 0 and 0.5) ----
    seq=[]  # (pitch, bar, beat, half) for notes in 'E' beats exactly 2 notes at 0/.5
    for (bar,beat,on) in bl:
        rs=nb.get((bar,beat),[])
        ps=[round((r[7]-1)/r[8],3) for r in rs]
        if len(rs)==2 and ps[0]==0 and ps[1] in(0.5,0.667):
            seq.append((int(rs[0][3]),bar,beat,0,inPh.get(ns.index(rs[0]))));seq.append((int(rs[1][3]),bar,beat,1,inPh.get(ns.index(rs[1]))))
        else:
            seq.append(None)
    # split into runs
    runs=[];curr=[]
    for x in seq:
        if x is None:
            if len(curr)>=6: runs.append(curr)
            curr=[]
        else:
            if curr and (x[4]!=curr[-1][4]): 
                if len(curr)>=6: runs.append(curr)
                curr=[]
            curr.append(x)
    if len(curr)>=6: runs.append(curr)
    for run in runs:
        for i in range(0,len(run)-3):
            a=run[i]
            if a[3]!=0: continue
            # single-chord 4-note (2 beats) and 6-note windows, start on beat 1 or 3
            if a[2] not in (1,3): continue
            for L in (4,6,5):
                w=run[i:i+L]
                if len(w)<L: continue
                # contiguous beats check
                ok=True
                for j in range(1,L):
                    if w[j][3]==w[j-1][3]: ok=False
                if not ok: continue
                cxs=[ctx(melid,x[1],x[2]) for x in w]
                if None in cxs: continue
                ivs=tuple(w[j][0]-w[j-1][0] for j in range(1,L))
                if max(abs(v) for v in ivs)>9: continue
                if all(cx==cxs[0] for cx in cxs) and L in(4,6):
                    key=(cxs[0][1],(w[0][0]-cxs[0][0])%12,ivs)
                    lickC[key]['n']+=1;lickC[key]['perf'].add(perf)
                elif L==5 and cxs[0]==cxs[3] and cxs[4]!=cxs[3]:
                    trans=(cxs[4][0]-cxs[0][0])%12
                    key=(cxs[0][1],cxs[4][1],trans,(w[0][0]-cxs[0][0])%12,ivs)
                    pairC[key]['n']+=1;pairC[key]['perf'].add(perf)

out={'profiles':{},'licks':[],'pairs':[]}
for g,P in profs.items():
    if P['n']<800: print('skip',g,P['n']);continue
    rhy={}
    for (bp,pt,t),n in P['rhy'].items():
        rhy.setdefault(str(bp),{}).setdefault(pt,{})[t]=n
    pl=sorted(P['phraseLen']);
    out['profiles'][g]={'n':P['n'],'solos':len(P['solos']),'rhy':rhy,
        'pc':{c:{m:P['pc'][c][m] for m in('on','off')} for c in CLS},
        'iv':P['iv'],
        'stats':{'ctOn':round(P['ctOn'][0]/max(1,P['ctOn'][1]),3),'chrom':round(P['chrom'][0]/max(1,P['chrom'][1]),3),
                 'eighth':round(P['eighth'][0]/max(1,P['eighth'][1]),3),'trip':round(P['trip'][0]/max(1,P['trip'][1]),3),
                 'phraseMed':pl[len(pl)//2] if pl else 0}}
allperf=lambda d:len(d['perf'])
L=[(k,v) for k,v in lickC.items() if allperf(v)>=4]
L.sort(key=lambda kv:-allperf(kv[1])*math.log(1+kv[1]['n']))
P2=[(k,v) for k,v in pairC.items() if allperf(v)>=4]
P2.sort(key=lambda kv:-allperf(kv[1])*math.log(1+kv[1]['n']))
print('licks',len(L),'pairs',len(P2))
inv={v:k for k,v in PERF.items()}
for k,v in L:
    out['licks'].append({'c':k[0],'s':k[1],'iv':list(k[2]),'n':v['n'],'np':len(v['perf']),'by':sorted(inv[p] for p in v['perf'] if p in inv)})
for k,v in P2:
    out['pairs'].append({'a':k[0],'b':k[1],'tr':k[2],'s':k[3],'iv':list(k[4]),'n':v['n'],'np':len(v['perf']),'by':sorted(inv[p] for p in v['perf'] if p in inv)})
json.dump(out,open('wjd_stats.json','w'))
for g,p in out['profiles'].items(): print(g,p['n'],p['solos'],p['stats'])
from collections import Counter
print(Counter(l['c'] for l in out['licks']))
print(Counter((l['a'],l['b'],l['tr']) for l in out['pairs']).most_common(12))
for l in out['licks'][:25]: print(l['c'],l['s'],l['iv'],l['n'],l['np'])
for l in out['pairs'][:15]: print(l['a'],l['b'],l['tr'],l['s'],l['iv'],l['n'],l['np'])
