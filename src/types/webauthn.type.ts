export type ChallengeType = 'registration' | 'authentication';

export type ChallengePayload = {
  challenge: string;
  type: ChallengeType;
  /** 등록 시: 현재 로그인 사용자 id (UUID) */
  userId?: string;
  /** 인증 시: 프론트가 이메일 힌트를 보낸 경우 */
  email?: string;
  /** 발급 시각 (초 단위 unix epoch) */
  iat: number;
};

export type WebAuthnConfig = {
  rpID: string;
  rpName: string;
  origin: string;
};

export type PasskeySessionTokens = {
  email: string;
  tokenHash: string;
};
