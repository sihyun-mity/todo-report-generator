'use client';

import { FormEvent, useState } from 'react';
import toast from 'react-hot-toast';
import { createClient } from '@/lib/supabase/client';

interface Props {
  currentEmail: string;
}

export default function PasswordForm({ currentEmail }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!currentEmail) return;

    if (newPassword !== confirmPassword) {
      toast.error('새 비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (newPassword === currentPassword) {
      toast.error('현재 비밀번호와 동일합니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();

      // 보안상 현재 비밀번호를 재검증
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: currentEmail,
        password: currentPassword,
      });
      if (verifyError) {
        toast.error('현재 비밀번호가 일치하지 않습니다.');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success('비밀번호가 변경되었습니다.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    'rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-950';

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-1 text-lg font-bold text-zinc-900 dark:text-white">비밀번호 변경</h2>
      <p className="mb-5 text-xs text-zinc-500 dark:text-zinc-400">
        변경 후에도 현재 로그인 세션은 유지됩니다. 6자 이상 입력해주세요.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="current-password" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            현재 비밀번호
          </label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="new-password" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            새 비밀번호
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="confirm-password" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            새 비밀번호 확인
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !currentPassword || !newPassword || !confirmPassword}
          className="self-start rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {isSubmitting ? '처리 중...' : '비밀번호 변경'}
        </button>
      </form>
    </section>
  );
}
