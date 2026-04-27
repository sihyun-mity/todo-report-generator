import type { Metadata } from 'next';
import { EmailSection } from '@/app/(app)/settings/_components';
import { staticMetadata } from '@/utils';

export const metadata: Metadata = staticMetadata({
  title: '이메일 변경',
});

export default function SettingsEmailPage() {
  return <EmailSection />;
}
