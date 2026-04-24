import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPublicClient } from '@/lib/supabase/public';
import type { News } from '@/types';

// 공개 뉴스 캐시 태그 — 글 등록/수정 시 revalidateTag(NEWS_CACHE_TAG)로 즉시 무효화 가능.
export const NEWS_CACHE_TAG = 'news';
const NEWS_CACHE_TTL_SECONDS = 3600;

// 최신 새소식 1건 — 없으면 null
export async function fetchLatestNews(supabase: SupabaseClient): Promise<News | null> {
  const { data, error } = await supabase
    .from('news')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[news] fetchLatestNews failed', error);
    return null;
  }
  return (data as News) ?? null;
}

// 전체 새소식 최신순
export async function fetchAllNews(supabase: SupabaseClient): Promise<News[]> {
  const { data, error } = await supabase.from('news').select('*').order('published_at', { ascending: false });

  if (error) {
    console.error('[news] fetchAllNews failed', error);
    return [];
  }
  return (data as News[]) ?? [];
}

export async function fetchNewsById(supabase: SupabaseClient, id: string): Promise<News | null> {
  const { data, error } = await supabase.from('news').select('*').eq('id', id).maybeSingle();

  if (error) {
    console.error('[news] fetchNewsById failed', error);
    return null;
  }
  return (data as News) ?? null;
}

export async function hasUserReadNews(supabase: SupabaseClient, userId: string, newsId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_news_reads')
    .select('news_id')
    .eq('user_id', userId)
    .eq('news_id', newsId)
    .maybeSingle();

  if (error) {
    console.error('[news] hasUserReadNews failed', error);
    return false;
  }
  return !!data;
}

export async function markNewsAsReadForUser(supabase: SupabaseClient, userId: string, newsId: string): Promise<void> {
  const { error } = await supabase.from('user_news_reads').upsert(
    {
      user_id: userId,
      news_id: newsId,
      read_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,news_id' }
  );

  if (error) {
    console.error('[news] markNewsAsReadForUser failed', error);
  }
}

// 공개 데이터 — 쿠키 없는 anon 클라이언트로 조회하고 태그 기반 캐시에 저장.
// 페이지 세그먼트가 layout의 dynamic API로 인해 여전히 per-request 렌더되더라도 DB 호출은 TTL 내 생략된다.
export const fetchAllNewsCached = unstable_cache(async () => fetchAllNews(createPublicClient()), ['news:all'], {
  tags: [NEWS_CACHE_TAG],
  revalidate: NEWS_CACHE_TTL_SECONDS,
});

export const fetchLatestNewsCached = unstable_cache(
  async () => fetchLatestNews(createPublicClient()),
  ['news:latest'],
  { tags: [NEWS_CACHE_TAG], revalidate: NEWS_CACHE_TTL_SECONDS }
);

export async function fetchNewsByIdCached(id: string): Promise<News | null> {
  return unstable_cache(async () => fetchNewsById(createPublicClient(), id), ['news:by-id', id], {
    tags: [NEWS_CACHE_TAG, `news:${id}`],
    revalidate: NEWS_CACHE_TTL_SECONDS,
  })();
}
