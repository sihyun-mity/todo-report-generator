import { ReactNode } from 'react';
import { AppTopBar } from '@/components';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar />
      {children}
    </div>
  );
}
