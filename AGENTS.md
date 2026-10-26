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

- 텍스트 출력 형식은 들여쓰기 4칸 단위 — 프로젝트 `   *`, 작업 `       -`(진행률 표기 포함), 세부 항목 `           ·`(진행률 없음).
- 프로젝트당 작업은 최소 1개를 유지하지만, **세부 항목은 최소 개수 제약이 없다** (0개 가능).
- 세부 항목은 드래그 정렬 대상이 아니다. 작업을 드래그하면 `details`가 통째로 따라간다.
- 파서(`utils/parser.ts`)는 가운뎃점 계열 불릿(`·ㆍ‧∙`)을 **직전 작업보다 깊게 들여쓰였을 때만** 세부 항목으로 본다. 들여쓰기가 같거나 얕으면 기존처럼 작업으로 파싱해 "가운뎃점 = 작업"으로 쓰던 문서의 하위호환을 지킨다. 그래서 `restoreLineBreaks`의 들여쓰기 보존 규칙(공백 2칸 이상 → 줄바꿈 + 들여쓰기 유지)이 진행률 뒤 분리 규칙보다 **먼저** 돌아야 한다 — 순서가 뒤집히면 불릿 앞 공백이 소비돼 계층 판정이 무너진다.
- `details`는 세부 항목 도입 이전에 저장된 기록에 없다. localStorage / DB 에서 읽어 들이는 지점(`use-report-history-store.ts`)에서 `normalizeProjects`로 형태를 맞춘다. `content`가 JSONB 라 DB 마이그레이션은 필요 없다.

### 보고서 기록 (Report History)

`stores/use-report-history-store.ts`는 모드별로 다른 적재 전략을 쓴다.

- **로그인 사용자**: 월 단위 페이지네이션. `initialize()`에서 ① `report_date` 목록만 lightweight으로 fetch(`allReportDates`), ② 가장 최근 월의 본문을 함께 fetch한 뒤에야 `isLoaded: true`로 set한다. 다른 월은 `loadMonth(year, month)`로 lazy 적재 후 `loadedMonths`에 기록. 동시 호출은 모듈 레벨 `monthFetchPromises` Map으로 합쳐진다. 클라이언트 정렬은 하지 않고 Supabase `.order('report_date', desc)` 결과를 그대로 신뢰한다.
- **게스트**: localStorage에서 한 번에 로드. `MAX_HISTORY_ITEMS` 제한이 있고 `sortGuestByReportDateDesc`로 클라이언트 정렬한다.
- **`addHistory`**: 같은 날짜의 기존 본문과 일치하면 I/O를 건너뛴다(복사 연타 시 무의미한 쓰기 방지). 사용자 모드에서는 upsert 후 해당 월을 직접 refetch — `loadingMonths`를 표시하지 않아 사용자 액션 직후 스켈레톤 깜빡임이 없다.

### 에이전트 도구 (WebMCP) · Nano(채팅)

화면의 기능을 **에이전트 도구**로 정의해 두 경로에 함께 노출한다 — ① 브라우저 에이전트용 WebMCP, ② 앱 안 Nano 채팅(Chrome 내장 모델). 서버는 관여하지 않는다 — 도구는 탭 안의 JS 로 store 액션을 직접 호출하고, 지시 해석은 에이전트·모델 몫이다.

- **정의는 한 곳**: 도구는 `AgentTool`(`types/agent-tool.type.ts`, WebMCP 도구 + 채팅 표시용 `title`)로 만들고 `useAgentTools(createTools, enabled)`(`hooks/use-agent-tools.ts`)로 등록한다. 이 훅이 `registerWebMcpTools`(WebMCP)와 `useAgentToolsStore`(채팅이 읽는 레지스트리)에 함께 올리고, `enabled` 가 꺼지거나 화면이 `<Activity>`로 숨겨지면 effect cleanup(`AbortController.abort()` + 레지스트리 해제)으로 둘 다 내린다. 복귀하면 다시 등록된다. 도구는 등록 시점에 한 번 만들어지므로 `execute` 는 `store.getState()` 나 ref 로 최신 값을 읽는다(`useEffectEvent` 함수는 effect 밖 콜백에서 부르면 lint 오류).
- **등록 위치**:
  - 전역 — `useGlobalAgentTools`(`components/agent-chat/`, (app) 레이아웃의 `AgentAssistant` 가 호출): `get_app_context`(경로·회원/비회원·테마·이동 가능 화면) · `navigate`(`AGENT_PAGES` 키 + `news_detail`; `settings*` 는 회원만, `login` 은 비회원만) · `set_theme` · `list_news` · `get_news` · `open_news`(소식 하나를 순서로 집어 상세 화면으로 연다 — "가장 최근 새소식 보여줘". 이런 요청에서는 `list_news`·`get_news` 를 `requires` 로 빼고, 순서는 요청 문장에서 읽는다. 없을 때 목록을 읽고 "새 소식 11가지가 있어요"로 답했다). 보고서 기록 조회 `list_report_dates` · `get_report` · `search_reports` 도 `useHistoryAgentTools`(`hooks/use-report-agent-tools.ts`)로 전역 등록한다 — 작성 중인 폼과 관계없고, 홈에만 두었을 때 새소식 화면의 "지난주 보고서 요약해줘"를 새소식 도구로 대신했다. 홈이 아닌 화면으로 바로 들어오면 기록 store 가 적재 전이라 실행 시 `initialize()` 를 먼저 기다린다.
  - 보고서 작성(홈) — `useReportAgentTools`(`ReportForm` 에서 `isFormReady` 이후): 조회 `get_current_report`, 쓰기 `fill_report`(WebMCP 전용) · 추가 `add_report_tasks` · `add_task_details` · `carry_over_incomplete_tasks` · `copy_today_to_tomorrow`(완료 작업까지 — 반복 업무, `keep_progress`), 작은 수정(`kind: edit`) `set_report_date` · `set_task_progress` · `rename_report_task` · `remove_report_task` · `remove_duplicate_tasks` · `move_report_task` · `rename_report_project` · `remove_report_project` · `move_report_project` · `edit_task_detail` · `remove_task_detail` · `move_task_detail`, 통째로 바꾸기(`kind: replace`) `replace_report_section` · `import_report_text` · `load_report`, `reset_report_form`, `save_report` · `copy_report` · `export_reports`, `open_github_import`. 쓰기 도구는 id 대신 구역(today/tomorrow) + 이름(작업·프로젝트·세부 항목)으로 받는다 — 이름은 정확히 같은 것 → 포함 관계 순으로 찾고(`utils/report-edit.ts`), 서로 다른 후보가 여럿이면 후보를 담은 오류로 다시 부르게 한다.
  - **화면에서 할 수 있는 일은 모두 도구가 있거나 빼는 이유가 있어야 한다** — `constants/agent-tool-coverage.constants.ts`. `REPORT_FORM_ACTION_TOOLS` 는 폼 store 의 모든 동작을 키로 가져 store 에 동작을 추가하면 이 표를 채우기 전까지 `tsc` 가 실패한다. store 밖 화면 기능(버튼·창)은 `REPORT_SCREEN_FEATURE_TOOLS` 에 손으로 넣는다. 표가 가리키는 도구가 실제로 등록됐는지는 개발 모드에서 `useReportAgentTools` 가 콘솔 오류로 알린다. 사고가 날 때마다 도구를 하나씩 덧붙이던 때는 "화면에서는 되는데 Nano는 못 하는 일"이 계속 생겨 비슷한 도구로 대신했다.
  - 도구마다 `kind`(read·add·edit·replace·reset·save·navigate·setting — 채팅의 의도 분류용)와, 필요하면 `surfaces`(노출 경로)를 단다. 여러 구역·날짜·모드를 한 번에 받는 `fill_report` 는 Nano 가 구역을 헷갈리고 필드를 지어내 `surfaces: ['webmcp']` 로 두고, 채팅은 입력이 단순한 `add_report_tasks`(구역 하나에 프로젝트 하나 덧붙이기) · `replace_report_section`(구역 하나 교체)을 쓴다.
  - 작은 모델은 스키마의 모든 필드를 채우는 경향이 있다. `fill_report` 는 기본 `mode` 를 append 로 두고 빈 배열을 "바꾸지 않음"으로 본다 — 실제로 "추가해줘"에 `mode:"replace", tomorrow: []` 를 보내 폼을 지웠다. 폼 hydration 전에 채우면 hydration 이 입력을 덮어쓰므로 `isFormReady` 전에는 등록하지 않는다.
  - 설정 화면 전용 도구는 두지 않는다 — 계정·인증·로그인 수단·데이터 삭제는 노출 대상이 아니고, 작성 알림 켜기는 알림 권한 프롬프트(사용자 제스처)가 필요해서다. 설정은 `navigate` 로 화면까지만 안내한다.
