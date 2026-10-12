import 'server-only';
import { cookies } from 'next/headers';
import { sealData, unsealData } from 'iron-session';
import { CHALLENGE_COOKIE_NAME, CHALLENGE_TTL_SECONDS } from '@/constants';
import type { ChallengePayload, ChallengeType } from '@/types';

function getSecret(): string {
  const secret = process.env.WEBAUTHN_CHALLENGE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('WEBAUTHN_CHALLENGE_SECRET 누락 또는 너무 짧음 (32자 이상 필요).');
  }
  return secret;
}

export async function sealChallenge(payload: Omit<ChallengePayload, 'iat'>): Promise<void> {
  const full: ChallengePayload = { ...payload, iat: Math.floor(Date.now() / 1000) };
  const sealed = await sealData(full, { password: getSecret(), ttl: CHALLENGE_TTL_SECONDS });

  const cookieStore = await cookies();
  cookieStore.set(CHALLENGE_COOKIE_NAME, sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: CHALLENGE_TTL_SECONDS,
    path: '/',
  });
}

export async function readChallenge(expectedType: ChallengeType): Promise<ChallengePayload> {
  const cookieStore = await cookies();
  const sealed = cookieStore.get(CHALLENGE_COOKIE_NAME)?.value;
  if (!sealed) {
    throw new Error('챌린지 쿠키가 없습니다. 처음부터 다시 시도해주세요.');
  }

  let payload: ChallengePayload;
  try {
    payload = await unsealData<ChallengePayload>(sealed, { password: getSecret(), ttl: CHALLENGE_TTL_SECONDS });
  } catch {
    throw new Error('챌린지 쿠키가 손상되었거나 만료되었습니다. 처음부터 다시 시도해주세요.');
  }

  if (payload.type !== expectedType) {
    throw new Error('챌린지 유형이 일치하지 않습니다.');
  }
  return payload;
}

export async function clearChallenge(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CHALLENGE_COOKIE_NAME);
}
