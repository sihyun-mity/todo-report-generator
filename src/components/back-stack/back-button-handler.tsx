'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { clearBackStackOnRouteChange, handlePopstate } from '@/components/back-stack/back-stack';

/**
 * 브라우저 back(안드로이드 하드웨어 back 포함)을 BackStack 에 연결하는 effect-only 컴포넌트.
 * children 을 받지 않으므로 root layout 의 sibling 으로 한 번 마운트한다.
 *
 * popstate 리스너는 useEffect 에서 등록되어 `popstate-view-transition.tsx` 의 모듈 로드
 * 리스너보다 늦게 실행된다. 실제 라우트 이동 popstate 는 view transition 엔진이
 * `stopImmediatePropagation` 으로 가로채므로 여기까지 오지 않고, sentinel back(다이얼로그
 * 닫기)만 이 핸들러에 도달한다.
 */
export function BackButtonHandler(): null {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = (event: PopStateEvent): void => {
      handlePopstate(event);
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  useEffect(() => {
    // pathname 변경 = 실제 라우트 이동. 남은 stack 을 정리해 더블 처리를 막는다.
    clearBackStackOnRouteChange();
  }, [pathname]);

  return null;
}
