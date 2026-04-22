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
  }
}
