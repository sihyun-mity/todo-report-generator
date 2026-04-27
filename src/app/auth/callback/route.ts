import { NextResponse, type NextRequest } from 'next/server';
import { GUEST_MODE_COOKIE } from '@/constants';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';
  // Supabase가 OAuth 실패 시 ?error=...&error_description=... 으로 돌려보내는 케이스
  const oauthError = url.searchParams.get('error_description') ?? url.searchParams.get('error');

  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  if (oauthError) {
    return redirectTo(`/login?error=${encodeURIComponent(oauthError)}`);
  }
  if (!code) {
    return redirectTo('/login?error=missing_code');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return redirectTo(`/login?error=${encodeURIComponent(error.message)}`);
  }

  const response = redirectTo(safeNext);
  // 게스트 쿠키가 남아있으면 미들웨어가 게스트로 취급해 세션을 무시한다 — 정리
  response.cookies.set({ name: GUEST_MODE_COOKIE, value: '', maxAge: 0, path: '/' });
  return response;
}
