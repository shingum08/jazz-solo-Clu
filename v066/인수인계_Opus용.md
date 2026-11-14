# EzImprovJazz 인수인계 — v0.66.4에서 이어서 작업하기

작성 2026-11-14 12:30 · 이 문서 하나만 읽으면 이어서 작업할 수 있게 적었다. 읽는 쪽이 사람이든 다른 모델이든 같다.

## 0. 시작하는 법

- **같은 채팅에서 모델만 바꾼 경우**: 작업 폴더 `/home/claude/work/`가 그대로 있다. 이 문서를 읽고 5절부터 진행.
- **새 채팅인 경우**: `ezimprovjazz-작업환경-v0.66.4.zip`과 이 문서를 첨부하고 "인수인계 문서대로 이어서 진행해줘"라고 하면 된다. 압축을 빈 폴더(예: `/home/claude/work/`)에 풀면 아래 경로가 그대로 맞는다.
- 첫 확인(한 줄): `cd /home/claude/work && node tools/licktest.js work/engine.js 5 2 | head -1` → `릭 1.5개/32마디` 안팎이 나오면 정상.

## 1. 사용자와 일하는 방식(꼭 지킬 것)

- 사용자는 재즈 연주자이자 서비스 운영자. 한국어로 답한다.
- **사용량이 빠듯하다.** 도구 호출을 줄이고, 출력은 `cut -c1-300`·`tail`로 잘라 보고, **단계마다 파일을 보내 저장**한다. 한 번에 끝내려다 한도에 걸려 날린 적이 있다.
- 우선순위는 **음악 구현의 완성도**(실제 좋은 재즈 연주와 비교해 긍정적인 평가를 받는 것). 문서 작업은 그다음.
- 사용자가 바로잡은 것: **두 음 반복, 한 음 리듬 연주는 결함이 아니라 흔한 기법**(특히 빠른 곡). 우연히 생기는 왕복만 줄이고, 장치(`riff2`, `perc`)로는 살려 둔다.
- 사용자의 평: "릭은 좋다 — 비율만 잘 맞추면 멋질 것."
- 모든 수치는 자동 측정이다. 듣고 판단한 것처럼 말하지 않는다.

## 2. 프로젝트 제약(브리핑 v0.65에서)

- 원곡 멜로디·특정 녹음 전사 금지. 곡은 코드 진행만. 릭·셀은 교본 공통 공식만, `src`(출처)를 적는다.
- WJD 파생물은 확률 분포와 4명 이상 공통 셀만(ODbL 1.0 표기).
- 엔진은 브라우저 없이 Node에서 돌아야 하고, 같은 시드면 같은 결과가 나와야 한다.
- 배포는 HTML 한 장(`app/index.html`). 사용자에게 보이는 글은 한국어.
- **v0.66의 모든 변경은 `NATURAL`(설정 「선율 다듬기」) 안에 있다. `opts.natural===false`면 v0.65와 한 음도 다르지 않아야 한다.** 엔진에서는 `NAT=opts.natural===false?null:NATURAL`로 가른다. 새 자료에는 `v:66`을 붙여 NAT가 없을 때 걸러낸다.

## 3. 작업 폴더

```
/home/claude/work/
  src_v065/            원본 v0.65.0 사이트(건드리지 않음). app/index.html 안에 스크립트 블록 3개
  analysis/            원본에서 꺼낸 블록: engine_orig.js · audio_orig_body.js · ui_orig.js (비교 기준)
  work/                고치는 파일: engine.js · audio.js · ui.js  ← 빌드의 원천
  patches/             단계별 패치 원문(p0663a~c, p0664a~c, p0664ui)
  tools/               도구(아래)
  out66/               사용자에게 보내는 묶음: *.patch · *_v066.js · v0.66.0_작업기록.md · 릭_분석과_목록.md · tools/
  dist/                빌드 결과(매번 새로 만듦)
```

도구와 쓰는 법(모두 `cd /home/claude/work` 뒤에):

