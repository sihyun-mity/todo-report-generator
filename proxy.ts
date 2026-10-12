import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { GUEST_MODE_COOKIE, GUEST_MODE_MAX_AGE_SECONDS } from '@/constants';
import { forwardedHeadersOption } from '@/lib/supabase/forwarded-headers';

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

  // 인증 필수 경로에 비로그인 상태로 접근하면 로그인 화면을 보여준다 (홈으로 우회시키지 않는다)
  const redirectToLogin = () => {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  };

  // 게스트 쿠키가 있고 Supabase 세션 흔적도 전혀 없으면 확정적 게스트 — Supabase 조회 생략(stale 토큰 오류 회피)
  if (isGuest && !hasSupabaseSessionCookie(request)) {
    if (isAuthOnlyPath) return redirectToLogin();
    return response;
  }

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    // getUser()가 만료된 토큰을 서버에서 리프레시할 때 GoTrue가 서버 런타임의
    // UA·IP로 auth.sessions를 덮어쓰지 않도록 원래 브라우저 요청 정보를 전달한다.
    ...forwardedHeadersOption(request.headers),
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
    if (isAuthOnlyPath) return redirectToLogin();
    return response;
  }

  // 비인증 상태는 게스트를 기본값으로 간주 — /login으로 보내지 않고 게스트 쿠키를 심어
  // 게스트 모드로 통과시킨다. 로그인은 선택사항(추천 UI로만 노출).
  if (!user && !isPublicPath) {
    if (isAuthOnlyPath) return redirectToLogin();
    // request에도 심어 이번 요청의 서버 렌더가 게스트로 인지하게 하고, response로 브라우저에 영속화한다.
    request.cookies.set(GUEST_MODE_COOKIE, '1');
    response = NextResponse.next({ request });
    response.cookies.set({
      name: GUEST_MODE_COOKIE,
      value: '1',
      maxAge: GUEST_MODE_MAX_AGE_SECONDS,
      path: '/',
      sameSite: 'lax',
    });
    return response;
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
