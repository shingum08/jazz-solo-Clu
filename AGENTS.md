# AGENTS.md — 코딩 에이전트용 프로젝트 안내

재즈 즉흥 솔로 악보 생성 앱. 규칙 엔진(v0.12)이 Weimar Jazz Database 실측 통계를 확률로 사용해
연습용 솔로를 만들고, Web Audio로 반주와 함께 재생한다. 단일 HTML 파일 앱.

마스터 기획안: `docs/blueprint-v1.0.pdf` (로드맵 v1~v4, ML/RAG 설계, 법무 프레임)

## 아키텍처 — 수정 전 반드시 이해할 것

```
app/template.html        UI·CSS·전체 뼈대 (마커 있음 — 직접 수정 금지, engine 수정 후 빌드)
engine/engine_core.js    순수 로직: analyzeHarmony(화성 분석) → generateSolo(생성) → toAbc(ABC 변환)
engine/style_data.js     생성 데이터: WJD 통계 프로필 9종 + 공통 셀 134종 (스크립트 산출물 — 손으로 고치지 말 것)
engine/playback.js       Web Audio: 스윙비·아티큘레이션·반주 (bassLine/voicingFor/playAll)
tools/                   데이터 파이프라인(analyze/phrase_stats/export) + 테스트(test/compare) + 빌드(build)
docs/                    기획안 PDF, v0.11 아카이브
index.html               빌드 결과물 — 커밋하지만 손으로 편집하지 않는다
```

**핵심 설계 원칙 (깨면 안 됨):**

1. **엔진/프레젠테이션 분리** — `engine/`은 DOM·AudioContext 없이 Node에서 돌아야 한다.
   `engine_core.js`에 `window`/`document` 참조를 넣지 마라. UI는 `template.html`, 소리는 `playback.js`.
2. **시드 기반 재현** — 모든 무작위 선택은 `mulberry32(seed)`에서 나온다. `Math.random()` 추가 금지.
   같은 시드+설정 → 항상 같은 악보여야 테스트와 ♡ 저장이 성립한다.
3. **틱 그리드** — 1틱 = 8분음표 1/3, 마디 = 24틱. 이벤트 `t`는 항상 마디 합계 24.
4. **법적 선** — 원곡 멜로디·특정 녹음 전사 절대 포함 금지. 곡은 코드 진행만.
   WJD 파생물은 "확률 분포 + 4명 이상 공통 셀"까지만 (ODbL 1.0, `DATA-SOURCES.md`).

## 명령어

```bash
python3 tools/build.py        # template.html + engine/*.js → index.html (수정 후 항상 실행)
node tools/test.js            # 945조합 전수 검증 — 마디 완결/음역/도약/3연음/겹침 위반이 0이어야 함
node tools/compare.js         # v0.11 대비 지표 (docs/solo-generator-v0.11.html 에서 engine_old.js 추출 필요 — tools/README.md)
python3 tools/analyze.py      # wjazzd.db(42MB, 커밋 안 함) → 통계 재추출 (필요 시)
```

## 완료 정의 (Definition of Done)

기능을 고쳤거나 추가했다면, 커밋 전에:

1. `node tools/test.js` → `violations` 전 항목 0, `errors 0`
2. `python3 tools/build.py` 성공, 생성된 index.html과 이전 빌드 diff가 의도한 변경만 포함
3. 화성 지표가 크게 하락하지 않았는지 확인 (강박 코드톤 ≥80%(난2), 코드 전환 착지 ≥95%, 가이드톤 ≥60%, 같은 음 반복 ≤6%) — 하락했으면 이유를 설명할 것
4. 사용자 대상 문구(UI 라벨·footer)를 바꿨다면 한국어로, 기존 톤 유지

## 코드 관습

- 주석·식별자·UI 문구: 한국어. 기존 주석 스타일(섹션 구분선 `/* ── ── */`, 버전 태그) 유지.
- 압축된 자바스크립트 스타일(들여쓰기 2칸, 짧은 헬퍼) — 기존 파일과 일관되게.
- 새 코드 생성 데이터(릭·셀·프로필)는 `style_data.js` 주입 구조를 따른다. 하드코딩하지 않는다.
- 템포·음역 상수는 마법 숫자로 흩놓지 말고 파일 상단 또는 옵션으로.

## v3 계획(참고)

생성을 ML(조건부 Transformer)로 옮기더라도 규칙 엔진은 검증기·폴백으로 유지한다(기획안 4.2).
엔진 산출물은 ML 예열용 합성 코퍼스가 된다. RAG 릭 검색 설계는 기획안 4.3.
