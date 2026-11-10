"""WJD 실제 솔로 vs 생성 솔로 — 리듬 지표 비교.
python3 tools/rhythm_compare.py tools/data_raw/wjazzd.db gen.json [gen2.json ...]
비교는 1박=12틱 격자에서 한다(8분=6, 셋잇단=4·8, 16분=3·9). 엔진 틱(1박=6)은 2배로 바꾼다. WJD는 4/4 스윙만, 템프 100~260."""
import sqlite3, json, sys, collections, statistics as st

def wjd_solos(db):
    c=sqlite3.connect(db)
    ok={m for (m,) in c.execute("select melid from solo_info where rhythmfeel='SWING' and signature='4/4' and avgtempo between 100 and 260")}
    rows=c.execute("select melid,eventid,onset,duration,bar,beat,tatum,division,beatdur,pitch from melody order by melid,eventid").fetchall()
    phr=collections.defaultdict(list)
    for m,s,e in c.execute("select melid,start,end from sections where type='PHRASE'"):phr[m].append((s,e))
    by=collections.defaultdict(list)
    for r in rows:
        if r[0] in ok:by[r[0]].append(r)
    out=[]
    for m,ns in by.items():
        base=ns[0][1];starts={s for s,e in phr[m]};ends={e for s,e in phr[m]}
        notes=[];bad=0
        for k,(_,eid,on,dur,bar,beat,tat,div,bd,p) in enumerate(ns):
            if bar<1 or not bd:continue
            pos=(tat-1)/div
            tk=round(pos*12)                       # 0 정박 · 6 엇박8분 · 4/8 셋잇단 · 3/9 16분
            T=(bar-1)*48+(beat-1)*12+tk
            d=max(1,round(dur/bd*12))
            notes.append({'T':T,'d':d,'trip':tk in(4,8),'ps':k in starts,'pe':k in ends,'m':int(p)})
        # 겹침 정리, 다음 음까지로 길이 제한
        notes.sort(key=lambda n:n['T'])
        for a,b in zip(notes,notes[1:]):
            if b['T']<=a['T']:b['T']=a['T']+1
            a['d']=min(a['d'],b['T']-a['T'])
        out.append({'id':m,'notes':notes})
    return out

def to12(solos):
    return [{'id':s['id'],'notes':[dict(x,T=x['T']*2,d=x['d']*2) for x in s['notes']]} for s in solos]

