'use client';

import { usePathname, useRouter as useNextRouter } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';
import { getBackStackSize, suppressNextPopstate } from '@/components/back-stack/back-stack';
import { resolveTransitionTypes } from '@/utils';

type AppRouter = ReturnType<typeof useNextRouter>;
type NavigateOptions = NonNullable<Parameters<AppRouter['push']>[1]>;

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
 *
 * popstate-view-transition 의 인수 로직은 `getBackStackSize() > 0` 분기 + `destPath ===
 * lastCommittedPath` 조건으로 자동 skip 되므로 (URL 변경 없는 sentinel pop) 별도 처리 불필요.
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
 * `next/navigation` 의 useRouter 를 감싸 `push` / `replace` 에 View Transition 방향
 * (`transitionTypes`)을 자동 주입한다.
 *
 * - 옵션에 `transitionTypes` 를 명시하면 그대로 사용한다.
 * - 생략하면 현재 경로 → 대상 href 의 depth 관계로 nav-forward / nav-back 을 자동 추론한다.
 * - `replace` 는 sentinel-aware: 다이얼로그 sentinel 위에서 호출되면 sentinel 을 먼저 pop 한
 *   뒤 replace 한다 (push-like 동작 방지).
 * - `back` / `forward` 는 native history 동작 그대로 위임한다. popstate 전환 애니메이션은
 *   `<PopstateViewTransitionNotifier>` 가 설치하는 자체 엔진이 담당한다.
 */
export function useRouter(): AppRouter {
  const baseRouter = useNextRouter();
  const pathname = usePathname();

  // pathname 을 ref 로 추적해 useMemo deps 에서 제외한다. deps 에 pathname 을 두면 페이지
  // 전환마다 router 객체가 새로 만들어지고, useRouter() 결과를 deps 에 가진 모든 useEffect /
  // useMemo 가 불필요하게 재실행된다. push/replace 는 사용자 인터랙션 시점(= commit 이후)에
  // 호출되므로 ref.current 는 항상 최신 pathname 을 가진다. 갱신은 effect 안에서만 — React 19
  // 의 `react-hooks/refs` 룰(렌더 중 ref.current 쓰기 금지) 을 따른다.
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  });

  return useMemo<AppRouter>(() => {
    const enrich = (href: string, options?: NavigateOptions): NavigateOptions | undefined => {
      const resolved = resolveTransitionTypes(pathnameRef.current, href, options?.transitionTypes);
      if (!resolved || resolved.length === 0) {
        if (!options) return undefined;
        const withoutTypes: NavigateOptions = { ...options };
        delete withoutTypes.transitionTypes;
        return Object.keys(withoutTypes).length > 0 ? withoutTypes : undefined;
      }
      return { ...options, transitionTypes: resolved };
    };

    return {
      ...baseRouter,
      push: (href, options) => baseRouter.push(href, enrich(href, options)),
      replace: (href, options) => {
        const enrichedOptions = enrich(href, options);
        const doReplace = (): void => baseRouter.replace(href, enrichedOptions);
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
