'use server';

/**
 * 서버에서 측정한 현재 시각을 epoch milliseconds 로 반환하는 Server Action.
 *
 * `useServerNow` 훅이 react-query 키 `queries.serverTime.now()` 로 호출해, 클라이언트 시계와의
 * 오프셋을 계산하는 기준값으로 사용한다. 외부 API 호출 비용 없이 서버 프로세스의 `Date.now()` 만
 * 반환하므로 매우 가볍지만, 프로세스 클럭이 NTP 동기화되어 있다는 전제를 깔고 있다.
 */
export const getServerTime = async () => Date.now();
