import type { Metadata } from 'next';
import { PasskeysManager } from '@/app/(app)/settings/_components';
import { staticMetadata } from '@/utils';

export const metadata: Metadata = staticMetadata({
  title: '패스키 관리',
  description: '등록한 패스키를 확인하고 새 기기에 패스키를 추가해 보세요.',
});

export default function PasskeysPage() {
  return <PasskeysManager />;
}
