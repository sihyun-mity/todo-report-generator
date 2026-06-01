'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { LogOut, Monitor, Smartphone } from 'lucide-react';
import { confirm } from '@/stores';
import { isMobileOs, parseUserAgent } from '@/utils';
import { SettingsSubHeader } from '.';

type Session = {
  id: string;
  created_at: string;
  updated_at: string | null;
  user_agent: string | null;
  ip: string | null;
  is_current: boolean;
};

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
});

export function SessionsManager() {
  const [sessions, setSessions] = useState<ReadonlyArray<Session> | null>(null);
  const [loading, setLoading] = useState(true);
  const [revokingOthers, setRevokingOthers] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sessions', { cache: 'no-store' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? '세션 목록을 불러오지 못했습니다.');
        setSessions([]);
        return;
      }
      const body = (await res.json()) as { sessions: ReadonlyArray<Session> };
      setSessions(body.sessions ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleRevoke = async (session: Session) => {
    const { browser, os } = parseUserAgent(session.user_agent);
    const ok = await confirm({
      title: `"${browser} · ${os}" 로그아웃`,
      description: '이 기기에서 로그아웃됩니다. 다시 사용하려면 새로 로그인해야 해요.\n계속할까요?',
      confirmText: '로그아웃',
      variant: 'danger',
    });
    if (!ok) return;

    // 낙관적 갱신: 목록에서 즉시 제거하고, 실패하면 원래 목록으로 되돌린다.
    const prev = sessions;
    setSessions((cur) => cur?.filter((s) => s.id !== session.id) ?? cur);
    try {
      const res = await fetch(`/api/sessions/${session.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSessions(prev);
        toast.error(body.error ?? '로그아웃에 실패했습니다.');
        return;
      }
      toast.success('해당 기기를 로그아웃했습니다.');
    } catch {
      setSessions(prev);
      toast.error('로그아웃에 실패했습니다.');
    }
  };

  const handleRevokeOthers = async () => {
    const ok = await confirm({
      title: '다른 모든 기기 로그아웃',
      description: '지금 사용 중인 이 기기를 제외한 모든 기기에서 로그아웃됩니다.\n계속할까요?',
      confirmText: '모두 로그아웃',
      variant: 'danger',
    });
    if (!ok) return;

    // 낙관적 갱신: 이 기기를 제외한 모든 세션을 즉시 제거 → "다른 기기 모두 로그아웃" 버튼도 곧바로 사라진다.
    const prev = sessions;
    setSessions((cur) => cur?.filter((s) => s.is_current) ?? cur);
    setRevokingOthers(true);
    try {
      const res = await fetch('/api/sessions', { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSessions(prev);
        toast.error(body.error ?? '로그아웃에 실패했습니다.');
        return;
      }
      const body = (await res.json()) as { revoked: number };
      toast.success(
        body.revoked > 0 ? `${body.revoked}개 기기를 로그아웃했습니다.` : '로그아웃할 다른 기기가 없습니다.'
      );
    } catch {
      setSessions(prev);
      toast.error('로그아웃에 실패했습니다.');
    } finally {
      setRevokingOthers(false);
    }
  };

  const otherCount = sessions?.filter((s) => !s.is_current).length ?? 0;

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6 lg:p-12">
      <SettingsSubHeader
        title="로그인 기기 관리"
        description="현재 이 계정으로 로그인된 기기 목록이에요. 본인이 사용하지 않는 기기가 있다면 로그아웃해 계정을 보호하세요."
      />

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">로그인된 기기</h2>
          {otherCount > 0 && (
            <button
              type="button"
              onClick={handleRevokeOthers}
              disabled={revokingOthers}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition-all hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
            >
              <LogOut size={12} />
              {revokingOthers ? '로그아웃 중...' : '다른 기기 모두 로그아웃'}
            </button>
          )}
        </div>

        {loading && <div className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">불러오는 중...</div>}

        {!loading && sessions && sessions.length === 0 && (
          <div className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">표시할 세션이 없습니다.</div>
        )}

        {!loading && sessions && sessions.length > 0 && (
          <ul className="flex flex-col gap-2">
            {sessions.map((session) => {
              const { browser, os } = parseUserAgent(session.user_agent);
              const lastActive = session.updated_at ?? session.created_at;
              return (
                <li
                  key={session.id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950/40"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg bg-zinc-100 p-2 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {isMobileOs(os) ? <Smartphone size={16} /> : <Monitor size={16} />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-zinc-900 dark:text-white">
                          {browser} · {os}
                        </div>
                        {session.is_current && (
                          <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            이 기기
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {session.ip && `IP ${session.ip} · `}
                        최근 활동 {dateFormatter.format(new Date(lastActive))}
                      </div>
                      <div className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
                        로그인 {dateFormatter.format(new Date(session.created_at))}
                      </div>
                    </div>
                    {!session.is_current && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(session)}
                        aria-label="로그아웃"
                        className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      >
                        <LogOut size={14} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
