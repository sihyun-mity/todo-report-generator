# 패스키(Passkey) 로그인 - 설계·설정 문서

> 기존 이메일/비밀번호 인증에 **WebAuthn 기반 패스키**를 추가하는 작업.
> 한 사용자(이메일 1개)에 **여러 인증 수단**(비밀번호·패스키 N개·향후 OAuth)을 묶는다.
> Cowork에서 Supabase 웹 UI 설정을 먼저 끝낸 뒤, 이 문서를 Claude Code에 넘겨 코드 작업을 이어간다.

---

## 0. 최종 사용자 시나리오 (확정)

### 0-1. 신규 가입
1. `/signup` 진입 → 이메일 입력.
2. 이메일로 OTP(또는 기존처럼 비밀번호 설정) 완료 → `auth.users`에 계정 생성됨.
3. 가입 완료 페이지에서 **"이 기기에서 패스키 등록하기"** 배너 노출.
   - [등록] 클릭 시 `navigator.credentials.create` 흐름.
   - [나중에] 클릭 시 설정 페이지에서 언제든 등록 가능.

### 0-2. 기존 계정에 패스키 추가
1. 로그인한 상태에서 `/account/security` (또는 `/settings/passkeys`) 진입.
2. 현재 등록된 패스키 목록을 보여줌 (이름·생성일·마지막 사용).
3. **"패스키 추가"** 버튼 → `navigator.credentials.create`.
4. 기기 이름(예: "아이폰 15 Face ID") 수정·삭제 가능.

### 0-3. 로그인 화면 변경
- 기존: 이메일·비밀번호 입력 필드가 바로 노출.
- 변경 후 (`/login`):
  - **첫 화면에 "로그인 수단 선택"**
    - `[패스키로 로그인]` — 주요 CTA
    - `[이메일로 로그인]` — 클릭 시 이메일·비밀번호 필드 확장 노출
    - (선택) `[이메일로 매직링크 받기]`
  - 사용자가 "이메일 입력칸에 focus하면 브라우저 자동완성이 패스키를 제안"하는 **conditional UI (autofill)**도 지원.

### 0-4. 계정 연결 원칙
- **이메일이 계정의 유일한 식별자**. 같은 이메일 = 같은 `auth.users` 행.
- 패스키만으로 처음 가입하는 사용자도, 이메일 먼저 입력받아 해당 이메일로 `auth.users`를 만든 뒤 패스키를 붙인다.
- 향후 OAuth(Google/Kakao 등)가 추가돼도 동일 이메일이면 같은 계정에 연결.
- 한 계정은 **N개의 패스키**를 가질 수 있음 (기기별·브라우저별로 다르게 등록 권장).

---

## 1. 아키텍처 개요

```
[브라우저]
   │  navigator.credentials.create / .get
   ▼
[Next.js API Route (Vercel)]
   │  @simplewebauthn/server 로 옵션 생성·검증
   ├─ 챌린지 저장: HttpOnly 쿠키 (단기 서명)
   ├─ 크리덴셜 저장: Supabase public.webauthn_credentials
   │
   ├─ 로그인 성공 시 세션 발급:
   │     supabaseAdmin.auth.admin.generateLink({type:'magiclink'})
   │       → token_hash 리턴 → 클라이언트에서 supabase.auth.verifyOtp() 호출
   │       → Supabase 세션 쿠키 세팅 (기존 체계 그대로)
   ▼
[Supabase Auth + DB]
   - auth.users (기존)
   - public.webauthn_credentials (신규)
```

### 핵심 설계 결정

