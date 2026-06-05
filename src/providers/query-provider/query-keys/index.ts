import { mergeQueryKeys } from '@lukemorales/query-key-factory';
import { serverTime } from '.';

export * from './server-time-query-keys';

/**
 * 모든 도메인 쿼리 키를 하나의 트리로 병합한다.
 *
 * 사용 측에서는 `queries.<domain>.<query>(...)` 형태로 접근한다.
 *
 * @example
 * import { useQuery } from '@tanstack/react-query';
 * import { queries } from '@/providers';
 *
 * const { data } = useQuery(queries.serverTime.now());
 *
 * 새 도메인 쿼리 키 파일을 추가하면 이 파일의 `mergeQueryKeys` 인자에 함께 등록한다.
 */
export const queries = mergeQueryKeys(serverTime);
