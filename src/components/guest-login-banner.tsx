'use client';

import { useState, useSyncExternalStore } from 'react';
import { CloudUpload, X } from 'lucide-react';
import { isGuestMode } from '@/lib/guest';
import { GUEST_LOGIN_BANNER_DISMISS_KEY } from '@/constants';
import { Link } from '.';

// SSR에서는 항상 false, 클라이언트에서는 쿠키·localStorage를 읽어 동기화 — hydration mismatch 방지
const subscribeNoop = () => () => {};
const getEligibleSnapshot = () => isGuestMode() && localStorage.getItem(GUEST_LOGIN_BANNER_DISMISS_KEY) !== '1';
const getEligibleServerSnapshot = () => false;

// 게스트에게 홈 상단에 한 번 뜨는 로그인 추천 배너.
// 게스트가 기본 진입 상태이므로 강요하지 않는다 — "나중에"로 닫으면 다시 뜨지 않는다.
// 노출 조건: 게스트 모드 + 사용자가 닫은 적 없음.
export function GuestLoginBanner() {
  const eligible = useSyncExternalStore(subscribeNoop, getEligibleSnapshot, getEligibleServerSnapshot);
  const [dismissed, setDismissed] = useState(false);

  const handleDismiss = () => {
    if (typeof window !== 'undefined') localStorage.setItem(GUEST_LOGIN_BANNER_DISMISS_KEY, '1');
    setDismissed(true);
  };

  if (!eligible || dismissed) return null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6 lg:px-12">
      <div className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mt-0.5 rounded-lg bg-zinc-900/5 p-2 text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
          <CloudUpload size={18} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold text-zinc-900 dark:text-white">로그인 없이 사용 중이에요</div>
          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
            지금 작성하는 기록은 이 브라우저에만 저장돼요. 로그인하면 기록이 계정에 안전하게 보관되고 다른 기기에서도
            이어서 쓸 수 있어요.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              로그인 / 회원가입
            </Link>
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
