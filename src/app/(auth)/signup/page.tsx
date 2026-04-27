import type { Metadata } from 'next';
import { AuthForm } from '@/app/(auth)/login/_components';
import { staticMetadata } from '@/utils';

export const metadata: Metadata = staticMetadata({
  title: '회원가입',
});

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
