'use client';

import { usePathname, useRouter as useNextRouter } from 'next/navigation';
import { useMemo } from 'react';
import { resolveTransitionTypes } from '@/utils';

type AppRouter = ReturnType<typeof useNextRouter>;
type NavigateOptions = NonNullable<Parameters<AppRouter['push']>[1]>;

/**
 * `next/navigation` 의 useRouter 를 감싸 `push` / `replace` 에 View Transition 방향
 * (`transitionTypes`)을 자동 주입한다.
 *
 * - 옵션에 `transitionTypes` 를 명시하면 그대로 사용한다.
 * - 생략하면 현재 경로 → 대상 href 의 depth 관계로 nav-forward / nav-back 을 자동 추론한다.
 * - `back` / `forward` 는 native history 동작 그대로 위임한다. popstate 전환 애니메이션은
 *   `<PopstateViewTransitionNotifier>` 가 설치하는 자체 엔진이 담당한다.
 */
export function useRouter(): AppRouter {
  const baseRouter = useNextRouter();
  const pathname = usePathname();

  return useMemo<AppRouter>(() => {
    const enrich = (href: string, options?: NavigateOptions): NavigateOptions | undefined => {
      const resolved = resolveTransitionTypes(pathname, href, options?.transitionTypes);
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
      replace: (href, options) => baseRouter.replace(href, enrich(href, options)),
    };
  }, [baseRouter, pathname]);
}
