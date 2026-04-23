import type { SupabaseClient } from '@supabase/supabase-js';
import type { News } from '@/types';

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