- **새 조회 경로 규칙은 도구에도 적용된다**: 새소식은 `getVisibleNewsList` / `getVisibleNewsDetail`(`actions/news.actions.ts`, `queries.news.*`)이 세션으로 회원 여부를 판단해 `newsAudiencesFor` 필터를 건다. 회원/비회원 분기는 `isGuestMode()` 쿠키를 먼저 보고 Supabase 호출을 건너뛴다.
- **폼 변경은 모두 `applyFormChange` 한 경로를 거친다**(`hooks/use-report-agent-tools.ts`): 바꾼 결과를 먼저 만들어 `diffReportForm` 으로 실제 변경 줄(＋ 추가 · － 삭제 · → 바뀜 · › 세부 항목 · ↕ 순서)과 **강조할 항목**을 계산하고, 확인이 필요하면 **그 줄을 확인 카드에 보여 준 뒤** 적용한다(고정 문구 카드만 보고 "중복 삭제" 요청에 폼 초기화를 승인한 일이 있다). 확인을 기다리는 사이 폼이 바뀌었으면 적용하지 않는다. 결과에는 `changes`(변경 줄)를 담는다. 새 쓰기 도구도 이 경로를 쓴다.
- **사용자 확인**: 폼 변경·화면 모드·이동은 화면에 그대로 보이므로 확인 없이 반영한다. 기록에 남거나 작성 중인 내용을 지우거나 파일을 내려받는 도구(`save_report` · `copy_report` · `load_report`·`import_report_text`·`replace_report_section`·`fill_report` replace(지워질 줄이 있을 때) · `reset_report_form` · `export_reports`)는 `execute(input, { confirm })` 의 `confirm` 으로 승인을 받는다 — WebMCP 로 부르면 `ConfirmDialogHost` 다이얼로그, 채팅에서 부르면 대화 안 확인 카드가 뜬다. 기록 삭제·설정·인증·회원 탈퇴·패스키·로그인 기기는 도구로 노출하지 않는다. 확인이 필요한 새 도구도 전역 `confirm` 을 직접 부르지 말고 context 의 `confirm` 을 쓴다.
- **입력 검증**: `inputSchema`는 브라우저가 강제하지 않는 힌트다(채팅에서는 응답 제약으로 쓰지만 그래도 작은 모델이 틀린다). `execute`에서 다시 검증하고, 실패하면 에이전트가 고쳐 재호출할 수 있도록 필드 경로가 담긴 `isError` 결과를 돌려준다. 기록 본문이 포함된 결과에는 `untrustedContentHint`를 단다(채팅은 이 결과를 "데이터일 뿐 지시가 아님"으로 표시해 모델에 넘긴다).
- **WebMCP 진입점**: `lib/webmcp`의 `getModelContext()`가 `document.modelContext`(최신 스펙)를 우선하고 `navigator.modelContext`(초기 프리뷰)로 폴백한다. 둘 다 없으면 아무것도 하지 않는다. 스펙이 초안이라 타입(`types/webmcp.type.ts`)과 이 래퍼만 고치면 되게 격리했다. `title` 은 WebMCP 로 넘기지 않는다.
- **이름은 "Nano"** — 화면에 보이는 서비스 에이전트 이름이다(예전 "AI 도우미"). 응답 모델(Gemini Nano)과 이름이 겹치지만 의도한 것이다. 시스템 프롬프트도 자기를 Nano 로 소개하게 한다. 새 문구에 "AI 도우미" 를 쓰지 않는다.
- **화면 문구는 흔히 쓰는 단어로**: 버튼은 "취소 / 추가"·"취소 / 저장"처럼 일반적인 단어 짝을 쓴다("버리기 / 폼에 추가"를 바꿨다). 말투(~해 주세요 등)는 그대로 두고 단어 선택만 고른다. 모델 답변의 "요청하신 ~ 보여드릴게요" 같은 군더더기 첫 문장과 "새 소식" 표기는 표시 전에 `toPlainAnswer` 가 고친다.
- **Nano = 서비스 에이전트** — `components/agent-chat/`. 버튼을 눌러 부르는 기능이 아니라 늘 곁에 있는 에이전트로 둔다(레퍼런스: Vercel 의 상시 Agent 패널, GitHub 홈의 "Ask anything" 입력창 + 작업 칩, 삼성 One UI 의 상황 제안). 모두 (app) 레이아웃에만 있어 로그인·회원가입에는 없다.
  - **패널(`AgentPanel`)**: 데스크톱(lg 이상)은 펼치면 오른쪽 400px 열로 붙고 `AgentLayoutShell`((app) 레이아웃 바깥 틀)이 같은 너비(`lg:pr-[400px]`)만큼 상단바·본문을 민다 — 두 값은 함께 바꾼다. **접으면 자리를 완전히 비우고** 상단바의 입력 모양 진입점(`AgentChatButton` — "Nano에게 부탁하기 · 추천 N · ⌘K", GitHub·Vercel 상단 검색창처럼)과 제안 알약이 진입점이 된다. 처음에는 56px 레일로 남겼지만 열 대부분이 비어 본문 폭만 깎아서 바꿨다. 펼침 여부는 localStorage(`AGENT_PANEL_STORAGE_KEY`)에 기억하고, 고른 적이 없으면 1440px 이상에서만 펼친다(1024~1440px 에서 펼치면 폼·미리보기 두 열이 너무 좁다). 홈의 두 열은 화면 너비(lg)가 아니라 본문 폭으로 나눈다 — 홈 `main` 이 `@container` 이고 `ReportForm`·스켈레톤·`MobileCopyBar`·미리보기 크게 보기 버튼이 `@min-[60rem]` 을 함께 쓴다(값은 같이 바꾼다). 그래서 패널을 펼쳐 본문이 좁아지면 lg 이상에서도 모바일처럼 한 열로 쌓이고 하단 복사 바가 패널 너비만큼 비켜 뜬다. SSR·첫 렌더는 접은 상태로 맞추고 마운트 뒤 `restore()` 로 정한다. 모바일(lg 미만)은 전체 화면 시트로 열고(상단바 아이콘 버튼(추천이 있으면 점)·⌘K·홈 입력창·제안 알약), 폼이 가려지므로 `ReportLivePreview` 를 위에 둔다. 비모달이라 배경을 깔지 않고 모바일 시트만 Esc·back(`useDismissOnBack`)·X 로 닫는다(back-stack 은 라우트가 바뀌면 비워지므로 `navigate` 뒤의 back 은 이전 화면으로 간다).
  - **헤더 높이를 맞춘다**: 상단바(`AppTopBar`)와 패널 헤더는 모두 `h-14`(테두리 포함 56px) + 아래 테두리라 데스크톱에서 두 줄이 한 줄로 이어진다. 한쪽 높이를 바꾸면 다른 쪽도 바꾼다.
  - **상황 제안(`useAgentSuggestions`)**: 지금 화면(`AgentPathTracker` 가 store 에 넣는 경로)·폼 상태·시각을 보고 다음 할 일을 고르는 규칙 엔진 — 모델을 쓰지 않아 AI 가 없는 브라우저에서도 동작하고, AI 가 필요한 제안만 `needsAi` 로 거른다. 지금 레지스트리에 도구가 있는 일만 권한다. 보고서 화면: 오늘 업무가 비었으면 **GitHub 가져오기(맨 앞·무지개 강조, 게스트에게도 — 열면 로그인 안내)**, 미완료 작업이 있고 익일이 비었으면 옮기기, 오늘 한 일 적어서 보고서 쓰기(AI, 입력칸으로 데려간다), 이 날짜를 저장하지 않았으면 저장, 금요일 이번 주 정리·월요일 지난주 요약(AI). 새소식 목록·상세: 요약(AI). 폼에 같은 프로젝트 안 같은 작업이 둘 이상이면 중복 작업 정리. 설정: 작성 알림. 밤(19~6시)에 라이트 모드면 다크 모드. 실행하거나 넘긴 제안은 이번 세션에서 다시 권하지 않는다(`dismissed`). AI 에게 묻는 제안·빠른 작업(`prompt` + `fresh`)은 앞 대화와 관계없는 독립 요청이라 **새 대화로 시작한다** — 앞 대화를 넘기면 지난 요청·폼 상태가 섞였다. 폼에 넣지 않은 초안이 남아 있으면 화면 대화는 두고 모델에 넘기는 기록만 새로 시작한다. 홈 입력창처럼 사용자가 직접 쓴 글은 이어 간다. 시각은 `useSyncExternalStore`(서버 스냅샷 null)로 읽는다 — 패널·알약이 서버에서도 렌더되므로 렌더 중 `new Date()`·`Math.random()` 은 Cache Components 규칙에 걸린다.
  - **빠른 작업**: 지금 화면에서 바로 할 수 있는 일을 칩으로 — **GitHub에서 가져오기가 늘 첫 번째·무지개 강조**(가장 많이 쓰는 기능, 한 번 누르면 조회·분류까지). 무지개 빛(`rainbow-glow`)은 바깥으로 약 20px 번지므로(blur 10px) `overflow` 가 있는 줄 안에 두면 경계에서 사각형으로 잘린다 — 홈 입력창은 칩을 줄바꿈하고, 가로 스크롤이 필요한 줄(패널 입력칸 위)은 `glow="ring"` 으로 번지는 층을 끄고 테두리만 남긴다, 미완료 → 내일·저장·이번 주 정리(AI)·기록 내보내기·보고서 작성으로·새소식·화면 모드. 도구 칩은 **모델 없이 도구를 바로 실행**한다(`runTool` — 채팅 도구와 같은 context 라 확인 카드·변경 카드·되돌리기가 따라오고, 결과는 대화 기록에 도구 턴으로 남아 모델도 안다).
  - **제안 알약(`AgentSuggestionPill`)**: 어느 화면에서나 가장 앞선 제안 하나를 화면 아래 알약으로 띄운다(One UI 식). 데스크톱 패널을 펼쳐 두어도 띄운다(패널 안 제안 줄은 눈에 잘 띄지 않는다는 피드백) — 펼친 패널(400px)을 비켜 본문 가운데에 둔다. 모바일 시트는 화면을 덮으므로 열려 있으면 숨기고, 같은 제안이 `AGENT_SUGGESTION_PILL_DELAY_MS` 유지된 뒤에 띄운다(상태가 출렁일 때마다 떴다 사라지지 않게). 모바일은 하단 복사 바 위에 둔다. 토스트(`ToasterProvider`)는 알약을 하단 차단 요소(`AGENT_SUGGESTION_PILL_ID`)로 보고 그 위로 비켜 뜬다 — 하단에 고정 요소를 새로 두면 `BOTTOM_BLOCKING_SELECTORS` 에 함께 넣는다. 도구 제안은 Nano를 열지 않고 실행(도구 토스트로 알림)하고, AI 에게 묻는 제안만 Nano를 연다. 알약 전체가 실행 영역이다 — 실행 버튼을 알약 전체에 깔고(`absolute inset-0`) 글은 클릭을 통과시키며 얹고, 넘기기(X)는 그 안에 따로 올린다(버튼 안에 버튼을 넣을 수 없어서). 잘 안 보인다는 피드백으로 "Nano 추천" 머리줄·색 아이콘을 두고, 나타날 때(제안이 바뀔 때마다 key 로 다시) 바깥으로 퍼지는 링 뒤 은은한 파란 빛(`animate-agent-pill-glow`)이 이어진다(빛은 어긋남 없이 사방 같은 굵기로 — 아래로 치우친 그림자를 함께 숨쉬게 하면 아래 테두리만 굵어 보였다. `animate-*` 둘을 붙이면 뒤의 것이 덮으므로 `animation` 한 값으로 함께 돌린다). 테두리는 흐림 배경(`backdrop-blur`)과 같은 요소에 두고 글줄 높이를 정수로 고정한다 — 흐림 배경은 따로 합성되는 층이라, 테두리를 바깥 요소에 두고 높이가 소수점(65.5px)이면 그 층이 반 픽셀 반올림되며 테두리 한쪽을 덮었다 — GitHub 강조 제안은 무지개 빛이 그 역할을 한다.
  - **홈 입력창(`AgentComposer`)**: 보고서 작성 화면 맨 위(헤더 아래)의 입력창 하나 + 빠른 작업 칩. 보내면 `useAgentChatStore.submit({ type: 'prompt' })` 으로 Nano에 넘기고 Nano를 연다(`AgentAssistant` 가 store 를 구독해 처리). AI 를 쓸 수 없으면 입력 없이 칩만 남는다.
  - **입력 상자(`AgentInputBox`)**: 패널·홈 입력창이 같이 쓴다. 상자 하나 안에 글 영역(위)과 도구 줄(아래: 한 줄 안내 `hint` · 마이크 · 보내기/멈추기)을 둔다 — 버튼을 글 영역 옆에 세우면 여러 줄일 때 높이가 어긋나고 안내 문구가 두 줄로 꺾였다. 안내 문구(placeholder)는 한 줄로 짧게, 예시·단축키는 `hint` 로 뺀다. 안내 줄은 입력칸의 `label`(보조기술에는 숨김)이고 버튼 사이 빈 곳까지 채워, 눌러도 입력칸으로 포커스가 간다. 홈에서는 빠른 작업 칩을 상자 밖 아래에 둔다.
  - **대화 목록은 맨 아래를 보고 있을 때만 새 내용을 따라간다**(`useFollowScroll` @ `hooks/use-follow-scroll.ts`, GitHub 가져오기의 AI 생각 로그와 같은 훅). 위로 올리면 따라가기를 멈추고 맨 아래로 가는 버튼을 띄우며, 새 요청(사용자 메시지)을 보내면 다시 따라간다. 따라가기는 내용 요소의 ResizeObserver 에서 해 스트리밍 답변·생각 과정 펼침도 따라간다.
  - **가로로 넘치는 칩 줄은 `useGrabSlide`(`hooks/use-grab-slide.ts`)로 마우스 끌기 스크롤을 붙인다**(패널 입력칸 위 칩 줄). next-app-boilerplate 의 훅과 같은 구현이다 — 10px 넘게 끌었다 놓으면 직후 자식 클릭을 막아 칩이 실행되지 않고, 터치는 기본 스크롤을 쓴다. 반환값의 `ref` 를 객체째(`x.ref`) 쓰면 React Compiler 린트(`react-hooks/refs`)가 객체 전체를 ref 로 보므로 구조 분해해 쓴다.
  - **Nano로 넘어갈 때 눈을 끈다**(`useAgentChatStore.attention` · `reveal({ attention })` · `attend()`): 패널이 열리거나 펼쳐질 때마다 테두리가 안쪽에서 빛나고(`animate-agent-attention-edge`), 입력이 필요하면(⌘K·상단바 진입점·"오늘 한 일 적어서" 제안) 입력 상자에 링이 퍼지며 포커스가 간다(`attention: 'input'`). 작업을 시작하는 할 일(홈 입력창·AI 제안)은 패널만 강조한다(`'panel'`). 사용자가 눌러야 진행되는 **후속 동작**(승인 대기 확인 카드·폼에 넣지 않은 초안)은 그 카드로 스크롤해 링을 띄우고(`'message'`), 입력칸 위에 무엇을 해야 하는지 고정 안내 줄("보고서 저장 — 위 카드에서 저장 또는 취소를 눌러 주세요 · 보기")을 둔다. 패널을 접었거나 시트를 닫아 후속 동작이 가려지면 상단바 진입점("확인 필요 N")·모바일 버튼 점(주황)·처리 중 안내("Nano가 확인을 기다리고 있어요 · 보기")·실행이 끝난 뒤의 하단 알약("확인할 일이 N개 있어요")이 알리고, 누르면 `showFollowUp()` 으로 그 카드로 데려간다(`followUpCount`/`followUpId` 는 `AgentAssistant` 가 대화에서 계산해 store 에 넣는다). 효과는 장식 요소를 nonce 로 다시 그려 재생한다 — 입력칸·카드 자체를 key 로 다시 그리지 않는다(포커스·상태가 사라진다).
  - AI 를 쓸 수 없을 때(`AgentAvailabilityNotice`)는 패널을 막지 않는 작은 안내만 둔다 — 제안·빠른 작업은 그대로 쓰고, 채팅 입력만 막는다. 가용성은 패널이 늘 보이므로 마운트 때 확인해 store(`availability`)에 둔다.
  - 이동·열기 도구(`kind: navigate` — 화면 이동, GitHub 가져오기 창 열기)가 채팅에서 성공하면 모델 답변을 기다리지 않고 도구가 돌려준 `message` 로 끝낸다 — 답변을 만드는 동안 본문이 잠겨 막 연 창을 바로 쓸 수 없었다.
  - 레이아웃째 숨겨지면(`/login` 등으로 이동) `useResetOnHide` 로 진행 중인 응답을 멈추고 모바일 시트를 닫는다(`hide()` — 사용자가 닫은 게 아니므로 데스크톱 펼침 설정은 그대로). 패널을 닫으면 응답 대기 중인 확인 카드는 취소로 본다. 확인이 필요해지면 패널이 닫혀 있어도 연다.
  - **처리 중에 다른 요청을 시도하면 무시하지 않고 알린다**(`useAgentChatStore.notifyBusy`): Nano는 요청을 한 번에 하나만 처리한다. 처리 중에 입력창 보내기(Enter·보내기 버튼)·빠른 작업 칩·상황 제안·예시·되돌리기·초안 "추가"를 누르면 토스트(`AGENT_BUSY_TOAST_ID`, 연타해도 하나)로 알리고, 확인 카드가 승인을 기다리는 중이면(`awaitingConfirm`) 그 카드로, 아니면 처리 과정이 보이는 패널로 데려간다. 그래서 이 버튼들은 `disabled` 대신 `aria-disabled` + 흐리게만 둔다 — `disabled` 면 클릭이 오지 않아 아무 반응이 없었다. 보내지 못한 입력 글은 지우지 않고, 실행하지 못한 제안은 넘긴 것(`dismissed`)으로 치지 않는다. 새 요청 진입점도 처리 중이면 조용히 `return` 하지 말고 이 함수를 부른다.
  - **폼을 바꾸는 요청을 처리하는 동안만 본문 조작을 막는다**(`AgentBusyGuard`, (app) 레이아웃에서 `PasskeyRegisterBanner`·`children` 을 감싼다): 의도 분류가 폼을 바꾸는 종류(`add`·`edit`·`replace`·`reset`)로 정해지면 `runAgentChatTurn` 이 `onFormLock` 을 불러 `useAgentChatStore.formLocked` 를 켜고, 요청이 끝나면 끈다. 조회·요약("지난주 보고서 요약해줘")·대화·저장·이동·화면 모드는 작성 중인 폼과 관계가 없어 잠그지 않는다 — 모든 응답에 잠그던 때는 기다리는 동안 보고서를 쓸 수 없었다. 잠그는 이유: 도구는 실행 시점의 store 를 읽고 덧붙이기는 함수형 업데이트라 입력이 섞이지는 않지만, 모델이 판단에 쓴 폼 스냅샷은 몇 초 전 것이라 교체 도구가 그사이 사용자가 고친 내용을 덮을 수 있다. 잠긴 동안 `inert` + 흐리게 + 상단 안내. 상단바·채팅 패널(멈추기·확인 카드)은 바깥이라 그대로 쓴다. WebMCP(외부 에이전트) 호출과 제안·빠른 작업의 도구 바로 실행은 잠그지 않는다(확인 대기 중 폼이 바뀌면 `applyFormChange` 가 적용하지 않는다).
  - **강조 대상**(`diffReportForm` 의 `changedIds` — `ProjectItem`·`TaskItem`·`TaskDetailItem`·날짜가 자기 id 로 `animate-agent-flash`): 새 작업·진행률이 바뀐 작업·새 이름의 프로젝트, 넣거나 고친 세부 항목 줄(부모 작업도), 순서를 옮긴 작업·프로젝트, 작업이 지워진 프로젝트(지운 줄은 강조할 수 없어 어디서 지웠는지 — 같은 프로젝트에 바뀐 작업이 이미 강조되면 빼서 이름 고치기·중복 정리에 프로젝트까지 빛나지 않게), 날짜. 순서만 바뀌면 순서 비교로 옮긴 항목을 고르지만 맞바꾼 둘은 가를 수 없어, 옮기기 도구는 `applyFormChange` 의 `moved` 로 옮긴 항목 id 를 넘긴다(되돌리기 강조도 같다). 강조를 받는 새 항목 종류를 만들면 그 컴포넌트에도 `useAgentHighlightStore` 를 단다.
  - **변경 카드·되돌리기·바뀐 칸 강조**: 폼을 바꾸는 도구는 `beginFormChange(context)` → 변경 → `finish()` 로 감싼다. 바꾸기 전후 폼 상태를 `diffReportForm`(`utils/report-diff.ts`, 프로젝트명+작업 내용으로 견준다 — 교체 도구는 id 를 새로 만들어 id 로 견주면 전부 바뀐 것처럼 보인다)으로 비교해 ① 바뀐 작업·새 프로젝트·날짜를 `useAgentHighlightStore.flash` 로 잠깐 강조하고(`animate-agent-flash`, WebMCP 로 불러도) ② `context.reportChange` 로 줄("＋ 익일 · QA · 회귀 테스트 0%")과 되돌리기를 넘긴다. 채팅은 도구 실행 줄 아래 변경 카드로 보여 준다. 되돌리기는 **바꾼 뒤 그대로일 때만** 한다(그사이 사용자가 고쳤으면 덮어쓰지 않고 "이후 내용이 바뀌어 되돌릴 수 없어요"). 되돌리면 모델도 알 수 있게 대화 기록에 남긴다. 화면 모드(`set_theme`)도 같은 방식으로 되돌린다. 강조는 `key` 로 다시 그리지 않는다 — 입력칸이 다시 마운트돼 포커스를 잃는다. 새 쓰기 도구도 이 래퍼를 거친다.
  - **입력창은 하나 — 부탁과 업무 메모를 Nano가 가른다**: 따로 "메모 모드"를 두지 않는다(보내기 전에 사용자가 종류를 고르게 하지 않는다). ① 규칙(`looksLikeWorkNotes` @ `lib/prompt-api/notes-to-report.ts`)이 분명한 메모 — 여러 줄이거나 25자 이상이고 부탁 표현(줘·주세요·알려·보여·열어·물음표 등)이 없는 글 — 를 모델 없이 바로 메모 정리로 보내고, ② 그 밖에는 채팅 의도 분류에 `work_notes` 의도를 더해(보고서 작성 화면에서만) 모델이 메모라고 고르면 `runAgentChatTurn` 이 `route: 'notes'` 를 돌려 메모 정리로 넘긴다. 부탁 표현이 있는 글은 `work_notes` 를 후보에서 아예 뺀다(`hasRequestExpression`) — 앞 대화가 메모 위주면 모델이 "지난주 보고서 요약해줘"까지 메모로 골랐다. 잘못 메모로 가도 초안 카드만 뜨고 폼은 바뀌지 않는다. **메모 정리**(`structureNotes`)는 한 번의 구조화 출력으로 금일·익일 → 프로젝트 → 작업·진행률 초안을 만들어 초안 카드로 보여 준다. 폼에 이미 있는 프로젝트명을 후보로 넘겨 같은 프로젝트로 묶게 한다. 초안 카드의 "추가"(취소는 "취소")는 레지스트리의 `fill_report`(append)를 채팅 context 로 실행한다 — 그래서 변경 카드·되돌리기·강조가 그대로 따라온다(`fill_report` 는 채팅 모델에는 숨겨져 있어도 앱은 부를 수 있다).
  - **음성 입력**(`useSpeechInput`): 채팅·메모 입력에 받아쓴다(ko-KR). 기기 안 인식(`processLocally`)을 우선하고, 언어 팩이 없으면 클릭 안에서 `install()` 을 시도한다. 그래도 안 되면 브라우저 음성 인식 서비스(Chrome 은 Google 서버)로 보내야 하므로 처음 한 번 알리고 동의를 받는다(`AGENT_VOICE_CLOUD_CONSENT_KEY`) — "AI 대화는 이 기기 안에서만" 이라는 안내와 어긋나지 않게.
  - **⌘K / Ctrl+K**(`AgentAssistant` 의 document keydown, 한글 조합 중 제외): 데스크톱은 패널을 펼치고 입력칸으로 포커스(`reveal()` → `focusSignal`), 모바일은 시트를 열고 닫는다.
  - 사용 예시(`AGENT_CHAT_EXAMPLES`)는 AI 를 쓸 수 있을 때만, **지금 등록된 도구로 할 수 있는 것만** 무작위로 4개 보여 준다("다른 예시"로 다시 섞기). 대화 중에는 입력칸 위 한 줄에 상황 제안·빠른 작업 칩을 둔다. 도구를 추가하면 예시·빠른 작업·제안 규칙에 넣을지 함께 판단한다.
