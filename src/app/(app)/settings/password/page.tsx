import type { Metadata } from 'next';
import { PasswordSection } from '@/app/(app)/settings/_components';
import { staticMetadata } from '@/utils';

export const metadata: Metadata = staticMetadata({
  title: '비밀번호 변경',
});

export default function SettingsPasswordPage() {
  return <PasswordSection />;
}
