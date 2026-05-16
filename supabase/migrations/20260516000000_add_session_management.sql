-- Session management: 로그인 사용자가 자신의 활성 세션(기기) 목록을 조회하고
-- 원격으로 로그아웃할 수 있도록 하는 RPC 함수들.
--
-- auth 스키마는 PostgREST로 노출되지 않으므로 public 스키마에 SECURITY DEFINER
-- 함수를 두어 접근한다. 본인 식별은 auth.uid(), 현재 세션 식별은 JWT의
-- session_id 클레임(auth.jwt() ->> 'session_id')으로 한다.
-- Generated for todo-report-generator on 2026-05-16

------------------------------------------------------------
-- 1. list_user_sessions : 본인의 활성 세션 목록
------------------------------------------------------------
create or replace function public.list_user_sessions()
returns table (
  id          uuid,
  created_at  timestamptz,
  updated_at  timestamptz,
  user_agent  text,
  ip          text,
  is_current  boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    s.id,
    s.created_at,
    s.updated_at,
    s.user_agent,
    host(s.ip) as ip,
    s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid as is_current
  from auth.sessions s
  where s.user_id = auth.uid()
  order by
    (s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid) desc,
    coalesce(s.updated_at, s.created_at) desc;
$$;

------------------------------------------------------------
-- 2. revoke_user_session : 본인 소유의 특정 세션을 로그아웃
--    (현재 사용 중인 세션은 이 화면에서 끊을 수 없도록 차단)
------------------------------------------------------------
create or replace function public.revoke_user_session(target_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  deleted_count int;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;
  if target_session_id is not distinct from current_session_id then
    raise exception 'cannot revoke current session';
  end if;

  delete from auth.sessions
  where id = target_session_id
    and user_id = auth.uid();
  get diagnostics deleted_count = row_count;

  return deleted_count > 0;
end;
$$;

------------------------------------------------------------
-- 3. revoke_other_user_sessions : 현재 세션을 제외한 본인의 모든 세션 로그아웃
------------------------------------------------------------
create or replace function public.revoke_other_user_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  deleted_count int;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  delete from auth.sessions
  where user_id = auth.uid()
    and (current_session_id is null or id is distinct from current_session_id);
  get diagnostics deleted_count = row_count;

  return deleted_count;
end;
$$;

------------------------------------------------------------
-- 4. 실행 권한 : 로그인 사용자(authenticated)에게만 부여
------------------------------------------------------------
revoke all on function public.list_user_sessions()        from public, anon;
revoke all on function public.revoke_user_session(uuid)    from public, anon;
revoke all on function public.revoke_other_user_sessions() from public, anon;

grant execute on function public.list_user_sessions()        to authenticated;
grant execute on function public.revoke_user_session(uuid)    to authenticated;
grant execute on function public.revoke_other_user_sessions() to authenticated;
