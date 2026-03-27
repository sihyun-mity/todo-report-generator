'use client';

import { ChevronLeft, ChevronRight, Copy, History, RotateCcw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { ReportHistoryItem } from '@/app/_components/types';
import { MouseEvent, useState } from 'react';

type Props = {
  history: ReportHistoryItem[];
  loadHistoryAction: (item: ReportHistoryItem, e: MouseEvent<HTMLDivElement | HTMLButtonElement>) => void;
  deleteHistoryAction: (id: string, e: MouseEvent<HTMLButtonElement>) => void;
};

const ITEMS_PER_PAGE = 3;

export default function ReportHistory({ history, loadHistoryAction, deleteHistoryAction }: Props) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(history.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentHistory = history.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  return (
    <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="mb-4 flex items-center gap-2">
        <History size={18} className="text-zinc-500" />
        <h2 className="text-sm font-semibold tracking-wider text-zinc-500 uppercase">이전 기록</h2>
      </div>
      <div className="flex flex-col gap-3">
        {currentHistory.map((item) => (
          <div
            key={item.id}
            onClick={(e) => loadHistoryAction(item, e)}
            className="group relative flex cursor-pointer flex-col rounded-lg border border-zinc-100 bg-zinc-50 p-3 transition-all hover:border-blue-200 hover:bg-blue-50 dark:border-zinc-800 dark:bg-black/20 dark:hover:border-blue-900/50 dark:hover:bg-blue-900/10"
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
    </div>
  );
}
