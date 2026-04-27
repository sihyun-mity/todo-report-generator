'use client';

import { PasswordForm, SettingsSubHeader, useAccountInfo } from '.';

export function PasswordSection() {
  const { currentEmail, identities, refresh } = useAccountInfo();
  const hasPassword = identities.some((i) => i.provider === 'email');

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6 lg:p-12">
      <SettingsSubHeader
        title={hasPassword ? '비밀번호 변경' : '비밀번호 설정'}
        description={
          hasPassword
            ? '변경 후에도 현재 로그인 세션은 유지됩니다.'
            : '비밀번호를 설정하면 GitHub뿐 아니라 이메일·비밀번호로도 로그인할 수 있어요.'
        }
      />
      <PasswordForm currentEmail={currentEmail} hasPassword={hasPassword} onPasswordCreated={refresh} />
    </div>
  );
}
