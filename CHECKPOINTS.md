# 체크포인트

큰 변경 전에 그 시점의 코드를 브랜치로 보존한다. (태그는 이 작업 환경에서 깃허브로 올릴 수 없어 브랜치를 쓴다.)

| 이름 | 브랜치 | 커밋 | 내용 |
|---|---|---|---|
| 체크포인트 2 | `claude/checkpoint-2` | `1451339` | v0.36.0 — 곡 366개(검증 표시만, 데이터 미수정) · 코드톤 라인은 연습 주제에서만 |

## 되돌리는 방법

그 시점의 앱을 보기만 할 때: 깃허브에서 브랜치를 `claude/checkpoint-2`로 바꾸고 `index.html`을 내려받는다.

`main`을 그 시점으로 되돌릴 때(이후 변경을 취소하는 새 커밋을 만든다 — 기록은 남는다):

```bash
git fetch origin
git checkout main
git restore --source=origin/claude/checkpoint-2 --staged --worktree -- .
git commit -m "체크포인트 2로 되돌림"
git push origin main
```

특정 파일만 되돌릴 때(예: 예전 곡 데이터 366곡만):

```bash
git restore --source=origin/claude/checkpoint-2 -- 'engine/songs_part*.js' engine/song_status.js tools/data/song_review_v036.json
python3 tools/build.py
```
