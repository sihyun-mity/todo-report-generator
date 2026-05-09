import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPublicClient } from '@/lib/supabase/public';
import { NEWS_GUEST_STORAGE_KEY, PENDING_NEWS_SEEN_COOKIE, PENDING_NEWS_SEEN_MAX_AGE_SECONDS } from '@/constants';
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

// 게스트 → 로그인 전환(클라이언트 직접 인증) 시 호출.
// 게스트 시절 마지막으로 본 새소식 id 가 localStorage 에 있으면 user_news_reads 에 upsert 하고
// localStorage 키를 정리한다. NewsDialogMount(서버) 가 이 사용자에 대해 호출되기 전에 await 되어야
// 첫 접속자 자동 처리 로직과 충돌하지 않는다.
export async function migrateGuestNewsLastSeen(supabase: SupabaseClient, userId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  let lastSeen: string | null = null;
  try {
    lastSeen = window.localStorage.getItem(NEWS_GUEST_STORAGE_KEY);
  } catch {
    return;
  }
  if (!lastSeen) return;

  await markNewsAsReadForUser(supabase, userId, lastSeen);

  try {
    window.localStorage.removeItem(NEWS_GUEST_STORAGE_KEY);
  } catch {
    // 정리 실패해도 user_news_reads 에는 들어갔으므로 다이얼로그 동작에는 영향 없음
  }
}

// 게스트 → 서버 콜백을 거치는 인증 흐름(GitHub OAuth, 이메일 회원가입) 직전에 호출.
// 콜백 라우트는 localStorage 를 읽을 수 없으므로 마지막 본 새소식 id 를 짧은 쿠키로 옮겨준다.
// 콜백이 처리 후 즉시 만료시킨다.
export const stashGuestNewsLastSeenInCookie = () => {
  if (typeof window === 'undefined') return;
  let lastSeen: string | null = null;
  try {
    lastSeen = window.localStorage.getItem(NEWS_GUEST_STORAGE_KEY);
  } catch {
    return;
  }
  if (!lastSeen) return;
  document.cookie = `${PENDING_NEWS_SEEN_COOKIE}=${encodeURIComponent(lastSeen)}; path=/; max-age=${PENDING_NEWS_SEEN_MAX_AGE_SECONDS}; samesite=lax`;
};

// 해당 유저가 새소식을 한 번이라도 읽은 적이 있는지 — 첫 접속(신규) 사용자 판별용.
// 오류 시에는 보수적으로 true(=기존 사용자)로 간주해 첫 접속 자동 읽음 처리를 건너뛴다.
export async function hasAnyUserNewsReadHistory(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('user_news_reads')
    .select('news_id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    console.error('[news] hasAnyUserNewsReadHistory failed', error);
    return true;
  }
  return (count ?? 0) > 0;
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
