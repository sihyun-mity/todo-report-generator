<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is
outdated — the docs are the source of truth.

<!-- END:nextjs-agent-rules -->

# AGENTS.md

This file is the single source of truth for AI agent guidance in this repository. `CLAUDE.md` is a symlink to this file.

일일 업무 보고 생성기 — Next.js 16 App Router + Supabase. 모든 사용자 노출 문자열은 한국어.

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
3. **비인증** — 위 둘 다 없음. **게스트가 기본값** — 미들웨어가 게스트 쿠키를 심어 게스트로 승격시키고 그대로 통과시킨다 (`/login` 리다이렉트 없음). 첫 방문자는 로그인 페이지를 거치지 않고 바로 보고서 작성 폼을 본다. 로그인은 선택사항으로, 게스트에게는 상단바 로그인 버튼·`GuestLoginBanner`(작성 화면(홈)에서만 노출, dismiss 가능)·사용자 메뉴로만 추천한다. 로그인 페이지는 첫 화면이 아니므로 카드에 홈으로 돌아가는 닫기(X) 버튼이 있다.

`isGuestMode()` 체크는 `useEffect`, 클라이언트 컴포넌트, 데이터 훅 곳곳에 있다. 새 데이터 경로를 만들 때 이 분기를 따라가야 한다.

### Middleware는 `src/proxy.ts` (not `middleware.ts`)

Next.js 기본 파일명이 아니다. 동작:
- `/api/*`는 무조건 통과 — route handler가 자체 인증. (리다이렉트하면 JSON 대신 HTML이 반환되어 패스키 로그인 등에서 깨진다)
- 게스트 쿠키가 있고 Supabase 세션 쿠키 흔적이 전혀 없으면 `supabase.auth.getUser()` 호출 자체를 건너뛰고 `/settings/*` 같은 `AUTH_ONLY_PATH_PREFIXES`만 `/login`으로 리다이렉트한다 (인증이 필요한 곳이므로 홈이 아니라 로그인 화면).
- `supabase.auth.getUser()` 오류는 삼켜서 비로그인으로 간주 (stale 토큰 허용).
- 비인증(게스트 쿠키도 세션도 없음) + 보호 경로 요청이면 `/login` 리다이렉트 대신 `guest-mode` 쿠키를 request/response 양쪽에 세팅하고 통과시킨다 — 게스트가 기본 진입 상태다.
- 세션 갱신 시 GoTrue가 서버 런타임의 UA/IP로 `auth.sessions`를 덮어쓰지 않도록 `forwardedHeadersOption(request.headers)`로 원래 브라우저 요청 정보를 전달한다.

### Route groups

- `src/app/(app)/` — 로그인/게스트가 접근 가능한 보호 영역. 공용 `AppTopBar` + 새소식 dialog가 여기 layout에서 마운트된다. 이 그룹 전용 서버 컴포넌트는 `src/app/(app)/_components/`에 둔다(예: `news-dialog-mount.tsx`).
- `src/app/(auth)/` — `/login`, `/signup`. 로그인된 사용자가 접근하면 `/`로 리다이렉트.
- `src/app/auth/callback/route.ts` — Supabase OAuth(예: GitHub) code exchange + 게스트 쿠키 정리. `proxy.ts`의 `PUBLIC_PATH_PREFIXES`에 `/auth`가 포함돼 비로그인 상태에서도 통과한다.
- `src/app/api/` — Passkey 관련 라우트는 `api/auth/passkey/{register,login}/{options,verify}` 구조, passkey CRUD는 `api/passkeys/`. 로그인 기기(세션) 관리는 `api/sessions/`.

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

`auth` 스키마(예: `auth.sessions`)는 PostgREST로 노출되지 않으므로, 클라이언트에서 읽거나 변경해야 하면 `public` 스키마에 `SECURITY DEFINER` 함수를 두고 `supabase.rpc()`로 호출한다. 함수 안에서 본인 식별은 `auth.uid()`, 현재 세션 식별은 JWT의 `auth.jwt() ->> 'session_id'`로 한다. `search_path = ''`로 고정하고 모든 객체를 스키마 한정한다. 실행 권한은 `authenticated`에만 부여(`anon`/`public`은 revoke). 로그인 기기 관리(`list_user_sessions` / `revoke_user_session` / `revoke_other_user_sessions`)가 이 패턴을 쓴다.

### 새소식 (News) 대상 체계

`public.news.audience` 컬럼이 소식마다 노출 대상을 지정한다 (`src/enums/news-audience.enum.ts`).

