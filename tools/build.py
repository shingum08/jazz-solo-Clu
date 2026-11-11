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
head+='\n'+open(os.path.join(root,'engine','importers.js'),encoding='utf-8').read()   # v0.42 곡 불러오기
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
# v0.41.1 공개 빌드(GitHub에 올라가는 index.html)는 앱 기능(설치·오프라인·업데이트)을 끈다.
#   python3 tools/build.py --app     → dist/app/ 에 테스트용 PWA 빌드(설치 가능) + dist/clu-app-v버전.zip
#   python3 tools/build.py --android → dist/android/CluJazz/ 안드로이드 프로젝트(앱 안에 index.html) + dist/clu-android-v버전.zip
#   (dist/는 커밋하지 않음 — 직접 전달)
import sys, shutil, zipfile
ver=re.search(r'<title>[^<]*?v(\d+\.\d+\.\d+)',tpl).group(1)
if '<!--__PWA_HEAD__-->' not in out or '/*__PWA_BUILD__*/false' not in out:
    raise RuntimeError('PWA 마커가 없습니다(app/template.html)')
pub=out.replace('<!--__PWA_HEAD__-->\n','').replace('<!--__PWA_HEAD__-->','')
open(os.path.join(root,'index.html'),'w',encoding='utf-8').write(pub)
print('built index.html',len(pub),'bytes (공개 빌드 · 앱 설치 꺼짐)')
if '--app' in sys.argv:
    pwa=os.path.join(root,'app','pwa'); dist=os.path.join(root,'dist','app')
    shutil.rmtree(dist,ignore_errors=True); os.makedirs(os.path.join(dist,'icons'))
    app=out.replace('<!--__PWA_HEAD__-->',open(os.path.join(pwa,'head.html'),encoding='utf-8').read().rstrip()).replace('/*__PWA_BUILD__*/false','true')
    open(os.path.join(dist,'index.html'),'w',encoding='utf-8').write(app)
    shutil.copyfile(os.path.join(pwa,'manifest.webmanifest'),os.path.join(dist,'manifest.webmanifest'))
    open(os.path.join(dist,'sw.js'),'w',encoding='utf-8').write(open(os.path.join(pwa,'sw.js'),encoding='utf-8').read().replace('__VERSION__',ver))
    for f in os.listdir(os.path.join(pwa,'icons')):
        shutil.copyfile(os.path.join(pwa,'icons',f),os.path.join(dist,'icons',f))
    guide=open(os.path.join(pwa,'INSTALL.txt'),encoding='utf-8').read().replace('__VERSION__',ver)
    open(os.path.join(dist,'설치 안내.txt'),'w',encoding='utf-8').write(guide)
    zp=os.path.join(root,'dist','clu-app-v'+ver+'.zip')
    with zipfile.ZipFile(zp,'w',zipfile.ZIP_DEFLATED) as z:
        for d,_,fs in os.walk(dist):
            for f in fs:
                full=os.path.join(d,f); z.write(full,os.path.join('clu-app-v'+ver,os.path.relpath(full,dist)))
    print('app build →',dist,'·',zp,os.path.getsize(zp),'bytes')
if '--android' in sys.argv:
    src=os.path.join(root,'app','android'); out_dir=os.path.join(root,'dist','android','CluJazz')
    shutil.rmtree(os.path.join(root,'dist','android'),ignore_errors=True)
    shutil.copytree(src,out_dir)
    a,b,c=(int(x) for x in ver.split('.')); vcode=a*1000000+b*1000+c
    for rel in ['app/build.gradle','안드로이드 빌드 안내.txt']:
        fp=os.path.join(out_dir,rel); t=open(fp,encoding='utf-8').read().replace('__VERSION_CODE__',str(vcode)).replace('__VERSION__',ver)
        open(fp,'w',encoding='utf-8').write(t)
    www=os.path.join(out_dir,'app','src','main','assets','www'); os.makedirs(www,exist_ok=True)
    open(os.path.join(www,'index.html'),'w',encoding='utf-8').write(pub)   # 공개 빌드(서비스 워커 없음) — 파일은 앱 안에 있다
    zp=os.path.join(root,'dist','clu-android-v'+ver+'.zip')
    with zipfile.ZipFile(zp,'w',zipfile.ZIP_DEFLATED) as z:
        for d,_,fs in os.walk(out_dir):
            for f in fs:
                full=os.path.join(d,f); z.write(full,os.path.join('CluJazz',os.path.relpath(full,out_dir)))
    print('android build →',out_dir,'·',zp,os.path.getsize(zp),'bytes · versionCode',vcode)
