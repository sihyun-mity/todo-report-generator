-- 새소식 대상(audience) 체계 도입
--
-- 지금까지 새소식은 모든 사용자에게 동일하게 노출됐다. 이제 소식마다 대상을 지정한다.
--   - all    : 모두 (기본값)
--   - member : 로그인 회원 전용 (설정 화면 · 계정 · 기기 관리 등 로그인해야 쓸 수 있는 기능)
--   - guest  : 비회원(게스트) 전용 (로그인 없이 쓰는 흐름 · 로그인 권유성 안내)
--
-- 필터링은 애플리케이션 레이어(src/lib/news.ts)에서 수행하고, RLS 는 기존 "누구나 읽기"를 유지한다.
-- 새소식 본문은 비밀이 아니라 관련성(relevance) 문제이고, RLS 로 막으면 게스트 → 로그인 전환 시
-- "게스트 시절 마지막으로 본 소식"(비회원 전용일 수 있음)의 발행 시각을 회원 세션이 조회하지 못해
-- 읽음 상태 이전이 깨진다.
-- Generated for todo-report-generator on 2026-07-22

------------------------------------------------------------
-- 1. audience 컬럼
------------------------------------------------------------
alter table public.news
  add column if not exists audience text not null default 'all';

alter table public.news
  drop constraint if exists news_audience_check;

alter table public.news
  add constraint news_audience_check
  check (audience in ('all', 'member', 'guest'));

comment on column public.news.audience is
  '노출 대상: all(모두) | member(로그인 회원 전용) | guest(비회원 전용)';

-- `where audience in (...) order by published_at desc limit 1` 을 위한 인덱스
create index if not exists news_audience_published_at_idx
  on public.news (audience, published_at desc);

------------------------------------------------------------
-- 2. 기존 새소식 분류
--
--    id 는 gen_random_uuid() / Studio 수동 입력이라 환경마다 다르므로 title 로 매칭한다.
--    매칭되지 않은 행은 컬럼 기본값인 'all' 로 남아 기존 동작(모두에게 노출)을 유지한다.
------------------------------------------------------------

-- 2-1. 회원 전용 — 로그인해야 도달할 수 있는 기능 안내
update public.news set audience = 'member'
where title in (
  -- 패스키 등록/관리는 로그인 상태 + 설정 화면에서만 가능
  '패스키로 더 빠르고 안전하게 로그인할 수 있어요',
  -- 설정 → 로그인 기기 관리는 회원 전용 화면
  '로그인한 기기를 직접 관리할 수 있어요',
  -- 작성 알림 구독은 로그인 사용자만 (push_subscriptions.user_id NOT NULL)
  '작성 알림을 받아보세요'
);

-- 2-2. 비회원 전용 — 로그인 없이 쓰는 흐름에 대한 안내
update public.news set audience = 'guest'
where title in (
  -- 첫 진입이 게스트 모드로 바뀐 안내. 이미 로그인한 회원에게는 해당 사항이 없다.
  '이제 로그인 없이 바로 시작할 수 있어요'
);

-- 2-3. 나머지는 모두 대상 — 명시적으로 한 번 더 확정 (기본값과 동일)
update public.news set audience = 'all'
where title in (
  '로그인과 캘린더 기능이 추가되었어요',
  '홈 화면이 한층 깔끔해졌어요',
  'GitHub 로그인이 생기고, 같은 날 보고서 복원이 더 똑똑해졌어요',
  '드래그로 정렬하고, 키보드로 빠르게, 실수해도 되돌릴 수 있어요',
  '작업을 다른 프로젝트로 끌어다 옮길 수 있어요'
);

------------------------------------------------------------
-- 3. 회원 읽음 상태 백필
--
--    대상 분류가 생기면서 "회원 관점의 최신 소식"이 바뀌는 유저가 생긴다.
--    (예: 마지막으로 읽은 소식이 비회원 전용으로 분류되면, 그보다 오래된 다른 소식이
--     회원 관점의 최신이 되어 미읽음으로 남고 다이얼로그가 다시 뜬다.)
--
--    다이얼로그는 애초에 "최신 1건"만 보여주므로, 유저가 읽은 소식 중 가장 최근 발행분보다
--    오래된 소식은 이미 봤거나 지나간 것으로 간주해도 안전하다. 그 구간을 읽음 처리한다.
--
--    멱등(on conflict do nothing) — 반복 실행해도 안전.
--    읽음 이력이 전혀 없는 유저는 조인에서 빠지므로 "첫 접속 자동 처리" 로직에 영향이 없다.
------------------------------------------------------------
insert into public.user_news_reads (user_id, news_id, read_at)
select last_read.user_id, n.id, now()
from (
  select unr.user_id, max(read_news.published_at) as published_at
  from public.user_news_reads unr
  join public.news read_news on read_news.id = unr.news_id
  group by unr.user_id
) as last_read
join public.news n
  on n.published_at <= last_read.published_at
 and n.audience in ('all', 'member')
on conflict (user_id, news_id) do nothing;
