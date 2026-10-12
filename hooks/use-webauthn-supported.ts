'use client';

import { useSyncExternalStore } from 'react';
import { isWebAuthnSupported } from '@/lib/webauthn/client';

const subscribeNoop = () => () => {};
const getServerSnapshot = () => null;

/**
 * 브라우저의 WebAuthn(패스키) 지원 여부.
 *
 * SSR 과 hydration 첫 렌더에서는 `null`(확인 전), 이후 클라이언트에서 `true`/`false` 로 확정된다.
 * 버튼을 항상 렌더링해 두고 `false` 일 때만 비활성/경고를 띄우면 hydration mismatch 와 깜빡임을 둘 다 피할 수 있다.
 */
export function useWebAuthnSupported(): boolean | null {
  return useSyncExternalStore(subscribeNoop, isWebAuthnSupported, getServerSnapshot);
}
