import 'server-only';
import { cookies } from 'next/headers';
import { sealData, unsealData } from 'iron-session';

export const CHALLENGE_COOKIE_NAME = 'webauthn_challenge';
const TTL_SECONDS = 300; // 5분

export type ChallengeType = 'registration' | 'authentication';

export interface ChallengePayload {
  challenge: string;
  type: ChallengeType;
  /** 등록 시: 현재 로그인 사용자 id (UUID) */
  userId?: string;
  /** 인증 시: 프론트가 이메일 힌트를 보낸 경우 */
  email?: string;
  /** 발급 시각 (초 단위 unix epoch) */
  iat: number;
}

function getSecret(): string {
  const secret = process.env.WEBAUTHN_CHALLENGE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('WEBAUTHN_CHALLENGE_SECRET 누락 또는 너무 짧음 (32자 이상 필요).');
  }
  return secret;
}

export async function sealChallenge(payload: Omit<ChallengePayload, 'iat'>): Promise<void> {
  const full: ChallengePayload = { ...payload, iat: Math.floor(Date.now() / 1000) };
  const sealed = await sealData(full, { password: getSecret(), ttl: TTL_SECONDS });

  const cookieStore = await cookies();
  cookieStore.set(CHALLENGE_COOKIE_NAME, sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: TTL_SECONDS,
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
    payload = await unsealData<ChallengePayload>(sealed, { password: getSecret(), ttl: TTL_SECONDS });
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