| 결정 | 선택 | 이유 |
|---|---|---|
| WebAuthn 라이브러리 | `@simplewebauthn/server` + `@simplewebauthn/browser` | 사실상 표준, 타입 지원, 브라우저 호환성 가장 좋음 |
| 챌린지 저장소 | **HttpOnly 쿠키** (서명+암호화) | 추가 테이블 불필요, TTL 명확, 정리 불필요 |
| 세션 발급 방식 | `generateLink(magiclink)` → `verifyOtp(token_hash)` | Supabase가 공식 지원하는 우회로, 커스텀 JWT 서명 불필요 |
| RP ID | 환경별 분리 (`localhost` / `todo-report-generator.vercel.app`) | WebAuthn은 정확한 RP ID 요구 |
| 크리덴셜 INSERT 권한 | **service_role 서버 라우트만** | 사용자가 임의로 credential 주입하는 공격 차단 |
| 크리덴셜 SELECT/DELETE/UPDATE | RLS로 `auth.uid() = user_id` 허용 | 본인 패스키만 목록·이름변경·삭제 |

---

## 2. DB 스키마 변경 (SQL)

> Supabase SQL Editor에서 한 번 실행. 결과가 "Success. No rows returned"면 OK.

```sql
-- =========================================================
-- 2-1. 패스키(크리덴셜) 테이블
-- =========================================================
create table public.webauthn_credentials (
  id               uuid         primary key default gen_random_uuid(),
  user_id          uuid         not null references auth.users(id) on delete cascade,
  credential_id    text         not null unique,             -- base64url, .get()의 rawId
  public_key       bytea        not null,                    -- COSE public key
  counter          bigint       not null default 0,
  transports       text[]       null,                        -- ['internal','hybrid','usb',...]
  aaguid           uuid         null,
  device_type      text         null check (device_type in ('single_device','multi_device') or device_type is null),
  backed_up        boolean      not null default false,      -- iCloud/Google Password Manager 동기화 여부
  device_name      text         null,                        -- 사용자 편집 가능한 라벨
  created_at       timestamptz  not null default now(),
  last_used_at     timestamptz  null
);

create index webauthn_credentials_user_idx on public.webauthn_credentials(user_id);

alter table public.webauthn_credentials enable row level security;

-- 본인 패스키만 조회
create policy "webauthn_credentials select own"
  on public.webauthn_credentials
  for select using (auth.uid() = user_id);

-- 본인 패스키 라벨 수정만 허용 (public_key/counter/credential_id는 서버에서만 수정)
create policy "webauthn_credentials update own label"
  on public.webauthn_credentials
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 본인 패스키 삭제
create policy "webauthn_credentials delete own"
  on public.webauthn_credentials
  for delete using (auth.uid() = user_id);

-- INSERT 정책은 만들지 않음 → RLS가 막음 → 서버 service_role 클라이언트로만 주입
```

> **주의**: `UPDATE` 정책을 그대로 두면 클라이언트가 `counter`를 임의 수정할 수 있음. 방어가 필요하면 trigger로 `credential_id`, `public_key`, `counter`, `aaguid`, `device_type`, `backed_up` 컬럼 변경을 차단하고 `device_name`, `last_used_at` 만 허용. 아래 선택 트리거:

```sql
-- (선택) 민감 컬럼 업데이트 차단 트리거
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
    -- service_role 컨텍스트면 통과 (auth.uid() IS NULL)
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
```

---

## 3. Supabase 웹 UI 설정 (Cowork에서 먼저 할 일)

### 3-1. SQL Editor에서 위 2번 스키마 실행

### 3-2. Auth → Email provider 옵션 확인
- "Enable Email provider": **ON**
- "Confirm email": 기존대로 (OFF 유지). 첫 가입 이메일 확인은 OTP로 대체.
- "Allow OTP Sign In" / "Enable Email OTP": **ON** (이메일 먼저 입력 → 코드 검증 → 패스키 등록 플로우에서 사용)

### 3-3. Authentication → URL Configuration 재확인
- Site URL: `https://todo-report-generator.vercel.app` (기존)
- Redirect URLs에 이미 `/**`가 있어 패스키 관련 API는 추가 변경 불필요.

### 3-4. Service role key 확보
- Supabase Dashboard → Project Settings → API Keys → `service_role` / `secret`
- **이 키는 서버 전용**. 절대 `NEXT_PUBLIC_*`에 넣지 말 것. 브라우저에 노출되면 전체 DB 우회 쿼리 가능.

