import type { Metadata } from 'next';
import { AuthForm } from '@/app/(auth)/login/_components';
import { staticMetadata } from '@/utils';

export const metadata: Metadata = staticMetadata({
  title: '로그인',
});

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const sp = await searchParams;
  const raw = sp.error;
  const initialError = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
  return <AuthForm mode="login" initialError={initialError} />;
}
