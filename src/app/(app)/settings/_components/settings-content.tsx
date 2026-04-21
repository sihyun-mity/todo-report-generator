'use client';

import { useEffect, useState } from 'react';
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
      </div>
    </div>
  );
}
