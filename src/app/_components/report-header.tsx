'use client';

import { ClipboardPaste, HardDriveDownload } from 'lucide-react';
import type { ReportDate } from '@/types';
import { DatePicker } from '.';

type ReportHeaderProps = {
  reportDate: ReportDate;
  onChangeDate: (date: ReportDate) => void;
  onOpenImport: () => void;
  onImportLocal?: () => void;
};

const actionButtonClass =
  'flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 shadow-sm transition-all hover:bg-zinc-50 dark:border-zinc-700/50 dark:bg-card dark:text-zinc-300 dark:hover:bg-[#2c2e33]';

// 보고서 도메인 전용 헤더 — 타이틀, 부제, 날짜 선택, 가져오기 액션
// (계정 관련 요소는 상단 AppTopBar로 분리됨)
export const ReportHeader = ({
  reportDate,
  onChangeDate,
  onOpenImport,
  onImportLocal,
}: Readonly<ReportHeaderProps>) => {
  return (
    <header className="mb-10">
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
        일일 업무 보고 생성기
      </h1>
      <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400">
        프로젝트별 진행률을 적으면 보고서 양식이 자동으로 만들어집니다.
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <DatePicker value={reportDate} onChange={onChangeDate} />
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
    </header>
  );
};
