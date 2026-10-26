'use server';

import { fetchAllNews, fetchNewsById, getViewerUserId } from '@/lib/news';
import { createClient } from '@/lib/supabase/server';
import type { News } from '@/types';

/**
 * 조회자(회원/비회원) 대상에 맞는 새소식 목록을 반환하는 Server Action.
 *
 * 에이전트 도구(`list_news`)가 react-query 키 `queries.news.list()` 로 호출한다.
 * 대상 필터링은 `lib/news` 의 `newsAudiencesFor(isMember)` 가 맡는다 — 로그인 여부는 세션으로 서버에서 판단한다.
 */
export async function getVisibleNewsList(): Promise<{ isMember: boolean; items: Array<News> }> {
  const supabase = await createClient();
  const isMember = !!(await getViewerUserId(supabase));
  return { isMember, items: await fetchAllNews(supabase, isMember) };
}

/**
 * 조회자 대상에 맞는 새소식 한 건. 대상이 아니거나 없으면 null — `/whats-new/[id]` 직접 접근과 같은 규칙이다.
 */
export async function getVisibleNewsDetail(id: string): Promise<News | null> {
  if (typeof id !== 'string' || id.trim() === '') return null;
  const supabase = await createClient();
  const isMember = !!(await getViewerUserId(supabase));
  return fetchNewsById(supabase, id, isMember);
}
