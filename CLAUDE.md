@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

일일 업무 보고 양식 생성기 — Next.js 16 App Router + Supabase. 모든 사용자 노출 문자열은 한국어.

## Commands

- `npm run dev` — 개발 서버 (Turbopack)
- `npm run build` — 프로덕션 빌드
- `npm run start` — 빌드 결과 실행
- `npm run lint` — ESLint (eslint-config-next)
- `npx tsc --noEmit` — 타입 체크 (package.json script 없음)

테스트 러너는 설정되어 있지 않다. Husky `pre-commit`이 `lint-staged`로 변경 파일에 `eslint --fix` + `prettier --write`를 돌린다.

## Runtime requirements

- Node `>=24.12.0 <25.0.0`, npm `>=11.6.2 <12.0.0` (`package.json#engines`)
- 의존성은 `npm ci`로 설치 (README 지침)

## Architecture

### 세 가지 인증 상태

코드 전반에 걸쳐 "로그인/게스트/비인증" 세 가지 상태를 분리해 처리한다 — 이 분기를 빼먹으면 버그가 생긴다.

1. **로그인 사용자** — Supabase 세션 쿠키 기반. 데이터는 Supabase DB(RLS 적용).
2. **게스트** — `guest-mode` 쿠키(`src/lib/guest.ts`의 `GUEST_MODE_COOKIE`)만 존재. 보고서 기록은 `localStorage`(`report-history` 키)에 저장. Supabase 호출을 건너뛰어 stale refresh token 오류를 회피한다.
3. **비인증** — 위 둘 다 없음. `/login`으로 리다이렉트.

`isGuestMode()` 체크는 `useEffect`, 클라이언트 컴포넌트, 데이터 훅 곳곳에 있다. 새 데이터 경로를 만들 때 이 분기를 따라가야 한다.

### Middleware는 `src/proxy.ts` (not `middleware.ts`)

Next.js 기본 파일명이 아니다. 동작:
- `/api/*`는 무조건 통과 — route handler가 자체 인증. (리다이렉트하면 JSON 대신 HTML이 반환되어 패스키 로그인 등에서 깨진다)
- 게스트 쿠키가 있으면 Supabase `getUser()` 호출 자체를 건너뛰고 `/settings/*` 같은 `AUTH_ONLY_PATH_PREFIXES`만 홈으로 리다이렉트한다
- `supabase.auth.getUser()` 오류는 삼켜서 비로그인으로 간주 (stale 토큰 허용)

### Route groups

- `src/app/(app)/` — 로그인/게스트가 접근 가능한 보호 영역. 공용 `AppTopBar` + 새소식 dialog가 여기 layout에서 마운트된다.
- `src/app/(auth)/` — `/login`, `/signup`. 로그인된 사용자가 접근하면 `/`로 리다이렉트.
- `src/app/api/` — Passkey 관련 라우트는 `api/auth/passkey/{register,login}/{options,verify}` 구조, passkey CRUD는 `api/passkeys/`.

### Supabase 클라이언트 세 종류

- `src/lib/supabase/client.ts` — 브라우저 (anon key)
- `src/lib/supabase/server.ts` — RSC / route handler (cookie 기반 세션)
- `src/lib/supabase/admin.ts` — `SUPABASE_SERVICE_ROLE_KEY`. `'server-only'`. RLS 우회 필요시에만.

### WebAuthn (passkey)

- 서버: `src/lib/webauthn/` — `@simplewebauthn/server`. 챌린지는 iron-session으로 서명된 쿠키에 저장(`challenge-cookie.ts`).
- 클라이언트: `@simplewebauthn/browser`.
- 환경변수 필수: `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGIN`, `WEBAUTHN_CHALLENGE_SECRET` (64자 hex). 모든 env 선언은 `src/types/environments.d.ts`에 있다.
- 셋업 문서: `src/docs/passkey-setup.md`, `src/docs/supabase-setup.md`.

### DB 마이그레이션

`supabase/migrations/*.sql` — RLS 정책 포함. 마이그레이션 추가 시 RLS도 함께 작성한다.

### 기타 규약

- Path alias: `@/*` → `src/*`, `#/*` → `public/*`
- React Compiler 활성화 (`next.config.ts` `reactCompiler: true`) — `useMemo`/`useCallback` 과도 사용 지양
- Vercel 배포 리전: `icn1` (Seoul, `vercel.json`)
- 상태 관리: Zustand (`src/stores/`), 데이터 페칭: SWR
- 토스트는 `react-hot-toast`