| 명령 | 하는 일 |
|---|---|
| `node tools/validate.js work/engine.js --ref analysis/engine_orig.js --seeds 1` | 전수 시험(약 75초). 마디 길이·겹침·음역·도약·셋잇단 묶음·재현성·natural=false 일치. 마지막 줄이 `위반 0`이어야 함 |
| `CARRY=1 node tools/quick.js work/engine.js swing 5 4 6` | 선율 지표 한 줄(정박 코드톤, 밖, 반음, 8분, 셋잇단 …) |
| `node tools/licktest.js work/engine.js 3,4,5 6 [list]` | 릭·셀 빈도와 종류. `FUNNEL=1`을 붙이면 자리 조건별 통과 수 |
| `node tools/lick_wjd.js work/engine.js` | 릭의 4음 조각이 WJD 실측 셀과 겹치는 비율 |
| `CARRY=1 node tools/show.js work/engine.js <곡> <시드> <단계> <코러스> - - <from-to>` | 글자 악보(마디별 음·도수·태그) |
| `node tools/licks_build.js work/engine.js out66/릭_어휘_목록.md` | `tools/licks_src.js`(음이름) → 엔진 자료. 엔진의 `LICKS66`·`CELLS66` 표시 사이를 다시 씀 |
| `python3 -I tools/patch.py <파일> <패치>` | 문자열 치환 패치. 블록 구분 `\n=====8<=====\n`, 옛/새 구분 `\n-----TO-----\n`, 옛 문자열은 정확히 한 번만 나와야 함 |
| `node tools/build.js 0.66.N` | `dist/` 생성(스크립트 블록 3개 교체, 버전 표기, 설정 화면 HTML 삽입) |
| `node tools/browser_test.js dist /tmp/shot66 \| tail -1` | 머리 없는 브라우저 시험. `스크립트 오류 0`이어야 함 |
| `node tools/browser_lick.js dist /tmp/lickamt.png` | 설정 「릭 빈도」 동작 확인 |

브라우저 시험은 `/opt/npm-tools/node_modules/playwright`와 `/usr/bin/google-chrome`을 쓴다. 새 환경에 없으면 건너뛰고 그 사실을 사용자에게 말한다.

**저장 지점에서 하는 일(그대로 복사해 쓰면 됨, N만 바꿈)**

```
cd /home/claude/work && node tools/build.js 0.66.N && node tools/browser_test.js dist /tmp/shot66 | tail -1
diff -u analysis/engine_orig.js work/engine.js > /home/claude/work/out66/engine.patch
diff -u analysis/audio_orig_body.js work/audio.js > /home/claude/work/out66/audio.patch
diff -u analysis/ui_orig.js work/ui.js > /home/claude/work/out66/ui.patch
cp work/engine.js out66/engine_v066.js; cp work/audio.js out66/audio_v066.js; cp work/ui.js out66/ui_v066.js
cd /home/claude/work/dist && zip -q -r /home/claude/work/ezimprovjazz-web-v0.66.N.zip .
cd /home/claude/work/out66 && zip -q -r /home/claude/work/ezimprovjazz-v0.66.N-패치와기록.zip .
```

그다음 두 zip을 사용자에게 보낸다. `out66/v0.66.0_작업기록.md`에 바뀐 것을 한 줄씩 덧붙인다(7절이 릭 작업).

주의: 상대 경로 glob으로 지우는 명령(`rm -f out66/*`)은 안전 검사에 막힌다. 지우지 말고 덮어쓴다. 원본 블록(`analysis/`)과 `src_v065/`는 절대 고치지 않는다.

## 4. 지금 상태 — v0.66.4

검증: 솔로 4,598개 · 곡 22 · 위반 0 · 재현성 660 · natural=false가 v0.65와 일치 660/660 · 브라우저 오류 0.

v0.65 대비 바뀐 것(자세한 표는 `out66/v0.66.0_작업기록.md` 3절·7절):

