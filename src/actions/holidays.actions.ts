'use server';

import { getKoreanHolidaysForYear, type KoreanHoliday } from '@/lib/holidays/kr-holidays';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * 특정 연도의 대한민국 공휴일(임시·대체공휴일 포함) 목록을 반환하는 Server Action.
 *
 * `useKrHolidays` 훅이 react-query 키 `queries.holidays.byYear(year)` 로 호출한다.
 * `kr_holidays` 테이블은 service_role 전용(RLS 정책 없음)이라 admin 클라이언트로 조회한다.
 * 미적재 연도는 공공데이터포털 특일정보 API 를 1회 호출해 캐시한 뒤 반환한다.
 */
export async function getKoreanHolidays(year: number): Promise<Array<KoreanHoliday>> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return [];
  return getKoreanHolidaysForYear(createAdminClient(), year);
}
