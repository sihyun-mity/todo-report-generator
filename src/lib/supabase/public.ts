import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

// 쿠키를 읽지 않는 공개용(anon) Supabase 클라이언트.
// RLS가 공개 SELECT를 허용하는 테이블 조회 전용 — 세션/개인화가 섞이면 ISR 캐시가 오염된다.
export function createPublicClient(): SupabaseClient {
  if (cached) return cached;

  cached = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cached;
}
