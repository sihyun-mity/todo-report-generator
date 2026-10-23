<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

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
2. **게스트** — `guest-mode` 쿠키(`GUEST_MODE_COOKIE` @ `constants/guest.constants.ts`)만 존재. 보고서 기록은 `localStorage`(`REPORT_HISTORY_STORAGE_KEY` 키)에 저장. Supabase 호출을 건너뛰어 stale refresh token 오류를 회피한다.
3. **비인증** — 위 둘 다 없음. **게스트가 기본값** — 미들웨어가 게스트 쿠키를 심어 게스트로 승격시키고 그대로 통과시킨다 (`/login` 리다이렉트 없음). 첫 방문자는 로그인 페이지를 거치지 않고 바로 보고서 작성 폼을 본다. 로그인은 선택사항으로, 게스트에게는 상단바 로그인 버튼·`GuestLoginBanner`(작성 화면(홈)에서만 노출, dismiss 가능)·사용자 메뉴로만 추천한다. 로그인 페이지는 첫 화면이 아니므로 카드에 홈으로 돌아가는 닫기(X) 버튼이 있다.

`isGuestMode()` 체크는 `useEffect`, 클라이언트 컴포넌트, 데이터 훅 곳곳에 있다. 새 데이터 경로를 만들 때 이 분기를 따라가야 한다.

### Middleware는 `proxy.ts` (not `middleware.ts`)

Next.js 기본 파일명이 아니다. 동작:

- `/api/*`는 무조건 통과 — route handler가 자체 인증. (리다이렉트하면 JSON 대신 HTML이 반환되어 패스키 로그인 등에서 깨진다)
- 게스트 쿠키가 있고 Supabase 세션 쿠키 흔적이 전혀 없으면 `supabase.auth.getUser()` 호출 자체를 건너뛰고 `/settings/*` 같은 `AUTH_ONLY_PATH_PREFIXES`만 `/login`으로 리다이렉트한다 (인증이 필요한 곳이므로 홈이 아니라 로그인 화면).
- `supabase.auth.getUser()` 오류는 삼켜서 비로그인으로 간주 (stale 토큰 허용).
- 비인증(게스트 쿠키도 세션도 없음) + 보호 경로 요청이면 `/login` 리다이렉트 대신 `guest-mode` 쿠키를 request/response 양쪽에 세팅하고 통과시킨다 — 게스트가 기본 진입 상태다.
- 세션 갱신 시 GoTrue가 서버 런타임의 UA/IP로 `auth.sessions`를 덮어쓰지 않도록 `forwardedHeadersOption(request.headers)`로 원래 브라우저 요청 정보를 전달한다.

### Route groups

- `app/(app)/` — 로그인/게스트가 접근 가능한 보호 영역. 공용 `AppTopBar` + 새소식 dialog가 여기 layout에서 마운트된다. 이 그룹 전용 서버 컴포넌트는 `app/(app)/_components/`에 둔다(예: `news-dialog-mount.tsx`).
- `app/(auth)/` — `/login`, `/signup`. 로그인된 사용자가 접근하면 `/`로 리다이렉트.
- `app/auth/callback/route.ts` — Supabase OAuth(예: GitHub) code exchange + 게스트 쿠키 정리. 커밋 가져오기 의도 쿠키(`GITHUB_IMPORT_INTENT_COOKIE`)가 있으면 GitHub provider token 도 받아 둔다(아래 GitHub 커밋 가져오기). `proxy.ts`의 `PUBLIC_PATH_PREFIXES`에 `/auth`가 포함돼 비로그인 상태에서도 통과한다.
- `app/api/` — Passkey 관련 라우트는 `api/auth/passkey/{register,login}/{options,verify}` 구조, passkey CRUD는 `api/passkeys/`. 로그인 기기(세션) 관리는 `api/sessions/`.

### Supabase 클라이언트 세 종류

