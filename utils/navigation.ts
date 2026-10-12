import { FLASH_TOAST_STORAGE_KEY } from '@/constants';
import type { FlashToast } from '@/types';

type HardNavigateOptions = {
  /** 이동한 새 문서에서 보여줄 토스트 — 메모리의 토스트는 문서 교체와 함께 사라지므로 sessionStorage 로 넘긴다 */
  flash?: FlashToast;
  /** 현재 history entry 를 대체한다 (로그아웃처럼 뒤로 가기로 돌아오면 안 되는 이동) */
  replace?: boolean;
};

// 인증 주체가 바뀌는 이동(로그인·로그아웃·게스트 시작 등) 전용 전체 페이지 이동.
// Cache Components 에서는 client navigation 시 이전 라우트가 <Activity> 로 숨겨진 채 state 를 보존하므로
// router.push + refresh 로는 이전 사용자의 화면 state(세션 목록·입력값 등)와 모듈 레벨 store 가 남는다.
// 문서를 새로 받아 클라이언트 state 를 통째로 초기화한다.
export const hardNavigate = (href: string, { flash, replace = false }: HardNavigateOptions = {}) => {
  if (flash) {
    try {
      sessionStorage.setItem(FLASH_TOAST_STORAGE_KEY, JSON.stringify(flash));
    } catch {
      // 저장 실패 시 토스트만 생략
    }
  }
  if (replace) window.location.replace(href);
  else window.location.assign(href);
};

// hardNavigate 가 남긴 토스트를 1회 꺼낸다 (꺼내는 즉시 삭제).
export const consumeFlashToast = (): FlashToast | null => {
  try {
    const raw = sessionStorage.getItem(FLASH_TOAST_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(FLASH_TOAST_STORAGE_KEY);
    return JSON.parse(raw) as FlashToast;
  } catch {
    return null;
  }
};
