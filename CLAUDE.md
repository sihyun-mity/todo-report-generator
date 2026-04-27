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
2. **게스트** — `guest-mode` 쿠키(`GUEST_MODE_COOKIE` @ `src/constants/guest.constants.ts`)만 존재. 보고서 기록은 `localStorage`(`REPORT_HISTORY_STORAGE_KEY` 키)에 저장. Supabase 호출을 건너뛰어 stale refresh token 오류를 회피한다.
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
- `src/app/auth/callback/route.ts` — Supabase OAuth(예: GitHub) code exchange + 게스트 쿠키 정리. `proxy.ts`의 `PUBLIC_PATH_PREFIXES`에 `/auth`가 포함돼 비로그인 상태에서도 통과한다.
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

### 페이지 metadata

모든 `page.tsx`는 `staticMetadata({ title, description })`로 metadata를 정의한다 (`src/utils/meta.ts`).

- title이 있으면 자동으로 ` | 일일 업무 보고 생성기` suffix가 붙고, 없으면 서비스명 단독.
- 동적 title은 `generateMetadata` 내부에서 동일 utility를 호출 (`src/app/(app)/whats-new/[id]/page.tsx` 참고).
- 새 page를 추가하면서 `Metadata` 객체를 직접 만들지 말고, 항상 이 utility를 거친다.

### 보고서 기록 (Report History)

`src/stores/use-report-history-store.ts`는 모드별로 다른 적재 전략을 쓴다.

- **로그인 사용자**: 월 단위 페이지네이션. `initialize()`에서 ① `report_date` 목록만 lightweight으로 fetch(`allReportDates`), ② 가장 최근 월의 본문을 함께 fetch한 뒤에야 `isLoaded: true`로 set한다. 다른 월은 `loadMonth(year, month)`로 lazy 적재 후 `loadedMonths`에 기록. 동시 호출은 모듈 레벨 `monthFetchPromises` Map으로 합쳐진다. 클라이언트 정렬은 하지 않고 Supabase `.order('report_date', desc)` 결과를 그대로 신뢰한다.
- **게스트**: localStorage에서 한 번에 로드. `MAX_HISTORY_ITEMS` 제한이 있고 `sortGuestByReportDateDesc`로 클라이언트 정렬한다.
- **`addHistory`**: 같은 날짜의 기존 본문과 일치하면 I/O를 건너뛴다(복사 연타 시 무의미한 쓰기 방지). 사용자 모드에서는 upsert 후 해당 월을 직접 refetch — `loadingMonths`를 표시하지 않아 사용자 액션 직후 스켈레톤 깜빡임이 없다.

### Hydration-safe 패턴 (보고서 기록 컴포넌트)

`report-history.tsx` / `report-calendar.tsx`는 SSR 시점에서 `new Date()`로 인한 hydration mismatch를 회피해야 한다.

- **`syncStage` 상태머신** (`'init' → 'today' | 'records' → 'records'`): SSR/초기 렌더에서는 결정적 placeholder(`viewYear=2026, viewMonth=1`)로 시작하고, 클라이언트 마운트 후 렌더 중 setState로 today 또는 latest 기록월로 보정한다. **effect 안에서 setState하지 않는다** — React 19 `react-hooks/set-state-in-effect` 룰을 따라 렌더 본문에서 if문으로 1회성 보정한다.
- **prop 변화로 state 리셋**: 월이 바뀔 때 `localPage`를 1로 되돌리는 등은 `pageMonthAnchor` 같은 anchor state + 렌더 중 비교로 처리 (effect 사용 X).
- **클라이언트 전용 값**: `useIsClient()` + `useMemo`로 SSR에서는 null로 두고 마운트 후 채우는 방식. 캘린더 today 강조가 이 패턴을 사용한다.
- **로딩 중 레이아웃 유지**: `isLoaded` / `loadingMonths` / `syncStage`로 스켈레톤(헤더 라벨, 카드)을 렌더해 컴포넌트가 비어 보이지 않도록 한다. 캘린더 헤더는 `isReady` prop으로 placeholder 단계에서 라벨을 스켈레톤으로 가리고 chevron을 비활성화한다. 카드 스켈레톤(`HistoryCardSkeleton`)은 실제 카드의 `p-3 + mb-1 + 22px 상단 행 + text-[11px] 2줄 + mt-2 + text-[10px] timestamp` 구조를 그대로 따라가 레이아웃 점프를 막는다.

### View Transitions

페이지 전환 애니메이션은 React 19 `<ViewTransition>` + Next.js 16 `experimental.viewTransition: true` 조합으로 처리한다.

