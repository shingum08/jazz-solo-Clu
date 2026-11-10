#!/usr/bin/env python3
"""Weimar Jazz Database에서 프레이즈 길이·쉼 길이 분포(백분위)를 뽑아 data/phrase_stats.json으로 저장.

사용법:
    python3 phrase_stats.py [wjazzd.db 경로]
    (기본값: ../wjazzd.db — https://jazzomat.hfm-weimar.de/download/downloads/wjazzd.db 에서 내려받으세요)

출력: 연주자별(전체 + 주요 연주자) 프레이즈 길이/쉼 길이의 Q1·중앙값·Q3 (단위: 박).
프레이즈 정의: Weimar sections 테이블 type='PHRASE'. 길이 = (마지막 음 onset+길이 − 첫 음 onset) / 박 길이.
"""
import sqlite3, collections, statistics, json, sys, os

PERF = {'Charlie Parker':'parker','Clifford Brown':'cbrown','Chet Baker':'baker',
        'Sonny Rollins':'rollins','Dexter Gordon':'dgordon','Miles Davis':'miles',
        'Stan Getz':'getz','John Coltrane':'coltrane','Lester Young':'lyoung',
        'J.J. Johnson':'jj','Cannonball Adderley':'cannon'}

def main(db):
    c = sqlite3.connect(db)
    info = {m: p for m, p, s in c.execute(
        "select melid,performer,style from solo_info where rhythmfeel='SWING' and signature='4/4'")}
    mel = collections.defaultdict(list)
    for melid, on, du, bd in c.execute(
        "select melid,onset,duration,beatdur from melody order by melid,eventid"):
        if melid in info: mel[melid].append((on, du, bd))
    res = collections.defaultdict(lambda: {'len': [], 'gap': []})
    for melid, s, e in c.execute(
        "select melid,start,end from sections where type='PHRASE' order by melid,start"):
        if melid not in info: continue
        ns = mel[melid]
        if e >= len(ns): continue
        bd = statistics.median([x[2] for x in ns[s:e+1]])
        L = (ns[e][0] + ns[e][1] - ns[s][0]) / bd
        keys = ['all'] + ([PERF[info[melid]]] if info[melid] in PERF else [])
        for k in keys:
            res[k]['len'].append(L)
            if e + 1 < len(ns): res[k]['gap'].append((ns[e+1][0] - (ns[e][0] + ns[e][1])) / bd)
    out = {}
    for k, v in res.items():
        q = lambda a, p: round(sorted(a)[int(len(a) * p)], 1)
        out[k] = {'len': [q(v['len'], p) for p in (0.25, 0.5, 0.75)],
                  'gap': [q(v['gap'], p) for p in (0.25, 0.5, 0.75)]}
    here = os.path.dirname(os.path.abspath(__file__))
    dst = os.path.join(here, 'data', 'phrase_stats.json')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    json.dump(out, open(dst, 'w'))
    print('saved', dst, {k: out[k] for k in list(out)[:3]})

if __name__ == '__main__':
    db = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'wjazzd.db')
    if not os.path.exists(db):
        sys.exit(f"DB not found: {db}\n먼저 내려받으세요: https://jazzomat.hfm-weimar.de/download/downloads/wjazzd.db")
    main(db)
