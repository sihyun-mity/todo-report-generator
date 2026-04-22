// 브라우저 전용 유틸. 서버 컴포넌트/라우트에서 import 금지
// (내부에서 navigator / PublicKeyCredential 을 건드린다).

import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { createClient } from '@/lib/supabase/client';

export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';
}

function detectBrowser(ua: string): string {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Version\/.*Safari\//.test(ua)) return 'Safari';
  return 'Browser';
}

function detectOS(ua: string): string {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/.test(ua)) return 'macOS';
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return '';
}

/**
 * navigator.userAgent에서 "Chrome on macOS" 같은 기본 라벨을 생성한다.
 * 사용자는 /settings/passkeys에서 언제든 수정 가능.
 */
export function guessDeviceLabel(): string | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent ?? '';
  if (!ua) return null;
  const browser = detectBrowser(ua);
  const os = detectOS(ua);
  if (!os) return browser;
  if (os === 'iPhone' || os === 'iPad' || os === 'Android') return `${os} · ${browser}`;
  return `${browser} on ${os}`;
}

export async function isConditionalUISupported(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  const PKC = window.PublicKeyCredential as typeof window.PublicKeyCredential & {
    isConditionalMediationAvailable?: () => Promise<boolean>;
  };
  if (typeof PKC.isConditionalMediationAvailable !== 'function') return false;
  try {
    return await PKC.isConditionalMediationAvailable();
  } catch {
    return false;
  }
}

async function parseError(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) message = body.error;
  } catch {
    // JSON 아닌 응답 — fallback 사용
  }
  throw new Error(message);
}

export async function registerPasskey(options: { deviceName?: string } = {}): Promise<void> {
  const optsRes = await fetch('/api/auth/passkey/register/options', { method: 'POST' });
  if (!optsRes.ok) await parseError(optsRes, '패스키 등록 옵션 요청 실패');
  const optsJSON = (await optsRes.json()) as PublicKeyCredentialCreationOptionsJSON;

  const response = await startRegistration({ optionsJSON: optsJSON });

  // 명시적으로 호출자가 deviceName을 주면 그걸 쓰고, 아니면 UA 기반 기본 라벨로 채움
  const deviceName = options.deviceName ?? guessDeviceLabel() ?? undefined;

  const verifyRes = await fetch('/api/auth/passkey/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response, deviceName }),
  });
  if (!verifyRes.ok) await parseError(verifyRes, '패스키 등록 검증 실패');
}

export async function loginWithPasskey(
  options: { useAutofill?: boolean; email?: string } = {}
): Promise<{ email: string }> {
  const { useAutofill = false, email } = options;

  const optsRes = await fetch('/api/auth/passkey/login/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!optsRes.ok) await parseError(optsRes, '패스키 로그인 옵션 요청 실패');
  const optsJSON = (await optsRes.json()) as PublicKeyCredentialRequestOptionsJSON;

  const response = await startAuthentication({ optionsJSON: optsJSON, useBrowserAutofill: useAutofill });

  const verifyRes = await fetch('/api/auth/passkey/login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response }),
  });
  if (!verifyRes.ok) await parseError(verifyRes, '패스키 로그인 검증 실패');
  const { email: userEmail, tokenHash } = (await verifyRes.json()) as { email: string; tokenHash: string };

  const supabase = createClient();
  const { error } = await supabase.auth.verifyOtp({ type: 'email', token_hash: tokenHash });
  if (error) throw new Error(`세션 발급 실패: ${error.message}`);

  return { email: userEmail };
}