- Root layout(`src/app/layout.tsx`)에서 children을 `<ViewTransition>`으로 감싸 모든 라우트 이동에 자동 적용. transition type별 클래스(`nav-forward`, `nav-back`, default `page`)가 매핑돼 있다.
- 상위 → 하위로 진입하는 `<Link>`엔 `transitionTypes={['nav-forward']}` (좌→우 슬라이드), 복귀 링크엔 `transitionTypes={['nav-back']}` (우→좌 슬라이드)을 부여한다. 분류가 모호하면 prop을 생략해 default `page` 효과(fade + slide-up)로 둔다.
- 전환 중에도 자기 자리에 고정돼야 하는 element(예: `AppTopBar`)엔 `style={{ viewTransitionName: '...' }}`을 부여하고 CSS에서 `::view-transition-group(name) { animation: none }`로 anchor한다.
- 효과 정의는 `src/styles/view-transitions.css` 한 곳에 모은다. `prefers-reduced-motion: reduce`에서는 짧은 cross-fade만 유지하도록 매핑돼 있다.
- React canary export(`ViewTransition`) 타입은 `src/types/react.d.ts`의 `import {} from 'react/canary'`로 활성화.

### 디렉터리 구조

```
src/
├── app/                         # Next.js App Router (page/layout/route.ts만 default export 유지)
│   ├── _components/             # 보고서 전용 컴포넌트 (kebab-case + index.ts 배럴)
│   ├── (app)/ | (auth)/ | api/
│   ├── layout.tsx
│   └── robots.ts
├── components/                  # 공용 UI 컴포넌트
├── constants/                   # `*.constants.ts` 파일로 상수 모음
├── core/                        # fetch 등 인프라 레이어
├── enums/                       # `*.enum.ts` (현재 비어 있음)
├── hooks/                       # `use-*.ts` — kebab-case + 네임드 export
├── lib/                         # supabase / webauthn / guest — 외부 의존 얇은 래퍼
├── stores/                      # Zustand `use-*-store.ts`
├── types/                       # `*.type.ts` + 전역 `.d.ts` (environments / query)
└── utils/                       # 범용 헬퍼
```

### 파일 / 모듈 규약

- **파일명**: 항상 kebab-case (`my-component.tsx`, `use-report-history.ts`). 컴포넌트/훅도 예외 없음.
- **export**: 전부 `export function` / `export const` — `export default`는 **Next.js가 요구하는 파일에만** (page.tsx, layout.tsx, route.ts, robots.ts 등).
- **배럴(barrel)**: 같은 레벨의 `index.ts`에서 `export * from './name'` 로만 내보낸다 (배럴 내부의 **`export *` 문은 상대 경로 `./name` 허용**). `export { default as ... }` 금지.
  - 서버 전용 모듈(`server-only` / `next/headers`를 import하는 파일)은 클라이언트 컴포넌트가 공유하는 배럴에 넣지 말 것. 클라이언트가 배럴을 import 하면 번들러가 서버 코드를 끌어와 빌드가 깨진다. `components/` 안의 서버 전용 Server Component(예: `NewsDialogMount`)는 해당 레이아웃 전용 `_components/` 디렉터리로 옮겨 별도 배럴에서 내보낸다.
- **import 경로** (import 문에만 적용, 위의 `export *` 문은 해당 없음):
  - 현재 파일과 **같은 디렉터리의 배럴**을 참조할 땐 `from '.'`.
  - **상위 디렉터리의 배럴**을 참조할 땐 `from '..'`.
  - 그 외는 **절대 경로(`@/...`)**. `./name`, `../name` 형식(뒤에 심볼 이름이 붙은 상대 경로)은 import 문에서 **금지**.
  - 배럴 경로로 단축 가능하면 단축한다: `@/utils/report` 대신 `@/utils` (단, 대상 심볼이 배럴에 실제로 있을 때만).
- **타입 선언**: 기본은 `type` alias. `interface`는 declaration merging이 반드시 필요한 경우에만 (예: `NodeJS.ProcessEnv` augmentation).
- **배열 타입 표기**: `Item[]` 형식 대신 `Array<Item>` 또는 `ReadonlyArray<Item>`를 사용한다.
  - 소비자가 읽기만 하면 `ReadonlyArray<Item>` (컴포넌트 Props, 읽기 전용 함수 파라미터 등).
  - 지역 변수 / 직접 조작이 필요한 state 등은 `Array<Item>`.
- **불변성**: 컴포넌트 / 훅 Props 파라미터는 `Readonly<Props>`로 감싼다.
- **layout / page / route handler 타입**: Next.js가 자동 생성하는 전역 헬퍼 사용.
  - `layout.tsx` → `LayoutProps<'/route'>`
  - `page.tsx` → `PageProps<'/route'>` (props를 받지 않으면 생략)
  - `route.ts`의 동적 세그먼트 → `RouteContext<'/api/route/[param]'>`
  - 자체 정의 `Params` / `PageProps` / `{ children }` 타입을 새로 작성하지 않는다.
- **상수 / 타입 / 이넘 위치**:
  - 상수 → `src/constants/<name>.constants.ts`
  - 타입 → `src/types/<name>.type.ts` (전역 augmentation은 `.d.ts`)
  - 이넘 → `src/enums/<name>.enum.ts`

### 기타 규약

- Path alias: `@/*` → `src/*`, `#/*` → `public/*`
- React Compiler 활성화 (`next.config.ts` `reactCompiler: true`) — `useMemo`/`useCallback` 과도 사용 지양
- Vercel 배포 리전: `icn1` (Seoul, `vercel.json`)
- 상태 관리: Zustand (`src/stores/`), 데이터 페칭: SWR
- 토스트는 `react-hot-toast`