### 3-5. Vercel 환경변수 등록

https://vercel.com/sihyuns-projects-a914edee/todo-report-generator/settings/environment-variables

**Production** 기준. 로컬 테스트 시 `.env.local`에도 동일하게 복사.

| Name | Sensitive | Value |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **ON** | 3-4에서 복사한 `service_role` 키 |
| `WEBAUTHN_RP_ID` | OFF | `todo-report-generator.vercel.app` (로컬은 `localhost`) |
| `WEBAUTHN_RP_NAME` | OFF | `일일 업무 보고` |
| `WEBAUTHN_ORIGIN` | OFF | `https://todo-report-generator.vercel.app` (로컬은 `http://localhost:3000`) |
| `WEBAUTHN_CHALLENGE_SECRET` | **ON** | `openssl rand -hex 32` 로 생성한 32바이트 hex |

> **RP ID가 환경별로 달라야 하는 이유**: WebAuthn spec상 RP ID는 현재 origin의 eTLD+1 이하여야 함. `localhost`와 `vercel.app`은 서로 커버 못함. Preview 배포(`*.vercel.app` 하위 도메인)에서 쓰려면 Preview용 별도 값 필요.

### 3-6. (선택) Preview 환경 대응
- Preview 배포에서 패스키 테스트가 필요하면 Vercel Preview용 환경변수도 등록.
- 단, 매 PR마다 URL이 바뀌는 특성상 RP ID를 동적으로 잡기 어려움 → Preview에서는 패스키 기능을 비활성화하는 feature flag를 하나 두는 쪽이 현실적. 초기에는 Production + 로컬만 지원.

---

## 4. Claude Code로 이어서 구현할 일

### 4-1. 패키지 설치

```bash
npm install @simplewebauthn/server @simplewebauthn/browser
npm install iron-session   # 챌린지 쿠키 암호화·서명용 (또는 jose로 직접 서명)
```

> `iron-session`이 과하다면 `jose`로 HMAC-서명만 해도 됨. 핵심은 **서버가 발급한 challenge를 클라이언트가 조작할 수 없게** 쿠키 페이로드를 무결성 검증하는 것.

### 4-2. 파일 구조 (예상)

```
lib/
  supabase/
    client.ts              # 기존 (브라우저용 anon 키)
    server.ts              # 기존 (SSR용 anon 키 + 쿠키)
    admin.ts               # 신규: service_role 키 클라이언트 (서버 전용)
  webauthn/
    config.ts              # RP ID / origin / name 환경변수 래퍼
    challenge-cookie.ts    # 챌린지 서명·검증 (iron-session 또는 jose)
    session.ts             # 패스키 검증 후 Supabase 세션 발급 (generateLink → verifyOtp 헬퍼)

app/
  api/auth/passkey/
    register/
      options/route.ts     # POST: 등록 옵션 생성
      verify/route.ts      # POST: 등록 검증 + credential 저장
    login/
      options/route.ts     # POST: 인증 옵션 생성 (email 옵션 허용)
      verify/route.ts      # POST: 인증 검증 + 세션 발급 토큰 리턴
  api/passkeys/
    route.ts               # GET: 내 패스키 목록 (RLS 기반)
    [id]/route.ts          # PATCH (rename), DELETE

  login/page.tsx           # UI 대폭 변경: 수단 선택 → 펼침
  signup/page.tsx          # 완료 단계에서 패스키 등록 유도 배너
  account/security/page.tsx  # 신규: 패스키 관리 UI (또는 /settings/passkeys)
```

### 4-3. 핵심 구현 포인트

#### (a) `lib/supabase/admin.ts`

```ts
// 서버 전용. 'use server' 컨텍스트나 route handler에서만 import.
import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
```

#### (b) 챌린지 쿠키

