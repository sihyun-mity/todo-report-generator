import type { Metadata } from 'next';
import { SocialSection } from '@/app/(app)/settings/_components';
import { staticMetadata } from '@/utils';

export const metadata: Metadata = staticMetadata({
  title: '소셜 계정 연동',
  description: 'GitHub 등 소셜 계정을 연결하거나 해제할 수 있어요.',
});

export default function SettingsSocialPage() {
  return <SocialSection />;
}
