'use client';

import { useRef, useState } from 'react';
import { Download, FileJson, FileText, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { ReportExportFormat } from '@/types';
import { useDismissOnBack } from '@/components';
import { useDismissLayer, useResetOnHide } from '@/hooks';
import { useReportHistoryStore } from '@/stores';
import { downloadReportHistory } from '@/utils';

type Props = {
  // 기록이 하나도 없거나 아직 적재 전이면 비활성화한다.
  disabled: boolean;
};

const FORMAT_OPTIONS: ReadonlyArray<{
  format: ReportExportFormat;
  label: string;
  description: string;
  Icon: typeof FileText;
}> = [
  { format: 'txt', label: '텍스트 (.txt)', description: '보고서 본문을 날짜순으로 모아 저장', Icon: FileText },
  { format: 'json', label: 'JSON (.json)', description: '프로젝트·작업·진행률 구조까지 저장', Icon: FileJson },
];

// 작성한 보고서 기록 전체를 파일로 내려받는 메뉴. 기록 자체는 그대로 남는다.
// 로그인 사용자는 캘린더가 월 단위로만 적재하므로 store.history 가 아니라 전체를 새로 조회한다.
export function ReportExportMenu({ disabled }: Readonly<Props>) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useDismissLayer(containerRef, () => setIsOpen(false), { enabled: isOpen });

  // 열린 채 다른 화면으로 이동하면 닫아 둔다 — 복귀 시 BackStack 재등록으로 history 가 꼬이는 것을 막는다.
  useResetOnHide(() => setIsOpen(false));

  useDismissOnBack(isOpen, () => setIsOpen(false));

  const handleExport = async (format: ReportExportFormat) => {
    setIsOpen(false);
    setIsExporting(true);
    try {
      const items = await useReportHistoryStore.getState().fetchAllHistory();
      if (items === null) {
        toast.error('기록을 불러오지 못해 내보내지 못했습니다.');
        return;
      }
      if (items.length === 0) {
        toast.error('내보낼 기록이 없습니다.');
        return;
      }
      downloadReportHistory(items, format);
      toast.success(`기록 ${items.length}건을 내보냈습니다.`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div ref={containerRef} className="relative ml-auto">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        disabled={disabled || isExporting}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:disabled:text-zinc-600"
      >
        {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        내보내기
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute top-full right-0 z-20 mt-1 w-60 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {FORMAT_OPTIONS.map(({ format, label, description, Icon }) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              onClick={() => void handleExport(format)}
              className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Icon size={16} className="mt-0.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
              <span className="flex flex-col">
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">{label}</span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{description}</span>
              </span>
            </button>
          ))}
          <p className="border-t border-zinc-100 px-3 pt-2 pb-1 text-[10px] text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
            파일로 저장만 하며, 기록은 삭제되지 않습니다.
          </p>
        </div>
      )}
    </div>
  );
}
