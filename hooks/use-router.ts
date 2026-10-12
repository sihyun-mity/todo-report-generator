'use client';

import { useRouter as useNextRouter } from 'next/navigation';
import { useMemo } from 'react';
import { getBackStackSize, suppressNextPopstate } from '@/components/back-stack/back-stack';

type AppRouter = ReturnType<typeof useNextRouter>;

/**
 * BottomSheet/Dialog 가 history 에 쌓아둔 sentinel entry 위에서 호출된 `router.replace` 를
 * 진짜 replace 처럼 동작시킨다.
 *
 * 문제: sentinel 위에서 그냥 `replaceState` 를 부르면 sentinel entry 만 덮어 사용자에겐 push
 * 처럼 보인다 (뒤로가기 시 원래 페이지가 다시 나옴).
 *
 * 처리: sentinel 개수만큼 `history.back()` 으로 pop 한 뒤, 그 popstate 가 처리된 시점에서
 * `replace` 를 실행한다. back-stack 의 stale 흡수 분기가 추가로 한 칸 더 흡수하지 않도록
 * `suppressNextPopstate(count)` 를 미리 표시한다 (cleanup 이 sync 로 `staleSentinelCount++`
 * 하는 race 회피 디자인은 그대로 유지 — 라우트 변경 시 `clearBackStackOnRouteChange` 가
 * 카운터를 리셋한다).
 */
function popSentinelsThenReplace(count: number, doReplace: () => void): void {
  if (typeof window === 'undefined') {
    doReplace();
    return;
  }
  let remaining = count;
  const onPop = (): void => {
    remaining -= 1;
    if (remaining > 0) {
      window.history.back();
      return;
    }
    window.removeEventListener('popstate', onPop);
    doReplace();
  };
  window.addEventListener('popstate', onPop);
  suppressNextPopstate(count);
  window.history.back();
}

/**
 * `next/navigation` 의 useRouter 를 감싸 다이얼로그 sentinel-aware `replace` 를 지원한다.
 *
 * - `replace` 는 sentinel-aware: 다이얼로그 sentinel 위에서 호출되면 sentinel 을 먼저 pop 한
 *   뒤 replace 한다 (push-like 동작 방지).
 * - `push`, `back`, `forward` 등은 Next.js 기본 router 로 위임한다.
 */
export function useRouter(): AppRouter {
  const baseRouter = useNextRouter();

  return useMemo<AppRouter>(() => {
    return {
      ...baseRouter,
      replace: (href, options) => {
        const doReplace = (): void => baseRouter.replace(href, options);
        const sentinelCount = getBackStackSize();
        if (sentinelCount === 0) {
          doReplace();
          return;
        }
        popSentinelsThenReplace(sentinelCount, doReplace);
      },
    };
  }, [baseRouter]);
}
