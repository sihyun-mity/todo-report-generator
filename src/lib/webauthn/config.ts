import 'server-only';

export interface WebAuthnConfig {
  rpID: string;
  rpName: string;
  origin: string;
}

function readEnv(name: 'WEBAUTHN_RP_ID' | 'WEBAUTHN_RP_NAME' | 'WEBAUTHN_ORIGIN'): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`환경변수 ${name}가 설정되지 않았습니다.`);
  }
  return value;
}

export function getWebAuthnConfig(): WebAuthnConfig {
  return {
    rpID: readEnv('WEBAUTHN_RP_ID'),
    rpName: readEnv('WEBAUTHN_RP_NAME'),
    origin: readEnv('WEBAUTHN_ORIGIN'),
  };
}