- `lib/supabase/client.ts` — 브라우저 (anon key)
- `lib/supabase/server.ts` — RSC / route handler (cookie 기반 세션)
- `lib/supabase/admin.ts` — `SUPABASE_SERVICE_ROLE_KEY`. `'server-only'`. RLS 우회 필요시에만.

### WebAuthn (passkey)

- 서버: `lib/webauthn/` — `@simplewebauthn/server`. 챌린지는 iron-session으로 서명된 쿠키에 저장(`challenge-cookie.ts`).
- 클라이언트: `@simplewebauthn/browser`.
- 환경변수 필수: `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGIN`, `WEBAUTHN_CHALLENGE_SECRET` (64자 hex). 모든 env 선언은 `types/environments.d.ts`에 있다.
- 셋업 문서: `docs/passkey-setup.md`, `docs/supabase-setup.md`.

### DB 마이그레이션

`supabase/migrations/*.sql` — RLS 정책 포함. 마이그레이션 추가 시 RLS도 함께 작성한다.

`auth` 스키마(예: `auth.sessions`)는 PostgREST로 노출되지 않으므로, 클라이언트에서 읽거나 변경해야 하면 `public` 스키마에 `SECURITY DEFINER` 함수를 두고 `supabase.rpc()`로 호출한다. 함수 안에서 본인 식별은 `auth.uid()`, 현재 세션 식별은 JWT의 `auth.jwt() ->> 'session_id'`로 한다. `search_path = ''`로 고정하고 모든 객체를 스키마 한정한다. 실행 권한은 `authenticated`에만 부여(`anon`/`public`은 revoke). 로그인 기기 관리(`list_user_sessions` / `revoke_user_session` / `revoke_other_user_sessions`)가 이 패턴을 쓴다.

### 새소식 (News) 대상 체계

`public.news.audience` 컬럼이 소식마다 노출 대상을 지정한다 (`enums/news-audience.enum.ts`).

| 값             | 뜻          | 노출                         |
| -------------- | ----------- | ---------------------------- |
| `all` (기본값) | 모두        | 회원 + 비회원(게스트/비인증) |
| `member`       | 회원 전용   | 로그인 사용자만              |
| `guest`        | 비회원 전용 | 게스트/비인증만              |

- **필터링 책임은 애플리케이션 레이어**(`lib/news.ts`)에 있다. `news` 의 RLS 는 "누구나 읽기"를 유지한다 — 소식 본문은 비밀이 아니라 관련성 문제이고, RLS 로 막으면 게스트 → 로그인 전환 시 게스트가 마지막으로 본 소식(비회원 전용일 수 있음)의 발행 시각을 회원 세션이 조회하지 못해 읽음 상태 이전이 깨진다. **새 조회 경로를 만들면 `newsAudiencesFor(isMember)` 필터를 반드시 함께 건다.**
- `fetchLatestNews` / `fetchAllNews` / `fetchNewsById` 는 모두 `isMember` 를 받는다. 로그인 여부는 `getViewerUserId(supabase)` 로 구한다(게스트/stale token 에서 `auth.getUser()` 가 던질 수 있어 try/catch 내장).
- 대상이 맞지 않는 소식은 `fetchNewsById` 가 `null` 을 돌려주므로 `/whats-new/[id]` 직접 접근도 `notFound()` 로 막힌다.
- 읽음 상태는 기존대로 회원 = `user_news_reads`, 게스트 = localStorage 단일 키(`NEWS_GUEST_STORAGE_KEY`). 다이얼로그는 **조회자 대상 기준 최신 1건**만 검사한다.
- **회원의 읽음 기록은 전부 `markNewsAsReadUpTo` 한 곳을 거친다** — 첫 접속 자동 처리(`NewsDialogMount`) · 다이얼로그 확인(`NewsDialog`) · 게스트→로그인 전환(`migrateGuestNewsLastSeen`, `/auth/callback`). 단건 마크는 _"다이얼로그가 최신 1건만 검사한다"_ 는 구현 세부에 의존해, 대상 분류가 바뀌어 **더 오래된 소식이 최신 자리로 올라오면 이미 지나간 소식이 뒤늦게 뜬다**. 기준 시점 이전 구간 전체를 읽음 처리해 이 결합을 끊는다. 새 읽음 경로를 추가할 때도 단건 upsert 를 쓰지 말 것.
- 게스트는 단일 키라 위와 같은 구간 기록이 불가능하다. 따라서 **이미 발행된 소식의 `audience` 를 나중에 바꾸면 게스트에게 지나간 소식이 다시 뜰 수 있다** (게스트 관점 최신 id 가 뒤로 밀리면 저장된 값과 불일치). 대상은 발행 시점에 확정하고, 부득이하게 바꿔야 하면 게스트 재노출을 감수한다.
- 소식 추가는 Supabase Studio 수동 insert. `audience` 를 지정하지 않으면 `all` 이다.