| 값 | 뜻 | 노출 |
| --- | --- | --- |
| `all` (기본값) | 모두 | 회원 + 비회원(게스트/비인증) |
| `member` | 회원 전용 | 로그인 사용자만 |
| `guest` | 비회원 전용 | 게스트/비인증만 |

- **필터링 책임은 애플리케이션 레이어**(`src/lib/news.ts`)에 있다. `news` 의 RLS 는 "누구나 읽기"를 유지한다 — 소식 본문은 비밀이 아니라 관련성 문제이고, RLS 로 막으면 게스트 → 로그인 전환 시 게스트가 마지막으로 본 소식(비회원 전용일 수 있음)의 발행 시각을 회원 세션이 조회하지 못해 읽음 상태 이전이 깨진다. **새 조회 경로를 만들면 `newsAudiencesFor(isMember)` 필터를 반드시 함께 건다.**
- `fetchLatestNews` / `fetchAllNews` / `fetchNewsById` 는 모두 `isMember` 를 받는다. 로그인 여부는 `getViewerUserId(supabase)` 로 구한다(게스트/stale token 에서 `auth.getUser()` 가 던질 수 있어 try/catch 내장).
- 대상이 맞지 않는 소식은 `fetchNewsById` 가 `null` 을 돌려주므로 `/whats-new/[id]` 직접 접근도 `notFound()` 로 막힌다.
- 읽음 상태는 기존대로 회원 = `user_news_reads`, 게스트 = localStorage 단일 키(`NEWS_GUEST_STORAGE_KEY`). 다이얼로그는 **조회자 대상 기준 최신 1건**만 검사한다.
- **회원의 읽음 기록은 전부 `markNewsAsReadUpTo` 한 곳을 거친다** — 첫 접속 자동 처리(`NewsDialogMount`) · 다이얼로그 확인(`NewsDialog`) · 게스트→로그인 전환(`migrateGuestNewsLastSeen`, `/auth/callback`). 단건 마크는 *"다이얼로그가 최신 1건만 검사한다"* 는 구현 세부에 의존해, 대상 분류가 바뀌어 **더 오래된 소식이 최신 자리로 올라오면 이미 지나간 소식이 뒤늦게 뜬다**. 기준 시점 이전 구간 전체를 읽음 처리해 이 결합을 끊는다. 새 읽음 경로를 추가할 때도 단건 upsert 를 쓰지 말 것.
- 게스트는 단일 키라 위와 같은 구간 기록이 불가능하다. 따라서 **이미 발행된 소식의 `audience` 를 나중에 바꾸면 게스트에게 지나간 소식이 다시 뜰 수 있다** (게스트 관점 최신 id 가 뒤로 밀리면 저장된 값과 불일치). 대상은 발행 시점에 확정하고, 부득이하게 바꿔야 하면 게스트 재노출을 감수한다.
- 소식 추가는 Supabase Studio 수동 insert. `audience` 를 지정하지 않으면 `all` 이다.

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

- **서버 날짜를 prop으로 주입** (`serverDateKey`): "오늘"은 클라이언트 `new Date()`가 아니라 `page.tsx`(서버 컴포넌트)가 `kstDateKey()`로 계산한 KST 날짜 키('YYYY-MM-DD')를 `page → ReportForm → ReportHistory → ReportCalendar`로 내려 쓴다. SSR HTML과 클라 첫 렌더가 같은 값을 쓰므로 캘린더 초기 뷰 월과 today 강조가 **첫 페인트부터 실제 현재 월/날짜로 결정적**이다 (과거의 `viewYear=2026, viewMonth=1` 하드코딩 placeholder 점프 제거). `useServerNow`(react-query, 서버시간)는 마운트 후 today 강조를 자기보정하는 보조 수단으로만 쓰고, 미도착(`now===undefined`) 구간엔 `serverDateKey`로 폴백한다.
- **`syncStage` 상태머신** (`'today' → 'records'`): 초기엔 `serverDateKey`의 월(today)로 시작하고, 기록 데이터가 도착하면 렌더 본문 if문에서 **1회성**으로 최신 기록월(오늘 월로 클램프)로 점프한다. SSR 시점엔 store가 비어 `recordMonths`가 0건이라 보정이 돌지 않아 서버 HTML과 일치한다. 기준 "오늘"이 항상 `serverDateKey`라 결정적이므로 별도 `isClient` 가드가 필요 없다. **effect 안에서 setState하지 않는다** — React 19 `react-hooks/set-state-in-effect` 룰을 따라 렌더 본문에서 if문으로 보정한다.
- **prop 변화로 state 리셋**: 월이 바뀔 때 `localPage`를 1로 되돌리는 등은 `pageMonthAnchor` 같은 anchor state + 렌더 중 비교로 처리 (effect 사용 X).
- **로딩 중 레이아웃 유지**: `isLoaded` / `loadingMonths`로 카드 스켈레톤을 렌더해 컴포넌트가 비어 보이지 않도록 한다. 캘린더 월 라벨은 서버 날짜로 첫 렌더부터 확정되므로 `isReady`는 `true`로 고정하고, 기록 도트는 데이터 도착 시 채워진다. 카드 스켈레톤(`HistoryCardSkeleton`)은 실제 카드의 `p-3 + mb-1 + 22px 상단 행 + text-[11px] 2줄 + mt-2 + text-[10px] timestamp` 구조를 그대로 따라가 레이아웃 점프를 막는다.

