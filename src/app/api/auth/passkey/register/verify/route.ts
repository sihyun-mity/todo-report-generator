import { NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getWebAuthnConfig } from '@/lib/webauthn/config';
import { readChallenge, clearChallenge } from '@/lib/webauthn/challenge-cookie';
import { bytesToBytea } from '@/lib/webauthn/bytea';

export const dynamic = 'force-dynamic';

interface Body {
  response: RegistrationResponseJSON;
  deviceName?: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const user = userData.user;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: '요청 본문이 JSON이 아닙니다.' }, { status: 400 });
  }
  if (!body?.response) {
    return NextResponse.json({ error: 'response 필드가 비어 있습니다.' }, { status: 400 });
  }

  let challenge: string;
  try {
    const payload = await readChallenge('registration');
    if (payload.userId !== user.id) {
      throw new Error('챌린지에 기록된 사용자와 현재 로그인 사용자가 다릅니다.');
    }
    challenge = payload.challenge;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const { rpID, origin } = getWebAuthnConfig();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (e) {
    await clearChallenge();
    return NextResponse.json({ error: `패스키 검증 실패: ${(e as Error).message}` }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    await clearChallenge();
    return NextResponse.json({ error: '패스키 검증 실패.' }, { status: 400 });
  }

  const info = verification.registrationInfo;
  const transports = body.response.response?.transports ?? null;

  // AAGUID가 zero UUID(플랫폼 비공개)로 오면 null로 저장해 컬럼 의미를 유지
  const aaguid = info.aaguid && info.aaguid !== '00000000-0000-0000-0000-000000000000' ? info.aaguid : null;

  // SimpleWebAuthn은 'singleDevice' / 'multiDevice' (camelCase)를 반환하지만
  // DB check constraint는 snake_case만 허용
  const deviceType =
    info.credentialDeviceType === 'singleDevice'
      ? 'single_device'
      : info.credentialDeviceType === 'multiDevice'
        ? 'multi_device'
        : null;

  const admin = createAdminClient();
  const { error: insertError } = await admin.from('webauthn_credentials').insert({
    user_id: user.id,
    credential_id: info.credential.id,
    public_key: bytesToBytea(info.credential.publicKey),
    counter: info.credential.counter,
    transports,
    aaguid,
    device_type: deviceType,
    backed_up: info.credentialBackedUp,
    device_name: body.deviceName?.trim() || null,
  });

  await clearChallenge();

  if (insertError) {
    return NextResponse.json({ error: `DB 저장 실패: ${insertError.message}` }, { status: 500 });
  }

  return NextResponse.json({ verified: true });
}
