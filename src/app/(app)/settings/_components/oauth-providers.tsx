'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Github } from 'lucide-react';
import type { UserIdentity } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type Props = {
  identities: ReadonlyArray<UserIdentity>;
  onChanged: () => void;
};

export function OAuthProviders({ identities, onChanged }: Readonly<Props>) {
  const [busy, setBusy] = useState(false);

  const githubIdentity = identities.find((i) => i.provider === 'github');
  const isLinked = Boolean(githubIdentity);
  // 마지막 남은 로그인 수단을 해제하면 계정에서 잠긴다 — 막는다.
  const canUnlink = identities.length > 1;

  const handleLink = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.linkIdentity({
        provider: 'github',
        options: { redirectTo: `${window.location.origin}/auth/callback?next=/settings` },
      });
      if (error) {
        toast.error(error.message);
        setBusy(false);
      }
      // 성공 시 GitHub로 리다이렉트 — 페이지가 떠나므로 setBusy(false) 불필요
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    if (busy || !githubIdentity) return;
    if (!canUnlink) {
      toast.error('마지막 로그인 수단은 해제할 수 없습니다. 먼저 비밀번호를 설정해주세요.');
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.unlinkIdentity(githubIdentity);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('GitHub 연동이 해제되었습니다.');
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-1 text-lg font-bold text-zinc-900 dark:text-white">소셜 로그인 연동</h2>
      <p className="mb-5 text-xs text-zinc-500 dark:text-zinc-400">
        외부 계정을 연결하면 비밀번호 없이도 로그인할 수 있어요.
      </p>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/50">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-zinc-900 p-2 text-white dark:bg-white dark:text-black">
            <Github size={16} />
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-900 dark:text-white">GitHub</div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {isLinked ? '연결됨' : '아직 연결되지 않았어요.'}
            </div>
          </div>
        </div>
        {isLinked ? (
          <button
            type="button"
            onClick={handleUnlink}
            disabled={busy || !canUnlink}
            title={canUnlink ? undefined : '먼저 비밀번호를 설정해야 해제할 수 있어요.'}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            연동 해제
          </button>
        ) : (
          <button
            type="button"
            onClick={handleLink}
            disabled={busy}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {busy ? '이동 중...' : '연결하기'}
          </button>
        )}
      </div>
    </section>
  );
}
