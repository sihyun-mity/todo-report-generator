import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { createClient } from '@/lib/supabase/server';
import { getWebAuthnConfig } from '@/lib/webauthn/config';
import { sealChallenge } from '@/lib/webauthn/challenge-cookie';

export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const user = userData.user;
  if (!user.email) {
    return NextResponse.json({ error: '계정에 이메일이 없어 패스키를 등록할 수 없습니다.' }, { status: 400 });
  }

  // 이 유저가 이미 가진 credential들을 excludeCredentials로 전달해 같은 authenticator 중복 등록 방지
  const { data: existing, error: selectError } = await supabase
    .from('webauthn_credentials')
    .select('credential_id, transports')
    .eq('user_id', user.id);
  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  const { rpID, rpName } = getWebAuthnConfig();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userDisplayName: user.email,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: (existing ?? []).map((c) => ({
      id: c.credential_id,
      transports: (c.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred',
    },
  });

  await sealChallenge({
    challenge: options.challenge,
    type: 'registration',
    userId: user.id,
  });

  return NextResponse.json(options);
}
