'use client';

import { EmailForm, SettingsSubHeader, useAccountInfo } from '.';

export function EmailSection() {
  const { currentEmail, setCurrentEmail } = useAccountInfo();

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6 lg:p-12">
      <SettingsSubHeader
        title="이메일 변경"
        description="변경 시 기존 이메일과 새 이메일 양쪽에 확인 메일이 발송될 수 있어요."
      />
      <EmailForm currentEmail={currentEmail} onUpdated={setCurrentEmail} />
    </div>
  );
}
