import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { forwardedHeadersOption } from '@/lib/supabase/forwarded-headers';

export async function createClient() {
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
