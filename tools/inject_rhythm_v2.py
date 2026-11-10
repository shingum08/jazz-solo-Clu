"""tools/data/rhythm_v2.json → engine/style_data.js 끝의 STYLE_DATA.rhy2 (스크립트 산출물, 손으로 고치지 않는다).
프로필별 1차 전이는 export.py와 같은 비율로 섞는다(연주자 1 · 스타일 그룹 0.4~0.7 · 전체 0.25)."""
import json, re
R=json.load(open('tools/data/rhythm_v2.json'))
UI={'all':[('all',1)],'parker':[('parker',1),('bebop',0.6)],'cbrown':[('cbrown',1),('hardbop',0.6)],'rollins':[('rollins',1),('hardbop',0.5)],
    'dgordon':[('dgordon',1),('hardbop',0.5)],'baker':[('baker',1),('cool',0.7)],'getz':[('getz',1),('cool',0.6)],'miles':[('miles',1),('hardbop',0.4)],'lyoung':[('lyoung',1),('swing',0.6)]}
TOK=R['tok']
bi={}
for key,parts in UI.items():
    out={}
    for bp in '1234':
        for p1 in TOK:
            k=bp+p1;row=[0.0]*len(TOK);wsum=0
            for g,w in parts+[('all',0.25)]:
                r=R['bi'].get(g,{}).get(k)
                if r:row=[a+w*b for a,b in zip(row,r)];wsum+=w
            if wsum:z=sum(row);out[k]=[round(x/z,4) for x in row]
    bi[key]=out
data={'tok':TOK,'tri':R['tri'],'bi':bi,'first':R['first'],'lastLen':R['lastLen']}
p='engine/style_data.js';s=open(p,encoding='utf-8').read()
s=re.sub(r'\n/\* v0\.33 리듬 v2.*?\nSTYLE_DATA\.rhy2=.*?;\n','\n',s,flags=re.S)
s=s.rstrip('\n')+'\n/* v0.33 리듬 v2 — WJD 4/4 스윙 솔로의 박 토큰 2차 전이·프레이즈 첫 박·끝음 길이 분포(tools/rhythm_v2.py · inject_rhythm_v2.py 산출물) */\nSTYLE_DATA.rhy2='+json.dumps(data,separators=(',',':'),ensure_ascii=False)+';\n'
open(p,'w',encoding='utf-8').write(s)
print('rhy2 bytes',len(json.dumps(data,separators=(',',':'))))
