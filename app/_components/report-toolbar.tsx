'use client';

import { ClipboardPaste, HardDriveDownload } from 'lucide-react';
import type { ReportDate } from '@/types';
import { AGENT_HIGHLIGHT_DATE_ID } from '@/constants';
import { useAgentHighlightStore } from '@/stores';
import { cn } from '@/utils';
import { DatePicker } from '.';

type ReportToolbarProps = {
  reportDate: ReportDate;
  onChangeDate: (date: ReportDate) => void;
  onOpenImport: () => void;
  onImportLocal?: () => void;
};

const actionButtonClass =
  'flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 shadow-sm transition-all hover:bg-zinc-50 dark:border-zinc-700/50 dark:bg-card dark:text-zinc-300 dark:hover:bg-[#2c2e33]';

// 작성 폼 바로 위 도구 줄 — 보고서 날짜 선택과 폼을 채우는 가져오기(텍스트 복원·로컬 기록 이전).
// 폼에만 걸리는 기능이라 Nano 입력창 아래, 업무 목록 위에 둔다
export const ReportToolbar = ({
  reportDate,
  onChangeDate,
  onOpenImport,
  onImportLocal,
}: Readonly<ReportToolbarProps>) => {
  // Nano가 보고서 날짜를 바꿨으면 날짜 선택을 잠깐 강조한다
  const isDateChanged = useAgentHighlightStore((s) => s.ids.has(AGENT_HIGHLIGHT_DATE_ID));
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className={cn('rounded-lg', isDateChanged && 'animate-agent-flash')}>
        <DatePicker value={reportDate} onChange={onChangeDate} />
      </div>
      <button onClick={onOpenImport} className={actionButtonClass} title="기존 보고서 텍스트를 붙여넣어 복원">
        <ClipboardPaste size={14} />
        텍스트로 복원
      </button>
      {onImportLocal && (
        <button onClick={onImportLocal} className={actionButtonClass} title="기존 로컬 저장 기록을 계정에 옮기기">
          <HardDriveDownload size={14} />
          로컬 기록 이전
        </button>
      )}
    </div>
  );
};
