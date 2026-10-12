import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthErrorToast, AuthForm } from '@/app/(auth)/login/_components';
import { staticMetadata } from '@/utils';

export const metadata: Metadata = staticMetadata({
  title: '로그인',
});

export default function LoginPage() {
  return (
    <>
      <AuthForm mode="login" />
      {/* `?error=` 는 요청 시점에만 알 수 있으므로 Suspense 로 격리해 폼은 정적 셸로 프리렌더한다 */}
      <Suspense>
        <AuthErrorToast />
      </Suspense>
    </>
  );
}
