'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { queries } from '@/providers';

/**
 * 특정 연도의 대한민국 공휴일(임시·대체공휴일 포함)을 `dateKey('YYYY-MM-DD') → 공휴일명` Map 으로 제공하는 Hook.
 *
 * - `@tanstack/react-query` + `queries.holidays.byYear(year)` 로 `getKoreanHolidays` Server Action 을 호출한다.
 * - 공휴일은 거의 바뀌지 않으므로 `staleTime` 을 하루로 길게 잡아 월 이동 시 재요청을 최소화한다.
 * - 로그인/게스트 무관하게 동작한다 (Server Action 이 서버에서 admin 클라이언트로 조회).
 */
export function useKrHolidays(year: number) {
  const { data, isLoading } = useQuery({
    ...queries.holidays.byYear(year),
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24,
  });

  const holidayMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const holiday of data ?? []) map.set(holiday.date, holiday.name);
    return map;
  }, [data]);

  return { holidayMap, isLoading };
}
