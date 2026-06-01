'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Bell, Send } from 'lucide-react';
import {
  getExistingSubscription,
  isIos,
  isPushSupported,
  isStandalone,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push/push-client';
import { SettingsSubHeader } from '.';

type Status = 'loading' | 'unsupported' | 'ios-needs-install' | 'ready';

export function NotificationsSection() {
  const [status, setStatus] = useState<Status>('loading');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isPushSupported()) {
        // iOS Safari 는 홈 화면에 추가(설치)해야 푸시 지원 — 안내 분기
        if (!cancelled) setStatus(isIos() && !isStandalone() ? 'ios-needs-install' : 'unsupported');
        return;
      }
      const subscription = await getExistingSubscription().catch(() => null);
      if (cancelled) return;
      setEnabled(Boolean(subscription));
      setStatus('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (enabled) {
        await unsubscribeFromPush();
        setEnabled(false);
        toast.success('작성 알림을 껐어요.');
      } else {
        await subscribeToPush();
        setEnabled(true);
        toast.success('작성 알림을 켰어요. 평일 오후 4시에 알림을 보내드릴게요.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'denied') {
        toast.error('알림 권한이 거부됐어요. 브라우저 설정에서 알림을 허용해주세요.');
      } else if (message === 'unsupported') {
        toast.error('이 브라우저는 푸시 알림을 지원하지 않아요.');
      } else {
        toast.error(message || '알림 설정에 실패했어요.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? '테스트 알림 발송에 실패했어요.');
        return;
      }
      toast.success('테스트 알림을 보냈어요. 잠시 후 도착해요.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6 lg:p-12">
      <SettingsSubHeader
        title="작성 알림"
        description="평일 오후 4시, 아직 오늘 업무 보고를 작성하지 않았다면 작성 알림을 보내드려요. 공휴일에는 보내지 않아요."
      />

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        {status === 'loading' && (
          <div className="py-2 text-center text-xs text-zinc-500 dark:text-zinc-400">불러오는 중...</div>
        )}

        {status === 'unsupported' && (
          <div className="py-2 text-sm text-zinc-600 dark:text-zinc-300">
            이 브라우저는 웹 푸시 알림을 지원하지 않아요. 최신 Chrome·Edge·Firefox·Safari 에서 사용해주세요.
          </div>
        )}

        {status === 'ios-needs-install' && (
          <div className="py-2 text-sm text-zinc-600 dark:text-zinc-300">
            iPhone·iPad 는 이 사이트를 홈 화면에 추가한 뒤에야 알림을 받을 수 있어요.
            <br />
            공유 버튼 <span aria-hidden>⎋</span> → <span className="font-semibold">홈 화면에 추가</span> 후 다시
            열어주세요.
          </div>
        )}

        {status === 'ready' && (
          <>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-zinc-100 p-2 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                  <Bell size={18} />
                </div>
                <div>
                  <div className="text-sm font-bold text-zinc-900 dark:text-white">이 기기에서 작성 알림 받기</div>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    알림은 기기(브라우저)별로 켜야 해요. 브라우저가 켜져 있을 때 도착합니다.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label="작성 알림"
                onClick={handleToggle}
                disabled={busy}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    enabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {enabled && (
              <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  <Send size={12} />
                  {testing ? '보내는 중...' : '테스트 알림 보내기'}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