### 페이지 metadata

모든 `page.tsx`는 `staticMetadata({ title, description })`로 metadata를 정의한다 (`utils/meta.ts`).

- title이 있으면 자동으로 ` | 일일 업무 보고 생성기` suffix가 붙고, 없으면 서비스명 단독.
- 동적 title은 `generateMetadata` 내부에서 동일 utility를 호출 (`app/(app)/whats-new/[id]/page.tsx` 참고).
- 새 page를 추가하면서 `Metadata` 객체를 직접 만들지 말고, 항상 이 utility를 거친다.

### 보고서 데이터 구조 (3단계 계층)

`Project`(대분류) → `Task`(중분류) → `TaskDetail`(소분류) 3단계다 (`types/report.type.ts`).

- 텍스트 출력 형식은 들여쓰기 4칸 단위 — 프로젝트 `    * `, 작업 `        - `(진행률 표기 포함), 세부 항목 `            · `(진행률 없음).
- 프로젝트당 작업은 최소 1개를 유지하지만, **세부 항목은 최소 개수 제약이 없다** (0개 가능).
- 세부 항목은 드래그 정렬 대상이 아니다. 작업을 드래그하면 `details`가 통째로 따라간다.
- 파서(`utils/parser.ts`)는 가운뎃점 계열 불릿(`·ㆍ‧∙`)을 **직전 작업보다 깊게 들여쓰였을 때만** 세부 항목으로 본다. 들여쓰기가 같거나 얕으면 기존처럼 작업으로 파싱해 "가운뎃점 = 작업"으로 쓰던 문서의 하위호환을 지킨다. 그래서 `restoreLineBreaks`의 들여쓰기 보존 규칙(공백 2칸 이상 → 줄바꿈 + 들여쓰기 유지)이 진행률 뒤 분리 규칙보다 **먼저** 돌아야 한다 — 순서가 뒤집히면 불릿 앞 공백이 소비돼 계층 판정이 무너진다.
- `details`는 세부 항목 도입 이전에 저장된 기록에 없다. localStorage / DB 에서 읽어 들이는 지점(`use-report-history-store.ts`)에서 `normalizeProjects`로 형태를 맞춘다. `content`가 JSONB 라 DB 마이그레이션은 필요 없다.

### 보고서 기록 (Report History)

`stores/use-report-history-store.ts`는 모드별로 다른 적재 전략을 쓴다.

- **로그인 사용자**: 월 단위 페이지네이션. `initialize()`에서 ① `report_date` 목록만 lightweight으로 fetch(`allReportDates`), ② 가장 최근 월의 본문을 함께 fetch한 뒤에야 `isLoaded: true`로 set한다. 다른 월은 `loadMonth(year, month)`로 lazy 적재 후 `loadedMonths`에 기록. 동시 호출은 모듈 레벨 `monthFetchPromises` Map으로 합쳐진다. 클라이언트 정렬은 하지 않고 Supabase `.order('report_date', desc)` 결과를 그대로 신뢰한다.
- **게스트**: localStorage에서 한 번에 로드. `MAX_HISTORY_ITEMS` 제한이 있고 `sortGuestByReportDateDesc`로 클라이언트 정렬한다.
- **`addHistory`**: 같은 날짜의 기존 본문과 일치하면 I/O를 건너뛴다(복사 연타 시 무의미한 쓰기 방지). 사용자 모드에서는 upsert 후 해당 월을 직접 refetch — `loadingMonths`를 표시하지 않아 사용자 액션 직후 스켈레톤 깜빡임이 없다.

