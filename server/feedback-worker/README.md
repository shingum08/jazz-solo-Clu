# Clu 마디 평가 수신 서버 (Cloudflare Worker + D1) — 설정 안내

오픈 베타 테스터가 악보에서 마디를 골라 👍·👎를 누르면, 평가가 익명으로 이 서버에 모입니다.
테스터는 파일을 내보내거나 보낼 필요가 없습니다.
(선택) 100개가 모일 때마다 비공개 깃허브 저장소에 파일로 묶어 올리고, 개발자(Claude)가 그 파일을 읽어 엔진에 반영합니다.

```
앱(clu-lab-0412.pages.dev) ──👍·👎──▶ Worker(clu-feedback) ──▶ D1 표 fb
                                              └─ 100개마다 ─▶ 비공개 깃허브 clu-feedback/batches/*.json
```

**비밀 값은 아래 4·5단계의 Cloudflare 화면에만 넣습니다.**
관리자 키와 깃허브 토큰은 채팅, 앱 페이지, 이 저장소 어디에도 적지 마세요.
Worker 주소(`https://….workers.dev`)는 비밀이 아니라서 개발자에게 알려 주면 됩니다.

---

## 1. D1 데이터베이스 만들기
1. Cloudflare 대시보드 왼쪽 메뉴에서 **Storage & Databases → D1 SQL database**를 엽니다.
2. **Create Database**를 누릅니다.
3. 이름은 `clu-feedback`, 위치(Location)는 비워 두거나 **Asia-Pacific**을 고릅니다.
4. **Create**를 누릅니다.

표는 직접 만들지 않아도 됩니다. Worker가 처음 요청을 받을 때 알아서 만듭니다.

## 2. Worker 만들기
1. **Workers & Pages → Create application**을 누릅니다.
2. **Start with Hello World!**를 고르고 **Get started**를 누릅니다.
3. 이름은 `clu-feedback`으로 하고 **Deploy**를 누릅니다.
4. 만들어진 Worker 화면에서 **Edit code**(`</>`)를 누릅니다.
5. `worker.js` 내용을 모두 지우고, 이 폴더의 `worker.js` 전체를 붙여 넣습니다.
6. **Deploy**(또는 Save 후 Deploy)를 누릅니다.

## 3. D1 연결(바인딩)
1. Worker 화면에서 **Bindings → Add binding → D1 database**를 고릅니다.
2. **Variable name**에는 `DB`(대문자 그대로)를 넣습니다.
3. 데이터베이스는 `clu-feedback`을 고르고 **Add binding**을 누릅니다.

## 4. (선택) 관리자 키 — 서버에 모인 평가를 직접 받아 보거나, 즉시 올리기를 할 때
1. **Settings → Variables and Secrets → Add**를 누릅니다.
2. Type은 **Secret**, 이름은 `ADMIN_KEY`로 합니다.
3. 값은 긴 무작위 문자열로 직접 만들어 넣습니다(예: 비밀번호 관리자에서 생성).

받아 보기: 브라우저 주소창에 `https://clu-feedbacks.shingum08.workers.dev/v1/export?key=` 를 쓰고 바로 뒤에 관리자 키 값을 붙여(괄호·공백 없이) 엽니다. 파일이 받아집니다.
안 되면 나오는 글자로 원인을 알 수 있습니다: `admin-key-not-set` = Cloudflare에 `ADMIN_KEY`(대문자)가 없음 · `key-missing` = 주소에 키가 없음 · `key-wrong` = 값이 다름(받은 글자 수 표시).

키 없이 내용을 보려면: Cloudflare **Storage & Databases → D1 → clu-feedback → Console**에서 `SELECT r, song, ch, bar, ts FROM fb ORDER BY rcv DESC;` 를 실행합니다(r: 1 = 👍, -1 = 👎).
이 주소는 키가 들어 있으니 북마크나 메모에만 두고 남에게 보내지 마세요.