- 쿠키 이름: `webauthn_challenge`
- 속성: `HttpOnly`, `Secure`, `SameSite=Strict`, `Max-Age=300` (5분)
- 페이로드: `{ challenge, type: 'registration'|'authentication', userId?, email?, iat }`
- `WEBAUTHN_CHALLENGE_SECRET`으로 HMAC-SHA256 서명.

#### (c) 등록 플로우 (로그인된 사용자가 새 패스키 추가)

1. `POST /api/auth/passkey/register/options`
   - 현재 로그인 유저 확인 (없으면 401).
   - 이 유저의 기존 credential_id들을 `excludeCredentials`로 전달해 중복 등록 방지.
   - `generateRegistrationOptions({ rpID, rpName, userID: user.id, userName: user.email, excludeCredentials })`.
   - 반환 JSON과 함께 `webauthn_challenge` 쿠키 세팅.

2. 브라우저에서 `@simplewebauthn/browser` 의 `startRegistration(options)` 호출.

3. `POST /api/auth/passkey/register/verify`
   - 쿠키에서 challenge 꺼내 검증.
   - `verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin, expectedRPID })`.
   - 성공 시 `supabaseAdmin.from('webauthn_credentials').insert({ user_id, credential_id, public_key, counter, transports, aaguid, device_type, backed_up, device_name })`.
   - 쿠키 삭제.

#### (d) 가입 플로우 (이메일 → 계정 생성 → 패스키 등록)

1. `/signup`에서 이메일 입력 → `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`.
2. 이메일에 도착한 6자리 코드 입력 → `supabase.auth.verifyOtp({ email, token, type: 'email' })`.
   - 이 시점에 세션이 생성되고 `auth.users`에 계정이 존재.
3. 가입 완료 화면에서 "이 기기에 패스키 등록" 배너 노출.
4. 사용자가 원하면 (c) 등록 플로우 그대로 진행.

> 기존 이메일+비밀번호 가입 플로우도 그대로 유지. 가입 완료 후 패스키 권유 배너를 **공통**으로 노출.

#### (e) 로그인 플로우 (패스키로 로그인)

1. `POST /api/auth/passkey/login/options`
   - 이메일 힌트가 있으면 해당 유저의 `allowCredentials` 포함해 응답.
   - 없으면 `allowCredentials`를 비워 **usernameless** (디바이스가 보유한 passkey 중 선택) 흐름.
   - challenge 쿠키 세팅.

2. 브라우저에서 `startAuthentication(options, /* conditionalUI */)`.
   - 이메일 필드에 `autocomplete="username webauthn"` 주면 OS·브라우저 autofill 제안.

3. `POST /api/auth/passkey/login/verify`
   - 쿠키 challenge 검증.
   - `credential_id`로 `webauthn_credentials` 조회 → 일치하는 `public_key`, `counter`로 `verifyAuthenticationResponse`.
   - 성공 → `counter`, `last_used_at` 업데이트.
   - `supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email: user.email })` 호출 → `properties.hashed_token` 획득.
   - 클라이언트에 `{ email, token_hash }` 반환.
   - 클라이언트에서 `supabase.auth.verifyOtp({ type: 'magiclink', token_hash })` → 세션 쿠키 세팅.

> **왜 이 우회로를 쓰나**: Supabase JS SDK가 공식적으로 "임의 유저로 세션을 생성"하는 API를 공개하지 않음. `admin.generateLink`의 `hashed_token`은 내부적으로 OTP와 동일 체계라 `verifyOtp`로 교환 가능. 커스텀 JWT 서명보다 덜 깨지고 Supabase의 refresh 토큰 체계도 그대로 사용됨.

#### (f) 패스키 관리 UI (`/account/security`)

- `GET /api/passkeys` → 내 패스키 목록 (RLS로 본인 것만 나옴).
  - 필드: `id`, `device_name`, `created_at`, `last_used_at`, `backed_up`, `transports`.
