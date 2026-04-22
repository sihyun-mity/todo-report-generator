'use client';

import { ChevronLeft, ChevronRight, Copy, History, RotateCcw, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { ReportHistoryItem } from '@/app/_components/types';
import { MouseEvent, useMemo, useState } from 'react';
import ReportCalendar, { getItemDateKey } from './report-calendar';

type Props = {
  history: ReportHistoryItem[];
  loadHistoryAction: (item: ReportHistoryItem, e: MouseEvent<HTMLDivElement | HTMLButtonElement>) => void;
  deleteHistoryAction: (id: string, e: MouseEvent<HTMLButtonElement>) => void;
};

const ITEMS_PER_PAGE = 3;

export default function ReportHistory({ history, loadHistoryAction, deleteHistoryAction }: Props) {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const initialView = useMemo(() => {
    const base = history[0] ? new Date(history[0].timestamp) : new Date();
    return { year: base.getFullYear(), month: base.getMonth() + 1 };
  }, [history]);
  const [viewYear, setViewYear] = useState(initialView.year);
  const [viewMonth, setViewMonth] = useState(initialView.month);

  const itemsByDateKey = useMemo(() => {
    const map = new Map<string, ReportHistoryItem>();
    for (const item of history) {
      const key = getItemDateKey(item);
      const existing = map.get(key);
      if (!existing || existing.timestamp < item.timestamp) map.set(key, item);
    }
    return map;
  }, [history]);

  const selectedItem = selectedDateKey ? (itemsByDateKey.get(selectedDateKey) ?? null) : null;

  const totalPages = Math.ceil(history.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentHistory = history.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handlePrevPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1));
  const handleNextPage = () => setCurrentPage((prev) => Math.min(prev + 1, totalPages));

  const handleChangeMonth = (year: number, month: number) => {
    setViewYear(year);
    setViewMonth(month);
  };

  const handleSelectDate = (key: string | null) => {
    setSelectedDateKey(key);
  };

  const handleCopySelected = () => {
    if (!selectedItem) return;
    navigator.clipboard.writeText(selectedItem.content);
    toast.success('내용이 클립보드에 복사되었습니다.');
  };

  return (
    <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="mb-4 flex items-center gap-2">
        <History size={18} className="text-zinc-500" />
        <h2 className="text-sm font-semibold tracking-wider text-zinc-500 uppercase">이전 기록</h2>
      </div>

      <ReportCalendar
        history={history}
        selectedDateKey={selectedDateKey}
        viewYear={viewYear}
        viewMonth={viewMonth}
        onChangeMonth={handleChangeMonth}
        onSelectDate={handleSelectDate}
      />

      {selectedItem ? (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900/50 dark:bg-blue-900/10">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
              {selectedItem.month}월 {selectedItem.day}일 보고서
            </span>
            <button
              type="button"
              onClick={() => setSelectedDateKey(null)}
              className="rounded p-1 text-zinc-400 hover:bg-white hover:text-zinc-600 dark:hover:bg-zinc-800"
              title="닫기"
              aria-label="닫기"
            >
              <X size={14} />
            </button>
          </div>
          <pre className="mb-3 max-h-60 overflow-auto rounded-md border border-blue-100 bg-white p-3 text-[11px] whitespace-pre-wrap text-zinc-700 dark:border-blue-900/40 dark:bg-background/50 dark:text-zinc-200">
            {selectedItem.content}
          </pre>
          <span className="mb-3 block text-[10px] text-zinc-400">
            {new Date(selectedItem.timestamp).toLocaleString()}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={(e) => loadHistoryAction(selectedItem, e)}
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-background dark:hover:bg-zinc-200"
            >
              <RotateCcw size={14} />
              불러오기
            </button>
            <button
              type="button"
              onClick={handleCopySelected}
              className="flex items-center justify-center gap-1 rounded-md border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-blue-900/50 dark:hover:bg-blue-900/10"
            >
              <Copy size={14} />
              복사
            </button>
            <button
              type="button"
              onClick={(e) => deleteHistoryAction(selectedItem.id, e)}
              className="flex items-center justify-center gap-1 rounded-md border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-red-900/50 dark:hover:bg-red-900/10"
            >
              <Trash2 size={14} />
              삭제
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-3">
            {currentHistory.map((item) => (
              <div
                key={item.id}
                onClick={(e) => loadHistoryAction(item, e)}
                className="group relative flex cursor-pointer flex-col rounded-lg border border-zinc-100 bg-zinc-50 p-3 transition-all hover:border-blue-200 hover:bg-blue-50 dark:border-zinc-800 dark:bg-[#25262b]/20 dark:hover:border-blue-900/50 dark:hover:bg-blue-900/10"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    {item.month}월 {item.day}일 보고서
                  </span>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(item.content);
                        toast.success('내용이 클립보드에 복사되었습니다.');
                      }}
                      className="rounded p-1 text-zinc-400 hover:bg-white hover:text-blue-600 dark:hover:bg-zinc-800"
                      title="다시 복사"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={(e) => loadHistoryAction(item, e)}
                      className="rounded p-1 text-zinc-400 hover:bg-white hover:text-blue-600 dark:hover:bg-zinc-800"
                      title="불러오기"
                    >
                      <RotateCcw size={14} />
                    </button>
                    <button
                      onClick={(e) => deleteHistoryAction(item.id, e)}
                      className="rounded p-1 text-zinc-400 hover:bg-white hover:text-red-600 dark:hover:bg-zinc-800"
                      title="삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="line-clamp-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {item.content.split('\n').slice(2).join(' ').trim()}
                </p>
                <span className="mt-2 text-[10px] text-zinc-400">{new Date(item.timestamp).toLocaleString()}</span>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <button
                onClick={handlePrevPage}
                disabled={currentPage === 1}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-800 dark:disabled:text-zinc-600"
              >
                <ChevronLeft size={14} />
                이전
              </button>
              <span className="text-xs text-zinc-400">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-800 dark:disabled:text-zinc-600"
              >
                다음
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
