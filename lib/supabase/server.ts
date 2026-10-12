import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { connection } from 'next/server';
import { forwardedHeadersOption } from '@/lib/supabase/forwarded-headers';

export async function createClient() {
  // Supabase auth 는 세션 만료 검사·토큰 갱신에 현재 시각(Date.now)을 쓴다. Cache Components 에서는
  // 쿠키가 주어진 채 프리렌더되는 단계(세션별 App Shell, dev 검증)가 있어 cookies() 만으로는 프리렌더가
  // 멈추지 않고, 이어지는 auth 호출이 "unstable value Date.now()" 오류를 낸다. 세션 기반 조회는 언제나
  // 요청 시점 작업이므로 클라이언트 생성 시점에 프리렌더를 멈춘다.
  await connection();
  const cookieStore = await cookies();
  const headerStore = await headers();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    // RSC·route handler에서 토큰이 서버 리프레시될 때 GoTrue가 서버 런타임의
    // UA·IP로 auth.sessions를 덮어쓰지 않도록 원래 브라우저 요청 정보를 전달한다.
    ...forwardedHeadersOption(headerStore),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component 렌더 중 호출된 경우 무시 (proxy에서 세션 갱신됨)
        }
      },
    },
  });
}
