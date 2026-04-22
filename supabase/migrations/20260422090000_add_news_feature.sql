-- News feature: tables, RLS, triggers, and seed data
-- Generated for todo-report-generator on 2026-04-22

------------------------------------------------------------
-- 1. news : 공지/업데이트 글을 저장
------------------------------------------------------------
create table if not exists public.news (
  id            uuid primary key default gen_random_uuid(),
  title         text        not null,
  content       text        not null,
  published_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists news_published_at_idx
  on public.news (published_at desc);

------------------------------------------------------------
-- 2. updated_at 자동 갱신 트리거
------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_news_updated_at on public.news;
create trigger trg_news_updated_at
  before update on public.news
  for each row execute function public.set_updated_at();

------------------------------------------------------------
-- 3. user_news_reads : 유저가 마지막으로 읽은 소식 기록
--    (동일 유저 + 동일 소식은 한 행만 존재하도록 PK로 제약)
------------------------------------------------------------
create table if not exists public.user_news_reads (
  user_id  uuid        not null references auth.users(id) on delete cascade,
  news_id  uuid        not null references public.news(id) on delete cascade,
  read_at  timestamptz not null default now(),
  primary key (user_id, news_id)
);

create index if not exists user_news_reads_user_read_at_idx
  on public.user_news_reads (user_id, read_at desc);

------------------------------------------------------------
-- 4. Row Level Security
------------------------------------------------------------
alter table public.news             enable row level security;
alter table public.user_news_reads  enable row level security;

-- 4-1. news : 누구나 읽기 가능 (쓰기는 service_role 만)
drop policy if exists "news_select_all" on public.news;
create policy "news_select_all"
  on public.news
  for select
  using (true);

-- 4-2. user_news_reads : 본인 행만 조회/추가/갱신
drop policy if exists "user_news_reads_select_own" on public.user_news_reads;
create policy "user_news_reads_select_own"
  on public.user_news_reads
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_news_reads_insert_own" on public.user_news_reads;
create policy "user_news_reads_insert_own"
  on public.user_news_reads
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_news_reads_update_own" on public.user_news_reads;
create policy "user_news_reads_update_own"
  on public.user_news_reads
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

------------------------------------------------------------
-- 5. Seed data : 초안 1건
--    (로그인 + 캘린더 기능을 같은 날 공개한 안내.
--     나중에 Supabase Studio 에서 직접 편집 가능합니다.)
------------------------------------------------------------
insert into public.news (title, content, published_at) values
(
  '로그인과 캘린더 기능이 추가되었어요',
  $md$## 두 가지 새로운 기능이 함께 공개되었어요

오늘부터 **로그인**과 **캘린더 뷰**를 한꺼번에 사용해보실 수 있어요.

### 1. 로그인으로 기기 간 동기화

이메일로 계정을 만들어 로그인하면, 할 일 목록과 리포트가 서버에 안전하게 저장돼요. 기기를 옮겨 다녀도 같은 기록을 이어서 볼 수 있어요.

- **게스트 모드는 그대로 유지돼요.** 로그인 없이 브라우저에만 저장하고 쓰는 지금 방식도 계속 사용할 수 있어요.
- **회원가입 시 수집하는 정보는 이메일 주소 하나뿐**이에요. 이 이메일은 로그인 식별용으로만 쓰이고, 마케팅이나 추가적인 개인 식별 용도로는 사용되지 않아요.
- 게스트로 쌓아둔 데이터는 로그인 시점에 자연스럽게 계정으로 이어져요. 별도 조작 없이 연결됩니다.

### 2. 캘린더로 지난 기록 되돌아보기

달력 위에서 날짜를 골라 그날의 할 일과 리포트를 한눈에 확인할 수 있어요.

- 특정 날짜를 클릭하면 그날 완료한 할 일과 생성한 리포트를 바로 볼 수 있어요.
- 월 단위로 성취한 작업의 밀도를 한눈에 파악할 수 있어요.
- 과거 리포트로 바로 이동하는 링크도 함께 제공돼요.

사이드바의 **"캘린더"** 메뉴에서 바로 열어볼 수 있어요. 로그인한 계정이라면 모든 기기에서 같은 기록이 보입니다.

가볍게 회고하기 좋은 기능이니 꼭 한 번 들러보세요.
$md$,
  '2026-04-22T09:00:00+09:00'
);
