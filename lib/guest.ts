import {
  GUEST_MODE_COOKIE,
  GUEST_MODE_MAX_AGE_SECONDS,
  NEWS_GUEST_STORAGE_KEY,
  REPORT_HISTORY_STORAGE_KEY,
} from '@/constants';

// 게스트 모드 플래그는 쿠키에 저장 — 미들웨어(proxy.ts)가 서버측에서 읽어 게스트 접근을 허용할 수 있도록 함.
// 실제 보고서 기록은 localStorage(`report-history`)에 저장되며, 이 파일은 플래그만 다룬다.

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
  document.cookie = `${GUEST_MODE_COOKIE}=1; path=/; max-age=${GUEST_MODE_MAX_AGE_SECONDS}; samesite=lax`;
};

export const disableGuestMode = () => {
  if (typeof document === 'undefined') return;
  document.cookie = `${GUEST_MODE_COOKIE}=; path=/; max-age=0; samesite=lax`;
};

// 게스트 모드 종료 시점에 호출. 게스트 → 로그인 전환 흐름과 달리,
// 게스트 모드를 명시적으로 끝낼 때는 이 브라우저에 남은 게스트 전용 데이터를 모두 정리한다.
// 마이그레이션이 필요한 경우(로그인/가입 진입점)에는 호출하지 않는다.
export const clearGuestLocalData = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(REPORT_HISTORY_STORAGE_KEY);
    localStorage.removeItem(`${REPORT_HISTORY_STORAGE_KEY}-imported`);
    localStorage.removeItem(NEWS_GUEST_STORAGE_KEY);
  } catch {
    // 접근 실패는 무시
  }
};
