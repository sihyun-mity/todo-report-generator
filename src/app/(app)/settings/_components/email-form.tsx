'use client';

import { FormEvent, useState } from 'react';
import toast from 'react-hot-toast';
import { createClient } from '@/lib/supabase/client';

interface Props {
  currentEmail: string;
  onUpdated: (email: string) => void;
}

export default function EmailForm({ currentEmail, onUpdated }: Props) {
  const [newEmail, setNewEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmed = newEmail.trim();
    if (!trimmed) return;
    if (trimmed === currentEmail) {
      toast.error('현재 이메일과 동일합니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.updateUser({ email: trimmed });

      if (error) {
        toast.error(error.message);
        return;
      }

      // Supabase "Secure email change"가 켜져 있으면 양쪽 이메일로 확인 메일이 발송됨
      if (data.user?.email === trimmed) {
        toast.success('이메일이 변경되었습니다.');
        onUpdated(trimmed);
      } else {
        toast.success('변경 확인 메일을 발송했습니다. 메일함을 확인해주세요.');
      }
      setNewEmail('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-1 text-lg font-bold text-zinc-900 dark:text-white">이메일 변경</h2>
      <p className="mb-5 text-xs text-zinc-500 dark:text-zinc-400">
        변경 시 기존 이메일과 새 이메일 양쪽에 확인 메일이 발송될 수 있습니다.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">현재 이메일</label>
          <input
            type="email"
            value={currentEmail}
            readOnly
            disabled
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="new-email" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            새 이메일
          </label>
          <input
            id="new-email"
            type="email"
            autoComplete="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !newEmail.trim()}
          className="self-start rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {isSubmitting ? '처리 중...' : '이메일 변경'}
        </button>
      </form>
    </section>
  );
}
