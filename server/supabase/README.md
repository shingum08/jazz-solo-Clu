# Clu 계정 서버 (Supabase) — 설정 안내

- 프로젝트: `clu` · 주소 `https://cbepzelupdhcgtvbpzvd.supabase.co`
- 앱에 들어가는 값: `config.json`(주소 + **publishable** 키). 비밀 키(`sb_secret_…`·`service_role`)와 DB 비밀번호는 절대 여기·채팅·앱에 넣지 않는다. 빌드(`tools/build.py`)가 publishable 키가 아니면 멈춘다.

## 1. 표 만들기 (한 번)
대시보드 **SQL Editor → New query**에 `schema_v1.sql` 전체를 붙여 넣고 **Run**.
→ `user_store` 표(회원별 내 곡·즐겨찾기·저장한 솔로·보관한 마디) + RLS(본인 줄만).

## 2. 로그인 설정
- **Authentication → URL Configuration**
  - Site URL: `https://clu-lab-0412.pages.dev` (도메인 연결 뒤 `https://ezimprojazz.com`)
  - Redirect URLs: 위 주소들 + 깃허브 판 `https://shingum08.github.io/jazz-solo-Clu/`
- **테스트 기간 메일 인증**: Supabase 기본 메일 발송은 프로젝트 팀원 메일로만 보내고 시간당 몇 통으로 제한된다(확인 필요). 테스터가 가입하려면
  - (간단) **Authentication → Sign In / Providers → Email**에서 **Confirm email**을 잠시 끈다 — 가입 즉시 로그인.
  - (정식) **Authentication → Emails → SMTP Settings**에 메일 발송 서비스를 연결한다 — 정식 공개 전 필수.

## 3. 앱에서 쓰기 (테스트 계정 전용)
개인정보처리방침 게시 전이라 계정 칸은 숨겨져 있다. 주소 끝에 `?beta=1`을 붙여 한 번 열면 그 기기에서 **⚙ 설정 → 계정 (테스트)**가 보인다.
- 가입 · 로그인 · 비밀번호 찾기/바꾸기 · 로그아웃(기기 자료는 남음)
- 처음 로그인한 기기: 기기 자료와 계정 자료를 합침(같은 id는 하나로) → 그 뒤로는 바뀐 쪽을 따름(1.5초 뒤 자동 저장, 앱으로 돌아올 때 다시 맞춤)
- 마디 평가(👍·👎)는 계정에 잇지 않음(익명 수집과 분리 — 연결은 별도 동의 화면 뒤)

## 시험
`python3 tools/build.py --web && node --no-warnings tools/test_acct_v055.mjs dist/web/index.html` — 가짜 Supabase로 가입·틀린 비밀번호·두 기기 합치기·변경 반영·로그아웃.
