# Supabase 마이그레이션 - Cowork 사전 작업 완료 보고

> Cowork에서 수행 완료한 웹 UI 기반 설정값 모음.
> 이 문서를 Claude Code에게 넘겨 코드 작업을 이어가면 됨.

## 프로젝트 식별자

| 항목 | 값 |
|---|---|
| Supabase Organization | `todo-report-generator` (Personal, Free tier) |
| Supabase Project name | `todo-report-prod` |
| Project ref | `atyknqnfijbfqqineedg` |
| Project URL | `https://atyknqnfijbfqqineedg.supabase.co` |
| Region | Northeast Asia (Seoul) — `ap-northeast-2` |
| Vercel Project | `sihyuns-projects-a914edee/todo-report-generator` |
| Vercel 기본 도메인 | `https://todo-report-generator.vercel.app` |

## 완료한 작업

### 1. Supabase 프로젝트 생성
- 프로젝트 생성 완료, RLS 자동 활성화 옵션 켠 상태로 시작.
- DB 비밀번호는 사용자 본인이 별도 보관.

### 2. DB 스키마 적용 (SQL Editor 실행 완료)
- `public.reports` 테이블
  - `id uuid pk default gen_random_uuid()`
  - `user_id uuid → auth.users(id) on delete cascade`
  - `report_date date`
  - `content jsonb`
  - `created_at`, `updated_at timestamptz default now()`
  - `unique(user_id, report_date)`
- `handle_updated_at()` 함수 + `reports_updated_at` BEFORE UPDATE 트리거
- RLS 활성화 + 본인 데이터만 CRUD 4개 정책(select/insert/update/delete, `auth.uid() = user_id`)
- 인덱스 `reports_user_date_idx on reports(user_id, report_date desc)`
- 결과: "Success. No rows returned"

### 3. Authentication 설정

> 위치 주의: "Confirm email", "Allow manual linking", "Allow new users to sign up", "Allow anonymous sign-ins"는 모두
> **Authentication > Sign In / Providers** 페이지 상단의 **User Signups** 섹션에 함께 묶여 있다.
> (옛 UI에서 "Providers > Email" 안에 있던 항목들이 이쪽으로 옮겨짐)

- Email provider 활성화 (Supabase 기본값)
- **Confirm email = ON** (User Signups 섹션, 기본값 유지)
  - 이메일/비밀번호 가입에만 적용. GitHub OAuth로 가입하면 GitHub가 이메일을 verified로 넘겨주므로 Supabase가 `email_confirmed_at`을 자동으로 채운다.
- **Allow manual linking = ON** (User Signups 섹션) — 설정 페이지의 GitHub 연동/해제(`supabase.auth.linkIdentity` / `unlinkIdentity`)에 필요
- GitHub provider 활성화 — Client ID / Client Secret 등록
  - GitHub OAuth App 등록 위치: `https://github.com/settings/applications/new`
  - Application name: `Todo Report Generator`
  - Homepage URL: `https://todo-report-generator.vercel.app`
  - Authorization callback URL: `https://atyknqnfijbfqqineedg.supabase.co/auth/v1/callback`
  - 발급받은 Client ID / Secret을 Supabase Dashboard > Authentication > Sign In / Providers > GitHub 패널에 입력하고 "GitHub enabled" 토글 ON
- URL Configuration:
  - **Site URL**: `https://todo-report-generator.vercel.app`
  - **Redirect URLs** (allowlist):
    - `https://todo-report-generator.vercel.app/**`
    - `http://localhost:3000/**`
    - `https://todo-report-generator.vercel.app/auth/callback` (와일드카드로도 매칭되지만 명시 등록)
    - `http://localhost:3000/auth/callback`
  - 앱 측 OAuth 콜백은 `/auth/callback`(`src/app/auth/callback/route.ts`)이 처리한다

### 4. Vercel 환경변수 등록
- Environment: **Production** (Preview/Development 미적용)
- Sensitive: **OFF** (`NEXT_PUBLIC_` 접두사는 어차피 브라우저에 노출되는 공개 값)
- 등록한 변수:
  - `NEXT_PUBLIC_SUPABASE_URL` = `https://atyknqnfijbfqqineedg.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (Supabase anon public key, JWT)
- 등록 직후 Vercel이 "새 배포 필요" 안내 → **코드 배포할 때 자동으로 반영되니 지금 재배포 안 함**

## Claude Code로 이어서 진행할 일

1. **`.env.local` 작성** (로컬 개발용):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://atyknqnfijbfqqineedg.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<본인이 Supabase에서 복사>
   ```
   - anon key 위치: Supabase Dashboard → Project Settings → API Keys → Legacy API Keys의 `anon` `public` 값. (또는 새 Publishable key 사용 가능)
   - `.env.local`을 `.gitignore`에 포함되어 있는지 확인.

2. **패키지 설치**:
   ```
   npm install @supabase/supabase-js @supabase/ssr
   ```

3. **migration-plan.md의 5~8단계 구현**:
   - `lib/supabase/client.ts`, `lib/supabase/server.ts`
   - `middleware.ts` (세션 갱신 + 로그인 가드)
   - `app/login/page.tsx`, `app/signup/page.tsx`
   - 기존 localStorage CRUD → `supabase.from('reports')` 쿼리로 교체
   - "기존 데이터 가져오기" 버튼 (`localStorage` → `upsert`)

4. **로컬에서 회원가입/로그인/보고서 저장 테스트** → 통과하면 Vercel에 배포(자동).

5. **배포 후 팀원 가입 테스트** 체크리스트 점검.

## 주의사항 (Cowork에서 확인한 것)

- **데이터베이스 비밀번호**는 Cowork가 기록하지 않음. 사용자 본인 보관분만 유효.
- **anon key**는 공개용 키지만 문서에 평문으로 남기지 않았음. Supabase 대시보드에서 그때그때 복사해서 쓰기.
- **service_role key**는 절대 클라이언트 코드나 `NEXT_PUBLIC_*` 변수에 넣지 말 것. 서버 전용 시크릿 작업이 생기면 별도 `SUPABASE_SERVICE_ROLE_KEY`로 관리.
- Auth "Confirm email"은 ON 상태(기본값) 유지. 이메일/비밀번호 가입에만 영향이 있고, GitHub OAuth 가입자는 영향 없음.
- 기존 localStorage 데이터는 "가져오기" 버튼으로 이전한 뒤에도 몇 주간 남겨두기 (롤백 대비).

## 유용한 링크

- Supabase 프로젝트 대시보드: https://supabase.com/dashboard/project/atyknqnfijbfqqineedg
- SQL Editor: https://supabase.com/dashboard/project/atyknqnfijbfqqineedg/sql/new
- API Keys (Legacy): https://supabase.com/dashboard/project/atyknqnfijbfqqineedg/settings/api-keys/legacy
- Auth Sign In / Providers (Confirm email · Manual linking · 각 Provider): https://supabase.com/dashboard/project/atyknqnfijbfqqineedg/auth/providers
- Auth URL Configuration: https://supabase.com/dashboard/project/atyknqnfijbfqqineedg/auth/url-configuration
- Vercel Env Vars: https://vercel.com/sihyuns-projects-a914edee/todo-report-generator/settings/environment-variables
