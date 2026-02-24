'use client';

import { Copy, History, RotateCcw, Trash2 } from 'lucide-react';
import { ReportHistoryItem } from '@/app/_components/types';
import { MouseEvent } from 'react';

type Props = {
  history: ReportHistoryItem[];
  loadHistoryAction: (item: ReportHistoryItem, e: MouseEvent<HTMLDivElement | HTMLButtonElement>) => void;
  deleteHistoryAction: (id: string, e: MouseEvent<HTMLButtonElement>) => void;
};

export default function ReportHistory({ history, loadHistoryAction, deleteHistoryAction }: Props) {
  return (
    <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="mb-4 flex items-center gap-2">
        <History size={18} className="text-zinc-500" />
        <h2 className="text-sm font-semibold tracking-wider text-zinc-500 uppercase">이전 기록</h2>
      </div>
      <div className="flex flex-col gap-3">
        {history.map((item) => (
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
                    alert('내용이 클립보드에 복사되었습니다.');
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
    </div>
  );
}
