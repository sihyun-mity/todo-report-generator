'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, KeyRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import EmailForm from './email-form';
import PasswordForm from './password-form';

export default function SettingsContent() {
  const [currentEmail, setCurrentEmail] = useState<string>('');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setCurrentEmail(data.user?.email ?? '');
    });
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6 lg:p-12">
      <header className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">계정 설정</h1>
      </header>

      <div className="flex flex-col gap-6">
        <EmailForm currentEmail={currentEmail} onUpdated={setCurrentEmail} />
        <PasswordForm currentEmail={currentEmail} />

        <Link
          href="/settings/passkeys"
          className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-6 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
        >
          <div className="rounded-lg bg-zinc-100 p-2 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            <KeyRound size={18} />
          </div>
          <div className="flex-1">
            <div className="text-lg font-bold text-zinc-900 dark:text-white">패스키 관리</div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              비밀번호 없이 Face ID / 지문 / Windows Hello 로 로그인.
            </p>
          </div>
          <ChevronRight size={16} className="text-zinc-400" />
        </Link>
      </div>
    </div>
  );
}
