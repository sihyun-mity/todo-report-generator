'use client';

import { AlertCircle, Check, Copy, RotateCcw } from 'lucide-react';
import { cn } from '@/utils/class';
import { ThemeToggle } from '@/components';

interface ReportPreviewProps {
  text: string;
  copied: boolean;
  copyError: string | null;
  isCopyDisabled: boolean;
  isResetDisabled: boolean;
  onCopy: () => void;
  onReset: () => void;
}

// 미리보기 패널: 보고서 텍스트 렌더링 + 복사/초기화 액션
const ReportPreview = ({
  text,
  copied,
  copyError,
  isCopyDisabled,
  isResetDisabled,
  onCopy,
  onReset,
}: ReportPreviewProps) => {
  return (
    <>
      <div className="mb-2 flex justify-end">
        <ThemeToggle />
      </div>
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700/50 dark:bg-card/50">
        <h2 className="mb-4 text-sm font-semibold tracking-wider text-zinc-500 uppercase">미리보기</h2>
        <pre className="mb-6 overflow-x-auto rounded-lg border border-zinc-100 bg-white p-4 text-sm whitespace-pre-wrap text-zinc-700 dark:border-zinc-700/30 dark:bg-background/50 dark:text-zinc-200">
          {text}
        </pre>

        <button
          onClick={onCopy}
          disabled={isCopyDisabled}
          className={cn(
            'mb-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg py-3 font-semibold transition-all',
            copied
              ? 'bg-green-500 text-white'
              : isCopyDisabled
                ? 'cursor-not-allowed bg-zinc-300 text-zinc-500 dark:bg-zinc-700/30 dark:text-zinc-500'
                : 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-background dark:hover:bg-zinc-200'
          )}
        >
          {copied ? (
            <>
              <Check size={18} /> 복사 완료!
            </>
          ) : (
            <>
              <Copy size={18} /> 복사하기
            </>
          )}
        </button>

        <button
          onClick={onReset}
          disabled={isResetDisabled}
          className={cn(
            'flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium transition-all',
            isResetDisabled
              ? 'cursor-not-allowed text-zinc-400 dark:text-zinc-600'
              : 'text-zinc-600 hover:bg-zinc-200/50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-card/50 dark:hover:text-red-400'
          )}
        >
          <RotateCcw size={16} /> 작성 내용 초기화
        </button>

        {copyError && (
          <div className="mt-2 flex items-start gap-2 rounded-md bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{copyError}</span>
          </div>
        )}
      </div>
    </>
  );
};

export default ReportPreview;
