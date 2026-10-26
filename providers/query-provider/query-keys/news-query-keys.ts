import { createQueryKeys } from '@lukemorales/query-key-factory';
import { getVisibleNewsDetail, getVisibleNewsList } from '@/actions';

/**
 * 새소식 관련 쿼리 키 모음.
 *
 * - 에이전트 도구(`list_news` / `get_news`)가 `queryClient.fetchQuery` 로 호출한다.
 * - 대상(회원/비회원) 필터링은 Server Action 이 세션으로 판단한다. 로그인 전환은 문서를 새로 받으므로(hardNavigate) 캐시가 섞이지 않는다.
 */
export const news = createQueryKeys('news', {
  /** 조회자 대상 기준 전체 새소식 (최신순) */
  list: () => ({
    queryKey: ['list'],
    queryFn: getVisibleNewsList,
  }),
  /** 조회자 대상 기준 새소식 한 건 — 대상이 아니면 null */
  detail: (id: string) => ({
    queryKey: [id],
    queryFn: () => getVisibleNewsDetail(id),
  }),
});
