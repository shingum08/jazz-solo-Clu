# 데이터 출처와 라이선스

## Weimar Jazz Database (WJD)

- **무엇**: 재즈 솔로 전사 456개(약 20만 음), 코드·연주자·리듬 메타데이터 포함. 수작업 검증 전사.
- **제공**: Jazzomat Research Project, HfM Weimar — https://jazzomat.hfm-weimar.de/
- **라이선스**: [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- **내려받기**: https://jazzomat.hfm-weimar.de/download/downloads/wjazzd.db (SQLite, 약 42MB)

## 이 저장소에 담긴 것 / 담지 않은 것

**담긴 것** (`tools/data/*.json`, 파생 통계):

- 연주자·스타일 그룹별 리듬 전이 확률(박 단위 토큰 R/H/Q/E/U/T)
- 코드 종류 대비 음 분포(강박/약박 × 12반음)
- 음정(인터벌) 분포 -12~+12반음
- 프레이즈 길이·쉼 길이 백분위, 템포별 스윙비
- **4명 이상의 서로 다른 연주자가 공통으로 사용한 4~5음 음형(셀) 134종** — 개인 고유 어구가 아닌 공용 어휘만

**담지 않은 것**:

- WJD의 원 전사 음표열(솔로 전체)
- 특정 녹음·특정 연주자의 개별 프레이즈 전사
- 원곡 멜로디(수록 곡은 코드 진행만 반영)

생성 결과는 새 선율이며 특정 솔로를 재현하지 않는다.

## ODbL 준수 사항

ODbL은 데이터베이스의 자유로운 이용·수정·배포(상업적 이용 포함)를 허용하되 다음을 요구한다:

1. **출처 표기** — 앱·문서에 위 출처를 명시 (본 저장소 README·앱 하단 고지 참조)
2. **동일 조건 공유(Share-Alike)** — WJD "데이터베이스"를 수정·재배포할 경우 같은 ODbL로. **앱 코드는 별도 저작물**로 보지만, 소송 리스크를 없애려면 v2 상업화 전 변호사 확인 권장 (기획안 7장 법무 항목에 추가할 것)
3. 개별 콘텐츠는 Database Contents License (DBCL) 적용

## 재추출 절차 (통계를 다시 만들 때)

```bash
curl -LO https://jazzomat.hfm-weimar.de/download/downloads/wjazzd.db
python3 tools/analyze.py          # → tools/data/wjd_stats.json
python3 tools/phrase_stats.py     # → tools/data/phrase_stats.json
python3 tools/export.py           # → tools/data/wjd_export.json (블렌딩 프로필+셀)
```

- `analyze.py`: 리듬 전이·코드 대비 음 분포·음정 분포·공통 셀 마이닝 (독립 소요 수 분)
- `phrase_stats.py`: 프레이즈 길이·쉼 백분위 (섹션 테이블 PHRASE 기준)
- `export.py`: 그룹별 프로필을 스타일 9종으로 블렌딩하고 `engine/style_data.js`에 주입될 JSON 생성


## 악기 샘플 (v0.21~)

- **무엇**: General MIDI 악기별 단음 녹음(mp3). 재생 시 브라우저가 필요한 음만 받아 씀(앱 파일에 포함하지 않음).
- **제공**: midi-js-soundfonts — Benjamin Gleitzman, https://github.com/gleitz/midi-js-soundfonts
- **라이선스**: FluidR3_GM — Creative Commons Attribution 3.0 / MusyngKite — Creative Commons Attribution-ShareAlike 3.0
- **사용 악기**: FluidR3_GM(acoustic_grand_piano, electric_piano_1, acoustic_guitar_nylon, acoustic_bass, electric_bass_finger, flute, vibraphone), MusyngKite(tenor_sax, alto_sax, trumpet)
