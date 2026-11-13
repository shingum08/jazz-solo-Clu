-- ── Clu 계정 저장소 v1 (2026-11-13) ─────────────────────────────────────────────
-- Supabase 대시보드 → SQL Editor → New query 에 이 파일 전체를 붙여 넣고 Run.
-- 회원마다 「내 곡 · 즐겨찾기 · 저장한 솔로 · 보관한 마디」를 한 줄씩(key별) JSON으로 보관한다.
-- 보안: RLS — 로그인한 본인 줄만 읽고·쓰고·지울 수 있다. 다른 사람 줄은 보이지도 않는다.
-- 마디 평가(👍·👎)는 여기 넣지 않는다 — 익명 수집(Cloudflare)과 계정 연결은 별도 동의 뒤에(젠팀 11/13).

create table if not exists public.user_store (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  key        text        not null check (key in ('mysongs','fav','saved','snips')),
  value      jsonb       not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key),
  constraint user_store_value_size check (pg_column_size(value) < 5000000)
);

alter table public.user_store enable row level security;

drop policy if exists "user_store: 본인 읽기" on public.user_store;
drop policy if exists "user_store: 본인 추가" on public.user_store;
drop policy if exists "user_store: 본인 수정" on public.user_store;
drop policy if exists "user_store: 본인 삭제" on public.user_store;
create policy "user_store: 본인 읽기" on public.user_store for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_store: 본인 추가" on public.user_store for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_store: 본인 수정" on public.user_store for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_store: 본인 삭제" on public.user_store for delete to authenticated using ((select auth.uid()) = user_id);

-- 로그인 안 한 사람(anon)은 아예 못 건드리게, 로그인한 사람(authenticated)만
revoke all on public.user_store from anon;
grant select, insert, update, delete on public.user_store to authenticated;

-- 저장할 때마다 updated_at 갱신
create or replace function public.user_store_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists user_store_touch on public.user_store;
create trigger user_store_touch before insert or update on public.user_store for each row execute function public.user_store_touch();
