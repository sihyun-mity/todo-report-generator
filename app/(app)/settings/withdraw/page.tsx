import type { Metadata } from 'next';
import { WithdrawSection } from '@/app/(app)/settings/_components';
import { staticMetadata } from '@/utils';

export const metadata: Metadata = staticMetadata({
  title: '회원 탈퇴',
  description: '계정과 계정에 저장된 데이터를 모두 삭제하고 탈퇴할 수 있어요.',
});

export default function WithdrawPage() {
  return <WithdrawSection />;
}
