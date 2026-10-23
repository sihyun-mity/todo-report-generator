import 'server-only';
import { cookies } from 'next/headers';
import { sealData, unsealData } from 'iron-session';
import { GITHUB_TOKEN_COOKIE_NAME, GITHUB_TOKEN_TTL_SECONDS } from '@/constants';
import type { GithubTokenPayload } from '@/types';

// GitHub 토큰은 DB 에 저장하지 않는다. 봉인 쿠키(httpOnly)에만 두어 서버가 요청 시점에만 꺼내 쓰고,
// 브라우저 JS(XSS)에서는 읽을 수 없게 한다. 토큰을 받은 회원 id 를 함께 봉인해 계정이 바뀌면 쓰지 않는다.
function getSecret(): string {
  const secret = process.env.GITHUB_TOKEN_COOKIE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('GITHUB_TOKEN_COOKIE_SECRET 누락 또는 너무 짧음 (32자 이상 필요).');
  }
  return secret;
}

type SealedCookie = {
  name: string;
  value: string;
  options: { httpOnly: true; secure: boolean; sameSite: 'lax'; maxAge: number; path: '/' };
};

// `/auth/callback` 은 redirect 응답 객체에 쿠키를 직접 쓴다(Supabase 세션 쿠키와 같은 이유).
// 그래서 여기서는 봉인한 쿠키 값만 만들어 돌려준다.
export async function createGithubTokenCookie(payload: GithubTokenPayload): Promise<SealedCookie> {
  const value = await sealData(payload, { password: getSecret(), ttl: GITHUB_TOKEN_TTL_SECONDS });
  return {
    name: GITHUB_TOKEN_COOKIE_NAME,
    value,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: GITHUB_TOKEN_TTL_SECONDS,
      path: '/',
    },
  };
}

// 봉인 쿠키의 토큰. 다른 회원(로그아웃 후 다른 계정 로그인 등)이 받은 토큰이면 null 이다.
export async function readGithubToken(userId: string): Promise<GithubTokenPayload | null> {
  const cookieStore = await cookies();
  const sealed = cookieStore.get(GITHUB_TOKEN_COOKIE_NAME)?.value;
  if (!sealed) return null;
  try {
    const payload = await unsealData<GithubTokenPayload>(sealed, {
      password: getSecret(),
      ttl: GITHUB_TOKEN_TTL_SECONDS,
    });
    // 만료·손상된 봉인은 unsealData 가 빈 객체를 돌려준다
    return payload.accessToken && payload.userId === userId ? payload : null;
  } catch {
    return null;
  }
}

export async function clearGithubToken(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(GITHUB_TOKEN_COOKIE_NAME);
}