- 코러스 이음매 도약 없앰(`opts.carry`, `carryOf(solo)` — UI는 코러스마다 따로 `generateSolo`를 부른다)
- 우연한 두 음 왕복 줄임(2차 비터비 `viterbi2`, `shapeCost3`), 선율 관성, 도약 뒤 메움
- 셋잇단 모양(`planTriplet`), 해결 착지, 음역 천장, 주제 회상, 2·4박 텐션(단계 4·5), 반음 어프로치
- 두 음 리프 장치(`riff2`), 정박 3·7음 쏠림 완화(`GUIDE`), 비밥 8분 라인 강화
- 재생 악센트 모델(`buildAudioEvents`), 셋잇단 마디 빔 끊기(`toAbc`)
- 릭 8 → 88개, 교본 셀 16 → 45개, 릭 자리 확장, 두 마디 릭 이어 붙이기, 대체 릭, 되풀이 줄이기, 3/4 릭, 설정 「릭 빈도」(`opts.lickAmt`)

조절 값은 전부 엔진의 `const NATURAL={...}` 한곳에 있다(`osc`, `beat`, `chrom`, `guide`, `bebop`, `trip`, `land`, `ceil`, `theme`, `outside`, `riff2`, `lick`).

기준 수치(스윙 단계 5, 관악): 정박 코드톤 86.4% · 밖 8.0% · 반음 24.6% · 8분 66.9% · 셋잇단 5.9% · 이음매 7반음 초과 0% · 릭 1.5개/32마디. WJD 실측은 정박 코드톤 58.8% · 반음 21.5% · 8분 73.5% · 셋잇단 9.8%.

엔진 구조 메모: 시간 격자는 박당 6틱(8분 3 · 셋잇단 2 · 4분 6 · 4/4 한 마디 24). `generateSolo(progId,keyPc,diff,seed,inst,opts)` → 화성 분석(`segs`) → 프레이즈 계획 → 리듬 토큰 → 릭 계획(`lickPlan`) → 음 고르기(`forced` 종류: target·appr·enc·cell·lick·song·blues·dev·trip3 …) → 후처리(교차 스냅, 반음 정리, `ctAlign`, `redFix`) → `bars`. 단계 1~5는 `LEVELS`로 diff 1~3에 대응. 악기: 관악·금관 음역 59~82·도약 7반음, 자유 52~86·12반음.

## 5. 남은 일(이 순서로)

### 5-1. 16분음표(더블 타임) — 다음 작업, 두 번에 나눠 저장

아직 **설계만 있고 구현은 없다.** 발라드·펑크에서 선율이 성기게 들리는 근본 원인이 16분음표가 없는 것.

설계안(검증 전):

1. **엔진 감싸기(1차 저장)**: 진행의 각 박을 엔진 박 두 개로 늘려 `generateSolo`를 부른 뒤, 엔진 두 마디를 실제 한 마디로 합친다. 엔진의 8분이 실제 16분이 된다. 결과에 `tpb:12`(박당 틱 수)를 실어 보낸다. 엔진 내부 격자는 건드리지 않으므로 natural=false 일치가 깨지지 않는다.
   - 확인할 것: 합친 뒤 마디 길이·붙임줄·셋잇단(실제로는 16분 셋잇단이 됨)·`carry`·태그 마디 번호.
   - 한계: 코러스 전체가 더블 타임이 된다. 프레이즈 일부만 더블 타임으로 하려면 마디별 `tpb`가 필요하고 손댈 곳이 훨씬 많다. 먼저 전체 방식으로 만들어 발라드에서 들어 보게 한 뒤 판단한다.
2. **악보·재생·UI(2차 저장)**: `tpb`를 읽도록 고칠 곳 약 20군데 — `toAbc`(`L:1/16`, 12틱마다 빔), `tickToBeat`·`buildAudioEvents`, `colorNotes`(`n.t/6`), MusicXML 내보내기의 `divisions`, `spliceLockedBars`의 마디 틱 수, 마디 편집·잠금. 설정 화면에 **실험 스위치(기본 끔)**로 넣는다.
3. 검증기(`tools/validate.js`)도 `tpb`를 읽게 고쳐야 한다.