### GitHub 커밋 가져오기

금일 업무 헤더의 **GitHub에서 가져오기** — 커밋을 불러와 Chrome 온디바이스 AI(Prompt API)로 프로젝트·작업에 분류한다. 설정은 `docs/github-import-setup.md`.

- **로그인 회원 전용이다.** 게스트에게도 버튼은 보이지만 다이얼로그는 로그인 안내만 띄우고 조회·분류를 시작하지 않는다. Server Action 도 `getUser()` 로 회원을 확인한다.
- **로그인용 Supabase GitHub OAuth App 을 그대로 쓴다.** 연결 시 `repo` 스코프로 GitHub OAuth 를 다시 거친다(GitHub 연동돼 있으면 `signInWithOAuth`, 아니면 `linkIdentity`). `/auth/callback` 은 의도 쿠키(`GITHUB_IMPORT_INTENT_COOKIE`, 회원 id + 복귀 경로)가 있을 때만 교환 직후의 `provider_token` 을 받는다. **`redirectTo` 에 쿼리를 붙이지 않는다** — Supabase Redirect URL 허용 목록과 어긋나면 Site URL 로 떨어져 콜백이 아예 돌지 않는다 — Supabase 는 provider token 을 보관·갱신하지 않아 이때뿐이다. 실제 `repo` 스코프가 승인됐고 교환 결과가 같은 회원일 때만 저장한다. 이 흐름에서 OAuth 를 취소·실패해도 세션 쿠키를 지우지 않는다(로그인 실패 처리와 다름).
- **토큰은 DB 에 저장하지 않는다.** iron-session 봉인 httpOnly 쿠키(`github_token`)에 회원 id 와 함께 두고, Server Action(`actions/github.actions.ts`)이 요청 시점에 꺼내 쓴다. 쿠키의 회원 id 가 현재 회원과 다르면 쓰지 않는다. 연결 해제는 쿠키만 지운다(GitHub 쪽 승인을 철회하면 GitHub 로그인까지 다시 승인해야 한다).
- 토큰 권한은 저장소 단위다. "본인 커밋만"은 `author` 필터일 뿐이므로 다른 사람 코드·커밋을 응답에 싣지 않도록 커밋 제목만 내보낸다.
- 분류(`lib/commit-classifier/`)는 브라우저에서만 돈다. Gemini Nano 는 `ko` 를 선언하면 unavailable 이라 `en` 으로 선언하고 한국어를 넣는다.
  - 결정은 **후보별 0-10 점수 + 임계값**으로 한다(저장소→프로젝트 ≥8, 커밋→작업 ≥7). 선택형 enum 하나로 고르게 하면 기존 항목으로 쏠려 "새 작업"을 못 고른다. 프롬프트를 바꾸면 PoC 세트로 다시 검증한다.
  - 모델 호출은 직렬로만 한다(`openPromptSession` 큐). 동시에 돌리면 뒤 요청이 수 분간 멈춘다.
  - 분류 중에는 응답을 `promptStreaming` 으로 받아 "AI가 생각하는 과정"(단계 제목 + 생성 중인 점수·`summary`·`reason`·작업명)을 보여 준다. 스트리밍 JSON 은 `partial-json.ts` 로 키 단위로만 읽는다. 표시를 위해 프롬프트·스키마를 바꾸지 않는다(바꾸면 PoC 재검증 대상). 진행은 단계 목록(`COMMIT_CLASSIFY_STAGE`)으로 보여 준다 — 전체 호출 수는 앞 단계 판정에 따라 달라져 미리 알 수 없어, 진행 중인 단계 안의 개수만 센다.
  - 모델이 `available` 일 때만 AI 를 쓴다. `downloadable` 이면 규칙 분류 결과를 먼저 보여주고, 다운로드는 사용자 클릭(`downloadPromptModel`)으로만 시작한다.
