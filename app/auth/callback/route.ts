import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  GITHUB_IMPORT_INTENT_COOKIE,
  GITHUB_IMPORT_OAUTH_SCOPES,
  GITHUB_OAUTH_RESULT_PARAM,
  GUEST_MODE_COOKIE,
  PENDING_NEWS_SEEN_COOKIE,
} from '@/constants';
import { inspectGithubToken } from '@/lib/github/api';
import { parseGithubImportIntent } from '@/lib/github/import-intent';
import { createGithubTokenCookie } from '@/lib/github/token-cookie';
import { markNewsAsReadUpTo } from '@/lib/news';
import { forwardedHeadersOption } from '@/lib/supabase/forwarded-headers';

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
  // 커밋 가져오기 연결(이미 로그인한 회원이 `repo` 스코프로 GitHub OAuth 를 다시 거친 경우).
  // 의도 쿠키의 회원 id 와 교환 결과가 다르면(다른 계정으로 로그인됨) 토큰을 받지 않는다.
  const githubImport = parseGithubImportIntent(request.cookies.get(GITHUB_IMPORT_INTENT_COOKIE)?.value);
  const isGithubImport = githubImport !== null;
  const githubImportTarget = (result: 'connected' | 'denied' | 'error') => {
    const target = new URL(githubImport?.next ?? safeNext, url.origin);
    target.searchParams.set(GITHUB_OAUTH_RESULT_PARAM, result);
    return `${target.pathname}${target.search}`;
  };
  // 의도 쿠키는 한 번만 쓰인다 — 커밋 가져오기 흐름의 모든 응답에서 지운다
  const buildImportRedirect = (path: string) => {
    const importResponse = buildRedirect(path);
    importResponse.cookies.set({ name: GITHUB_IMPORT_INTENT_COOKIE, value: '', maxAge: 0, path: '/' });
    return importResponse;
  };

  // exchange 실패 / OAuth 에러로 복귀할 때 호출. 이전 세션의 stale 청크 토큰과 PKCE verifier 가
  // 남아있으면 다음 로그인 시도에서 또 같은 실패를 반복하므로, supabase 가 쓰는 쿠키를 모두 지운다.
  // - `sb-<projectRef>-auth-token` / `.0` / `.1` (access/refresh 청크)
  // - `sb-<projectRef>-auth-token-code-verifier` (PKCE — 새 시도에서 새로 생성)
  const buildFailureRedirect = (errorMessage: string) => {
    const failureResponse = buildRedirect(`/login?error=${encodeURIComponent(errorMessage)}`);
    request.cookies.getAll().forEach((c) => {
      if (c.name.startsWith('sb-') && c.name.includes('-auth-token')) {
        failureResponse.cookies.set({ name: c.name, value: '', maxAge: 0, path: '/' });
      }
    });
    return failureResponse;
  };

  // 커밋 가져오기 연결은 로그인 상태에서 시작한다. GitHub 승인 화면에서 취소해도 기존 세션은 그대로 두고
  // 원래 화면으로 돌려보낸다(로그인 실패처럼 세션 쿠키를 지우면 회원이 로그아웃된다).
  if (oauthError && isGithubImport) {
    return buildImportRedirect(githubImportTarget('denied'));
  }
  if (oauthError) {
    return buildFailureRedirect(oauthError);
  }
  if (!code) {
    return buildFailureRedirect('missing_code');
  }

  // 응답 객체를 먼저 만들고 supabase가 setAll로 직접 이 응답에 쿠키를 쓰게 한다.
  let redirectPath = safeNext;
  let response = buildRedirect(redirectPath);
  // 커밋 가져오기 연결 결과에 따라 redirect 대상을 바꿀 때 세션 쿠키를 새 응답에 다시 옮겨 담는다
  let sessionCookies: Array<{ name: string; value: string; options: CookieOptions }> = [];

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    // 코드 교환·이후 토큰 리프레시가 서버에서 일어나도 GoTrue가 실제 기기 정보를
    // auth.sessions에 기록하도록 원래 브라우저 요청의 UA·IP를 전달한다.
    ...forwardedHeadersOption(request.headers),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // 새 redirect 응답을 다시 만들고 모든 청크 쿠키를 응답에 직접 기록한다.
        sessionCookies = cookiesToSet;
        response = buildRedirect(redirectPath);
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error && isGithubImport) {
    return buildImportRedirect(githubImportTarget('error'));
  }
  if (error) {
    return buildFailureRedirect(error.message);
  }

  // 커밋 가져오기 연결: 로그인용 GitHub OAuth App 이 넘긴 provider token 을 봉인 쿠키에 담는다.
  // Supabase 는 provider token 을 보관·갱신하지 않으므로 교환 직후인 지금만 받을 수 있다.
  // `repo` 스코프가 실제로 승인된 토큰만 받는다(평소 로그인 토큰은 저장하지 않는다).
  if (isGithubImport) {
    let result: 'connected' | 'error' = 'error';
    const providerToken = data.session?.provider_token;
    if (providerToken && data.user && data.user.id === githubImport.userId) {
      try {
        const { login, scopes } = await inspectGithubToken(providerToken);
        if (scopes.includes(GITHUB_IMPORT_OAUTH_SCOPES)) {
          const cookie = await createGithubTokenCookie({ accessToken: providerToken, login, userId: data.user.id });
          redirectPath = githubImportTarget('connected');
          response = buildImportRedirect(redirectPath);
          sessionCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          response.cookies.set(cookie.name, cookie.value, cookie.options);
          result = 'connected';
        }
      } catch {
        // GitHub API 오류 — 아래에서 error 로 돌려보낸다
      }
    }
    if (result === 'error') {
      console.warn(
        `[github-import] 콜백 토큰 저장 실패: token=${Boolean(providerToken)} sameUser=${data.user?.id === githubImport.userId}`
      );
      redirectPath = githubImportTarget('error');
      response = buildImportRedirect(redirectPath);
      sessionCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    }
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
        await markNewsAsReadUpTo(supabase, userId, pendingNewsSeen);
      }
    } catch {
      // 마이그레이션이 실패해도 로그인 자체는 성공시킨다 — 다이얼로그가 한 번 더 뜰 뿐.
    }
    response.cookies.set({ name: PENDING_NEWS_SEEN_COOKIE, value: '', maxAge: 0, path: '/' });
  }

  return response;
}
