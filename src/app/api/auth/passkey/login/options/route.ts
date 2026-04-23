import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { getWebAuthnConfig } from '@/lib/webauthn/config';
import { sealChallenge } from '@/lib/webauthn/challenge-cookie';

export const dynamic = 'force-dynamic';

type Body = {
  /** 이메일 힌트 (옵셔널, conditional UI에서는 생략) */
  email?: string;
};

/**
 * 패스키 로그인 옵션 생성.
 *
 * 현재는 usernameless(discoverable credential) 모드만 지원:
 * - allowCredentials를 비워서 브라우저가 기기에 저장된 passkey 중 이 RP용을 골라 제안한다.
 * - conditional UI(autofill)도 동일한 options로 동작.
 *
 * 이메일 힌트는 받지만 서버 쪽 allowCredentials 필터에는 사용하지 않는다
 * (Supabase 쪽 email→user_id 조회 비용을 피하려는 MVP 선택).
 */
export async function POST(request: Request) {
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    // 본문 없는 호출도 허용
  }

  const { rpID } = getWebAuthnConfig();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials: [],
  });

  await sealChallenge({
    challenge: options.challenge,
    type: 'authentication',
    email: body.email,
  });

  return NextResponse.json(options);
}
