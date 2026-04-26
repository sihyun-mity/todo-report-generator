# todo-report-generator

일일 업무 보고 양식을 빠르게 작성·복사·재사용할 수 있게 도와주는 웹앱.

- **프레임워크**: Next.js 16 (App Router) + React 19 + React Compiler
- **인증/DB**: Supabase (이메일·비밀번호 + WebAuthn 패스키)
- **상태/데이터**: Zustand · SWR
- **스타일**: Tailwind CSS v4
- **배포**: Vercel (리전 `icn1`)

---

## Required

- **Node.js**: `>=24.12.0 <25.0.0`
- **npm**: `>=11.6.2 <12.0.0`
- Supabase 프로젝트 (DB + Auth) — 셋업은 [`src/docs/supabase-setup.md`](src/docs/supabase-setup.md)
- WebAuthn 패스키를 활성화하려면 [`src/docs/passkey-setup.md`](src/docs/passkey-setup.md) 참조

---

## 환경 변수

`.env.local`에 다음 키를 정의한다. 자세한 설명은 `src/types/environments.d.ts`.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

WEBAUTHN_RP_ID=localhost                    # 운영: 실제 도메인
WEBAUTHN_RP_NAME=todo-report-generator
WEBAUTHN_ORIGIN=http://localhost:3000       # 운영: https://...
WEBAUTHN_CHALLENGE_SECRET=                  # 64자 hex (openssl rand -hex 32)
```

---

## 프로젝트 설정

```shell
npm ci
```

Supabase 마이그레이션은 `supabase/migrations/*.sql`을 순서대로 적용한다 (RLS 정책 포함).

---

## Scripts

| 명령어            | 설명                                       |
| ----------------- | ------------------------------------------ |
| `npm run dev`     | 개발 서버 (Turbopack)                      |
| `npm run build`   | 프로덕션 빌드                              |
| `npm run start`   | 빌드 결과 실행                             |
| `npm run lint`    | ESLint (eslint-config-next)                |
| `npx tsc --noEmit`| 타입 체크                                  |

커밋 시 Husky `pre-commit` 훅이 변경 파일에 `eslint --fix` + `prettier --write`를 실행한다.

---

## 사용자 상태

코드 전반에서 세 가지 상태를 분리해 처리한다.

1. **로그인 사용자** — Supabase 세션 쿠키. 보고서 기록은 Supabase DB(RLS 적용)에 저장.
2. **게스트** — `guest-mode` 쿠키만 보유. 보고서 기록은 브라우저 `localStorage`에 저장. Supabase 호출을 건너뛰어 stale token 오류를 회피.
3. **비인증** — 둘 다 없음. 보호 경로 접근 시 `/login`으로 이동.

---

## 디렉터리 구조 요약

```
src/
├── app/
│   ├── (app)/            # 로그인/게스트가 접근하는 보호 영역 (홈, 설정, 새소식)
│   ├── (auth)/           # /login, /signup
│   ├── api/              # passkey, github, auth route handlers
│   └── _components/      # 보고서 폼/프리뷰/캘린더 등
├── components/           # 공용 UI
├── lib/                  # supabase / webauthn / guest / news 외부 어댑터
├── stores/               # Zustand 스토어
├── hooks/                # SWR/UI 훅
├── types/ constants/ utils/ enums/ core/
└── proxy.ts              # 미들웨어 (파일명 주의: middleware.ts 아님)

supabase/migrations/       # SQL 마이그레이션 + RLS
src/docs/                  # 패스키/Supabase 셋업 문서
```

코드 스타일·네이밍·import 규약은 [`CLAUDE.md`](CLAUDE.md) 참고.
