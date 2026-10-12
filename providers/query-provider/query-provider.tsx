'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren, useState } from 'react';

export * from './query-keys';

/**
 * 앱 전역에서 `@tanstack/react-query` 를 사용할 수 있도록 `QueryClientProvider` 를 마운트하는 Provider.
 *
 * - `queryClient` 는 `useState` 로 마운트 시 1회 생성한다 — SSR/스트리밍 시 요청 간 캐시가 섞이지 않도록
 *   모듈 스코프 싱글턴 대신 컴포넌트 인스턴스에 묶는다.
 * - `staleTime` 기본값을 2초로 두어 짧은 시간 내 같은 키 중복 요청이 자연스럽게 합쳐진다.
 *   더 오래 캐시하려면 `useQuery` 호출부에서 `staleTime` 을 덮어쓴다 (예: 공휴일은 길게).
 */
export function QueryProvider({ children }: Readonly<PropsWithChildren>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 2,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
