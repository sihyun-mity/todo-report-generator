-- =========================================================
-- 패스키(WebAuthn) 크리덴셜 테이블 + RLS + 민감 컬럼 보호 트리거
-- Supabase SQL Editor에서 한 번에 실행
-- =========================================================

create table public.webauthn_credentials (
  id               uuid         primary key default gen_random_uuid(),
  user_id          uuid         not null references auth.users(id) on delete cascade,
  credential_id    text         not null unique,             -- base64url (rawId)
  public_key       bytea        not null,                    -- COSE public key
  counter          bigint       not null default 0,
  transports       text[]       null,
  aaguid           uuid         null,
  device_type      text         null check (device_type in ('single_device','multi_device') or device_type is null),
  backed_up        boolean      not null default false,
  device_name      text         null,
  created_at       timestamptz  not null default now(),
  last_used_at     timestamptz  null
);

create index webauthn_credentials_user_idx on public.webauthn_credentials(user_id);

alter table public.webauthn_credentials enable row level security;

create policy "webauthn_credentials select own"
  on public.webauthn_credentials
  for select using (auth.uid() = user_id);

create policy "webauthn_credentials update own label"
  on public.webauthn_credentials
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "webauthn_credentials delete own"
  on public.webauthn_credentials
  for delete using (auth.uid() = user_id);

-- INSERT 정책 없음 → anon/authenticated는 막히고, service_role(서버)만 insert 가능

-- 민감 컬럼 보호: 본인(auth.uid()이 not null)이 credential_id/public_key/counter 등을 바꾸려 하면 실패
create or replace function public.webauthn_credentials_protect_cols()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.credential_id is distinct from old.credential_id
     or new.public_key is distinct from old.public_key
     or new.counter is distinct from old.counter
     or new.aaguid is distinct from old.aaguid
     or new.device_type is distinct from old.device_type
     or new.backed_up is distinct from old.backed_up
     or new.user_id is distinct from old.user_id then
    if auth.uid() is not null then
      raise exception 'only device_name/last_used_at can be updated by the owner';
    end if;
  end if;
  return new;
end;
$$;

create trigger webauthn_credentials_protect_cols_trg
before update on public.webauthn_credentials
for each row execute function public.webauthn_credentials_protect_cols();
