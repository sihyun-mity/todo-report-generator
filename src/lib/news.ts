import type { SupabaseClient } from '@supabase/supabase-js';
import {
  NEWS_AUDIENCES_FOR_GUEST,
  NEWS_AUDIENCES_FOR_MEMBER,
  NEWS_GUEST_STORAGE_KEY,
  PENDING_NEWS_SEEN_COOKIE,
  PENDING_NEWS_SEEN_MAX_AGE_SECONDS,
} from '@/constants';
import type { News, NewsAudience } from '@/types';

// 현재 조회자가 볼 수 있는 대상 값 목록.
// news 는 RLS 상 누구나 읽을 수 있으므로(공개 공지), 대상 필터링은 이 레이어가 책임진다.
// 새 조회 경로를 추가할 때 이 필터를 빠뜨리면 회원/비회원 전용 소식이 그대로 새어 나간다.
export function newsAudiencesFor(isMember: boolean): ReadonlyArray<NewsAudience> {
  return isMember ? NEWS_AUDIENCES_FOR_MEMBER : NEWS_AUDIENCES_FOR_GUEST;
}

// 로그인 유저 id — 게스트(또는 stale token) 환경에서 auth.getUser() 가 던질 수 있어 방어한다.
export async function getViewerUserId(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

// 조회자 대상 기준 최신 새소식 1건 — 없으면 null
export async function fetchLatestNews(supabase: SupabaseClient, isMember: boolean): Promise<News | null> {
  const { data, error } = await supabase
    .from('news')
    .select('*')
    .in('audience', newsAudiencesFor(isMember))
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[news] fetchLatestNews failed', error);
    return null;
  }
  return (data as News) ?? null;
}

// 조회자 대상 기준 전체 새소식 최신순
export async function fetchAllNews(supabase: SupabaseClient, isMember: boolean): Promise<Array<News>> {
  const { data, error } = await supabase
    .from('news')
    .select('*')
    .in('audience', newsAudiencesFor(isMember))
    .order('published_at', { ascending: false });

  if (error) {
    console.error('[news] fetchAllNews failed', error);
    return [];
  }
  return (data as Array<News>) ?? [];
}

// 대상이 맞지 않는 소식은 null — 상세 페이지에서 notFound() 로 이어진다.
export async function fetchNewsById(supabase: SupabaseClient, id: string, isMember: boolean): Promise<News | null> {
  const { data, error } = await supabase
    .from('news')
    .select('*')
    .eq('id', id)
    .in('audience', newsAudiencesFor(isMember))
    .maybeSingle();

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

// 기준 소식과, 그보다 오래된 **회원 대상** 소식을 한꺼번에 읽음 처리한다.
//
// 회원의 읽음 기록은 전부 이 함수를 거친다(첫 접속 자동 처리 · 다이얼로그 확인 · 게스트→로그인 전환).
// 단건 마크로 충분하지 않은 이유 — 셋 다 "기준 시점 이전은 이미 지나갔다"를 기록해야 하는 자리다:
//   1. 게스트 → 로그인 전환: 게스트가 마지막으로 본 소식이 비회원 전용일 수 있고, 그렇다면 회원
//      관점의 최신 소식은 그보다 오래된 다른 소식이 된다. 미읽음으로 남아 로그인 직후 다이얼로그가 뜬다.
//   2. 첫 접속 회원 / 다이얼로그 확인: 최신 1건만 마크하면 대상 분류가 바뀌어 더 오래된 소식이
//      최신 자리로 올라올 때 그 소식이 뒤늦게 떠버린다.
//
// 다이얼로그는 어차피 "최신 1건"만 보여주므로, 기준 시점 이전 소식은 이미 봤거나 지나간 것으로
// 간주해도 안전하다.
export async function markNewsAsReadUpTo(supabase: SupabaseClient, userId: string, newsId: string): Promise<void> {
  // 기준 소식은 게스트 대상일 수 있으므로 audience 필터 없이 시각만 조회한다.
  const { data: anchor, error: anchorError } = await supabase
    .from('news')
    .select('published_at')
    .eq('id', newsId)
    .maybeSingle();

  if (anchorError || !anchor) {
    if (anchorError) console.error('[news] markNewsAsReadUpTo anchor lookup failed', anchorError);
    return;
  }

  const { data: rows, error: listError } = await supabase
    .from('news')
    .select('id')
    .in('audience', NEWS_AUDIENCES_FOR_MEMBER)
    .lte('published_at', (anchor as { published_at: string }).published_at);

  if (listError) {
    console.error('[news] markNewsAsReadUpTo list failed', listError);
    return;
  }

  const readAt = new Date().toISOString();
  const payload = ((rows as Array<{ id: string }>) ?? []).map((row) => ({
    user_id: userId,
    news_id: row.id,
    read_at: readAt,
  }));
  if (payload.length === 0) return;

  const { error } = await supabase.from('user_news_reads').upsert(payload, { onConflict: 'user_id,news_id' });
  if (error) {
    console.error('[news] markNewsAsReadUpTo upsert failed', error);
  }
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

  await markNewsAsReadUpTo(supabase, userId, lastSeen);

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