- **응답 모델 = Chrome 내장 Prompt API(Gemini Nano)** — `lib/prompt-api/`(커밋 분류와 공용):
  - `getPromptApiAvailability` 가 `available` 일 때만 대화를 연다. 미지원(`unavailable`)·미설치(`downloadable`/`downloading`)는 패널 안에서 안내하고, 다운로드는 버튼 클릭(`downloadPromptModel`)으로만 시작한다. `ko` 선언 시 unavailable 이라 `en` 으로 선언하고 한국어를 넣는다(`PROMPT_API_OPTIONS`). 선언은 지원 여부·다운로드 판정용이고 모델이 보는 프롬프트에는 영향이 없다(스펙 설명서).
  - **모델이 읽는 글은 영어, 사용자가 보는 글은 한국어**(커밋 분류 프롬프트와 같은 방식): 시스템 프롬프트·의도 라벨·단계 지시문·도구 `description`/스키마 설명은 영어로 쓰고, 사용자 입력·도구 결과의 데이터·답변(해요체로 지시)·도구 `title`·토스트·확인 카드·`toolError` 문구는 한국어로 둔다. 근거: 공식 지원 언어가 en·ja·es·de·fr 이고, 같은 요청 12개 × 2회 A/B 에서 영어 지시문이 의도·도구 24/24(한국어 23/24)에 약 10% 빨랐으며, 같은 내용이면 한국어가 토큰을 약 20% 더 쓴다. 영어 지시문으로도 한국어 답변은 자연스러웠다. 이름·작업 문구는 사용자 표현 그대로 넣으라고 지시한다.
  - `search_reports` 는 기간 표현("지난주"·"이번 달"·"보고서" 등, `QUERY_STOP_WORDS_REGEX`)을 검색어로 보지 않고, 검색어로 0건이면 기간 전체를 안내(`note`)와 함께 돌려준다 — 모델이 기간을 검색어로 넣고 "검색어를 빼고 다시 부르라"는 힌트를 무시한 채 같은 호출을 되풀이했다.
  - **개수는 도구가 미리 센다**: `search_reports`·`get_report`·`get_current_report` 결과 맨 앞(결과가 길면 뒤가 잘린다)에 `counts` 문장(프로젝트·작업·100% 완료 수)을 둔다. 여러 날은 같은 작업(프로젝트+내용)을 한 번만 센 수와 날짜별로 센 건수를 함께 준다(`periodCounts`). 답변 지시에 "직접 세지 말고 counts 를 쓰고, 업무·작업을 물으면 작업 수"를 적었다 — "지난주에 한 업무 몇 가지?"에 날짜 수를 답하고 작업 대신 프로젝트를 늘어놓았다. `list_report_dates` 도 `total`·월별 개수(`byMonth`)를 준다.
  - **조회 결과는 모델이 계산하거나 지어낼 일이 없게 준다**: 요일(`10/19(월)`)·저장 시각(`savedAt`)을 데이터로 넣는다 — 없을 때 2026-10-19 월요일을 "(화)"로 지어냈다. `search_reports` 는 프로젝트·작업을 JSON 객체로 넘기지 않고 ① `tasks`(기간 안 금일 작업별로 며칠 했는지·첫날~마지막 날·진행률 변화, `taskTimeline`) ② `days`(날짜마다 한 줄, `compactDay`)로 준다 — 객체로 넘기면 글자 대부분이 키 이름이라 한 주만 넘어도 채팅에 넘기는 결과(`AGENT_CHAT_TOOL_RESULT_MAX_CHARS`)가 잘려 뒤 날짜가 빠졌다. 요약 답변은 `tasks` 를 먼저 쓰게 지시한다. 결과에 없는 것은 추측하지 말고 없다고 답하게 한다.
  - **사용자 데이터를 묻는 말은 대화 의도라도 조회한다**: 묻는 말(`QUESTION_REQUEST`)에 보고서·기록·작업 등(`DATA_QUESTION`)이 있고 사용법을 묻는 말(`HOW_TO_QUESTION`)이 아니면 `chat` 으로 분류돼도 `read` 로 돌린다 — 도구 없이 답하면 기록을 지어낸다. 사용법 질문은 대화 답변에 넘기는 앱 안내(`APP_GUIDE` — 화면 위치·회원/게스트 저장 방식·GitHub 가져오기·설정 항목)로만 답하게 한다. 화면 기능이 바뀌면 이 안내도 함께 고친다.
  - **묻는 말은 조회로 돌린다**: `read_reports` 설명에 개수·질문 표현을 넣고, 앞 질문을 다듬는 말("프로젝트 말고 작업 단위로 세줘")은 앞 요청과 같은 의도로 고르게 했다. 그래도 쓰기 의도로 분류돼 ② 가 `cannot_do` 를 고르면, 요청이 묻는 말(`QUESTION_REQUEST`)일 때 거절하지 않고 조회(`read`) 후보로 한 번 더 고른다 — "내일 할 업무는 몇가지야?"가 "처리할 기능이 없어요"로 끝났다.
  - **앞 대화와 관계없는 요청은 새 대화로 시작한다**: 앞 대화가 있으면 ① 의도 분류에서 `follow_up`(앞 대화를 잇는지)을 의도보다 먼저 함께 고른다. `false` 면 모델에 넘기는 기록을 이번 요청만 남기고 `onFreshStart` 로 화면의 앞 대화도 비운다(생각 과정에 "새 대화로 시작했어요"). 처리하지 않은 후속 동작(초안·확인 카드)이 있으면 화면은 두고 기록만 새로 시작한다(`startFresh` 와 같은 규칙). 잘못 지우면 되묻기·후속 요청이 끊기므로, 직전 답이 질문(`?`)으로 끝났거나 잇는 말(`FOLLOW_UP_REQUEST` — 그거·방금·말고·다시·응 등)이 있으면 모델이 `false` 라고 해도 지우지 않는다.
  - Chrome 155 에서 확인한 Prompt API 상태: 컨텍스트 창 9,216 토큰(`contextWindow`·`measureContextUsage()`, 예전 `inputQuota`/`measureInputUsage` 는 없음). `create({ tools })` 는 오류 없이 **무시**된다 — 도구를 부르지 않고 "바꿨어요"라고 지어냈다. 그래서 도구 호출은 구조화 출력 루프로 직접 돌린다(네이티브 도구 사용이 나오면 다시 검토). `samplingMode`(예측 가능한 쪽으로 고정)는 오리진 트라이얼(Chrome 148~)이라 토큰 없이는 반영되지 않는다.
  - 모델 호출은 **탭 전체에서 직렬**이다(`withModelLock`) — 세션이 달라도(커밋 분류 중 채팅) 동시에 돌리면 뒤 요청이 수 분간 멈춘다. 도구 실행·확인 대기는 락 밖에서 한다.
  - 루프(`runAgentChatTurn`), 모든 단계가 `responseConstraint` 구조화 출력이다: ① 요청 **의도**(`chat`·(보고서 화면에서) `work_notes`·`read_reports`·`add_to_report`·`edit_report`(작은 수정)·`rewrite_report`(통째로 바꾸기)·`clear_report`·`save_or_export`·`go_to_screen`·`change_theme`·`unsupported`)를 고르고 ② 그 의도의 `kind` 도구 + 조회 도구만 후보로 `{ next: enum }` 을 고르고 ③ 도구면 **그 도구의 `inputSchema`(+`additionalProperties: false`)를 응답 제약으로** 입력을 만들어 실행하고 결과를 대화 기록에 붙인다. 대화 의도면 도구 없이 답한다. 도구 목록은 매 단계 레지스트리에서 다시 읽는다(이동하면 바뀐다).
    - **다른 화면에서 받은 보고서 요청은 홈으로 옮겨 가서 마친다**: 폼을 바꾸거나 저장하는 의도(`HOME_KINDS`)인데 지금 화면에 그 종류의 도구가 없으면(설정·새소식 등 — 보고서 도구는 홈에만 등록된다) `navigate`(home)를 스스로 실행하고, 보고서 도구가 등록될 때까지(`AGENT_CHAT_TOOL_WAIT_MS`) 기다린 뒤 이어 간다. 답변 앞에 "보고서 작성 화면으로 옮겨 와서 처리했어요."를 붙인다. 예전에는 "이 화면에서는 처리하지 못했어요"로 끝났다. 처리하는 사이 사용자가 홈을 벗어나 보고서 도구가 내려가도 단계마다 같은 방법으로 돌아와 마친다.
    - **생각 과정을 보여 준다**(`onThinking` → 대화의 `thinking` 항목, `ThinkingTrace`): 요청 이해(고른 의도) → 할 일(고른 도구·되묻기·멈춤) → 도구 입력(생성 중인 JSON 끝부분을 스트리밍으로, 끝나면 한국어 요약 "구역 익일 · 작업 회귀 테스트") → 답 쓰기. 처리 중에는 펼치고 끝나면 "Nano가 생각한 과정 · N단계"로 접는다. 패널 맨 아래 진행 줄은 지금 단계 이름을 보여 준다. 응답이 몇 초씩 걸려 기다리는 게 지루하다는 피드백.
    - **모델을 다른 작업과 나눠 쓰면 알린다**: `withModelLock(run, owner)` 가 주인(`chat`·`notes`·`commit-import`)별 대기·실행 수를 세고, 채팅은 다른 주인이 쓰고 있으면 생각 과정에 "GitHub 커밋 분류와 AI를 번갈아 쓰고 있어 조금 느릴 수 있어요"를 띄운다. 커밋 분류는 호출을 하나씩 기다리며 넣어 큐에 늘 한 건만 있으므로 채팅은 그 한 건만 기다리고 이후 번갈아 돈다(멈추지는 않지만 둘 다 느려진다). 모델 호출을 새로 만들면 반드시 `withModelLock` 에 주인을 달아 거친다.
    - **할 수 없으면 멈춘다**: ① 에는 이 화면의 도구 제목 목록("What the app can do here")과 `unsupported` 의도를, ② 에는 늘 `cannot_do` 를 둔다. 고르면 아무것도 실행하지 않고 정해진 문구로 답한다. 단 의도가 `unsupported` 면 바로 거절하지 않고 전체 도구(`'any'`)에서 한 번 더 고르게 한다("중복 작업 삭제해줘"를 할 수 없는 일로 고른 적이 있다) — 그래도 못 찾으면 거절한다. 선택지가 도구 이름뿐이던 때는 맞는 도구가 없으면 가장 비슷한 도구로 대신했다("중복 작업 삭제해줘" → 폼 초기화). 또 큰 동작은 요청 문장에 그 뜻이 있어야 실행한다(`KIND_GUARDS` — 초기화는 "초기화·전부·비워" 등이 없으면 `edit` 후보로 다시 고른다). 화면 모드 의도도 요청에 "모드·다크·라이트·밝게" 등(`THEME_REQUEST`)이 없으면 분류를 믿지 않고 전체 도구(`'any'`)에서 다시 고른다 — "가장 최근 새소식 보여줘"를 화면 모드로 분류해 남은 조회 후보로 엉뚱하게 답했다. 화면 이동 의도도 요청에 옮기거나 열어 달라는 말(`NAVIGATE_REQUEST` — 이동·가줘·열어·보여·화면 등)이 없으면 믿지 않고 묻는 말이면 조회로, 아니면 전체 도구에서 다시 고른다 — "가장 최근 소식 알고싶어"에 새소식 화면으로 옮겨 갔다. 작은 수정(`edit`) 후보에는 조회 도구 대신 구역 다시 쓰기(`replace_report_section`)를 마지막 수단으로 두고, 지워질 줄을 보여 주며 확인을 받는다.
    - **요청에 그 대상이 있어야 후보로 둔다**(`AgentTool.requires`): 세부 항목 도구는 "세부·하위·아래에", 미완료 가져오기는 "미완료·진행 중", 금일 전체 복사는 "오늘 한 업무·전부·그대로·반복·똑같이"가 요청에 있을 때만 후보다(새소식 상세 화면에서 "지금·이 소식·보고 있는"처럼 보고 있는 소식을 가리키면 목록 조회를 뺀다 — 남겨 두면 "지금 보고 있는 새소식 요약해줘"에 최근 소식 여럿을 요약했다. "다음 소식 열어줘"처럼 목록이 있어야 하는 요청까지 막지 않게, 목록을 가리키는 말이 함께 있으면 둔다)(복사 뒤 "진행률도 똑같이"는 수정으로 분류돼 수정 의도에도 둔다). 요청에 "프로젝트"만 있고 "작업·업무"가 없으면 작업 단위 삭제·옮기기는 빼고, 프로젝트 도구는 "프로젝트"가 있을 때만 후보다 — "프로젝트는 삭제해줘"에 작업을 지웠다. 덧붙이기는 그 구역의 다른 프로젝트에 이미 있는 작업만 들어오면 거부한다("API 연동 추가해줘"에 지금 폼의 작업을 베껴 넣었다). 실제 Nano 로 "토큰 로그인 작업 삭제해줘"에 그 아래 세부 항목을 지웠고, "이 작업 내일로 옮겨줘"에 금일 전체를 복사했다. 반대로 의도가 갈라지기 쉬운 도구는 `extraKinds` 로 다른 의도에도 둔다(작업·프로젝트 옮기기는 추가로 분류돼도 후보 — 대신 "옮겨·이동·순서"가 있어야 한다. 없으면 "내일 할 일에도 넣어줘"에 복사 대신 옮겼다).
    - 쓰기 도구가 모두 실패하거나 **바꾼 게 없으면**(`"changed":false`) 모델에 맡기지 않고 도구의 `message` 로 답한다 — "이미 100%" 결과에도 "바꿨어요"라고 답했다. 그래서 변경 없음 `message` 는 다음에 할 일까지 적는다(예: 다른 구역에 같은 작업이 있으면 그 section 으로 다시 부르라고).
    - **되묻기(`ask_user`)**: ② 에는 늘 `ask_user` 를 둔다 — 요청에 필요한 정보가 대화에도 지금 상태에도 없으면 한 줄 질문으로 되묻고 `route: 'question'` 으로 끝낸다(패널은 입력칸으로 포커스). 사용자의 다음 메시지가 그 답이다 — ① 의도 분류에 "방금 질문했으면 원래 요청으로, '다시 해줘'면 앞 요청으로 분류하라"고 적어 이어지게 한다. 되묻기가 없을 때는 빈 곳을 지어내 요청 문장을 작업명으로 넣었다.
    - **가장 맞는 도구가 대상을 찾지 못하면 대신하지 않고 대안을 묻는다**(`AgentTool.unavailable`): 의도가 정해진 뒤 후보 도구의 `unavailable(request, scope)` 가 `{ reason, offer }` 를 돌려주면 모델을 거치지 않고 "못 한 이유 + 대안 질문"으로 답하고 `route: 'question'` 으로 끝낸다. 사용자가 받아들이면 다음 요청이 그 대안으로 이어진다. 보고 있던 새소식을 요약해 달라고 한 뒤 화면을 벗어나자 `list_news` 로 대신해 목록 전체를 요약했다 — 이제 "방금 보신 'OO' 소식으로 할까요?"(마지막으로 본 소식이 있을 때) 또는 "대신 최근 새소식을 살펴볼까요?"로 묻는다. 대신할 도구는 `requires` 로 후보에서 빼 둔다. 실행해 봐야 아는 경우는 도구가 `toolUnavailable({ reason, offer })`(`lib/webmcp`)를 돌려주면 루프가 같은 방식으로 되묻는다 — 비회원의 설정 화면 요청("로그인 화면으로 갈까요?" — 오류에 "로그인하도록 안내하세요"를 적었더니 바로 로그인 화면으로 옮겼다), 볼 수 없는 새소식, 기록이 없는 날짜(가까운 저장 날짜 셋을 권한다). 대상이 없어 다른 일로 대신할 수 있는 새 도구도 `toolError` 대신 이것을 쓴다.
    - **지금 상황을 처음부터 안다**(`useAgentSituation` @ `components/agent-chat/`, `RunOptions.getSituation`): 요청마다 한 번 화면(이름·보고 있는 소식 제목)·회원/게스트·화면 모드·작성 중인 보고서 요약(날짜, 구역별 프로젝트·작업·완료 수)·저장 기록 수와 처음/마지막 날짜·볼 수 있는 새소식 수와 최신 제목·마지막으로 본 소식을 모아 **모든 단계 프롬프트**("Situation now")에 넣는다. 의도 분류에는 앱 안내(`APP_GUIDE`)도 함께 넘긴다. 예전에는 도구를 불러야 알아서 첫 단계가 화면·회원 여부·기록 유무를 모른 채 골랐다. 컨텍스트 창이 작아 개수·이름만 담고 본문은 도구로 읽는다. 회원 여부는 기록 store 의 `mode`(게스트 쿠키면 Supabase 를 부르지 않는다)로, 새소식 목록은 `AGENT_SITUATION_NEWS_STALE_MS` 동안 다시 받지 않는다. 화면 기능·데이터가 늘면 여기에 짧게 더한다.
    - **원하는 것과 대상을 먼저 풀어 쓰고 고른다**: 의도 분류의 구조화 출력에 `wants`(원하는 것)·`about`(가리키는 대상 — "그거·그날·그 작업"을 대화와 `talkingAbout` 으로 푼 이름)을 `intent` 앞에 영어 몇 단어로 쓰게 한다 — 낱말 하나("보여줘")에 끌려 엉뚱한 의도를 고르지 않게. 둘 다 다음 단계(도구 고르기·입력·되묻기)에 "The user wants: / It is about:"로 넘기고, `about` 은 대화 대상(`focus.subject`)으로 기억한다. 의도 분류에는 도구 제목만이 아니라 제목 + 설명 첫 문장(`capabilityCatalog`)을 넘긴다 — 제목만 넘기던 때는 Nano가 자기가 무엇을 할 수 있는지 몰랐다. 앱 안내(`APP_GUIDE`)에는 요청을 읽는 법(알려줘 = 채팅으로 답, 보여줘·열어줘 = 화면에서 열기, 그거 = 앞에서 다룬 것, 다시 = 앞 요청 다시)도 적었다.
    - **"다시 시도해"는 앞 요청을 다시 처리한다**(`RETRY_REQUEST`): 그 문장 그대로 쓰면 요청 문장으로 후보를 거르는 규칙(`requires`·의도 가드)이 모든 도구를 빼 "처리할 기능이 없어요"로 끝났다. 앞 요청 문장을 이번 요청으로 삼아 분류·후보·도구 context 에 쓴다(대화 기록에는 그대로 남는다).
    - **답변은 앞 대화도 근거로 쓴다**: 가장 새 도구 결과를 먼저 쓰되, 앞 대화·결과는 후속 질문("실패 사유는?", "방금 뭐 했어?")의 근거다. 이번 요청에서 도구가 실패했으면 짧게 이유를 말한다. "이번 요청 뒤의 결과로만 답하라"고 막았더니 대화를 묻는 말에 엉뚱하게 답해 멍청해 보였다 — 답변을 이렇게 좁히지 않는다(앞 답을 그대로 베끼지 말라고만 한다).
    - **답한 뒤 다음 할 일을 권한다**(`AgentTool.followUp` → `AgentChatTurnResult.followUp`): 조회 도구가 답변 아래 버튼(`AgentQuickAction`)과 한 줄 질문(`ask`, 답변 끝에 붙는다)을 정한다 — `list_news` 는 "'OO' 소식을 자세히 보시겠어요?" + 가장 최근 소식 열기·새소식 목록, `get_news` 는 화면에서 열기, `get_report` 는 폼으로 불러오기. 폼을 바꾼 답변 뒤에는 저장 버튼을 둔다. 지금 등록되지 않은 도구의 버튼은 뺀다. `ask` 로 물었으면 바로 다음 메시지가 받아들이는 말(`ACCEPT_OFFER` — 응·네·보여줘·그거 보여줘 등)일 때 모델 없이 첫 버튼을 실행한다. 조회로 끝나 "그거 보여줘"를 다시 말해야 했고, 그 말에 본문을 다시 읽어 늘어놓았다. 버튼(`runTool`)으로 화면을 옮기거나 할 수 없으면 그 안내도 대화에 보여 준다. 새 조회 도구에는 자연스러운 다음 할 일이 있으면 `followUp` 을 단다.
    - **대화에서 다루고 있는 대상을 기억한다**(`useAgentChatStore.focus`, `AgentFocus`): 소식(id·제목)·저장 보고서 날짜·작업(구역·프로젝트·작업명)·이번 요청이 가리킨 대상(`subject`)과 가장 최근에 다룬 종류(`latest`)를 남기고, 지금 상황의 `talkingAbout` 으로 넘겨 다음 요청의 "그거·그날·그 작업"을 실제 대상으로 풀게 한다. 도구를 실행할 때마다 `focusAfterTool` 이 정한다 — 도구의 `focus`(새소식 도구들), 없으면 입력의 `task`/`new_text`·`project`·`section`·`date` 와 넣은 줄. 무엇을 다뤘는지 모르는 도구(화면 모드·기간 검색 등)면 `latest` 를 비운다. 채팅·답변 뒤 버튼(`runTool`)·초안 추가 모두 거치고, 새 대화면 비운다. 새소식은 `latest` 가 소식일 때 "그거/이 소식 + 보여줘·열어줘"를 `open_news` 로 연다. `get_news` 는 모델이 지어낸 id 로 못 찾으면 요청의 순서·보고 있는 소식·대화에서 다룬 소식으로 찾는다("가장 최근 새소식 알려줘"가 매번 실패했다). 대상을 다루는 새 도구는 입력 키를 위 이름으로 두거나 `focus` 를 단다.
    - **요청 범위(`AgentRequestScope`)**: `runAgentChatTurn` 은 시작할 때의 경로를 `scope.path` 로 잡아 `inputContext(scope)`·`requires(request, scope)`·`unavailable` 에 넘긴다 — 모델을 기다리는 사이 화면을 옮겨도 "지금 보고 있는 것"은 요청할 때 보던 것이다. 화면을 가리키는 새 도구도 `window.location` 대신 `scope.path` 를 쓴다(이동 직후 상태가 필요한 `navigate` 의 지금 경로만 예외). 마지막으로 연 새소식은 `useAgentChatStore.lastNewsId` 에 남고(`AgentPathTracker`), AI 를 쓸 수 있으면 그 소식을 미리 받아 두어 `get_news` 상태에 제목과 함께 넘긴다.
    - **지금 상태(`AgentTool.inputContext`)**: ②·③ 프롬프트에 후보 도구들이 주는 상태를 **모두 합쳐** 넣는다(같은 함수는 한 번 — 보고서 쓰기 도구는 작성 중인 폼과 중복 작업 목록, `set_theme` 은 지금 모드, `get_news` 는 보고 있는 소식 id, `navigate` 는 지금 경로). 상태를 넘기면 그 상태를 읽기만 하는 조회 도구(`stateReader` — `get_current_report`)는 후보에서 뺀다. **대화 기록의 쓰기 도구 결과는 결과 원문(그때의 폼 전체) 대신 변경 줄(`AgentChatTurn.changes`)만** 넘기고, 이번 요청 전의 조회 결과에는 "예전 결과일 수 있음"을 붙인다 — 예전 폼 스냅샷이 지금 상태와 섞여 오래된 내용을 근거로 골랐다. 사용자가 **멈춘 요청은 대화 기록에서 뺀다**(메시지는 흐리게 "중단됨") — 남겨 두면 다음 요청 때 답하지 않은 앞 요청까지 이어서 처리했다. 이미 실행된 변경은 변경 카드의 되돌리기로 돌린다 — "오늘 한 업무"처럼 화면 내용을 가리키는 요청을 실제 값으로 채우게. 화면 내용을 받아 쓰는 새 쓰기 도구에도 단다.
    - **작업 하나를 고치는 도구를 따로 둔다**(`set_task_progress` · `remove_report_task` · `remove_duplicate_tasks`, 의도 `edit_report`). 없을 때 "진행률도 똑같이 해줘"에 덧붙이기로 같은 작업이 둘이 됐고, "중복 작업 삭제해줘"를 `clear_report` 로 골라 폼 전체를 초기화했다. `clear_report` 설명에 "폼 전체일 때만"을 적고, 덧붙이기(`appendProjects`)는 같은 프로젝트의 같은 내용 작업을 새로 넣지 않고 그 작업을 고친다(진행률은 0 이 아닐 때만). 작업 이름은 정확히 같은 것 → 포함 관계 순으로 찾고, 서로 다른 작업이 여럿 걸리면 후보를 담은 오류로 다시 부르게 한다. 지울 대상을 콕 집은 삭제라 확인 없이 하고 변경 카드의 되돌리기로 돌린다.
    - 쓰기 도구가 오류 없이 아무것도 바꾸지 않았으면(`"changed":false`) 루프를 끝내지 않고 다른 도구를 고르게 한다(예: 옮길 미완료 업무가 없으면 `copy_today_to_tomorrow`).
    - 실제 Nano 로 확인한 실패와 대응: 전체 도구에서 고르면 의도(교체)는 맞혀도 비슷한 도구(덧붙이기)를 골라 → 의도로 후보를 좁힌다. 실행할 요청인데 첫 단계에 `answer` 를 허용하면 실행 없이 "바꿨다"고 답해 → 첫 단계에서는 `answer` 를 뺀다. 쓰기 도구가 성공한 뒤에도 고르게 하면 시키지 않은 변경을 이어 골라 → 쓰기가 하나 성공하면 루프를 끝낸다(요청 하나에 변경 하나). 같은 호출을 되풀이하면 끊는다. 의도 라벨이 `replace`·`setting` 처럼 짧으면 "다크 모드로 바꿔줘"를 "바꾸기"로 골라 날짜를 바꿨다 → 라벨에 대상을 붙이고(`edit_report`·`change_theme`) 설명에 한국어 표현을 함께 적는다.
    - 답변: 실패·취소·미실행은 모델에 맡기지 않고 정해진 문구로 답한다("실패 또는 취소"를 알려 줘도 "바꿨어요"라고 답했다). **쓰기 요청의 답변도 모델에 맡기지 않는다** — 도구가 알린 실제 변경 줄(`reportChange`)을 문장으로 옮긴다(`writeAnswer`: 뺀 줄·넣은 줄이 짝이면 "옮겼어요"/"고쳤어요"로 묶고, 조사는 받침에 맞추고, 3문장 넘으면 "그 밖에 N건"). 도구 이름만 넘기던 때 폼이 초기화됐는데 "중복만 지웠어요"라고 했고, 변경 줄을 넘겨도 "생일 작업을 삭제했습니다"처럼 없는 말을 지어내거나 앞 요청의 변경까지 다시 말했다. 변경 줄을 그대로 옮기므로 요청과 다르게 바뀌었으면 답에서 바로 드러난다. 모델 답변은 조회·대화에만 쓴다. 변경 카드(`diffReportForm`)는 같은 작업이 여럿이어도 순서대로 짝지어 견준다(하나로 덮으면 중복 추가가 "0% → 100%" 로 보였다). 그 밖에는 `promptStreaming` 으로 받되, 할 수 있는 일 목록은 대화 의도일 때만 넘긴다(늘 넘기면 묻지 않아도 늘어놓았다). 마크다운 강조·코드 표기·이모지·습관적인 "안녕하세요"는 표시 전에 걷어 낸다(`toPlainAnswer`). 프롬프트마다 오늘 날짜와 이번 주 범위를 넣어 "지난달"·"이번 주"를 기간으로 바꾸게 한다.
  - 질문마다 시스템 프롬프트만 든 세션을 clone 해 쓰고, 문맥은 매번 대화 기록으로 넘긴다. **대화 기록은 고정 개수가 아니라 남은 컨텍스트에 맞춘다**: 프롬프트를 `measureContextUsage(prompt, { responseConstraint })` 로 재서 `contextWindow − contextUsage(시스템 프롬프트) − 응답 여유분(AGENT_CHAT_OUTPUT_RESERVE_TOKENS: 구조화 768 / 답변 1,024)` 안에 들어가도록 가장 오래된 턴부터 뺀다(빼야 할 개수는 이분 탐색 — 재기 호출이 log n 번). 이번 요청(마지막 사용자 턴부터)은 빼지 않고, 그것만으로도 넘치면 도구 결과를 `AGENT_CHAT_TOOL_RESULT_MAX_CHARS`(6,000자)에서 `MIN`(400자)까지 반씩 줄인다. 앞부분을 뺀 적이 있으면(`onContextTrim`) 패널에 "앞부분은 AI가 더 기억하지 못해요" 안내를 띄운다. `measureContextUsage` 가 없는 브라우저만 `AGENT_CHAT_FALLBACK_HISTORY_TURNS` 로 자른다. 그래도 넘치면(`QuotaExceededError`) "새 대화" 안내로 알린다.
  - 프롬프트·도구 설명·`kind` 를 바꾸면 Chrome(모델 `available`)에서 회귀 시나리오를 돌린다 — 개발 모드에서 `await window.__nanoEval({ runs: 3 })`(`lib/prompt-api/agent-eval.ts`, 특정 시나리오만은 `only: ['중복']`). 시나리오마다 폼을 정해 두고 턴별로 실행해야 할·하면 안 되는 도구와 마지막 폼을 검사하며, 확인은 모두 승인하고 끝나면 되돌린다. 실제로 틀렸던 대화는 시나리오로 남긴다. 그 밖에 대표 요청을 다시 돌려 본다 — 인사/사용법, 작업 추가(금일·익일), 구역 교체(확인 카드), 날짜 변경, 이번 주·지난달 기록 정리, 작성 중 보고서 요약, 화면 모드, 새소식, 화면 이동. 요청 하나에 15~30초 걸린다(모델 호출 3~5회). 결과가 실행마다 흔들리므로 여러 번 돌린다.
