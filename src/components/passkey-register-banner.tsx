'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { KeyRound, X } from 'lucide-react';
import { isWebAuthnSupported, registerPasskey } from '@/lib/webauthn/client';
import { isGuestMode } from '@/lib/guest';
import { PASSKEY_BANNER_DISMISS_KEY } from '@/constants';

// 홈 상단에 한 번 뜨는 패스키 등록 유도 배너.
// 노출 조건: 로그인 계정 + 패스키 0개 + WebAuthn 지원 + 사용자가 "나중에" 눌러 닫은 적 없음.
export function PasskeyRegisterBanner() {
  const [visible, setVisible] = useState(false);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    if (isGuestMode()) return;
    if (!isWebAuthnSupported()) return;
    if (typeof window !== 'undefined' && localStorage.getItem(PASSKEY_BANNER_DISMISS_KEY) === '1') return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/passkeys', { method: 'GET', cache: 'no-store' });
        if (!res.ok) return; // 비로그인 등 — 배너 안 띄움
        const body = (await res.json()) as { passkeys: ReadonlyArray<unknown> };
        if (cancelled) return;
        if (Array.isArray(body.passkeys) && body.passkeys.length === 0) {
          setVisible(true);
        }
      } catch {
        // 네트워크 오류 등 — 조용히 무시
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDismiss = () => {
    if (typeof window !== 'undefined') localStorage.setItem(PASSKEY_BANNER_DISMISS_KEY, '1');
    setVisible(false);
  };

  const handleRegister = async () => {
    if (registering) return;
    setRegistering(true);
    try {
      await registerPasskey();
      toast.success('패스키가 등록되었습니다. 다음부터는 비밀번호 없이 로그인할 수 있어요.');
      if (typeof window !== 'undefined') localStorage.setItem(PASSKEY_BANNER_DISMISS_KEY, '1');
      setVisible(false);
    } catch (e) {
      const msg = (e as Error).message;
      if (!/NotAllowedError|cancel|timed out/i.test(msg)) {
        toast.error(msg);
      }
    } finally {
      setRegistering(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6 lg:px-12">
      <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
        <div className="mt-0.5 rounded-lg bg-blue-600/10 p-2 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
          <KeyRound size={18} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold text-zinc-900 dark:text-white">이 기기에 패스키 등록하기</div>
          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
            Face ID / 지문 / Windows Hello 로 비밀번호 없이 바로 로그인할 수 있어요.{' '}
            <Link href="/settings/passkeys" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
              설정에서 관리
            </Link>
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleRegister}
              disabled={registering}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              {registering ? '등록 중...' : '등록'}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              나중에
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="닫기"
          className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
