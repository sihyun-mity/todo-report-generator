'use client';

import { addTransitionType, startTransition } from 'react';
import { ChevronLeft } from 'lucide-react';

export function BackLink() {
  const handleBack = () => {
    startTransition(() => {
      addTransitionType('nav-back');
      window.history.back();
    });
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className="inline-flex cursor-pointer items-center gap-1 text-sm text-zinc-500 transition hover:text-zinc-700 dark:hover:text-zinc-300"
    >
      <ChevronLeft className="h-4 w-4" />
      새소식 목록
    </button>
  );
}