- **보정 메모리**(`lib/commit-classifier/memory.ts`, 회원 id 별 localStorage `COMMIT_IMPORT_MEMORY_STORAGE_KEY:<id>`): 저장소 → 프로젝트명, `저장소#scope` → 작업명, 세부 항목 표기 보정(AI 제안 문구 → 사용자 문구), 새 작업 진행률 보정(제안 값 → 사용자 값, `progressEdits`)을 기억한다. 프로젝트명·작업명은 다음 분류에서 AI 판정보다 먼저 쓰고, 세부 항목·진행률 보정은 프롬프트 예시로 넘긴다.
  - 미리보기 확정 시(`rememberCommitImport`) 한 번, 폼에서 더 고친 뒤 **보고서 저장(복사) 시**(`learnFromSavedReport`) 다시 읽는다. 확정 시에는 분류 결과와 비교해 **사용자가 고친 프로젝트명·작업명만** 기억한다 — AI 판정을 그대로 기억하면 보고서를 저장하지 않고 폼을 비워도 다음 분류·다시 분류가 AI 를 건너뛰고 같은 결과를 되풀이한다. 고치지 않은 판정은 보고서 저장 시 확정된다. 폼 항목 id 와 원래 커밋의 연결(`applyCommitImportPlan` 의 `links`)로 최종 표기를 찾는다.
  - 세부 항목은 **사용자가 실제로 고친 경우만** 배운다(`suggestedDetail` / 링크의 `inserted` 와 비교). AI 가 다시 쓴 문구를 사용자 보정으로 배우면 스스로를 강화한다.
  - 진행률도 같다 — 제안 값(`suggestedProgress` / `progress` 링크의 `inserted`)과 다를 때만 배운다.
  - 이전 기록의 프로젝트명을 저장소 판정 후보로 넣지 않는다 — 이름만으로는 무관한 저장소에도 높은 점수를 줬다. 과거 연결은 확정 메모리로만 잇는다.
  - 작업명 문체는 이전 보고서 작업명을 예시로 넘긴다(문체 참고용 — "그대로 재사용"을 허용하면 예시로 작업을 지어냈다).
- **분류에서 뺄 저장소**(개인 프로젝트 등)는 같은 보정 메모리의 `excludedRepos` 에 둔다. 미리보기의 저장소 칩 "제외"로 빼고 하단 "제외한 저장소" 메뉴에서 해제한다. 제외 목록은 `fetchGithubCommits` 로 넘겨 커밋 조회부터 건너뛴다. 이번 미리보기에서 뺀 저장소를 해제하면 받아 둔 커밋으로 다시 분류만 하고, 조회 때부터 빠져 있던 저장소를 해제하면 다시 조회한다.
- 저장소 → 프로젝트도 작업 판정처럼 **두 번 채점해 둘 다 임계값을 넘을 때만** 연결한다.
- 폼 반영(`applyCommitImportPlan`)은 더하기만 한다 — 새 작업·프로젝트는 뒤에 추가하고, 기존 작업은 진행률을 맞춘다.
- **새 작업 진행률은 커밋 제목으로 가늠한다**(`progressPrompt`, 프로젝트마다 한 번). 커밋 종류(feat/fix 등)·개수로 나누지 않고, 제목에 미완성 신호(WIP·진행 중·1차·초안 등)가 분명할 때만 낮춘다 — 애매하면 100(`COMMIT_IMPORT_DEFAULT_PROGRESS`). AI 가 없거나 판정이 빠지면 100. 기존 작업은 폼에 적힌 진행률을 그대로 둔다. 검증된 이름짓기 프롬프트에 덧붙이지 않고 따로 묻는다.
- **세부 항목은 AI 가 필요하다고 판단한 작업에만 미리 채운다**(`detailSuggestionPrompt`). 커밋은 분류 근거일 뿐 세부 항목과 1:1 이 아니다. 커밋 하나로 새로 만든 작업은 묻지 않고, 개수 상한을 커밋 수로 둔다(상한이 없으면 커밋 하나에서 여러 줄을 지어냈다). 작업명과 겹치는 줄은 버린다. 세부 항목을 거의 안 쓰는 사용자(최근 작업의 10% 미만)이거나 제안을 지운 횟수가 남긴 횟수보다 많으면 더 아끼라고 알린다. 미리보기에서는 폼처럼 세부 항목을 추가·삭제할 수 있고, 작업 반영 여부는 작업 머리줄의 "가져오기" 체크로 고른다.

