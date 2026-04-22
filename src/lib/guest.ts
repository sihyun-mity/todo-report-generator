// 게스트 모드 플래그는 쿠키에 저장 — 미들웨어(proxy.ts)가 서버측에서 읽어 게스트 접근을 허용할 수 있도록 함.
// 실제 보고서 기록은 localStorage(`report-history`)에 저장되며, 이 파일은 플래그만 다룬다.

export const GUEST_MODE_COOKIE = 'guest-mode';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1년

const readCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
};

export const isGuestMode = (): boolean => {
  return readCookie(GUEST_MODE_COOKIE) === '1';
};

export const enableGuestMode = () => {
  if (typeof document === 'undefined') return;
  // 기본 경로 쿠키 — HttpOnly 불가(클라이언트에서 써야 함), SameSite=Lax
  document.cookie = `${GUEST_MODE_COOKIE}=1; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
};

export const disableGuestMode = () => {
  if (typeof document === 'undefined') return;
  document.cookie = `${GUEST_MODE_COOKIE}=; path=/; max-age=0; samesite=lax`;
};