- **추가**: 위 (c) 등록 플로우 재사용.
- **이름 변경**: `PATCH /api/passkeys/[id]` → `device_name`만 업데이트.
- **삭제**: `DELETE /api/passkeys/[id]`.
- **주의**: 계정에 남은 패스키가 1개뿐이고 **패스키가 유일한 로그인 수단**이면 삭제 전 경고 ("비밀번호 설정 or 다른 패스키 등록 후 삭제하세요"). 현재는 이메일/비밀번호가 항상 공존하므로 초기 버전에서는 경고만 띄우면 충분.

#### (g) 로그인 페이지 리디자인

```
┌─────────────────────────────────────┐
│  일일 업무 보고                       │
│                                      │
│  [ 🔑  패스키로 로그인 ]  ← 주 버튼   │
│                                      │
│  ───── 또는 ─────                    │
│                                      │
│  [ ✉  이메일로 로그인 ]  ← 클릭 펼침  │
│      email [________________]        │
│      password [_____________]        │
│      [로그인]   [회원가입]           │
│                                      │
│  문제가 있나요? 이메일 링크로 받기    │
└─────────────────────────────────────┘
```

- "패스키로 로그인" 버튼은 **WebAuthn 미지원 브라우저에서는 숨김 처리**.
  - `if (typeof window !== 'undefined' && window.PublicKeyCredential)` 체크.
- "이메일로 로그인"의 이메일 인풋에 `autocomplete="username webauthn"` 지정 → conditional UI로 패스키 자동 제안.

---

## 5. 보안 체크리스트

- [ ] `SUPABASE_SERVICE_ROLE_KEY` 는 **Sensitive ON**, `NEXT_PUBLIC_` 접두사 절대 사용 안 함.
- [ ] `WEBAUTHN_CHALLENGE_SECRET` 는 32바이트 이상 랜덤. Sensitive ON.
- [ ] 챌린지 쿠키는 `HttpOnly`, `Secure`, `SameSite=Strict`, `Max-Age=300`.
- [ ] `verifyRegistrationResponse` / `verifyAuthenticationResponse` 의 `expectedOrigin`·`expectedRPID` 는 환경변수에서 읽음 (클라이언트가 조작 불가).
- [ ] 로그인 `verify` 라우트에서 `counter` 감소·정체 감지 시 **경고**. (감소하면 복제 의심 → 해당 credential 삭제 또는 비활성화.)
- [ ] `webauthn_credentials.INSERT` 는 오직 service_role 서버 라우트에서만. RLS로 클라이언트 직접 INSERT 차단 확인.
- [ ] 패스키 목록 응답에 `public_key`, `counter` 는 노출하지 않음. (ID, device_name, 메타만.)
- [ ] `/api/passkeys/[id]` DELETE·PATCH 는 RLS가 본인 여부 검증.
- [ ] 로그인 `options` 라우트는 `rate limit` (동일 IP에서 초당 과다 호출 시 차단). 기본 Vercel 레이트 리밋에 의존하되, 필요 시 Upstash Redis 기반으로 확장.
- [ ] `generateLink` 반환 토큰을 서버 로그에 남기지 않음.

---

## 6. 테스트 체크리스트

### 6-1. 로컬 개발 (`http://localhost:3000`)
- [ ] `.env.local`에 `WEBAUTHN_RP_ID=localhost`, `WEBAUTHN_ORIGIN=http://localhost:3000` 세팅.
- [ ] Chrome/Edge/Safari 최신 버전에서 패스키 등록·로그인.
- [ ] macOS Touch ID / Windows Hello / Android 지문 3종 중 최소 2종 검증.
- [ ] 한 계정에 2개 이상 패스키 등록 → 목록에 둘 다 보이는지.
- [ ] 패스키 이름 변경 → DB 반영.
- [ ] 패스키 삭제 → DB 삭제 + 목록에서 사라짐.
- [ ] 삭제한 패스키로 로그인 시도 → 실패.

