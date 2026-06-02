'use client';

import { useEffect } from 'react';
import { Check, Copy, Maximize2, X } from 'lucide-react';
import { useScrollLock } from 'usehooks-ts';
import type { ReportDate } from '@/types';
import { cn } from '@/utils';
import { Portal, useDeferOpenDuringViewTransition, useDismissOnBack } from '@/components';

type ReportPreviewDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  text: string;
  reportDate: ReportDate;
  copied: boolean;
  isCopyDisabled: boolean;
  onCopy: () => void;
};

// 미리보기를 큰 화면으로 보는 다이얼로그 (데스크탑 전용 — 트리거 버튼이 lg 이상에서만 노출된다)
export function ReportPreviewDialog({
  isOpen,
  onClose,
  text,
  reportDate,
  copied,
  isCopyDisabled,
  onCopy,
}: Readonly<ReportPreviewDialogProps>) {
  // Portal 로 root group 에 마운트되는 다이얼로그라, 페이지 전환(page-shell 슬라이드) 도중에는
  // page-shell snapshot 이 위로 스택돼 비친다. 전환이 끝난 뒤에 열리도록 통과시킨다.
  const deferredOpen = useDeferOpenDuringViewTransition(isOpen);
  const { lock, unlock } = useScrollLock({ autoLock: false });

  const charCount = text.length;
  const hasDate = reportDate.month.trim() !== '' && reportDate.day.trim() !== '';

  useEffect(() => {
    if (!deferredOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [deferredOpen, onClose]);

  // 브라우저 back(안드 하드웨어 back 포함)으로도 다이얼로그가 닫히도록 BackStack 에 등록한다.
  useDismissOnBack(deferredOpen, onClose);

  // 다이얼로그가 열려 있는 동안 배경 스크롤을 잠근다.
  useEffect(() => {
    if (deferredOpen) lock();
    else unlock();
    return () => unlock();
  }, [deferredOpen, lock, unlock]);

  if (!deferredOpen) return null;

  return (
    <Portal>
      <div
        role="presentation"
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm sm:p-6"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-preview-dialog-title"
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[90%] w-full max-w-3xl flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 p-5 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Maximize2 className="h-5 w-5 shrink-0 text-blue-500" aria-hidden="true" />
              <h2 id="report-preview-dialog-title" className="text-base font-bold sm:text-lg">
                미리보기
              </h2>
              {hasDate && (
                <span className="text-sm text-zinc-400 dark:text-zinc-500">
                  {reportDate.month}월 {reportDate.day}일 보고서
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="rounded-full p-2 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <pre className="rounded-lg border border-zinc-100 bg-zinc-50 p-5 text-base leading-relaxed whitespace-pre-wrap text-zinc-700 dark:border-zinc-700/30 dark:bg-background/50 dark:text-zinc-200">
              {text}
            </pre>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-zinc-100 p-4 sm:p-5 dark:border-zinc-800">
            <span className="text-xs text-zinc-400 tabular-nums dark:text-zinc-500">{charCount}자</span>
            <button
              type="button"
              onClick={onCopy}
              disabled={isCopyDisabled}
              className={cn(
                'flex cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all',
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
          </div>
        </div>
      </div>
    </Portal>
  );
}