- **DOM 경로도 유지한다**: WebMCP 를 모르는 에이전트·보조기술을 위해 폼 입력칸·버튼은 "금일 프로젝트 1 작업 2 진행률(%)" 같은 위치 기반 `aria-label`을 갖는다. 접두어는 `ProjectList → ProjectItem → TaskItem → TaskDetailItem`으로 `label` prop 을 내려 만든다.
- **로컬 검증**: Chrome 을 `--enable-features=WebMCPTesting`(또는 `chrome://flags/#enable-webmcp-testing`)으로 띄우고, `chrome-devtools-mcp --categoryExperimentalWebmcp=true`의 `list_webmcp_tools` / `execute_webmcp_tool`로 호출한다.
- **실사용자 노출 = 오리진 트라이얼**: 기본 설정의 Chrome 에는 `document.modelContext`가 없다. `ORIGIN_TRIAL_TOKENS`(쉼표 구분, `types/environments.d.ts`)를 설정하면 `next.config.ts`의 `headers()`가 모든 응답에 `Origin-Trial` 헤더를 실어 방문자 브라우저에서 API 가 켜진다. 토큰이 없으면 헤더를 싣지 않는다.
  - Chrome 트라이얼(`WebMCP`)은 데스크톱 Chrome 149~162 대상이다(2026-09 연장). Edge 는 별도 트라이얼이라 토큰을 따로 받아 함께 넣는다.
  - 토큰은 등록한 origin 에만 유효하다(프리뷰 배포 도메인에서는 무시됨). `headers()`는 빌드 시점에 평가되므로 토큰을 바꾸면 재배포해야 한다.
  - 트라이얼이 끝나기 전에 Chrome Platform Status(feature `5117755740913664`)에서 연장·정식 출시 여부를 확인한다.

