-- Backfill: 마이그레이션 시점에 존재하는 새소식(시드 1건: 로그인 + 캘린더 통합 안내)을
-- 기존 로그인 유저 전원이 "이미 읽은 것"으로 기록합니다.
--
-- 목적:
--   시드 소식("로그인과 캘린더 기능이 추가되었어요")은
--   이미 배포된 기능에 대한 사후 안내이므로, 기존 유저에게는
--   첫 접속 시 Dialog 가 뜨지 않게 합니다.
--   앞으로 올릴 "진짜 새로운" 소식은 backfill 하지 않으므로
--   모든 유저에게 한 번 자연스럽게 노출됩니다.
--
-- 특성:
--   - 멱등(on conflict do nothing) — 반복 실행해도 안전.
--   - 새로 가입하는 유저에게는 영향 없음(이들은 아직 읽은 적 없어
--     다음 번 새소식 발행 시 정상적으로 노출됨).
--
-- 실행 타이밍:
--   20260422090000_add_news_feature.sql 이 적용된 **직후** 한 번.

insert into public.user_news_reads (user_id, news_id, read_at)
select u.id, n.id, now()
from auth.users u
cross join public.news n
on conflict (user_id, news_id) do nothing;