### 6-2. Production (`https://todo-report-generator.vercel.app`)
- [ ] Vercel 환경변수 5개 등록 확인.
- [ ] 실 신규 가입 → 패스키 등록 → 로그아웃 → 패스키 로그인.
- [ ] 다른 기기에서 iCloud/Google Password Manager로 동기화된 패스키가 뜨는지 확인 (동기화형 패스키).
- [ ] 보고서 CRUD가 패스키 로그인 세션에서도 정상 동작하는지 (`auth.uid()` 같은 user_id로 나오는지).

### 6-3. 장애 상황
- [ ] 챌린지 쿠키 만료(5분 초과) → 명확한 에러 메시지.
- [ ] 다른 RP ID에서 생성된 크리덴셜로 시도 → 검증 실패.
- [ ] 서버가 service_role 키 없이 실행 → 패스키 등록 요청 시 500 + 로그.
- [ ] Supabase `generateLink` 실패 시 → 사용자에게 "잠시 후 다시 시도해주세요" + 서버 로그.

---

## 7. 단계별 롤아웃 계획

1. **Phase 0 (이 문서)**: 설계·Supabase 설정·환경변수 등록.
2. **Phase 1**: DB 테이블 + `/api/auth/passkey/*` 라우트 + 관리 UI. 가입 후 등록 배너. *로그인 화면은 기존 그대로 두고 뒤에서 조용히 테스트.*
3. **Phase 2**: `/login` 화면 리디자인 (수단 선택). conditional UI 추가.
4. **Phase 3**: (선택) OAuth (Google/Kakao) 추가 — 동일 email이면 자동으로 같은 계정에 연결되도록 `identity` 병합 로직 점검.

---

## 8. 오픈 이슈 / 향후 결정 필요

- **동일 이메일 OAuth 병합**: Supabase Auth의 "Allow same email in multiple providers" 옵션이 향후 OAuth 붙일 때 이슈. Phase 3에서 확정.
- **패스키 복구**: 사용자가 모든 패스키를 잃었을 때 이메일 매직링크로 복구 가능함 (이메일 인증이 항상 fallback). Phase 1 범위 내.
- **디바이스 이름 기본값**: User-Agent 파싱해서 "Chrome on macOS" 같은 기본값을 줄지, 빈 값으로 둘지. Phase 1 구현 시 결정.
- **backed_up=false 경고**: 하드웨어 키(YubiKey 등)처럼 동기화되지 않는 패스키를 등록했을 때, UI에서 "이 기기에만 저장됨" 뱃지로 표시할지. Phase 2에서 결정.

---

## 9. 참고 링크

- SimpleWebAuthn 문서: https://simplewebauthn.dev/docs/
- Supabase generateLink API: https://supabase.com/docs/reference/javascript/auth-admin-generatelink
- Supabase verifyOtp (token_hash): https://supabase.com/docs/reference/javascript/auth-verifyotp
- WebAuthn conditional UI: https://web.dev/articles/passkey-form-autofill
- WebAuthn RP ID 규칙: https://www.w3.org/TR/webauthn-2/#rp-id

---

## 10. Cowork → Claude Code 인수인계 요약

### 10-1. Cowork에서 완료한 것 (2026-04-23)

- [x] **2번 SQL 실행 완료** — `public.webauthn_credentials` 테이블 + 인덱스 + RLS(select/update/delete 3개 정책) + `webauthn_credentials_protect_cols` 트리거 모두 성공. 실행 SQL은 `passkey-step1.sql`로 보관.
- [x] **3-2 Auth Email OTP 옵션 확인 완료** — Email provider ON, "Confirm email"은 현재 ON 상태이지만 OTP 발송 자체는 Confirm email 설정과 독립적이라 동작에 문제 없음.
- [x] **3-5 Vercel 환경변수 5개 등록 완료** (Production 환경만, Preview·Development 미적용):
  - `WEBAUTHN_RP_ID` = `todo-report-generator.vercel.app` (Sensitive OFF)
  - `WEBAUTHN_RP_NAME` = `일일 업무 보고` (Sensitive OFF)
  - `WEBAUTHN_ORIGIN` = `https://todo-report-generator.vercel.app` (Sensitive OFF)
  - `WEBAUTHN_CHALLENGE_SECRET` = (openssl rand -hex 32로 생성한 64자 hex, **Sensitive ON**)
  - `SUPABASE_SERVICE_ROLE_KEY` = Supabase Legacy service_role JWT (**Sensitive ON**)
  - 기존 등록분 유지: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 10-2. 로컬 `.env.local`에 추가할 값 (Claude Code 진입 시 첫 작업)