### GitHub 커밋 가져오기

금일 업무 헤더의 **GitHub에서 가져오기** — 커밋을 불러와 Chrome 온디바이스 AI(Prompt API)로 프로젝트·작업에 분류한다. 설정은 `docs/github-import-setup.md`.

- **로그인 회원 전용이다.** 게스트에게도 버튼은 보이지만 다이얼로그는 로그인 안내만 띄우고 조회·분류를 시작하지 않는다. Server Action 도 `getUser()` 로 회원을 확인한다.
- **로그인용 Supabase GitHub OAuth App 을 그대로 쓴다.** 연결 시 `repo` 스코프로 GitHub OAuth 를 다시 거친다(GitHub 연동돼 있으면 `signInWithOAuth`, 아니면 `linkIdentity`). `/auth/callback` 은 의도 쿠키(`GITHUB_IMPORT_INTENT_COOKIE`, 회원 id + 복귀 경로)가 있을 때만 교환 직후의 `provider_token` 을 받는다. **`redirectTo` 에 쿼리를 붙이지 않는다** — Supabase Redirect URL 허용 목록과 어긋나면 Site URL 로 떨어져 콜백이 아예 돌지 않는다 — Supabase 는 provider token 을 보관·갱신하지 않아 이때뿐이다. 실제 `repo` 스코프가 승인됐고 교환 결과가 같은 회원일 때만 저장한다. 이 흐름에서 OAuth 를 취소·실패해도 세션 쿠키를 지우지 않는다(로그인 실패 처리와 다름).
- **토큰은 DB 에 저장하지 않는다.** iron-session 봉인 httpOnly 쿠키(`github_token`)에 회원 id 와 함께 두고, Server Action(`actions/github.actions.ts`)이 요청 시점에 꺼내 쓴다. 커밋 조회에 성공할 때마다 다시 봉인해 만료(`GITHUB_TOKEN_TTL_SECONDS`, 30일)를 새로 센다 — 연결 여부 확인만으로는 늘리지 않는다. 쿠키의 회원 id 가 현재 회원과 다르면 쓰지 않는다. 연결 해제는 쿠키만 지운다(GitHub 쪽 승인을 철회하면 GitHub 로그인까지 다시 승인해야 한다).
- **조회 범위는 보고서 날짜 기준이다**(`commitImportRange` @ `utils/commit-import.ts`). 시작은 그 날짜 직전 보고서의 작성(저장) 시각 — **보고서 날짜 자신의 기록은 기준에서 뺀다**. 오늘 보고서를 한 번 저장한 뒤 다시 가져와도(임시 저장처럼 나눠 가져오기) 저장 전처럼 직전 보고서 이후 커밋을 모두 받고, 이미 넣은 작업은 아래 "이미 등록한 작업 알아보기"가 해제해 둔다. 지난 날짜 보고서는 그 날짜가 끝나는 시각까지만 조회하고, 직전 보고서가 그보다 늦게 저장됐으면(몰아 쓰기) 직전 보고서 날짜 다음 날 0시부터 본다. 서버는 범위 끝에서 `GITHUB_COMMITS_MAX_LOOKBACK_DAYS`(7일) 까지만 조회하고, 분류할 커밋은 최근 `GITHUB_COMMITS_CLASSIFY_LIMIT` 건만 남긴다(AI 호출이 커밋 묶음 수에 비례하고 이름짓기 프롬프트가 길어져서). 잘렸는지(`clipped`)·뺀 개수(`omitted`)를 돌려주면 미리보기 요약 아래 안내 한 줄로 알리고, 빠진 커밋이 이전 날짜에 있을 수 있으면 보고서 날짜를 그날로 바꿔 가져오라고 덧붙인다. 그 밖의 상한·오류로 다 찾아보지 못한 곳(`reposCapped` 저장소 20개 상한, `pageCapped` 한 페이지 100건, `repoGaps` 저장소별 SSO·권한·없음·activity 실패/초과·브랜치 상한)도 돌려줘 안내 줄과 "다 찾아보지 못한 저장소" 목록(`GithubRepoGaps`)으로 알린다 — **조회를 조용히 줄이는 상한·건너뛰기를 새로 만들면 여기로 알린다.** 커밋이 0건이어도 빠진 곳이 있으면 "없다"고 단정하지 않는다("찾은 커밋이 없어요"). activity `time_period` 는 지금부터 거슬러 세는 창이라 범위 끝이 아니라 시작이 들어가는 창을 고른다.
- 토큰 권한은 저장소 단위다. "본인 커밋만"은 `author` 필터일 뿐이므로 다른 사람 코드·커밋을 응답에 싣지 않도록 커밋 제목만 내보낸다.
- **추가 작성자**(하단 "작성자 추가", 보정 메모리 `commitAuthors`): 연결한 계정 외에 GitHub 사용자 이름·이메일을 최대 `GITHUB_COMMIT_EXTRA_AUTHORS_LIMIT`(5)개 더 넣으면 같은 저장소 범위에서 그 작성자 커밋도 `author` 필터로 함께 가져온다 — 커밋 작성 이메일이 계정에 연결돼 있지 않은 경우(예: GitLab 에서 옮겨 온 저장소)용. 이메일 작성자는 push 주체를 알 수 없어 activity API 를 쓰지 않고, login 작성자들과 연결한 계정이 push 한 브랜치·기본 브랜치에서 찾는다. 값 검증(`normalizeCommitAuthor` @ `utils/commit-author.ts`)은 클라이언트와 Server Action 이 같이 쓴다. 바꾸면 다시 조회·분류한다.
  - 메뉴를 열면 자동완성 후보(`fetchGithubCommitAuthors`)를 불러온다 — 같은 저장소 범위(제외 저장소 빼고)의 최근 `GITHUB_COMMIT_AUTHOR_LOOKBACK_DAYS`(30일) 기본 브랜치 커밋 작성자. 저장소마다 커밋 목록 한 번만 조회한다. GitHub 계정과 연결된 커밋은 login, 아니면 작성 이메일로 모은다. 후보에는 작성자 식별값·이름·커밋 수·저장소만 싣고 커밋 내용은 싣지 않는다 — 다른 사람의 이메일이 보이는 것은 저장소 접근 권한으로 이미 볼 수 있는 정보라 허용한다.
