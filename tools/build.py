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
#   python3 tools/build.py --web     → dist/web/ 웹 빌드(홈 / + 앱 /app/ · 공통 형식만 · noindex) + dist/ezimprovjazz-web-v버전.zip
#   (dist/는 커밋하지 않음 — 직접 전달)
import sys, shutil, zipfile
ver=re.search(r'<title>[^<]*?v(\d+\.\d+\.\d+)',tpl).group(1)
if '<!--__PWA_HEAD__-->' not in out or '/*__PWA_BUILD__*/false' not in out:
    raise RuntimeError('PWA 마커가 없습니다(app/template.html)')
# v0.53 마디 평가 수신 주소(Cloudflare Worker) — 환경변수 CLU_FB_URL 또는 server/feedback-worker/ENDPOINT 한 줄. 비밀 아님(주소만).
#   없으면 앱은 예전처럼 「📤 내보내기」 파일 방식으로 동작한다.
fb_url=os.environ.get('CLU_FB_URL','').strip()
fb_file=os.path.join(root,'server','feedback-worker','ENDPOINT')
if not fb_url and os.path.exists(fb_file): fb_url=open(fb_file,encoding='utf-8').read().strip()
if fb_url and not re.fullmatch(r'https://[A-Za-z0-9.-]+(/[A-Za-z0-9._/-]*)?',fb_url): raise RuntimeError('평가 수신 주소 형식이 이상합니다: '+fb_url)
if out.count("/*__FB_ENDPOINT__*/''")!=1: raise RuntimeError('FB_ENDPOINT 마커가 없습니다(app/template.html)')
out=out.replace("/*__FB_ENDPOINT__*/''",'/*__FB_ENDPOINT__*/'+repr(fb_url.rstrip('/')))
print('마디 평가 수신 주소:',fb_url or '(없음 — 파일 내보내기 방식)')
# v0.55 Supabase 공개 설정(주소 + publishable 키) — server/supabase/config.json. 비밀 키(sb_secret_·service_role)는 절대 넣지 않는다
import json as _json
sb_file=os.path.join(root,'server','supabase','config.json')
sb_cfg=None
if os.path.exists(sb_file):
    sb_cfg=_json.load(open(sb_file,encoding='utf-8'))
    if not re.fullmatch(r'https://[a-z0-9]{20}\.supabase\.co',sb_cfg.get('url','')): raise RuntimeError('Supabase 주소 형식이 이상합니다')
    k=sb_cfg.get('key','')
    if not k.startswith('sb_publishable_') or 'secret' in k or 'service_role' in k: raise RuntimeError('Supabase 키는 publishable 키만 넣습니다(비밀 키 금지)')
    sb_cfg={'url':sb_cfg['url'],'key':k}
