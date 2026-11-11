#!/usr/bin/env python3
"""app/template.html (마커 있음) + engine/*.js → 루트 index.html (단일 파일 앱).

- <script id="engine">…</script> 를 engine/engine_core.js + engine/style_data.js + engine/headabc.js 로 교체
- /*__PLAYBACK_START__*/ … /*__PLAYBACK_END__*/ 사이를 engine/playback.js 로 교체
- 마지막 구형 MusicXML 스크립트는 결과에서만 제거하고 engine/musicxml.js 삽입
사용법: python3 tools/build.py   (repo 루트에서 실행)
"""
import re, os
import glob
here=os.path.dirname(os.path.abspath(__file__)); root=os.path.dirname(here)
tpl=open(os.path.join(root,'app','template.html'),encoding='utf-8').read()
eng=open(os.path.join(root,'engine','engine_core.js'),encoding='utf-8').read()
data=open(os.path.join(root,'engine','style_data.js'),encoding='utf-8').read()
data+='\n'+open(os.path.join(root,'engine','licks.js'),encoding='utf-8').read()   # v0.40 릭 사전
head=open(os.path.join(root,'engine','headabc.js'),encoding='utf-8').read()
head+='\n'+open(os.path.join(root,'engine','drill.js'),encoding='utf-8').read()
head+='\n'+open(os.path.join(root,'engine','locks.js'),encoding='utf-8').read()
head+='\n'+open(os.path.join(root,'engine','song_status.js'),encoding='utf-8').read()
songs=''
for fp in sorted(glob.glob(os.path.join(root,'engine','songs_part*.js'))):
    songs+=open(fp,encoding='utf-8').read()
pb=open(os.path.join(root,'engine','playback.js'),encoding='utf-8').read()
out=re.sub(r'<script id="engine">[\s\S]*?</script>',
           lambda m:'<script id="engine">\n'+eng+'\n'+data+'\n'+head+'\n'+songs+'\n</script>',tpl,count=1)
start=out.index('/*__PLAYBACK_START__*/'); end=out.index('/*__PLAYBACK_END__*/')+len('/*__PLAYBACK_END__*/')
out=out[:start]+pb+out[end:]
marker='<!--__MUSICXML_MODULE__-->'
if out.count(marker) != 1:
    raise RuntimeError('Expected exactly one MusicXML module marker')
xml=open(os.path.join(root,'engine','musicxml.js'),encoding='utf-8').read()
out=out.replace(marker, '<script id="musicxml">\n'+xml+'\n</script>', 1)
open(os.path.join(root,'index.html'),'w',encoding='utf-8').write(out)
# v0.41 PWA — 매니페스트·서비스 워커·아이콘을 루트로(서비스 워커 캐시 이름에 버전을 찍어 새 버전 배포 시 옛 캐시를 지운다)
import shutil
ver=re.search(r'<title>[^<]*?v(\d+\.\d+\.\d+)',tpl).group(1)
pwa=os.path.join(root,'app','pwa')
shutil.copyfile(os.path.join(pwa,'manifest.webmanifest'),os.path.join(root,'manifest.webmanifest'))
open(os.path.join(root,'sw.js'),'w',encoding='utf-8').write(open(os.path.join(pwa,'sw.js'),encoding='utf-8').read().replace('__VERSION__',ver))
os.makedirs(os.path.join(root,'icons'),exist_ok=True)
for f in os.listdir(os.path.join(pwa,'icons')):
    shutil.copyfile(os.path.join(pwa,'icons',f),os.path.join(root,'icons',f))
print('built index.html',len(out),'bytes · PWA v'+ver)