- 분류(`lib/commit-classifier/`)는 브라우저에서만 돈다. Gemini Nano 는 `ko` 를 선언하면 unavailable 이라 `en` 으로 선언하고 한국어를 넣는다.
  - 결정은 **후보별 0-10 점수 + 임계값**으로 한다(저장소→프로젝트 ≥8, 커밋→작업 ≥7). 선택형 enum 하나로 고르게 하면 기존 항목으로 쏠려 "새 작업"을 못 고른다. 프롬프트를 바꾸면 PoC 세트로 다시 검증한다.
  - 모델 호출은 직렬로만 한다(`openPromptSession` 큐). 동시에 돌리면 뒤 요청이 수 분간 멈춘다. 큐는 분류(세션)마다 따로라, 다시 분류하기 전에 **이전 분류를 취소한다** — 분류 쿼리의 react-query `signal` 을 `classifyCommits` → `openPromptSession` 까지 넘겨 두면 키가 바뀌거나(작성자·제외 목록 변경으로 다시 조회) 같은 키로 refetch 할 때 진행 중인 응답을 끊고 남은 호출을 버린다. 중단은 `safeAsk` 에서 던져 "판정 없음"으로 삼키지 않고, 중단 뒤에는 진행 표시 콜백을 부르지 않는다.
  - 분류 중에는 응답을 `promptStreaming` 으로 받아 "AI가 생각하는 과정"(단계 제목 + 생성 중인 점수·`summary`·`reason`·작업명)을 보여 준다 단계는 다시 분류할 때까지 모두 남기고, 대화창 높이를 넘으면 로그 안에서 스크롤한다. 맨 아래를 보고 있을 때만 새 내용을 따라가고, 위로 올리면 따라가기를 멈추고 맨 아래로 가는 아이콘 버튼을 띄운다. 스트리밍 JSON 은 `partial-json.ts` 로 키 단위로만 읽는다. 표시를 위해 프롬프트·스키마를 바꾸지 않는다(바꾸면 PoC 재검증 대상). 진행은 단계 목록(`COMMIT_CLASSIFY_STAGE`)으로 보여 준다 — 전체 호출 수는 앞 단계 판정에 따라 달라져 미리 알 수 없어, 진행 중인 단계 안의 개수만 센다.
  - 모델이 `available` 일 때만 AI 를 쓴다. 다운로드는 사용자 클릭(`downloadPromptModel`)으로만 시작한다.
  - AI 를 쓸 수 없으면(모델 미설치 `downloadable`/`downloading`, 미지원 브라우저 `unavailable`) 커밋 조회 뒤 **분류 시작 전에 한 번** 안내한다(`AiUnavailableNotice`) — 모델 받고 AI 로 분류할지, 저장소 기준(규칙) 분류로 계속할지 고르게 한다. 확인한 상태는 기기 localStorage(`COMMIT_IMPORT_AI_NOTICE_STORAGE_KEY`)에 남겨 같은 상태로는 다시 묻지 않는다(상태가 바뀌면 다시 안내). 이후 규칙 분류 미리보기의 안내 줄과 "AI 모델 받고 다시 분류" 버튼은 그대로 둔다.