### Hydration-safe 패턴 (보고서 기록 컴포넌트)

`report-history.tsx` / `report-calendar.tsx`는 SSR 시점에서 `new Date()`로 인한 hydration mismatch를 회피해야 한다.

- **서버 날짜를 prop으로 주입** (`serverDateKey`): "오늘"은 클라이언트 `new Date()`가 아니라 홈 `page.tsx`의 `TodayReportForm`(서버 컴포넌트, `connection()` 이후)이 `kstDateKey()`로 계산한 KST 날짜 키('YYYY-MM-DD')를 `page → ReportForm → ReportHistory → ReportCalendar`로 내려 쓴다. SSR HTML과 클라 첫 렌더가 같은 값을 쓰므로 캘린더 초기 뷰 월과 today 강조가 **첫 페인트부터 실제 현재 월/날짜로 결정적**이다 (과거의 `viewYear=2026, viewMonth=1` 하드코딩 placeholder 점프 제거). `useServerNow`(react-query, 서버시간)는 마운트 후 today 강조를 자기보정하는 보조 수단으로만 쓰고, 미도착(`now===undefined`) 구간엔 `serverDateKey`로 폴백한다.
- **`syncStage` 상태머신** (`'today' → 'records'`): 초기엔 `serverDateKey`의 월(today)로 시작하고, 기록 데이터가 도착하면 렌더 본문 if문에서 **1회성**으로 최신 기록월(오늘 월로 클램프)로 점프한다. SSR 시점엔 store가 비어 `recordMonths`가 0건이라 보정이 돌지 않아 서버 HTML과 일치한다. 기준 "오늘"이 항상 `serverDateKey`라 결정적이므로 별도 `isClient` 가드가 필요 없다. **effect 안에서 setState하지 않는다** — React 19 `react-hooks/set-state-in-effect` 룰을 따라 렌더 본문에서 if문으로 보정한다.
- **prop 변화로 state 리셋**: 월이 바뀔 때 `localPage`를 1로 되돌리는 등은 `pageMonthAnchor` 같은 anchor state + 렌더 중 비교로 처리 (effect 사용 X).
- **로딩 중 레이아웃 유지**: `isLoaded` / `loadingMonths`로 카드 스켈레톤을 렌더해 컴포넌트가 비어 보이지 않도록 한다. 캘린더 월 라벨은 서버 날짜로 첫 렌더부터 확정되므로 `isReady`는 `true`로 고정하고, 기록 도트는 데이터 도착 시 채워진다. 카드 스켈레톤(`HistoryCardSkeleton`)은 실제 카드의 `p-3 + mb-1 + 22px 상단 행 + text-[11px] 2줄 + mt-2 + text-[10px] timestamp` 구조를 그대로 따라가 레이아웃 점프를 막는다.

### Cache Components (`cacheComponents` + `partialPrefetching`)

`next.config.ts`에서 켜져 있다. 라우트는 **정적 셸 + 요청 시점 스트리밍**(PPR)으로 나뉜다. `next build` 결과에서 `○`는 완전 정적, `◐`는 부분 프리렌더다.

