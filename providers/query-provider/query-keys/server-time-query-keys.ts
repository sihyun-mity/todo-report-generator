import { createQueryKeys } from '@lukemorales/query-key-factory';
import { getServerTime } from '@/actions';

/**
 * 서버 시간 관련 쿼리 키 모음.
 *
 * - `useServerNow` 훅이 `serverTime.now()` 키로 `getServerTime` Server Action 을 호출한다.
 * - 새 서버 시간 관련 쿼리가 추가되면 이 파일에 새 항목으로 함께 둔다.
 */
export const serverTime = createQueryKeys('serverTime', {
  /** 서버에서 측정한 현재 시각 (epoch ms) */
  now: () => ({
    queryKey: ['now'],
    queryFn: getServerTime,
  }),
});