- **보정 메모리**(`lib/commit-classifier/memory.ts`, Supabase `commit_import_memories` 회원당 한 행 JSONB, 본인 행만 RLS): 저장소 → 프로젝트명, `저장소#scope` → 작업명, 세부 항목 표기 보정(AI 제안 문구 → 사용자 문구), 새 작업 진행률 보정(제안 값 → 사용자 값, `progressEdits`)을 기억한다. 프로젝트명은 다음 분류에서 AI 판정보다 먼저 쓰고, 세부 항목·진행률 보정은 프롬프트 예시로 넘긴다.
  - 작업명은 바로 쓰지 않고 **AI 로 확인한 커밋에만** 쓴다 — scope 는 기능 영역 단위로 넓게 쓰이기도 해(`store` 아래 서로 다른 작업 여럿) 그대로 쓰면 무관한 커밋이 지난 작업명으로 묶였다. 기억한 작업명을 후보 하나로 두고 기존 작업 판정과 같은 `taskScorePrompt` 로 묶음 채점 → 커밋마다 재채점해 둘 다 `COMMIT_IMPORT_REMEMBERED_TASK_AI_SCORE`(8) 이상인 커밋만 그 이름으로 보내고, 나머지는 평소 판정(기존 작업 채점·새 작업 이름짓기)으로 넘긴다. AI 를 쓸 수 없으면 기억대로 둔다.
    - 작업 연결(7)보다 높게 둔다 — 후보가 기억한 작업 하나뿐이라 같은 영역이면 7-8 점을 쉽게 줬다. PoC(react-user-web 실제 커밋, 같은 작업 12·같은 영역 다른 작업 12건, 각 4회를 두 번 채점 쌍으로): 같은 작업은 모두 8-10, 다른 작업 오통과는 7 에서 5/24 → 8 에서 3/24. 같은 작업 최저점이 8 이라 여유가 없어 프롬프트를 바꾸면 다시 검증한다. 같은 영역의 인접 작업(예: 로그인 기기 정보 버그 ↔ 구앱 토큰 로그인 종료)은 8 에서도 붙는다 — 미리보기에서 고친다.
  - 미리보기 확정 시(`rememberCommitImport`) 한 번, 폼에서 더 고친 뒤 **보고서 저장(복사) 시**(`learnFromSavedReport`) 다시 읽는다. 확정 시에는 분류 결과와 비교해 **사용자가 고친 프로젝트명·작업명만** 기억한다 — AI 판정을 그대로 기억하면 보고서를 저장하지 않고 폼을 비워도 다음 분류·다시 분류가 AI 를 건너뛰고 같은 결과를 되풀이한다. 고치지 않은 판정은 보고서 저장 시 확정된다. 폼 항목 id 와 원래 커밋의 연결(`applyCommitImportPlan` 의 `links`)로 최종 표기를 찾는다.
  - 세부 항목은 **사용자가 실제로 고친 경우만** 배운다(`suggestedDetail` / 링크의 `inserted` 와 비교). AI 가 다시 쓴 문구를 사용자 보정으로 배우면 스스로를 강화한다.
  - 진행률도 같다 — 제안 값(`suggestedProgress` / `progress` 링크의 `inserted`)과 다를 때만 배운다.
  - 세부 항목을 "얼마나 아낄지"는 지운 횟수 > 남긴 횟수 + **사용자가 직접 추가한 줄 수**(`detailFeedback.added`)로 정한다. 지운 횟수만 보면 한 번 아끼기 시작한 뒤 되돌아오지 않는다.
    - **남김·지움·추가는 모두 보고서 저장 때만 센다** — 미리보기 확정 때 세면 폼에서 지운 줄이 남김·지움으로 상쇄되고, 확정만 하고 버리거나 다시 가져오면 거듭 세였다. 미리보기에서 지운 제안은 `dropped` 링크(개수)로 남겨 작업이 저장된 보고서에 남아 있을 때 지움으로 한 번 센다(작업째 지웠으면 세지 않는다). 추가한 줄은 `details` 링크의 `known` 에 없는 줄이다(미리보기에서 추가한 줄도 `known` 에서 빼 둔다). 남김으로 센 제안 줄은 `detail` 링크에 `counted` 로 표시해 다시 저장해도 한 번만 세고, 같은 날 다시 고쳐 지우면 남김을 지움으로 옮긴다.
    - 횟수는 누적만 하지 않고 **감쇠한다**(`COMMIT_IMPORT_DETAIL_FEEDBACK_DECAY`, 0.85) — 누적만 하면 오래 쓸수록 판단이 굳어 습관이 바뀌어도 뒤집히지 않았다. 보고서 날짜가 바뀐 뒤 처음 횟수가 바뀌는 저장에서 한 번만 기존 횟수에 곱하고(`decayedOn`), 같은 날짜를 여러 번 저장하거나 확정만 하고 저장하지 않으면 감쇠하지 않는다. 그래서 횟수는 소수다. 예전 로컬 기록과 합칠 때 DB 쪽이 감쇠를 시작했으면 DB 값을 그대로 쓴다.
  - 읽기·쓰기는 브라우저 Supabase 클라이언트로 하고 **실패해도 빈 메모리로 계속한다**(기억하지 못할 뿐 가져오기는 동작). 쓰기는 모두 `updateMemory` 큐를 거쳐 한 탭 안에서 차례로 읽고-고치고-쓴다. 다른 기기와 동시 쓰기는 나중 쓰기가 이긴다.
  - 예전 저장 위치(localStorage `COMMIT_IMPORT_MEMORY_STORAGE_KEY:<id>`)에 남은 기록은 그 기기에서 처음 읽을 때 DB 기록과 합쳐 저장하고 지운다(DB 값 우선·목록 합집합·횟수는 큰 쪽 — 다시 합쳐도 늘지 않게).
  - 다이얼로그는 메모리를 받아 온 뒤에 커밋을 조회한다(제외 목록이 조회 조건이라서).
  - 이전 기록의 프로젝트명을 저장소 판정 후보로 넣지 않는다 — 이름만으로는 무관한 저장소에도 높은 점수를 줬다. 과거 연결은 확정 메모리로만 잇는다.
  - 작업명 문체는 이전 보고서 작업명을 예시로 넘긴다(문체 참고용 — "그대로 재사용"을 허용하면 예시로 작업을 지어냈다).
