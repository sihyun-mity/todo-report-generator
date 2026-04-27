'use client';

import { OAuthProviders, SettingsSubHeader, useAccountInfo } from '.';

export function SocialSection() {
  const { identities, refresh } = useAccountInfo();

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6 lg:p-12">
      <SettingsSubHeader
        title="외부 계정 연동"
        description="외부 계정을 연결하면 비밀번호 없이도 로그인할 수 있어요."
      />
      <OAuthProviders identities={identities} onChanged={refresh} />
    </div>
  );
}