### View Transitions

페이지 전환 애니메이션은 React 19 `<ViewTransition>` + Next.js 16 `experimental.viewTransition: true` 조합으로 처리한다.

- Root layout(`src/app/layout.tsx`)에서 children을 **`<PageViewTransition>`** wrapper로 감싸 모든 라우트 이동에 자동 적용한다. 이 wrapper는 내부에서 React `<ViewTransition>` 을 호출하고 `enter`/`exit` 클래스 맵에 `NAV_TRANSITION_TYPES`(`nav-forward`, `nav-back`, …)를 그대로 연결한다. 방향 타입이 주입되지 않은 navigation 의 `default` 는 `'none'` — directional 클래스를 부여하지 않는 안전 폴백이다.
- SSR·CSR 모두 동일하게 `<ViewTransition>` 로 감싼다 — hydration 게이트(과거의 `useIsClient`)를 두지 않는다. React `<ViewTransition>` 은 DOM 을 추가하지 않는 logical fiber 라 SSR/hydration 출력이 children 그대로로 일치하므로 mismatch 가 없다. 과거엔 hydration 전엔 fragment, 후엔 ViewTransition 으로 "승격"했는데, 이때 `#page-shell` 의 자식 wrapper 타입이 Fragment → ViewTransition 으로 바뀌며 React 가 children(=페이지 전체)을 통째로 unmount→remount 했다 — 모든 라우트 진입이 마운트 2회가 되어 새소식 dialog 가 두 번 뜨고 화면이 두 번 깜빡였다. wrapper 타입을 처음부터 고정해 이 remount 를 제거한다. `PageViewTransition` 을 우회해 React `<ViewTransition>` 을 직접 쓰지 말 것.
- `PageViewTransition` 모듈은 import 시점에 `document.startViewTransition` 을 한 번 래핑(`patchStartViewTransition`)해 push/pop/popstate 모든 전환에 두 가지 공통 처리를 부여한다. (a) **스크롤 보정**: OLD 캡처 직전의 `window.scrollY` 를 `--vt-old-shift` 음수 px 로 노출 → `page-shell` 의 OLD 키프레임이 이 값으로 translateY 보정하므로 스크롤된 상태로 navigation 해도 OLD 스냅샷이 최상단으로 끌어올려지지 않는다. (b) **입력 락**: `<html>` 에 `.vt-in-flight` 클래스를 토글 → `view-transitions.css` 가 `pointer-events: none + user-select: none` 으로 입력을 차단해 네이티브 NavigationController 처럼 전환 도중 Link/popstate 등 추가 네비게이션이 끼어들지 못하게 한다 (없으면 React 가 새 transition 으로 직전 transition 을 skip 시켜 화면이 끊기거나, popstate 큐/페닝 상태가 꼬임). 둘 다 `transition.finished` 의 `.finally` 에서 자동 해제하되, `finished` 가 영영 settle 되지 않아 입력 락(`pointer-events:none`)이 전체 페이지에 영구히 걸리는 것을 막는 **안전 타임아웃(2s) 백스톱**(`VT_LOCK_SAFETY_TIMEOUT_MS`)을 함께 건다. 전환이 겹칠 때(직전 전환 skip + 새 전환 시작) 옛 전환의 cleanup 이 새 전환의 락을 덮어 풀지 않도록 **세대(generation) 가드**로 자기 세대일 때만 정리한다.
- 상위 → 하위로 진입하는 `<Link>`엔 `transitionTypes={['nav-forward']}` (좌→우 슬라이드), 복귀 링크엔 `transitionTypes={['nav-back']}` (우→좌 슬라이드)을 부여한다. 분류가 모호하면 prop을 생략해 default `page` 효과(fade + slide-up)로 둔다.
- 전환 중에도 자기 자리에 고정돼야 하는 element(예: `AppTopBar`)엔 `style={{ viewTransitionName: '...' }}`을 부여하고 CSS에서 `::view-transition-group(name) { animation: none }`로 anchor한다.
- 효과 정의는 `src/styles/view-transitions.css` 한 곳에 모은다. `prefers-reduced-motion: reduce`에서는 짧은 cross-fade만 유지하도록 매핑돼 있다.
- React canary export(`ViewTransition`) 타입은 `src/types/react.d.ts`의 `import {} from 'react/canary'`로 활성화.
- 브라우저 back/forward(popstate) 는 root layout 의 `<PopstateViewTransitionNotifier />` 가 라우트 commit 시점을 보고하고, `popstate-view-transition.tsx` 가 자체 엔진으로 처리한다 (Next 의 urgent RESTORE 는 React `<ViewTransition>` 을 우회하므로). 진행 중 전환 도중 도착한 popstate 는 `stopImmediatePropagation()` 으로 Next 의 RESTORE 를 막고 큐(최신 1개 coalesce)에 적재 → 현재 leg 의 `transition.finished` cleanup 에서 drain 해 다음 leg 의 takeover 를 이어 시작한다. 연속 back 시 각 leg 의 애니메이션이 네이티브처럼 차례대로 재생되며, 3 연속 이상은 중간 1개를 collapse 하되 첫·마지막 leg 은 항상 재생. dialog/modal 은 URL 라우트가 아닌 sentinel 기반(`back-stack`)이라 `getBackStackSize() > 0` 검사로 자동 스킵된다 — 별도 modal route matcher 불필요.

