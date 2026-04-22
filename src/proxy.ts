import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { GUEST_MODE_COOKIE } from '@/lib/guest';

const PUBLIC_PATH_PREFIXES = ['/login', '/signup', '/auth'];

// 설정 페이지 등 로그인 계정이 필요한 경로 — 게스트는 접근 불가
const AUTH_ONLY_PATH_PREFIXES = ['/settings'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { pathname } = request.nextUrl;

  // API 경로는 각 route handler가 자체적으로 인증·권한을 판단한다.
  // 미들웨어는 redirect하지 않고 그대로 통과시켜야 비로그인 호출(패스키 로그인 등)에
  // HTML redirect 대신 JSON 응답이 돌아간다.
  if (pathname.startsWith('/api/')) {
    return response;
  }

  const isPublicPath = PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isAuthOnlyPath = AUTH_ONLY_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isGuest = request.cookies.get(GUEST_MODE_COOKIE)?.value === '1';

  // 게스트는 Supabase 세션 조회 자체를 건너뛴다 — stale refresh token이 있어도 오류로 이어지지 않게 함
  if (isGuest) {
    if (isAuthOnlyPath) {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = '/';
      return NextResponse.redirect(homeUrl);
    }
    return response;
  }

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // refresh_token_not_found 등 stale 토큰 오류는 비로그인으로 간주하고 진행
  let user: { id: string } | null = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }

  if (!user && !isPublicPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  if (user && isPublicPath) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/';
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