## 5. (선택·추천) 100개마다 비공개 깃허브로 자동 올리기
1. 깃허브에서 **비공개 저장소** `clu-feedback`을 새로 만듭니다(README 하나 넣어서 만들기).
2. 깃허브에서 **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**으로 갑니다.
   - Repository access: **Only select repositories → clu-feedback**
   - Permissions → Repository permissions → **Contents: Read and write**(다른 권한은 주지 않음)
   - 만료일: 원하는 기간(만료되면 새로 만들어 6번 값만 바꾸면 됨)
3. 만든 토큰 값은 바로 아래 Cloudflare 화면에만 붙여 넣습니다.
4. Worker **Settings → Variables and Secrets**에 아래 값을 추가합니다.

   | 이름 | 종류 | 값 |
   |---|---|---|
   | `GH_TOKEN` | Secret | 2번에서 만든 토큰 |
   | `GH_REPO` | Text | `shingum08/clu-feedback` |
   | `BATCH` | Text | `100` (몇 개마다 올릴지) |

5. **Settings → Triggers → Cron Triggers → Add**에서 하루 한 번(예: `17 18 * * *` = 한국 시각 새벽 3시 17분)을 추가합니다.
   - 새 평가가 들어올 때도 100개가 넘으면 바로 올리므로, 크론은 놓친 것을 챙기는 보조 수단입니다.
6. 개발자가 `clu-feedback` 저장소를 읽을 수 있게, Claude 세션에 이 저장소를 추가해 달라고 말해 주세요.

## 6. 앱에 주소 넣기
1. Worker 화면 위쪽에 보이는 주소(`https://clu-feedbacks.shingum08.workers.dev` — 2026-11-13 만든 이름)를 개발자에게 알려 줍니다.
2. 개발자가 그 주소를 `server/feedback-worker/ENDPOINT`에 넣고 웹 테스트판을 다시 빌드합니다.
3. 새 zip을 Cloudflare Pages에 올리면 끝입니다.

동작 확인: 브라우저에서 `https://<Worker 주소>/v1/health`를 열면 `{"ok":true,"total":…}`가 보입니다.

## 허용 주소
기본으로는 `https://clu-lab-0412.pages.dev`(미리보기 하위 주소 포함)와 `https://shingum08.github.io`에서 오는 요청만 받습니다.
주소가 바뀌면 Worker 변수 `ALLOW_ORIGINS`(Text, 쉼표 구분)에 새 주소를 넣으세요.

## 무엇이 저장되나
- 곡(이름·분류·조·형식), 생성 설정(시드·난이도·스타일·악기·반주·BPM), 코러스·마디, 코드, 음(높이·박자), 앞뒤 음, 기법 태그, 👍/👎
- 기기 무작위 번호(cid): 같은 사람이 같은 마디를 다시 누르면 덮어쓰는 데 씁니다. 이름·이메일·연락처는 없습니다.
- IP는 저장하지 않습니다. 짧은 시간에 너무 많이 보내는 걸 막으려고, `IP+날짜` 해시만 남깁니다(날마다 바뀌어 사람을 이어 볼 수 없음).
- 불러온 곡의 헤드(원곡 멜로디) 마디는 음을 받지 않습니다.
- 정식 서비스(계정 도입) 전에 개인정보처리방침과 수집 항목 고지를 법률 검토로 확정할 것 — **확인 필요**

## 남용 방지
- 요청 하나에 평가 60개, 본문 96KB까지 받습니다.
- 같은 IP 해시에서 10분에 400개를 넘으면 잠깐 거절합니다(429).
- 정해진 칸만 남기고 길이를 잘라 저장합니다. 모르는 칸은 버립니다.
- Cloudflare 무료 요금제 한도(요청 수·D1 용량) 안에서 동작합니다. 한도 수치는 Cloudflare 요금 안내에서 확인하세요 — **확인 필요**

## 시험
`node --no-warnings tools/test_fbworker_v053.mjs`를 실행하면 D1을 흉내 내어 Worker를 시험합니다.
허용 주소, 정리, 덮어쓰기, 헤드 마디, 100개 동기화, 내보내기, 속도 제한, 즉시 올리기를 확인합니다.
