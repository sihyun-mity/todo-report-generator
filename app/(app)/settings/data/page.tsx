import type { Metadata } from 'next';
import { DataManagementSection } from '@/app/(app)/settings/_components';
import { staticMetadata } from '@/utils';

export const metadata: Metadata = staticMetadata({
  title: '저장된 데이터 관리',
  description: '계정에 저장된 보고서 기록·커밋 가져오기 메모리 등을 골라 삭제할 수 있어요.',
});

export default function DataManagementPage() {
  return <DataManagementSection />;
}
