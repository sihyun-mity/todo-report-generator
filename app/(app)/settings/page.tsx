import type { Metadata } from 'next';
import { SettingsMenu } from '@/app/(app)/settings/_components';
import { staticMetadata } from '@/utils';

export const metadata: Metadata = staticMetadata({
  title: '설정',
});

export default function SettingsPage() {
  return <SettingsMenu />;
}
