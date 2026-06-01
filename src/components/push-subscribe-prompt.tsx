'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { BellRing, X } from 'lucide-react';
import { useScrollLock } from 'usehooks-ts';
import { DIALOG_PRIORITY_PUSH_SUBSCRIBE, DIALOG_PUSH_SUBSCRIBE, PUSH_PROMPT_DISMISSED_KEY } from '@/constants';
import { isGuestMode } from '@/lib/guest';
import { getExistingSubscription, isPushSupported, subscribeToPush } from '@/lib/push/push-client';
import { useDialogQueueStore, useIsActiveDialog } from '@/stores';
import { Link, Portal, useDeferOpenDuringViewTransition, useDismissOnBack } from '.';

// 로그인 직후 홈에서 한 번 뜨는 작성 알림 구독 권유 다이얼로그.
// 노출 조건: 로그인 계정 + 푸시 지원 + 권한 거부 안 함 + 이 기기 미구독 + "나중에"로 닫은 적 없음.
// ((app) 그룹은 로그인/게스트만 접근하므로 !isGuestMode() = 로그인 사용자)
export function PushSubscribePrompt() {
  const [subscribing, setSubscribing] = useState(false);

  const request = useDialogQueueStore((s) => s.request);
  const release = useDialogQueueStore((s) => s.release);
  // 큐에서 자신이 활성일 때만 실제로 열린다 (다른 자동 다이얼로그와 동시 노출 방지).
  const isActive = useIsActiveDialog(DIALOG_PUSH_SUBSCRIBE);

  // 페이지 진입 View Transition 이 진행 중이면 전환이 끝난 뒤에 열리도록 한 박자 미룬다.
  const deferredOpen = useDeferOpenDuringViewTransition(isActive);

  const { lock, unlock } = useScrollLock({ autoLock: false });
  useEffect(() => {
    if (deferredOpen) lock();
    else unlock();
    return () => unlock();
  }, [deferredOpen, lock, unlock]);

  useEffect(() => {
    if (isGuestMode()) return;
    if (!isPushSupported()) return; // iOS 미설치 PWA 등 구독 불가 환경 제외
    if (Notification.permission === 'denied') return;
    try {
      if (localStorage.getItem(PUSH_PROMPT_DISMISSED_KEY) === '1') return;
    } catch {
      return;
    }

    let cancelled = false;
    (async () => {
      const sub = await getExistingSubscription().catch(() => null);
      if (cancelled || sub) return; // 이미 이 기기에서 구독 중이면 띄우지 않음
      request(DIALOG_PUSH_SUBSCRIBE, DIALOG_PRIORITY_PUSH_SUBSCRIBE);
    })();
    // 홈을 벗어나 언마운트되면 큐에 항목이 남지 않도록 정리한다.
    return () => {
      cancelled = true;
      release(DIALOG_PUSH_SUBSCRIBE);
    };
  }, [request, release]);

  // 닫기(나중에 / X / 바깥 클릭 / back / Esc) — 다시 묻지 않도록 기억한다.
  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, '1');
    } catch {
      // 무시
    }
    release(DIALOG_PUSH_SUBSCRIBE);
  }, [release]);

  useDismissOnBack(deferredOpen, dismiss);

  useEffect(() => {
    if (!deferredOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deferredOpen, dismiss]);

  const handleEnable = async () => {
    if (subscribing) return;
    setSubscribing(true);
    try {
      await subscribeToPush();
      try {
        localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, '1');
      } catch {
        // 무시
      }
      release(DIALOG_PUSH_SUBSCRIBE);
      toast.success('작성 알림을 켰어요. 평일 오후 4시에 알림을 보내드릴게요.');
    } catch (error) {
      // 실패해도 다이얼로그를 닫지 않는다 — 권한을 나중에 허용한 뒤 다시 "알림 켜기"로 재시도할 수 있어야 한다.
      // (닫기는 사용자가 명시적으로 X / 나중에 / 바깥 클릭 / back / Esc 를 했을 때만 dismiss() 로 처리)
      const message = error instanceof Error ? error.message : '';
      if (message === 'denied') {
        toast.error('알림 권한이 거부됐어요. 브라우저 설정에서 허용한 뒤 다시 시도해주세요.');
      } else if (message !== 'unsupported') {
        toast.error(message || '알림 설정에 실패했어요.');
      }
    } finally {
      setSubscribing(false);
    }
  };

  if (!deferredOpen) return null;

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-prompt-title"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm sm:p-6"
        onClick={dismiss}
      >
        <div
          className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={dismiss}
            aria-label="닫기"
            className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex flex-col items-center px-6 pt-8 pb-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600/10 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
              <BellRing className="h-6 w-6" />
            </div>
            <h2 id="push-prompt-title" className="mt-4 text-lg font-bold text-zinc-900 dark:text-zinc-100">
              작성 알림을 켜보세요
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              아직 오늘 업무 보고를 작성하지 않았다면, 평일 오후 4시에 알림으로 알려드릴게요.
            </p>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              알림은 이 기기(브라우저)에서 받게 되며, 언제든{' '}
              <Link
                href="/settings/notifications"
                onClick={dismiss}
                className="font-semibold text-blue-500 hover:underline"
              >
                설정
              </Link>
              에서 끌 수 있어요.
            </p>
          </div>

          <div className="flex flex-col gap-2 p-5 pt-4">
            <button
              type="button"
              onClick={handleEnable}
              disabled={subscribing}
              className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              {subscribing ? '켜는 중...' : '알림 켜기'}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              나중에
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
