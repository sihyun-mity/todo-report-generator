'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { clearBackStackOnRouteChange, handlePopstate } from '@/components/back-stack/back-stack';

/**
 * 브라우저 back(안드로이드 하드웨어 back 포함)을 BackStack 에 연결하는 effect-only 컴포넌트.
 * children 을 받지 않으므로 root layout 의 sibling 으로 한 번 마운트한다.
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