- **route segment config 금지**: `dynamic` / `revalidate` / `fetchCache` / `dynamicParams` / `runtime = 'edge'`는 쓰지 않는다. 캐시가 필요하면 `'use cache'` + `cacheLife` / `cacheTag`를 쓴다. 현재 `'use cache'` 사용처는 없고, 세션 쿠키에 의존하는 데이터는 모두 요청 시점에 처리한다.
- **요청 시점 데이터는 `<Suspense>` 안에서만 읽는다**:
  - 대상: `cookies()` / `headers()`(= `createClient()` 서버), `params`, `searchParams`, `useSearchParams()`, 동적 세그먼트의 `usePathname()`.
  - 예: 새소식 목록은 `NewsList`, 상세는 `NewsArticle`로 분리해 감싸고, 로그인의 `?error=`는 `AuthErrorToast`로 격리했다.
  - fallback 스켈레톤은 실제 레이아웃을 따라 만든다.
- **현재 시각·난수는 프리렌더 금지**:
  - 서버 컴포넌트에서 `new Date()` / `Date.now()` / `Math.random()`을 쓰기 전에 `await connection()`을 호출하고 `<Suspense>`로 감싼다. 그렇지 않으면 빌드 시점 값이 셸에 굳는다.
  - 홈 작성 폼(`TodayReportForm` + `ReportFormSkeleton`)과 cron GET이 이 패턴이다.
  - 서버 Supabase 클라이언트(`lib/supabase/server.ts`의 `createClient()`)도 첫 줄에서 `connection()`을 호출한다. auth 가 세션 만료 검사에 `Date.now()`를 쓰는데, `partialPrefetching`의 세션별 셸 프리렌더(쿠키가 주어진 프리렌더)에서는 `cookies()`만으로 프리렌더가 멈추지 않기 때문이다. 로그인 상태의 `next dev`에서만 드러나고 `next build`로는 잡히지 않는다.
- **루트 레이아웃에 fallback 없는 `<Suspense>`로 children 전체를 감싸지 않는다**: 하위의 동적 접근이 빌드 오류 대신 "빈 셸"로 조용히 흡수된다. 필요한 컴포넌트만 좁게 감싼다(예: `BackButtonHandler`).
- **요청 단위 중복 조회는 `React.cache`로 합친다**: 예: `/whats-new/[id]`의 `getVisibleNews`는 `generateMetadata`와 본문이 공유한다.

#### `<Activity>` 라우트 보존 — 이전 페이지는 언마운트되지 않는다

클라이언트 이동 시 이전 라우트는 숨겨진 채(`display: none`) state와 DOM을 유지한다(최근 ~3개). 숨김 시 effect cleanup이 돌고, 다시 보일 때 effect가 **deps와 무관하게 재실행**된다. ref는 유지된다.

- **일시적 UI는 숨김 시 초기화한다** — `useResetOnHide(() => ...)`(`hooks/use-reset-on-hide.ts`, `useLayoutEffect` cleanup):
  - 열린 팝오버·다이얼로그(DatePicker, ReportPreview 크게 보기, ImportModal 등): 열린 채 복귀하면 BackStack에 재등록돼 history가 꼬인다.
  - 지난 시도의 오류 문구, 편집 모드.
  - 비밀번호 입력값.
  - 반대로 작성 중인 초안처럼 보존이 이득인 state는 넣지 않는다.
- **"신호가 올 때 한 번" 하는 DOM 부수효과**(포커스 이동 등)는 `useSignalEffect(signal, fn)`을 쓴다. 그냥 effect로 두면 재방문 때마다 마지막 대상이 다시 포커스된다.
- **effect가 state를 한쪽으로만 바꾸지 않게 한다**: 예: `setVisible(true)`만 하면 재실행 시 내려가지 않는다. 결과를 그대로 반영한다.
- **인증 주체가 바뀌는 이동**(로그인·로그아웃·게스트 시작·가입 완료):
  - `router.push` + `refresh` 대신 `hardNavigate(href, { flash })`(`utils/navigation.ts`)로 문서를 새로 받는다.
  - 그렇지 않으면 숨겨진 페이지에 이전 사용자의 세션 목록·입력값 등이 남는다.
  - 이동 직후 토스트는 `flash`로 넘기면 `ToasterProvider`가 새 문서에서 띄운다.
  - 같은 문서에 머무르는 초기화(게스트 기록 삭제)만 store `reset()` / `resetSession()`을 직접 호출한다.
