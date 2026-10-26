declare namespace NodeJS {
  interface ProcessEnv {
    /** Supabase 키 */
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
    /** Supabase URL */
    NEXT_PUBLIC_SUPABASE_URL: string;
    /** Supabase service_role 키 (서버 전용, 절대 브라우저 번들에 노출 금지) */
    SUPABASE_SERVICE_ROLE_KEY: string;
    /** WebAuthn Relying Party ID (예: localhost / todo-report-generator.vercel.app) */
    WEBAUTHN_RP_ID: string;
    /** WebAuthn Relying Party 표시 이름 */
    WEBAUTHN_RP_NAME: string;
    /** WebAuthn 기대 Origin (예: http://localhost:3000 / https://todo-report-generator.vercel.app) */
    WEBAUTHN_ORIGIN: string;
    /** 챌린지 쿠키 서명/암호화용 64자 hex (서버 전용) */
    WEBAUTHN_CHALLENGE_SECRET: string;
    /** Web Push VAPID 공개키 (브라우저 노출용) — `npx web-push generate-vapid-keys` 로 생성 */
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: string;
    /** Web Push VAPID 비밀키 (서버 전용) */
    VAPID_PRIVATE_KEY: string;
    /** Web Push VAPID subject — `mailto:you@example.com` 형식 */
    VAPID_SUBJECT: string;
    /** Vercel Cron 호출 인증용 시크릿 (Authorization: Bearer 로 전달됨) */
    CRON_SECRET: string;
    /** 공공데이터포털 한국천문연구원 특일정보 API 서비스 키 (디코딩된 일반 인증키) */
    DATA_GO_KR_SERVICE_KEY: string;
    /** GitHub 토큰 봉인 쿠키 암호화용 32자 이상 시크릿 (서버 전용) */
    GITHUB_TOKEN_COOKIE_SECRET: string;
    /**
     * 오리진 트라이얼 토큰 (선택). 쉼표로 여러 개를 줄 수 있다 — 예: Chrome WebMCP 토큰, Edge WebMCP 토큰.
     * 값이 있으면 모든 응답에 `Origin-Trial` 헤더로 실려 방문자 브라우저에서 해당 실험 기능(WebMCP 등)이 켜진다.
     * 토큰은 등록한 origin 에서만 유효하고, `next.config.ts` 의 headers() 가 빌드 시점에 읽으므로 바꾸면 재배포해야 한다.
     */
    ORIGIN_TRIAL_TOKENS?: string;
  }
}
