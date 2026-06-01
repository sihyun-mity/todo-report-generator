import type { Metadata } from 'next';
import { NotificationsSection } from '@/app/(app)/settings/_components';
import { staticMetadata } from '@/utils';

export const metadata: Metadata = staticMetadata({
  title: '작성 알림',
  description: '평일 오후 4시 30분, 아직 오늘 업무 보고를 작성하지 않았다면 작성 알림을 받을 수 있어요.',
});

export default function NotificationsPage() {
  return <NotificationsSection />;
}