기존 `.env.local`에 아래 5줄을 **추가**. RP_ID/ORIGIN은 localhost용이라 Production 값과 달라야 함.

```
# --- WebAuthn (로컬 개발용) ---
WEBAUTHN_RP_ID=localhost
WEBAUTHN_RP_NAME=일일 업무 보고 (dev)
WEBAUTHN_ORIGIN=http://localhost:3000
WEBAUTHN_CHALLENGE_SECRET=<Vercel에 등록한 것과 동일한 64자 hex를 그대로 복사>
SUPABASE_SERVICE_ROLE_KEY=<Supabase Dashboard → Settings → API Keys → Legacy → service_role Reveal 후 복사>
```

- `WEBAUTHN_CHALLENGE_SECRET`은 로컬과 Production이 같아도 무방 (쿠키 서명용이라 환경 분리가 필수는 아님). 보안상 분리하고 싶으면 `openssl rand -hex 32`로 별도 생성.
- `.env.local`이 `.gitignore`에 포함돼 있는지 한 번 더 확인.
- Preview 배포에서 패스키 테스트가 필요해지면 feature flag로 OFF 처리 (3-6 참조).

### 10-3. Claude Code에서 진행할 것 (순서)

1. **환경 준비**
   - `.env.local` 업데이트 (10-2 값 5개 추가)
   - `npm install @simplewebauthn/server @simplewebauthn/browser iron-session`
2. **서버 인프라**
   - `lib/supabase/admin.ts` 신설: `SUPABASE_SERVICE_ROLE_KEY`로 만드는 admin client. `lib/supabase/client.ts`·`server.ts`와 분리.
   - `lib/webauthn/config.ts`: `WEBAUTHN_RP_ID`/`ORIGIN`/`RP_NAME` 읽는 래퍼.
   - `lib/webauthn/challenge-cookie.ts`: 챌린지 HttpOnly 쿠키 서명·검증 (iron-session 또는 jose HMAC).
   - `lib/webauthn/session.ts`: 패스키 검증 성공 후 `admin.auth.admin.generateLink({ type: 'magiclink', email })` → 클라이언트 `supabase.auth.verifyOtp({ token_hash, type: 'email' })` 브리지 헬퍼.
3. **API 라우트** (4-2 파일 구조 준수)
   - `app/api/auth/passkey/register/options` · `verify`
   - `app/api/auth/passkey/login/options` · `verify`
   - `app/api/passkeys` (목록) · `app/api/passkeys/[id]` (이름 변경·삭제)
4. **UI 변경**
   - `/signup` 완료 화면에 "이 기기에 패스키 등록하기" 배너 추가.
   - `/account/security` (또는 `/settings/passkeys`) 페이지 신설: 등록된 패스키 목록·추가·이름 변경·삭제.
   - `/login` 리디자인: **수단 선택 UI 우선**, 이메일 필드에는 conditional UI(autofill) 적용.
5. **검증 순서**
   - 로컬에서 `npm run dev` → 회원가입 → 패스키 등록 → 로그아웃 → 패스키 로그인까지 end-to-end.
   - 같은 이메일로 기존 비밀번호 로그인도 계속 동작하는지 회귀 확인.
   - Vercel 배포 후 Production에서 동일 시나리오 재검증.
   - 6번 체크리스트 전체 통과 후 완료.