### 디렉터리 구조

```
src/
├── app/                         # Next.js App Router (page/layout/route.ts만 default export 유지)
│   ├── _components/             # 보고서 폼/프리뷰/캘린더 등 페이지 전용 컴포넌트 (kebab-case + index.ts 배럴)
│   ├── (app)/                   # 로그인/게스트 보호 영역
│   │   └── _components/         # (app) 그룹 전용 서버/클라 컴포넌트 (예: news-dialog-mount)
│   ├── (auth)/                  # /login, /signup
│   ├── auth/callback/           # Supabase OAuth code exchange
│   ├── api/                     # passkey · 세션(로그인 기기) route handlers
│   ├── layout.tsx
│   └── robots.ts
├── actions/                     # `*.actions.ts` — `'use server'` Server Action (react-query queryFn 이 호출)
├── components/                  # 공용 UI 컴포넌트 (back-stack, news, view-transition 등 하위 디렉터리 + 배럴)
├── constants/                   # `*.constants.ts` 파일로 상수 모음
├── core/                        # fetch 등 인프라 레이어
├── enums/                       # `*.enum.ts` (as const 객체 + `src/types` 의 파생 union 타입 조합)
├── hooks/                       # `use-*.ts` — kebab-case + 네임드 export
├── lib/                         # supabase / webauthn / guest / news — 외부 의존 얇은 래퍼
├── providers/                   # 전역 Provider — query-provider(react-query) + query-keys 팩토리
├── stores/                      # Zustand `use-*-store.ts`
├── styles/                      # globals.css · view-transitions.css 등 글로벌 스타일
├── types/                       # `*.type.ts` + 전역 `.d.ts` (environments / query / react)
├── utils/                       # 범용 헬퍼
└── proxy.ts                     # 미들웨어 (파일명 주의: middleware.ts 아님)
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
- 상태 관리: Zustand (`src/stores/`), 서버 데이터 페칭: `@tanstack/react-query` (SWR 미사용 — 제거됨)
  - `QueryProvider`(`src/providers/query-provider/`)가 root layout 에 마운트된다.
  - 쿼리 키는 `@lukemorales/query-key-factory` 로 `src/providers/query-provider/query-keys/` 에 도메인별로 정의하고 `mergeQueryKeys` 로 합친다. 소비 측은 `import { queries } from '@/providers'` 후 `useQuery(queries.<domain>.<query>(...))`.
  - queryFn 은 `src/actions/*.actions.ts` 의 `'use server'` Server Action 을 호출한다 (예: 공휴일 `queries.holidays.byYear`, 서버시간 `queries.serverTime.now`).
- 토스트는 `react-hot-toast`
