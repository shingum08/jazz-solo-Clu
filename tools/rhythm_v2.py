"""v2 리듬 모델 추출 — WJD 4/4 스윙 솔로에서 박 단위 토큰(9종)의 2차 마르코프 전이를 센다.
python3 tools/rhythm_v2.py tools/data_raw/wjazzd.db tools/data/rhythm_v2.json

토큰(박 하나 = 12틱 격자, 16분은 8분 격자로 접고, 셋잇단 3음은 T):
  R  쉼으로 시작, 온셋 없음         H  앞 음이 이어짐, 온셋 없음
  Q  정박 온셋, 엇박까지 울림        Qs 정박 온셋, 엇박 전에 끝남(짧게 끊음)
  E  정박+엇박 온셋                 Ur 쉼 뒤 엇박 온셋        Uh 이어진 음 뒤 엇박 온셋
  T  셋잇단 3음                     (셋잇단 일부·16분 잔여는 가까운 8분 토큰으로)
산출물은 확률 분포만 담는다(원 음표열 없음 · ODbL 파생 통계)."""
import sqlite3, json, sys, collections

TOK=['R','H','Q','Qs','E','Ur','Uh','T']
PERFN={'parker':'Charlie Parker','cbrown':'Clifford Brown','baker':'Chet Baker','rollins':'Sonny Rollins','dgordon':'Dexter Gordon','miles':'Miles Davis','getz':'Stan Getz','lyoung':'Lester Young'}
STYLEOF={'parker':'BEBOP','cbrown':'HARDBOP','rollins':'HARDBOP','dgordon':'HARDBOP','baker':'COOL','getz':'COOL','miles':'HARDBOP','lyoung':'SWING'}

def load(db):
    c=sqlite3.connect(db)
    info={m:(p,s) for m,p,s in c.execute("select melid,performer,style from solo_info where rhythmfeel='SWING' and signature='4/4' and avgtempo between 90 and 280")}
    by=collections.defaultdict(list)
    for m,on,dur,bar,beat,tat,div,bd in c.execute("select melid,onset,duration,bar,beat,tatum,division,beatdur from melody order by melid,eventid"):
        if m in info and bar>=1 and bd:
            T=(bar-1)*48+(beat-1)*12+round((tat-1)/div*12)
            by[m].append([T,max(1,round(dur/bd*12))])
    return info,by

def tokens(ns,nbeats):
    """음표 [T,d](12틱) → 박 토큰 배열. 프레이즈 경계는 1박 이상 쉼."""
    ns=sorted(ns)
    for a,b in zip(ns,ns[1:]):a[1]=min(a[1],max(1,b[0]-a[0]))
    on=collections.defaultdict(list)
    for T,d in ns:on[T//12].append((T%12,d,T))
    sound=bytearray(nbeats*12+48)
    for T,d in ns:
        for x in range(T,min(len(sound),T+d)):sound[x]=1
    out=[]
    for b in range(nbeats):
        pos=sorted(p for p,_,_ in on.get(b,[]))
        s=set()
        for p in pos:
            if p in(4,8):s.add(p)
            elif p<3:s.add(0)
            elif p<=9:s.add(6)            # 3은 정박 쪽 16분이지만 엇박 직전이 대부분 — 6으로
        held=sound[b*12-1] if b>0 else 0
        if 4 in s and 8 in s and 0 in s:t='T'
        elif not s:t='H' if (held and sound[b*12]) else 'R'
        elif 0 in s and 6 in s:t='E'
        elif 0 in s and (8 in s or 4 in s):t='E'
        elif 0 in s:t='Q' if sound[b*12+7] else 'Qs'
        else:t='Uh' if (held and sound[b*12]) else 'Ur'
        out.append(t)
    return out

def main(db,outp):
    info,by=load(db)
    groups={'all':lambda p,s:True,'bebop':lambda p,s:s=='BEBOP','hardbop':lambda p,s:s=='HARDBOP','cool':lambda p,s:s=='COOL','swing':lambda p,s:s=='SWING'}
    for k,v in PERFN.items():groups[k]=(lambda vv:(lambda p,s:p==vv))(v)
    tri=collections.Counter()                                    # (bp,p2,p1,t) — 전체만
    bi={g:collections.Counter() for g in groups}                  # (bp,p1,t) — 그룹별
    first=collections.Counter();last=collections.Counter();lastLen=collections.Counter()
    nsolo=collections.Counter()
    for m,ns in by.items():
        p,s=info[m];gs=[g for g,f in groups.items() if f(p,s)]
        for g in gs:nsolo[g]+=1
        nbeats=max(T for T,_ in ns)//12+2
        tk=tokens([x[:] for x in ns],nbeats)
        # 프레이즈 = 쉼(R)으로 둘러싸인 구간
        inph=False;p1=p2='R'
        for b,t in enumerate(tk):
            bp=b%4+1
            if t=='R':
                if inph:last[(prev_bp,p1)]+=1
                inph=False;p2,p1='R','R';continue
            if not inph:first[(bp,t)]+=1;inph=True
            tri[(bp,p2,p1,t)]+=1
            for g in gs:bi[g][(bp,p1,t)]+=1
            p2,p1=p1,t;prev_bp=bp
            # 프레이즈 안에서 다음 박이 R이면 같은 반복의 끝
        # 프레이즈 끝음 길이(8분 단위)
        srt=sorted(ns)
        for a,b in zip(srt,srt[1:]+[[10**9,0]]):
            gap=b[0]-(a[0]+a[1])
            if gap>=12:lastLen[min(8,max(1,round(a[1]/6)))]+=1
    def norm(cnt,keys):
        z=sum(cnt.get(k,0) for k in keys)
        return [round(cnt.get(k,0)/z,4) if z else 0 for k in keys]
    out={'tok':TOK,'tri':{},'bi':{},'first':{},'lastLen':[],'n':dict(nsolo)}
    for bp in range(1,5):
        out['first'][str(bp)]=norm({t:first[(bp,t)] for t in TOK},TOK)
        for p2 in TOK:
            for p1 in TOK:
                row={t:tri[(bp,p2,p1,t)] for t in TOK}
                if sum(row.values())>=25:out['tri'][f'{bp}{p2}|{p1}']=norm(row,TOK)
    for g in groups:
        out['bi'][g]={}
        for bp in range(1,5):
            for p1 in TOK:
                row={t:bi[g][(bp,p1,t)] for t in TOK}
                if sum(row.values())>=15:out['bi'][g][f'{bp}{p1}']=norm(row,TOK)
    out['lastLen']=norm(lastLen,list(range(1,9)))
    json.dump(out,open(outp,'w'),ensure_ascii=False)
    tot=collections.Counter()
    for (bp,p2,p1,t),v in tri.items():tot[t]+=v
    z=sum(tot.values())
    print('토큰 빈도',{t:round(100*tot[t]/z,1) for t in TOK})
    print('프레이즈 첫 박',{bp:dict(zip(TOK,out['first'][str(bp)])) for bp in '1'})
    print('끝음 길이(8분)',out['lastLen'],'솔로',dict(nsolo))
    print('2차 문맥',len(out['tri']),'개')
if __name__=='__main__':main(sys.argv[1],sys.argv[2])
