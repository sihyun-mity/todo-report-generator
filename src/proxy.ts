import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { GUEST_MODE_COOKIE } from '@/constants';

const PUBLIC_PATH_PREFIXES = ['/login', '/signup', '/auth'];

// 설정 페이지 등 로그인 계정이 필요한 경로 — 게스트는 접근 불가
const AUTH_ONLY_PATH_PREFIXES = ['/settings'];

// @supabase/ssr이 세션을 저장할 때 쓰는 쿠키 이름 패턴
// - `sb-<projectRef>-auth-token` (본 세션)
// - `sb-<projectRef>-auth-token.<n>` (토큰 chunk)
// - `sb-<projectRef>-auth-token-code-verifier` (PKCE verifier — 세션 아님, 제외)
const hasSupabaseSessionCookie = (request: NextRequest): boolean =>
  request.cookies.getAll().some((c) => {
    if (!c.name.startsWith('sb-') || !c.name.includes('-auth-token')) return false;
    if (c.name.includes('-code-verifier')) return false;
    return true;
  });

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

  // 게스트 쿠키가 있고 Supabase 세션 흔적도 전혀 없으면 확정적 게스트 — Supabase 조회 생략(stale 토큰 오류 회피)
  if (isGuest && !hasSupabaseSessionCookie(request)) {
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

  // 실제 세션이 있는데 게스트 쿠키가 남아있는 경우(회원가입 후 이메일 인증 redirect 등) — 게스트 쿠키 정리
  if (user && isGuest) {
    response.cookies.set({ name: GUEST_MODE_COOKIE, value: '', maxAge: 0, path: '/' });
  }

  // 세션이 없고 게스트 쿠키만 남은 경우(세션이 만료된 게스트)도 게스트로 동작
  if (!user && isGuest) {
    if (isAuthOnlyPath) {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = '/';
      return NextResponse.redirect(homeUrl);
    }
    return response;
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
