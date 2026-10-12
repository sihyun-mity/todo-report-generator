import { createQueryKeys } from '@lukemorales/query-key-factory';
import { getKoreanHolidays } from '@/actions';

/**
 * 대한민국 공휴일 관련 쿼리 키 모음.
 *
 * - `useKrHolidays` 훅이 `holidays.byYear(year)` 키로 `getKoreanHolidays` Server Action 을 호출한다.
 * - 공휴일은 거의 바뀌지 않으므로 소비 측에서 `staleTime` 을 길게 잡는다.
 */
export const holidays = createQueryKeys('holidays', {
  /** 특정 연도의 공휴일(임시·대체공휴일 포함) 목록 */
  byYear: (year: number) => ({
    queryKey: [year],
    queryFn: () => getKoreanHolidays(year),
  }),
});