### 5-2. 평가 문서 마무리(Claude Docs)

문서 「EzImprovJazz v0.65 평가와 v0.66 보완 — 연주자·교수 관점」: https://claude.ai/artifact/BhK1CVaRR6JC8uKcLZy2hv
프로젝트 id `569c3b7e-879a-476c-8f66-b37bc72331c9`, 본문 노드 `67d4d8a3-05db`. 채워진 절: 결론, 이번에 고친 것, 전후 비교. **비어 있는 블록**:

- `m540paayhgv.51` 영역별 완성도 평가 · `.52` 어색함의 원인과 악보 사례 (= 작업 A)
- `.56` 브리핑 9번 질문 11개 답변 · `.57` 출처 (= 작업 B, 조사 내용은 작업기록 6절에 URL과 함께 있음)
- `.55` 남은 과제와 순서 (= 작업 C)

채우는 호출 꼴: `mcp__Claude_Docs__update(ref={"object":"node","id":"67d4d8a3-05db"}, engine="prose", container={"kind":"project","id":"569c3b7e-…"}, payload={"ops":[{"op":"replace","target":{"kind":"blocks","ids":["m540paayhgv.51"]},"with":{"from":{"kind":"inline","content":"## …"},"as":"markdown"}}]})`. 릭 분석(`out66/릭_분석과_목록.md`)도 이 문서에 한 절로 옮기면 좋다.

### 5-3. 사용자가 귀로 확인해 줄 것(답을 받으면 값만 바꾸면 됨)

| 물어볼 것 | 바꿀 값 |
|---|---|
| 릭이 많은가 적은가 | 설정 「릭 빈도」, 기본값은 `NATURAL.lick.rate`·`rateC` |
| 목록에서 어색한 릭 | `tools/licks_src.js`에서 빼거나 고치고 `licks_build.js` 실행 |
| 단계 5 셋잇단이 적은가(5.9%) | `NATURAL.bebop.line` 낮추기 또는 `NATURAL.trip.p` |
| 두 음 리프·한 음 리듬 빈도 | `NATURAL.riff2.w` |
| 우연한 왕복을 너무 눌렀는가 | `NATURAL.osc.aba`·`abaLeap` |
| 반음 진행 양 | `NATURAL.chrom` |
| 기존 셀 `Ⅴ: 5-4-3-2 → Ⅰ의 1음` | 실제로는 Ⅰ의 5음에 착지. 이름을 고칠지 마지막 음정을 +3으로 바꿀지 |

### 5-4. 릭에서 남은 것(급하지 않음)

- 「8분 라인」 장치가 걸린 마디에는 릭이 못 들어간다. 장치 안에 릭을 심는 방법.
- 릭 변형(박 자리 옮기기, 끝맺음만 바꾸기, 앞부분만 쓰기).
- 16분음표 릭(5-1 뒤), 5/4 릭, CESH, 화성 일반화.

### 5-5. 그 밖에 권한 것

- 조표(지금은 늘 `K:C`), 아티큘레이션 표기.
- **264곡 전수 시험은 원본 저장소에서 다시 돌려야 한다.** 여기에는 공개 10곡과 시험 진행 12개뿐이다.

## 6. 원본 저장소에 옮기는 법

1. `out66/engine.patch`·`audio.patch`·`ui.patch`를 원본의 세 스크립트 블록에 적용(또는 `*_v066.js`로 통째 교체).
2. `tools/licks_src.js`·`licks_build.js`를 가져간다. 릭은 음이름으로 고치고 빌드 스크립트로 엔진 자료를 다시 만든다.
3. 설정 화면 HTML 두 군데(「선율 다듬기」 스위치, 「릭 빈도」 선택)는 `tools/build.js`의 `rep(...)` 문자열을 그대로 옮긴다.
4. 원본의 전수 시험을 돌린다. 「선율 다듬기」를 끈 결과가 v0.65와 같은지도 본다.
