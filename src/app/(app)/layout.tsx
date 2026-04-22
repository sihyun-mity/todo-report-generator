import { ReactNode, Suspense } from 'react';
import { AppTopBar } from '@/components';
import NewsDialogMount from '@/components/news/NewsDialogMount';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar />
      {children}

      {/* 새소식 dialog: (auth) 경로(/login, /signup)에는 노출되지 않도록 (app) 그룹 layout 에서만 마운트 */}
      <Suspense>
        <NewsDialogMount />
      </Suspense>
    </div>
  );
}