def metrics(solos):
    M=collections.defaultdict(list);C=collections.Counter()
    for s in solos:
        ns=s['notes']
        if len(ns)<20:continue
        n=len(ns)
        pos=collections.Counter(x['T']%12 for x in ns)
        C['on']+=pos[0];C['and']+=pos[6];C['trip']+=pos[4]+pos[8];C['other']+=n-pos[0]-pos[6]-pos[4]-pos[8];C['n']+=n
        # IOI 분포
        for a,b in zip(ns,ns[1:]):
            ioi=b['T']-a['T']
            C['ioi_'+{6:'8분',12:'4분',4:'셋잇단',3:'16분',18:'점4분',24:'2분'}.get(ioi,'긴쉼포함' if ioi>24 else '기타')]+=1
            C['ioi_n']+=1
        # 8분 연속 길이(연속 IOI=3)
        run=1;runs=[]
        for a,b in zip(ns,ns[1:]):
            if b['T']-a['T']==6:run+=1
            else:
                if run>1:runs.append(run)
                run=1
        if run>1:runs.append(run)
        M['eighth_run_mean'].append(st.mean(runs) if runs else 0)
        M['eighth_run_ge8'].append(sum(r for r in runs if r>=8)/n)
        # 당김음: 엇박(3)에서 시작해 다음 박을 넘어가는 음
        M['anticip'].append(sum(1 for x in ns if x['T']%12==6 and x['d']>6)/n)
        # 프레이즈: 쉼(IOI 끝-다음 시작 간격 >= 6틱) 기준으로 나눈다(두 데이터에 같은 정의)
        phr=[[ns[0]]]
        for a,b in zip(ns,ns[1:]):
            if b['T']-(a['T']+a['d'])>=12:phr.append([b])
            else:phr[-1].append(b)
        for p in phr:
            if len(p)<2:continue
            C['ph_n']+=1
            C['ph_start_pos_'+str(p[0]['T']%48//6)]+=1      # 8분 단위 마디 내 위치 0..7
            C['ph_start_off']+= p[0]['T']%12!=0
            C['ph_end_pos_'+str(p[-1]['T']%48//6)]+=1
            C['ph_end_off']+=p[-1]['T']%12!=0
            M['ph_notes'].append(len(p))
            M['ph_beats'].append((p[-1]['T']+p[-1]['d']-p[0]['T'])/12)
            M['last_dur'].append(p[-1]['d']/12)
            # 프레이즈 안 짧은 쉼(1박 미만 공백)
            C['in_gap']+=sum(1 for a,b in zip(p,p[1:]) if b['T']-(a['T']+a['d'])>=3)
            C['in_pairs']+=len(p)-1
        gaps=[(b['T']-(a['T']+a['d']))/12 for a,b in zip(ns,ns[1:]) if b['T']-(a['T']+a['d'])>=12]
        M['gap_beats'].extend(gaps)
        # 마디 리듬 반복: 연속 두 마디의 온셋 집합 자카드
        bars=collections.defaultdict(set)
        for x in ns:bars[x['T']//48].add(x['T']%48)
        ks=sorted(bars);J=[];same=0;cnt=0
        for a,b in zip(ks,ks[1:]):
            if b!=a+1:continue
            A,B=bars[a],bars[b];J.append(len(A&B)/len(A|B));same+=A==B;cnt+=1
        if cnt:M['bar_jacc'].append(st.mean(J));M['bar_same'].append(same/cnt)
        # 박 단위 토큰 다양성: 박 안 온셋 패턴의 엔트로피
        beat=collections.Counter()
        bb=collections.defaultdict(list)
        for x in ns:bb[x['T']//12].append(x['T']%12)
        for v in bb.values():beat[tuple(sorted(v))]+=1
        tot=sum(beat.values())
        import math
        M['beat_entropy'].append(-sum(c/tot*math.log2(c/tot) for c in beat.values()))
        M['dur_long'].append(sum(1 for x in ns if x['d']>=12)/n)
        M['dur_dotq'].append(sum(1 for x in ns if x['d']==18)/n)
    R={}
    R['onset 정박 %']=100*C['on']/C['n'];R['onset 엇박8분 %']=100*C['and']/C['n'];R['onset 셋잇단 %']=100*C['trip']/C['n'];R['onset 기타(16분 등) %']=100*C['other']/C['n']
    for k in ['16분','셋잇단','8분','4분','점4분','2분','긴쉼포함','기타']:R['IOI '+k+' %']=100*C['ioi_'+k]/C['ioi_n']
    for k,v in M.items():
        if v:R[k+(' (중앙값)' if k in('ph_notes','ph_beats','gap_beats','last_dur') else ' (평균)')]=st.median(v) if k in('ph_notes','ph_beats','gap_beats','last_dur') else st.mean(v)
    R['프레이즈 시작 엇박 %']=100*C['ph_start_off']/C['ph_n'];R['프레이즈 끝 엇박 %']=100*C['ph_end_off']/C['ph_n']
    R['프레이즈 안 짧은 쉼 / 음간격 %']=100*C['in_gap']/max(1,C['in_pairs'])
    R['프레이즈 시작 위치(8분) %']=' '.join(f"{100*C['ph_start_pos_'+str(i)]/C['ph_n']:.0f}" for i in range(8))
    R['프레이즈 끝 위치(8분) %']=' '.join(f"{100*C['ph_end_pos_'+str(i)]/C['ph_n']:.0f}" for i in range(8))
    return R

if __name__=='__main__':
    db=sys.argv[1];W=metrics(wjd_solos(db))
    G=[metrics(to12(json.load(open(f)))) for f in sys.argv[2:]]
    names=['WJD']+[f.split('/')[-1] for f in sys.argv[2:]]
    print('지표'.ljust(34)+''.join(n[:16].rjust(17) for n in names))
    for k in W:
        vals=[W[k]]+[g.get(k,'-') for g in G]
        print(k.ljust(34)+''.join((f'{v:17.2f}' if isinstance(v,float) else str(v).rjust(17)) for v in vals))
