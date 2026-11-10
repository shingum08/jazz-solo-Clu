# tools — 데이터 파이프라인과 테스트

## 파일

| 스크립트 | 입력 → 출력 | 역할 |
|---|---|---|
| `analyze.py` | `wjazzd.db` → `data/wjd_stats.json` | 스타일/연주자별 리듬 전이, 코드 대비 음 분포, 음정 분포, 공통 셀 마이닝 |
| `phrase_stats.py` | `wjazzd.db` → `data/phrase_stats.json` | 프레이즈 길이·쉼 길이 백분위 |
| `export.py` | `data/wjd_stats.json` + `data/phrase_stats.json` → `data/wjd_export.json` | 스타일 9종 블렌딩 프로필 + 셀 (엔진 주입용) |
| `build.py` | `app/template.html` + `engine/*.js` → `index.html` | 단일 파일 앱 빌드 |
| `test.js` | `engine/*.js` | 945개 조합 전수 검증 (마디 완결·음역·도약·3연음·겹침 위반 카운트 + 화성 지표) |
| `compare.js` | `engine/*.js` | v0.11 엔진(`docs/solo-generator-v0.11.html`에서 추출한 버전)과 지표 비교 |

## 요구 사항

- Python 3 (표준 라이브러리만)
- Node.js 18+
- `compare.js`가 읽는 v0.11 엔진 파일은 별도 추출 필요:

```bash
python3 - <<'PY'
import re
s=open('../docs/solo-generator-v0.11.html',encoding='utf-8').read()
open('engine_old.js','w').write(re.search(r'<script id="engine">(.*?)</script>',s,re.S).group(1))
PY
```

## 실행 순서

```bash
# 1) 원 DB (42MB, 커밋하지 않음)
curl -LO https://jazzomat.hfm-weimar.de/download/downloads/wjazzd.db

# 2) 통계 추출 → 블렌딩
python3 analyze.py
python3 phrase_stats.py
python3 export.py

# 3) 테스트
node test.js        # 위반 0건이어야 함
node compare.js     # v0.11 대비 표 출력
```

`export.py`의 출력을 `engine/style_data.js`로 반영하려면 저장소 루트에서:

```bash
python3 - <<'PY'
import json
d=json.load(open('tools/data/wjd_export.json'))
# … 기존 style_data.js 생성 로직과 동일 — 현재 engine/style_data.js 가 이 출력으로 만들어져 있음
PY
```

(스타일 프로필을 바꾸지 않는 한 재생성 불필요 — `engine/style_data.js`가 그 결과물이다.)
