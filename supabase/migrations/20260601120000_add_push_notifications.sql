-- Web Push 알림: 로그인 사용자가 기기(브라우저)별로 작성 알림 푸시 구독을 등록하고,
-- 평일 16:30(KST) 크론이 "오늘 미작성" 사용자에게 보고서 작성 알림을 발송한다.
--
-- - push_subscriptions: 기기 단위 구독(한 사용자가 여러 기기). 토글 ON = 행 존재, OFF = 행 삭제.
--   본인 행만 CRUD 가능하도록 RLS. 크론은 service_role 로 RLS 를 우회해 전체를 스캔한다.
-- - kr_holidays: 공공데이터포털 특일정보(임시·대체공휴일 포함) 캐시. 크론(service_role)만 접근.
-- Generated for todo-report-generator on 2026-06-01

------------------------------------------------------------
-- 1. push_subscriptions : 기기(브라우저) 단위 푸시 구독
------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- 본인 소유 구독만 조회/등록/수정/삭제
create policy "own push subscriptions"
  on public.push_subscriptions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

------------------------------------------------------------
-- 2. kr_holidays : 대한민국 공휴일 캐시 (임시·대체공휴일 포함)
------------------------------------------------------------
create table if not exists public.kr_holidays (
  holiday_date date primary key,
  name         text not null,
  fetched_at   timestamptz not null default now()
);

-- 어떤 연도의 공휴일 데이터를 이미 적재했는지 표시 (특정 연도가 "전부 휴일 없음"인 경우와
-- "아직 조회 안 함"을 구분하기 위한 메타 테이블)
create table if not exists public.kr_holiday_sync (
  year       int primary key,
  synced_at  timestamptz not null default now()
);

alter table public.kr_holidays enable row level security;
alter table public.kr_holiday_sync enable row level security;
-- 정책 없음 = authenticated/anon 접근 불가. 크론(service_role)만 RLS 를 우회해 접근한다.
