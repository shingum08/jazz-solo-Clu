import sys
# 사용: python3 -I tools/patch.py <file> <patchfile>  — patchfile: 블록을 '=====8<=====' 로 나누고, 블록 안은 '-----TO-----' 로 old/new 구분. 각 old는 정확히 한 번 나와야 한다.
f,pf=sys.argv[1],sys.argv[2]
s=open(f,encoding='utf-8').read()
blocks=open(pf,encoding='utf-8').read().split('\n=====8<=====\n')
n=0
for b in blocks:
    if not b.strip(): continue
    old,new=b.split('\n-----TO-----\n')
    old=old.strip('\n'); new=new.strip('\n')
    c=s.count(old)
    if c!=1:
        print('FAIL: count=%d for block starting: %s'%(c,old[:90].replace('\n','⏎'))); sys.exit(1)
    s=s.replace(old,new); n+=1
open(f,'w',encoding='utf-8').write(s)
print('applied',n,'blocks to',f)
