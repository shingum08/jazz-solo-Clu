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
head=open(os.path.join(root,'engine','headabc.js'),encoding='utf-8').read()
head+='\n'+open(os.path.join(root,'engine','drill.js'),encoding='utf-8').read()
head+='\n'+open(os.path.join(root,'engine','locks.js'),encoding='utf-8').read()
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
print('built index.html',len(out),'bytes')
