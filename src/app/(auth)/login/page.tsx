import type { Metadata } from 'next';
import { AuthForm } from '@/app/(auth)/login/_components';
import { staticMetadata } from '@/utils';

export const metadata: Metadata = staticMetadata({
  title: '로그인',
});

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
