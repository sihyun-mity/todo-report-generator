import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { GUEST_MODE_COOKIE, PENDING_NEWS_SEEN_COOKIE } from '@/constants';
import { markNewsAsReadForUser } from '@/lib/news';

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

  // OAuth 코드 교환은 서버에서 실행되므로, 브라우저 정보를 명시적으로 전달하지 않으면
  // GoTrue가 서버 런타임(node/undici)의 UA·IP를 auth.sessions에 기록한다.
  // 그러면 로그인 기기 관리 화면이 "알 수 없는 기기"로 표시한다 — 실제 기기 정보를 실어 보낸다.
  const userAgent = request.headers.get('user-agent');
  // Vercel이 세팅하는 x-real-ip가 신뢰 가능한 단일 클라이언트 IP다.
  // x-forwarded-for 맨 앞 값은 클라이언트가 위조해 끼워넣을 수 있어 폴백으로만 쓴다.
  const clientIp = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();

  const forwardedHeaders: Record<string, string> = {};
  if (userAgent) forwardedHeaders['User-Agent'] = userAgent;
  if (clientIp) forwardedHeaders['X-Forwarded-For'] = clientIp;

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    ...(Object.keys(forwardedHeaders).length > 0 ? { global: { headers: forwardedHeaders } } : {}),
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

  // 게스트 시절 마지막으로 본 새소식 id 가 임시 쿠키로 들어왔다면 user_news_reads 로 마이그레이션한다.
  // 이 흐름이 없으면 신규 가입자로 인식되어 NewsDialogMount 가 최신 1건만 자동 읽음 처리하므로,
  // 게스트가 안 본 새 소식이 있는 경우 묻혀버린다.
  const pendingNewsSeen = request.cookies.get(PENDING_NEWS_SEEN_COOKIE)?.value;
  if (pendingNewsSeen) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (userId) {
        await markNewsAsReadForUser(supabase, userId, pendingNewsSeen);
      }
    } catch {
      // 마이그레이션이 실패해도 로그인 자체는 성공시킨다 — 다이얼로그가 한 번 더 뜰 뿐.
    }
    response.cookies.set({ name: PENDING_NEWS_SEEN_COOKIE, value: '', maxAge: 0, path: '/' });
  }

  return response;
}
