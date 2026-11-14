import sys,re
# 사용: python3 -I tools/ctx.py <file> <pattern> [before] [after] [max]
f,pat=sys.argv[1],sys.argv[2]
b=int(sys.argv[3]) if len(sys.argv)>3 else 60
a=int(sys.argv[4]) if len(sys.argv)>4 else 60
mx=int(sys.argv[5]) if len(sys.argv)>5 else 40
s=open(f,encoding='utf-8').read()
n=0
for m in re.finditer(pat,s):
    ln=s.count('\n',0,m.start())+1
    st=max(0,m.start()-b);en=min(len(s),m.end()+a)
    print(f"{ln}: "+s[st:en].replace('\n','⏎'))
    n+=1
    if n>=mx: break
print(f"-- {n} shown")
