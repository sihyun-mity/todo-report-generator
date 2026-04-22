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
- Email provider 활성화 (Supabase 기본값)
- URL Configuration:
  - **Site URL**: `https://todo-report-generator.vercel.app`
  - **Redirect URLs**:
    - `https://todo-report-generator.vercel.app/**`
    - `http://localhost:3000/**`
- "Confirm email" 옵션은 테스트 중 OFF 권장 (운영 안정화 후 ON으로 전환)

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
- Auth "Confirm email"은 현재 정책이 기본값대로임. 테스트 편의를 위해 OFF 상태가 맞는지 한 번 더 확인하고, 운영 안정화 후 ON 전환.
- 기존 localStorage 데이터는 "가져오기" 버튼으로 이전한 뒤에도 몇 주간 남겨두기 (롤백 대비).

## 유용한 링크

- Supabase 프로젝트 대시보드: https://supabase.com/dashboard/project/atyknqnfijbfqqineedg
- SQL Editor: https://supabase.com/dashboard/project/atyknqnfijbfqqineedg/sql/new
- API Keys (Legacy): https://supabase.com/dashboard/project/atyknqnfijbfqqineedg/settings/api-keys/legacy
- Auth URL Configuration: https://supabase.com/dashboard/project/atyknqnfijbfqqineedg/auth/url-configuration
- Vercel Env Vars: https://vercel.com/sihyuns-projects-a914edee/todo-report-generator/settings/environment-variables
