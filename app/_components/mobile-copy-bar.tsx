'use client';

import { Check, Copy } from 'lucide-react';
import { useAgentChatStore } from '@/stores';
import { cn } from '@/utils';

type MobileCopyBarProps = {
  copied: boolean;
  isCopyDisabled: boolean;
  onCopy: () => void;
};

// 한 열 배치에서만 노출되는 하단 sticky 복사 액션 바.
// 두 열 배치(본문 폭 60rem 이상)는 우측 sticky 미리보기에서 같은 동작을 제공하므로 숨긴다 — 기준은 ReportForm 과 같은 @container.
// 데스크톱에서 Nano 패널을 펼쳐 한 열이 되면 패널 너비만큼 비켜 본문 가운데에 둔다(AgentLayoutShell 의 lg:pr-[400px] 과 맞춘다).
export const MobileCopyBar = ({ copied, isCopyDisabled, onCopy }: Readonly<MobileCopyBarProps>) => {
  const expanded = useAgentChatStore((s) => s.expanded);

  return (
    <div
      id="report-mobile-copy-bar"
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 @min-[60rem]:hidden',
        expanded && 'lg:right-[400px]'
      )}
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
    >
      <button
        type="button"
        onClick={onCopy}
        disabled={isCopyDisabled}
        className={cn(
          'pointer-events-auto flex w-full max-w-md cursor-pointer items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold shadow-lg backdrop-blur-md transition-all',
          copied
            ? 'bg-green-500 text-white'
            : isCopyDisabled
              ? 'cursor-not-allowed bg-zinc-300/95 text-zinc-500 dark:bg-zinc-700/80 dark:text-zinc-400'
              : 'bg-zinc-900/95 text-white hover:bg-zinc-800 dark:bg-zinc-100/95 dark:text-background dark:hover:bg-zinc-200'
        )}
        aria-label={copied ? '복사 완료' : '보고서 복사하기'}
      >
        {copied ? (
          <>
            <Check size={16} /> 복사 완료!
          </>
        ) : (
          <>
            <Copy size={16} /> 복사하기
          </>
        )}
      </button>
    </div>
  );
};
