import json, math, sqlite3, collections, statistics
d=json.load(open('wjd_stats.json')); ph=json.load(open('phrase_stats.json'))
P=d['profiles']
TOK=['R','H','Q','E','Ur','Uh','T','Tr']; CLS=['maj','min','dom','domalt','hdim','dim']
UI=[('all','균형 · WJD 전체',[('all',1)]),
    ('parker','Charlie Parker 계열',[('parker',1),('bebop',0.6)]),
    ('cbrown','Clifford Brown 계열',[('cbrown',1),('hardbop',0.6)]),
    ('rollins','Sonny Rollins 계열',[('rollins',1),('hardbop',0.5)]),
    ('dgordon','Dexter Gordon 계열',[('dgordon',1),('hardbop',0.5)]),
    ('baker','Chet Baker 계열',[('baker',1),('cool',0.7)]),
    ('getz','Stan Getz 계열',[('getz',1),('cool',0.6)]),
    ('miles','Miles Davis 계열',[('miles',1),('hardbop',0.4)]),
    ('lyoung','Lester Young 계열',[('lyoung',1),('swing',0.6)])]
# swing offsets per performer
c=sqlite3.connect('wjazzd.db')
PERFN={'parker':'Charlie Parker','cbrown':'Clifford Brown','baker':'Chet Baker','rollins':'Sonny Rollins','dgordon':'Dexter Gordon','miles':'Miles Davis','getz':'Stan Getz','lyoung':'Lester Young'}
rows=c.execute("""select m.melid,m.bar,m.beat,m.onset,m.tatum,m.division,m.beatdur,s.avgtempo,s.performer from melody m join solo_info s on s.melid=m.melid
where s.rhythmfeel='SWING' and s.signature='4/4' order by m.melid,m.eventid""").fetchall()
bt={(a,b,cc):o for a,b,cc,o in c.execute("select melid,bar,beat,onset from beats")}
beats=collections.defaultdict(list)
for r in rows: beats[(r[0],r[1],r[2])].append(r)
glob=collections.defaultdict(list); perf=collections.defaultdict(list)
for k,v in beats.items():
    if len(v)==2 and v[0][4]==1 and v[0][5]==2 and v[1][4]==2 and k in bt:
        r=(v[1][3]-bt[k])/v[0][6]
        if 0.3<r<0.85:
            b=int(v[0][7]//40); glob[b].append(r); perf[v[0][8]].append((b,r))
gm={b:statistics.median(x) for b,x in glob.items()}
swingOff={}
for key,name in PERFN.items():
    res=[r-gm[b] for b,r in perf[name]]
    swingOff[key]=round(statistics.median(res),3) if len(res)>30 else 0
swingOff['all']=0
print(swingOff)
def blend(parts):
    out={'rhy':{},'pc':{},'iv':[0]*25}
    # rhythm counts
    for bp in '1234':
        out['rhy'][bp]={}
        for pt in TOK:
            row=[]
            for t in TOK:
                s=0
                for g,w in parts+[('all',0.25)]:
                    tab=P[g]['rhy'].get(bp,{}).get(pt,{}); tot=sum(tab.values()) or 1
                    s+=w*tab.get(t,0)/tot
                row.append(s)
            z=sum(row) or 1
            out['rhy'][bp][pt]=[round(x/z,4) for x in row]
    for cl in CLS:
        out['pc'][cl]={}
        for m in ('on','off'):
            row=[0]*12
            for g,w in parts+[('all',0.25)]:
                a=P[g]['pc'][cl][m]; z=sum(a) or 1
                for i in range(12): row[i]+=w*a[i]/z
            z=sum(row); out['pc'][cl][m]=[round(x/z,4) for x in row]
    for g,w in parts+[('all',0.25)]:
        a=P[g]['iv']; z=sum(a)
        for i in range(25): out['iv'][i]+=w*a[i]/z
    z=sum(out['iv']); out['iv']=[round(x/z,4) for x in out['iv']]
    main=parts[0][0]
    st=P[main]['stats']; phs=ph.get(main,ph['all'])
    out['stats']={**st,'phLen':phs['len'],'gap':phs['gap']}
    return out
prof={}
for key,label,parts in UI:
    b=blend(parts); b['label']=label; b['swingOff']=swingOff.get(key,0); b['n']=P[parts[0][0]]['n']; b['solos']=P[parts[0][0]]['solos']
    prof[key]=b
DEG=['1','♭2','2','♭3','3','4','♭5','5','♭6','6','♭7','7']
cells=[]
for i,l in enumerate(d['licks']):
    if l['np']<4: continue
    degs=[l['s']];
    for v in l['iv']: degs.append(degs[-1]+v)
    cells.append({'id':'w%d'%i,'cls':l['c'],'s':l['s'],'iv':l['iv'],'np':l['np'],'n':l['n'],'by':l['by'],'src':'WJD','name':'-'.join(DEG[x%12] for x in degs)})
for i,l in enumerate(d['pairs']):
    degs=[l['s']]
    for v in l['iv']: degs.append(degs[-1]+v)
    cells.append({'id':'wp%d'%i,'cls':l['a'],'to':l['b'],'tr':l['tr'],'s':l['s'],'iv':l['iv'],'np':l['np'],'n':l['n'],'by':l['by'],'src':'WJD','name':'-'.join(DEG[x%12] for x in degs[:4])+' → '+DEG[(degs[4]-l['tr'])%12]+'(다음 코드)'})
json.dump({'profiles':prof,'cells':cells},open('wjd_export.json','w'),ensure_ascii=False,separators=(',',':'))
import os;print(os.path.getsize('wjd_export.json'),len(cells))