- **같은 화면이 두 번 DOM에 공존할 수 있다**(예: `/login` ↔ `/signup`). 폼 필드의 DOM `id`는 `useId()`로 만든다.
- 데이터 재조회는 대부분 effect 재실행으로 자연히 이뤄진다. 단, "1회만" 가드(ref/플래그)를 둔 fetch는 재방문 시 갱신되지 않는다는 점을 의도적으로 판단한다.

### 디렉터리 구조

`src/` 없이 프로젝트 루트에 소스를 둔다 (최신 `create-next-app` 기본 구조).

```
./
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
├── components/                  # 공용 UI 컴포넌트 (back-stack, news 등 하위 디렉터리 + 배럴)
├── constants/                   # `*.constants.ts` 파일로 상수 모음
├── core/                        # fetch 등 인프라 레이어
├── enums/                       # `*.enum.ts` (as const 객체 + `types` 의 파생 union 타입 조합)
├── hooks/                       # `use-*.ts` — kebab-case + 네임드 export
├── lib/                         # supabase / webauthn / guest / news — 외부 의존 얇은 래퍼
├── providers/                   # 전역 Provider — query-provider(react-query) + query-keys 팩토리
├── stores/                      # Zustand `use-*-store.ts`
├── styles/                      # globals.css 등 글로벌 스타일
├── types/                       # `*.type.ts` + 전역 `.d.ts` (environments / query)
├── utils/                       # 범용 헬퍼
├── docs/                        # 패스키 / Supabase 셋업 문서
├── public/                      # 정적 파일 (`#/*` alias)
├── supabase/migrations/         # SQL 마이그레이션 + RLS
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
  - 상수 → `constants/<name>.constants.ts`
  - 타입 → `types/<name>.type.ts` (전역 augmentation은 `.d.ts`)
  - 이넘 → `enums/<name>.enum.ts`

### 기타 규약

- Path alias: `@/*` → 프로젝트 루트(`./*`), `#/*` → `public/*`
- React Compiler 활성화 (`next.config.ts` `reactCompiler: true`) — `useMemo`/`useCallback` 과도 사용 지양
- Tailwind CSS v4 는 PostCSS 가 아니라 `@tailwindcss/turbopack` 로더로 처리한다 (`next.config.ts` `turbopack.rules['*.css']`, `postcss.config.*` 없음 — create-next-app 기본 구성)
- Tailwind 테마 토큰은 `@theme inline` 으로 선언한다 (`styles/colors.css` 등). 유틸리티가 `var(--background)` 를 직접 품어 사용 요소에서 해석되므로 `.dark` 등 하위에서 재정의한 변수가 그대로 반영된다. 대신 `--color-*` / `--container-*` 변수는 소스에 그 이름이 그대로 등장할 때만 `:root` 에 출력되니, CSS·JS 에서 직접 참조할 땐 변수명을 문자열로 조합하지 말고 그대로 적는다.
- Vercel 배포 리전: `icn1` (Seoul, `vercel.json`)
- 상태 관리: Zustand (`stores/`), 서버 데이터 페칭: `@tanstack/react-query` (SWR 미사용 — 제거됨)
  - `QueryProvider`(`providers/query-provider/`)가 root layout 에 마운트된다.
  - 쿼리 키는 `@lukemorales/query-key-factory` 로 `providers/query-provider/query-keys/` 에 도메인별로 정의하고 `mergeQueryKeys` 로 합친다. 소비 측은 `import { queries } from '@/providers'` 후 `useQuery(queries.<domain>.<query>(...))`.
  - queryFn 은 `actions/*.actions.ts` 의 `'use server'` Server Action 을 호출한다 (예: 공휴일 `queries.holidays.byYear`, 서버시간 `queries.serverTime.now`).
- 토스트는 `react-hot-toast`