- **이미 등록한 작업 알아보기**(`lib/commit-classifier/registered-tasks.ts`): **같은 보고서 날짜에 이미 넣은 작업**이 다시 잡히면 `similarTo` 를 채우고 가져오기를 해제해 프로젝트 작업 목록 맨 아래로 보낸다(미리보기 "기존 작업과 유사" 배지, 다시 체크하면 들어간다). 다른 날 이어서 한 일은 그날 다시 보고할 일이라 견주지 않는다.
  - 가져와 넣은 작업은 같은 메모리의 `importedTasks` 에 보고서 날짜·AI 원래 이름(`suggested`)·사용자 최종 이름(`final`)·저장소·커밋 sha·제목으로 남는다(확정 시 `imported` 링크로 만들고, 보고서 저장 시 최종 이름·저장 날짜로 확정 — 저장 전에 폼에서 지운 작업은 기록에서 뺀다). 새 작업이 ① 같은 sha ② 커밋 제목 절반 이상 겹침 ③ 같은 저장소에서 `suggested`/`final` 과 이름 유사도(bigram Dice) ≥ `COMMIT_IMPORT_SIMILAR_TASK_THRESHOLD` 이면 같은 작업이다.
  - AI 가 폼의 기존 작업에 붙인 묶음("기존 작업에 추가")은 커밋이 **모두 이미 보고된 것**일 때만 같은 처리를 한다(`isReportedCommit` — 같은 날짜 등록 기록의 sha·제목에 있거나, 이 날짜 보고서를 마지막으로 저장한 시각 이전 커밋). 새 커밋이 섞였으면 이어서 한 일이라 그대로 둔다.
  - 폼에 직접 적은 작업도 같은 프로젝트(기존 프로젝트 또는 폼 반영 때 이름으로 합쳐질 프로젝트) 안에서 이름 유사도로 견준다.
  - 위 확실한 경우는 문자열로 바로 정한다(AI 점수는 실행마다 흔들린다). 이름 유사도가 애매한 구간(`COMMIT_IMPORT_SIMILAR_TASK_AI_MIN` 이상 ~ 임계값 미만, 작업당 최대 `COMMIT_IMPORT_SIMILAR_TASK_AI_CANDIDATE_LIMIT` 개)의 후보만 AI 에 `similarTaskScorePrompt` 로 0-10 채점을 **두 번** 시켜 둘 다 `COMMIT_IMPORT_SIMILAR_TASK_AI_SCORE`(8) 이상일 때 같은 작업으로 본다 — 표현만 다른 같은 작업을 잡되, 잘못 맞으면 실제 새 작업이 해제돼 빠지므로 작업 연결(7)보다 엄격하다. 소규모 PoC(같은 작업 4·다른 작업 4건, 각 3회)에서 같은 작업 8-9점, 다른 작업 ≤7점으로 갈렸다 — 여유가 1점이라 프롬프트를 바꾸면 다시 검증한다. 이 작업들은 세부 항목 제안을 묻지 않고, 이것만 남은 저장소는 `repoSkips` 를 올리지 않는다.
- **분류에서 뺄 저장소**(개인 프로젝트 등)는 같은 보정 메모리의 `excludedRepos` 에 둔다. 미리보기의 저장소 칩 "제외"로 빼고 하단 "제외한 저장소" 메뉴에서 해제한다. 제외 목록은 `fetchGithubCommits` 로 넘겨 커밋 조회부터 건너뛴다. 이번 미리보기에서 뺀 저장소를 해제하면 받아 둔 커밋으로 다시 분류만 하고, 조회 때부터 빠져 있던 저장소를 해제하면 다시 조회한다. 작업을 하나도 넣지 않고 적용한 일이 연속 `COMMIT_IMPORT_REPO_SKIP_SUGGEST_COUNT` 번 쌓인 저장소(`repoSkips`)는 미리보기 칩에서 제외를 **제안만** 한다 — 자동으로 빼면 실제 업무가 조용히 빠질 수 있다.
- 저장소 → 프로젝트도 작업 판정처럼 **두 번 채점해 둘 다 임계값을 넘을 때만** 연결한다.
- 폼 반영(`applyCommitImportPlan`)은 더하기만 한다 — 새 작업·프로젝트는 뒤에 추가하고, 기존 작업은 진행률을 맞춘다.
- **새 작업 진행률은 커밋 제목으로 가늠한다**(`progressPrompt`, 프로젝트마다 한 번). 커밋 종류(feat/fix 등)·개수로 나누지 않고, 제목에 미완성 신호(WIP·진행 중·1차·초안 등)가 분명할 때만 낮춘다 — 애매하면 100(`COMMIT_IMPORT_DEFAULT_PROGRESS`). AI 가 없거나 판정이 빠지면 100. 기존 작업은 폼에 적힌 진행률을 그대로 둔다. 검증된 이름짓기 프롬프트에 덧붙이지 않고 따로 묻는다.
- **세부 항목은 AI 가 필요하다고 판단한 작업에만 미리 채운다**(`detailSuggestionPrompt`). 커밋은 분류 근거일 뿐 세부 항목과 1:1 이 아니다. 커밋 하나로 새로 만든 작업은 묻지 않고, 개수 상한을 커밋 수로 둔다(상한이 없으면 커밋 하나에서 여러 줄을 지어냈다). 작업명과 겹치는 줄은 버린다. 세부 항목을 거의 안 쓰는 사용자(최근 작업의 10% 미만)이거나 제안을 지운 횟수가 남긴 횟수보다 많으면 더 아끼라고 알린다. 미리보기에서는 폼처럼 세부 항목을 추가·삭제할 수 있고, 작업 반영 여부는 작업 머리줄의 "가져오기" 체크로 고른다.

### 저장된 데이터 관리 (`/settings/data`)

회원이 서버에 저장된 데이터를 종류별로 골라 지운다. 종류는 `ACCOUNT_DATA_KIND`(`enums/account-data.enum.ts`), 조회·삭제는 `actions/account-data.actions.ts`(RLS 적용 서버 클라이언트, `user_id` 기준).

- **회원 행을 담는 테이블을 새로 만들면 여기 종류로 추가할지 판단하고, 본인 행 delete RLS 정책을 함께 둔다.** RLS 가 삭제를 막으면 오류 없이 0행만 지워지므로 Action 은 지운 뒤 다시 세어 남은 행이 있으면 실패로 돌려준다.
- 서버에서 지운 뒤 **이 기기에 남은 사본을 정리**한다(`DataManagementSection` 의 `cleanUpLocal`): 보고서 기록 store 재적재, 커밋 보정 메모리 쿼리 초기화. 커밋 보정 메모리는 서버 삭제 **전에** `clearLocalCommitImportMemory` 로 쓰기 큐를 비우고 예전 localStorage 기록을 지운다 — 남기면 다음 읽기에서 DB 로 다시 합쳐져 되살아난다.
- 계정 자체·로그인 수단(패스키·로그인 기기)·작성 알림 구독·새소식 읽음 기록·GitHub 토큰 쿠키는 대상이 아니다(계정 자체는 아래 회원 탈퇴).

### 회원 탈퇴 (`/settings/withdraw`)

설정 메뉴 하단 링크로 들어가 확인 문구(`WITHDRAW_CONFIRM_PHRASE`)를 입력하고 확인 dialog 를 거쳐 탈퇴한다. 처리는 `actions/account.actions.ts` 의 `withdrawAccount`.

- 세션(`getUser()`)으로 확인한 본인 id 만 admin 클라이언트 `auth.admin.deleteUser` 로 지운다 — 계정 삭제는 service role 만 가능하다.
- **회원 데이터는 FK `on delete cascade` 로 계정과 함께 지워진다**(보고서·커밋 보정 메모리·패스키·작성 알림 구독·새소식 읽음 기록·세션). **회원 행을 담는 테이블을 새로 만들면 `auth.users(id) on delete cascade` 를 반드시 건다** — 빠지면 탈퇴가 FK 오류로 실패하거나 데이터가 남는다.
- 삭제 후 서버에서 GitHub 토큰 쿠키를 지우고 `signOut({ scope: 'local' })` 로 세션 쿠키를 정리한다. 클라이언트는 삭제 전 `clearLocalCommitImportMemory` 로 메모리 쓰기 큐·예전 로컬 기록을 비우고, 삭제 후 이 기기의 브라우저 푸시 구독을 해제한 뒤 `hardNavigate('/', { replace, flash })` 로 문서를 새로 받는다(이후 미들웨어가 게스트로 승격).

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
- **바깥 클릭·Esc 닫기는 `useDismissLayer`(`hooks/use-dismiss-layer.ts`) 한 곳에서만 한다** — 모달·다이얼로그·팝오버·드롭다운 모두. 열린 순서대로 쌓은 층 중 **맨 위 층 하나만** 닫는다(모달 안 팝오버가 열린 채 모달 밖을 누르거나 Esc 를 누르면 팝오버만 닫힌다, back 키의 BackStack 과 같은 규칙). 배경 `onClick` + `stopPropagation` 이나 개별 `keydown` 리스너로 닫지 말 것 — 층을 거치지 않으면 겹친 창이 함께 닫힌다.
  - `ref` 는 창 본문(배경이 아니라 패널)에 단다. 바깥 클릭은 누른 곳과 뗀 곳이 모두 바깥일 때만 인정한다(창 안에서 드래그하다 밖에서 놓아도 닫히지 않게).
  - 토글 메뉴·팝오버·조건부 다이얼로그는 `{ enabled: isOpen }` 로 **열려 있는 동안만** 등록한다 — 닫힌 창이 등록돼 있으면 맨 위 자리를 차지해 아래 창의 닫기를 가로챈다.
  - 창·팝오버·배너의 X 닫기 버튼은 `CloseButton`(`components/close-button.tsx`, 팝오버·배너·인라인 패널은 `size="sm"`, 모달은 기본 `md`)으로 통일한다. 버튼이 아닌 요소(Link 등)는 `closeButtonClassName` + `CloseIcon` 을 쓴다.
  - 바깥 클릭·Esc 로 닫지 않을 창도 `outsideClick: false` / `escape: false` 로 등록한다 — 층을 차지해야 클릭·Esc 가 아래 창까지 내려가지 않는다(예: `ImportLocalDialog`, Esc 로 닫지 않는 GitHub 가져오기·텍스트 복원 모달).
