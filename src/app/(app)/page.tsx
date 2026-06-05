import type { Metadata } from 'next';
import { ReportForm } from '@/app/_components';
import { PushSubscribePrompt } from '@/components';
import { kstDateKey, staticMetadata } from '@/utils';

export const metadata: Metadata = staticMetadata({
  title: '보고서 작성',
  description: '오늘 한 일과 진행률을 입력해 일일 업무 보고서를 작성해 보세요.',
});

// 요청 시점 KST 날짜를 계산해 클라이언트로 내려준다.
// 캘린더 초기 뷰가 첫 페인트(SSR)부터 실제 현재 월을 그리게 해, placeholder→보정 시 발생하던
// 그리드 레이아웃 점프를 없앤다. (서버 HTML 과 클라 첫 렌더가 같은 값을 쓰므로 hydration 안전)
export default function Home() {
  const serverDateKey = kstDateKey();

  return (
    <main className="container mx-auto">
      <ReportForm serverDateKey={serverDateKey} />
      <PushSubscribePrompt />
    </main>
  );
}
