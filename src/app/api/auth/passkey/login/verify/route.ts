import { NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getWebAuthnConfig } from '@/lib/webauthn/config';
import { readChallenge, clearChallenge } from '@/lib/webauthn/challenge-cookie';
import { byteaToBytes } from '@/lib/webauthn/bytea';
import { issuePasskeyLoginTokens } from '@/lib/webauthn/session';

export const dynamic = 'force-dynamic';

type Body = {
  response: AuthenticationResponseJSON;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: '요청 본문이 JSON이 아닙니다.' }, { status: 400 });
  }
  if (!body?.response?.id) {
    return NextResponse.json({ error: 'response 필드가 비어 있습니다.' }, { status: 400 });
  }

  let challenge: string;
  try {
    const payload = await readChallenge('authentication');
    challenge = payload.challenge;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: credRow, error: credErr } = await admin
    .from('webauthn_credentials')
    .select('id, user_id, credential_id, public_key, counter, transports')
    .eq('credential_id', body.response.id)
    .maybeSingle();

  if (credErr) {
    return NextResponse.json({ error: credErr.message }, { status: 500 });
  }
  if (!credRow) {
    await clearChallenge();
    return NextResponse.json({ error: '등록되지 않은 패스키입니다.' }, { status: 404 });
  }

  const { rpID, origin } = getWebAuthnConfig();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credRow.credential_id,
        publicKey: byteaToBytes(credRow.public_key),
        counter: Number(credRow.counter),
        transports: (credRow.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
      },
      requireUserVerification: false,
    });
  } catch (e) {
    await clearChallenge();
    return NextResponse.json({ error: `패스키 검증 실패: ${(e as Error).message}` }, { status: 400 });
  }

  if (!verification.verified) {
    await clearChallenge();
    return NextResponse.json({ error: '패스키 검증 실패.' }, { status: 400 });
  }

  // counter/last_used_at 갱신 (admin client로 — trigger는 auth.uid() is null인 service_role 경로에서 통과)
  const { error: updateErr } = await admin
    .from('webauthn_credentials')
    .update({
      counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', credRow.id);
  if (updateErr) {
    // 로그만 남기고 진행 — 세션 발급까지 성공시키되 counter 저장 실패는 다음 요청에서 재시도될 것
    console.error('[passkey/verify] counter 갱신 실패:', updateErr.message);
  }

  // 이메일 조회 → magiclink → token_hash 브리지
  const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(credRow.user_id);
  if (userErr || !userRes.user?.email) {
    await clearChallenge();
    return NextResponse.json({ error: '계정 이메일을 찾을 수 없습니다.' }, { status: 500 });
  }

  let tokens;
  try {
    tokens = await issuePasskeyLoginTokens(userRes.user.email);
  } catch (e) {
    await clearChallenge();
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  await clearChallenge();

  return NextResponse.json({
    verified: true,
    email: tokens.email,
    tokenHash: tokens.tokenHash,
  });
}
