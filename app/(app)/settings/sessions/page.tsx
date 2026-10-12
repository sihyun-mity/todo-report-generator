import type { Metadata } from 'next';
import { SessionsManager } from '@/app/(app)/settings/_components';
import { staticMetadata } from '@/utils';

export const metadata: Metadata = staticMetadata({
  title: '로그인 기기 관리',
  description: '현재 이 계정으로 로그인된 기기를 확인하고 원격으로 로그아웃할 수 있어요.',
});

export default function SessionsPage() {
  return <SessionsManager />;
}
