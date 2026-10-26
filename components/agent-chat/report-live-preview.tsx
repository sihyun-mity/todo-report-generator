'use client';

import { useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { useReportFormStore } from '@/stores';
import { cn, generateReportText, hasProjectContent } from '@/utils';

// AI 모드(전체 화면 채팅)에서 폼이 가려지므로, 작성 중인 보고서를 접었다 펼 수 있는 미리보기로 보여 준다.
// 도구가 폼을 바꾸면 store 를 그대로 읽어 바로 반영된다. 데스크톱(lg 이상)은 본문이 옆에 보여 숨긴다.
export function ReportLivePreview() {
  const [isExpanded, setIsExpanded] = useState(false);
  const reportDate = useReportFormStore((s) => s.reportDate);
  const today = useReportFormStore((s) => s.today);
  const tomorrow = useReportFormStore((s) => s.tomorrow);

  const projectCount = today.filter(hasProjectContent).length + tomorrow.filter(hasProjectContent).length;
  const text = generateReportText({ ...reportDate, todayProjects: today, tomorrowProjects: tomorrow });

  return (
    <div className="border-b border-zinc-100 lg:hidden dark:border-zinc-800">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-zinc-600 dark:text-zinc-300"
      >
        <FileText size={14} className="shrink-0 text-zinc-400" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          작성 중인 보고서 · {reportDate.month}월 {reportDate.day}일 · 프로젝트 {projectCount}개
        </span>
        <ChevronDown
          size={14}
          className={cn('shrink-0 transition-transform', isExpanded && 'rotate-180')}
          aria-hidden
        />
      </button>
      {isExpanded && (
        <pre className="max-h-48 overflow-y-auto px-4 pb-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-zinc-700 select-text dark:text-zinc-200">
          {text}
        </pre>
      )}
    </div>
  );
}
