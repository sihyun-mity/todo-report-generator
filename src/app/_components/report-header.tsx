'use client';

import { Download, HardDriveDownload, LogOut } from 'lucide-react';

interface ReportDate {
  month: string;
  day: string;
}

interface ReportHeaderProps {
  reportDate: ReportDate;
  onChangeDate: (date: ReportDate) => void;
  onOpenImport: () => void;
  onImportLocal: () => void;
  onLogout: () => void;
  userEmail?: string | null;
}

const actionButtonClass =
  'flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm transition-all hover:bg-zinc-50 dark:border-zinc-700/50 dark:bg-card dark:text-zinc-300 dark:hover:bg-[#2c2e33]';

// 상단 타이틀 / 날짜 입력 / 가져오기·로그아웃 버튼을 담당하는 프레젠테이션 컴포넌트
const ReportHeader = ({
  reportDate,
  onChangeDate,
  onOpenImport,
  onImportLocal,
  onLogout,
  userEmail,
}: ReportHeaderProps) => {
  const dateInputClass = 'w-8 bg-transparent text-right outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <header className="mb-10">
      <div className="mb-2 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
          일일 업무 보고 생성기
        </h1>
        <div className="flex items-center gap-2">
          {userEmail && <span className="hidden text-xs text-zinc-500 sm:inline">{userEmail}</span>}
          <button onClick={onLogout} className={actionButtonClass}>
            <LogOut size={14} />
            로그아웃
          </button>
        </div>
      </div>
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
        <button onClick={onImportLocal} className={actionButtonClass} title="기존 로컬 저장 기록을 계정에 옮기기">
          <HardDriveDownload size={14} />
          로컬 기록 이전
        </button>
      </div>
    </header>
  );
};

export default ReportHeader;
export type { ReportDate };
