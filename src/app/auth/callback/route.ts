import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { GUEST_MODE_COOKIE } from '@/constants';

// OAuth 코드 교환은 supabase가 발급하는 access/refresh 토큰을 chunked 쿠키로 저장한다.
// `next/headers`의 cookies()로 set하면 GET route handler에서는 응답에 자동 반영되지 않는 케이스가 있어,
// 일부 청크(특히 refresh token이 들어 있는 청크)가 누락된 채 access만 저장될 수 있다.
// 그러면 클라이언트가 자동 갱신을 시도하다 "Refresh Token Not Found"가 반복 발생한다.
// 응답 객체(response)의 cookies에 직접 set하는 supabase 공식 패턴으로 작성한다.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';
  // Supabase가 OAuth 실패 시 ?error=...&error_description=... 으로 돌려보내는 케이스
  const oauthError = url.searchParams.get('error_description') ?? url.searchParams.get('error');

  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const buildRedirect = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  if (oauthError) {
    return buildRedirect(`/login?error=${encodeURIComponent(oauthError)}`);
  }
  if (!code) {
    return buildRedirect('/login?error=missing_code');
  }

  // 응답 객체를 먼저 만들고 supabase가 setAll로 직접 이 응답에 쿠키를 쓰게 한다.
  let response = buildRedirect(safeNext);

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // 새 redirect 응답을 다시 만들고 모든 청크 쿠키를 응답에 직접 기록한다.
        response = buildRedirect(safeNext);
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return buildRedirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  // 게스트 쿠키가 남아있으면 미들웨어가 게스트로 취급해 세션을 무시한다 — 정리
  response.cookies.set({ name: GUEST_MODE_COOKIE, value: '', maxAge: 0, path: '/' });
  return response;
}
