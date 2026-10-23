import { createQueryKeys } from '@lukemorales/query-key-factory';
import { getAccountDataSummary } from '@/actions';

/**
 * 설정 > 저장된 데이터 관리 쿼리 키.
 *
 * - `summary()` 는 종류별로 서버에 남은 행 수를 `getAccountDataSummary` Server Action 으로 센다.
 */
export const accountData = createQueryKeys('accountData', {
  /** 종류별 서버 저장 행 수 */
  summary: () => ({
    queryKey: ['summary'],
    queryFn: getAccountDataSummary,
  }),
});
