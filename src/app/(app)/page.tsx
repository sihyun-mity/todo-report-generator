import type { Metadata } from 'next';
import { ReportForm } from '@/app/_components';
import { staticMetadata } from '@/utils';

export const metadata: Metadata = staticMetadata({
  title: '보고서 작성',
  description: '오늘 한 일과 진행률을 입력해 일일 업무 보고서를 작성해 보세요.',
});

export default function Home() {
  return (
    <main className="container mx-auto">
      <ReportForm />
    </main>
  );
}