if out.count("/*__SB_CONFIG__*/null")!=1: raise RuntimeError('SB_CONFIG 마커가 없습니다(app/template.html)')
out=out.replace("/*__SB_CONFIG__*/null",'/*__SB_CONFIG__*/'+(_json.dumps(sb_cfg) if sb_cfg else 'null'))
print('Supabase:',sb_cfg['url'] if sb_cfg else '(없음 — 계정 기능 꺼짐)')
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
if '--web' in sys.argv:
    # v0.44 웹 테스트 빌드 — Cloudflare Pages에 올려 초대한 사람만 쓰는 판(dist/는 커밋하지 않음)
    #   · 출판 리드시트에서 옮긴 곡(songs_part1.js)과 곡 검수 메모(song_status.js)를 빼고 engine/songs_web.js(공통 형식)만 넣는다
    #   · 검색 엔진에 안 잡히게(noindex · robots.txt), GitHub로 가는 피드백 버튼 숨김
    web=pub
    p1=open(os.path.join(root,'engine','songs_part1.js'),encoding='utf-8').read()
    st=open(os.path.join(root,'engine','song_status.js'),encoding='utf-8').read()
    if web.count(p1)!=1 or web.count(st)!=1: raise RuntimeError('웹 빌드: 곡 데이터 블록을 찾지 못했습니다')
    web=web.replace(p1,open(os.path.join(root,'engine','songs_web.js'),encoding='utf-8').read())
    wst={'p251':('practice','앱 연습용 진행'),'blues12':('practice','앱 연습용 진행'),'m25':('practice','앱 연습용 진행'),
         'form-rhythm':('form','공통 형식 — 재즈에서 널리 쓰는 리듬 체인지 진행'),'form-jazzblues':('form','공통 형식 — 재즈 블루스 12마디'),'form-minorblues':('form','공통 형식 — 마이너 블루스 12마디'),
         'pd-i-got-rhythm':('draft','거슈윈 1930 · 퍼블릭 도메인. 재즈에서 흔히 치는 32마디(원곡 끝 2마디 꼬리는 뺌)'),
         'pd-honeysuckle-rose':('draft','팻츠 월러 1929 · 퍼블릭 도메인. A 5~8마디 확인 필요'),
         'pd-tea-for-two':('draft','빈센트 유먼스 1924 · 퍼블릭 도메인. B 끝 턴어라운드·마지막 8마디 확인 필요'),
         'pd-it-had-to-be-you':('draft','아이셤 존스 1924 · 퍼블릭 도메인. 9~16마디·마지막 8마디 확인 필요')}
    import json
    web=web.replace(st,'/* 웹 빌드 곡 상태 */\nconst SONG_STATUS='+json.dumps({k:{'s':a,'n':b,'a':[]} for k,(a,b) in wst.items()},ensure_ascii=False)+';')
    def rep(old,new):
        global web
        if web.count(old)!=1: raise RuntimeError('웹 빌드: 문구를 찾지 못했습니다 — '+old[:40])
        web=web.replace(old,new)
    sub_old=re.search(r'<p class="sub">재즈 스탠더드 .*?</p>',web).group(0)
    rep(sub_old,'<p class="sub">코드 진행 위에 매번 새로운 연습용 솔로를 만듭니다. 연습 진행·공통 형식으로 바로 시작하고, 갖고 있는 곡은 📥 곡 불러오기로 이 기기에 담아 쓰세요. 아티스트 스타일 · 반음 단위 조 변환을 지원합니다.</p>')
    rep('placeholder="예: night, bossa, moon, 별"','placeholder="예: 블루스, 리듬"')
    rep('</head>','<meta name="robots" content="noindex,nofollow">\n<style>#btnFeedback{display:none!important}</style>\n</head>')
    for bad in ['리얼북','261곡','대조해 옮겼','정오표']:
        if bad in web: raise RuntimeError('웹 빌드에 남은 문구: '+bad)
    # v0.56 홈페이지 + 앱 나눔 — / 는 홈(app/landing/index.html: 소개·로그인·「프로그램 실행」), /app/ 은 앱
    rep('<a class="brandlink" id="brandLink">','<a class="brandlink" id="brandLink" href="../" title="EzImprovJazz 홈">')
    rep('</head>','<link rel="icon" type="image/svg+xml" href="../favicon.svg">\n</head>')
    wd=os.path.join(root,'dist','web'); shutil.rmtree(wd,ignore_errors=True); os.makedirs(os.path.join(wd,'app')); os.makedirs(os.path.join(wd,'icons'))
    open(os.path.join(wd,'app','index.html'),'w',encoding='utf-8').write(web)
    ld=os.path.join(root,'app','landing')
    land=open(os.path.join(ld,'index.html'),encoding='utf-8').read()
    mark=re.sub(r'\s*<!--.*?-->','',open(os.path.join(root,'app','brand','mark.svg'),encoding='utf-8').read())
    mark=re.sub(r'\n\s*','',mark).strip().replace('<svg ','<svg aria-hidden="true" ')
    demo=json.load(open(os.path.join(ld,'demo.json'),encoding='utf-8'))['solos']
    def lrep(old,new,n=1):
        global land
        if land.count(old)!=n: raise RuntimeError('홈페이지 마커를 찾지 못했습니다 — '+old)
        land=land.replace(old,new)
    lrep('<!--__MARK__-->',mark,3)
    sv=lambda d:'<div class="sv sv-w">'+d['svg']+'</div><div class="sv sv-n">'+d['svgN']+'</div>'
    lrep('<div id="sheetSvg"><!--__DEMO_FIRST__-->','<div id="sheetSvg" data-diff="'+str(demo[0]['diff'])+'">'+sv(demo[0]))
    lrep('<!--__DEMO_REST__-->',''.join('<template class="demo" data-diff="'+str(d['diff'])+'">'+sv(d)+'</template>' for d in demo[1:]))
    lrep('/*__SB_CONFIG__*/null','/*__SB_CONFIG__*/'+(json.dumps(sb_cfg) if sb_cfg else 'null'))
    lrep('</head>','<meta name="robots" content="noindex,nofollow">\n</head>')   # 공개 출시(개인정보처리방침·약관 게시) 전까지
    open(os.path.join(wd,'index.html'),'w',encoding='utf-8').write(land)
    shutil.copyfile(os.path.join(root,'app','pwa','icon.svg'),os.path.join(wd,'favicon.svg'))
    for f in ['apple-touch-icon.png','icon-192.png']: shutil.copyfile(os.path.join(root,'app','pwa','icons',f),os.path.join(wd,'icons',f))
    shutil.copyfile(os.path.join(ld,'og.jpg'),os.path.join(wd,'og.jpg'))
    open(os.path.join(wd,'_headers'),'w',encoding='utf-8').write('/*\n  X-Robots-Tag: noindex, nofollow\n')
    open(os.path.join(wd,'robots.txt'),'w',encoding='utf-8').write('User-agent: *\nDisallow: /\n')
    zp=os.path.join(root,'dist','ezimprovjazz-web-v'+ver+'.zip')
    with zipfile.ZipFile(zp,'w',zipfile.ZIP_DEFLATED) as z:
        for d,_,fs in os.walk(wd):
            for f in sorted(fs): full=os.path.join(d,f); z.write(full,os.path.relpath(full,wd))
    print('web build →',wd,'(홈 index.html + 앱 app/index.html) ·',zp,os.path.getsize(zp),'bytes')
