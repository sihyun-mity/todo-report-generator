'use client';

import { Download, HardDriveDownload } from 'lucide-react';
import type { ReportDate } from '@/types';

type ReportHeaderProps = {
  reportDate: ReportDate;
  onChangeDate: (date: ReportDate) => void;
  onOpenImport: () => void;
  onImportLocal?: () => void;
};

const actionButtonClass =
  'flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm transition-all hover:bg-zinc-50 dark:border-zinc-700/50 dark:bg-card dark:text-zinc-300 dark:hover:bg-[#2c2e33]';

// 보고서 도메인 전용 헤더 — 타이틀, 날짜 입력, 가져오기 관련 버튼
// (계정 관련 요소는 상단 AppTopBar로 분리됨)
export const ReportHeader = ({
  reportDate,
  onChangeDate,
  onOpenImport,
  onImportLocal,
}: Readonly<ReportHeaderProps>) => {
  const dateInputClass = 'w-8 bg-transparent text-right outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <header className="mb-10">
      <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
        일일 업무 보고 생성기
      </h1>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-zinc-500">
          <input
            type="text"
            value={reportDate.month}
            onChange={(e) => onChangeDate({ ...reportDate, month: e.target.value })}
            onBlur={(e) => onChangeDate({ ...reportDate, month: e.target.value.trim() })}
            className={dateInputClass}
          />
          <span>월</span>
          <input
            type="text"
            value={reportDate.day}
            onChange={(e) => onChangeDate({ ...reportDate, day: e.target.value })}
            onBlur={(e) => onChangeDate({ ...reportDate, day: e.target.value.trim() })}
            className={dateInputClass}
          />
          <span>일 보고서</span>
        </div>
        <button onClick={onOpenImport} className={actionButtonClass}>
          <Download size={14} />
          가져오기
        </button>
        {onImportLocal && (
          <button onClick={onImportLocal} className={actionButtonClass} title="기존 로컬 저장 기록을 계정에 옮기기">
            <HardDriveDownload size={14} />
            로컬 기록 이전
          </button>
        )}
      </div>
    </header>
  );
};
