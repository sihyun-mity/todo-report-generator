'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { useIsClient } from 'usehooks-ts';
import type { ReportHistoryItem } from '@/types';
import { cn } from '@/utils';

type Props = {
  // 'YYYY-MM-DD' 도트 표시용 — 페이지네이션 미적재 월의 항목도 포함되어야 한다
  dateKeys: ReadonlyArray<string>;
  selectedDateKey: string | null;
  viewYear: number;
  viewMonth: number;
  // false면 헤더 라벨 자리에 스켈레톤을 보여주고 월 이동 버튼을 비활성화한다 (SSR/초기 placeholder 단계 대응)
  isReady: boolean;
  onChangeMonth: (year: number, month: number) => void;
  onSelectDate: (dateKey: string | null) => void;
};

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export const toDateKey = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export const getItemDateKey = (item: ReportHistoryItem) => {
  const year = new Date(item.timestamp).getFullYear();
  return toDateKey(year, parseInt(item.month, 10), parseInt(item.day, 10));
};

export function ReportCalendar({
  dateKeys,
  selectedDateKey,
  viewYear,
  viewMonth,
  isReady,
  onChangeMonth,
  onSelectDate,
}: Readonly<Props>) {
  const datesWithRecords = useMemo(() => new Set<string>(dateKeys), [dateKeys]);

  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth - 1, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const result: Array<number | null> = [];
    for (let i = 0; i < startDow; i++) result.push(null);
    for (let d = 1; d <= daysInMonth; d++) result.push(d);
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [viewYear, viewMonth]);

  // hydration 안전: 서버에서는 today 강조를 표시하지 않고, 클라이언트 마운트 후 보정한다.
  const isClient = useIsClient();
  const todayKey = useMemo(() => {
    if (!isClient) return null;
    const now = new Date();
    return toDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }, [isClient]);

  const handlePrev = () => {
    if (viewMonth === 1) onChangeMonth(viewYear - 1, 12);
    else onChangeMonth(viewYear, viewMonth - 1);
  };
  const handleNext = () => {
    if (viewMonth === 12) onChangeMonth(viewYear + 1, 1);
    else onChangeMonth(viewYear, viewMonth + 1);
  };

  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-[#25262b]/20">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={handlePrev}
          disabled={!isReady}
          className="rounded p-1 text-zinc-500 transition-colors hover:bg-white hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-500 dark:hover:bg-zinc-800"
          aria-label="이전 달"
        >
          <ChevronLeft size={14} />
        </button>
        {isReady ? (
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
            {viewYear}년 {viewMonth}월
          </span>
        ) : (
          <span
            className="block h-4 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700"
            aria-label="달력 로딩 중"
          />
        )}
        <button
          type="button"
          onClick={handleNext}
          disabled={!isReady}
          className="rounded p-1 text-zinc-500 transition-colors hover:bg-white hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-500 dark:hover:bg-zinc-800"
          aria-label="다음 달"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-zinc-400">
        {DAY_LABELS.map((label, idx) => (
          <div
            key={label}
            className={cn('py-1 font-medium', idx === 0 && 'text-red-400', idx === 6 && 'text-blue-400')}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, idx) => {
          if (d === null) return <div key={`empty-${idx}`} className="aspect-square" />;
          const key = toDateKey(viewYear, viewMonth, d);
          const hasRecord = datesWithRecords.has(key);
          const isSelected = selectedDateKey === key;
          const isToday = todayKey === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(isSelected ? null : key)}
              disabled={!hasRecord}
              className={cn(
                'relative flex aspect-square flex-col items-center justify-center rounded-md text-[11px] transition-colors',
                isSelected && 'bg-blue-500 text-white',
                !isSelected &&
                  hasRecord &&
                  'cursor-pointer text-zinc-700 hover:bg-white dark:text-zinc-200 dark:hover:bg-zinc-800',
                !isSelected && !hasRecord && 'cursor-default text-zinc-400 dark:text-zinc-600',
                isToday && !isSelected && 'ring-1 ring-blue-300 dark:ring-blue-700'
              )}
              title={hasRecord ? `${viewMonth}월 ${d}일 보고서 보기` : undefined}
            >
              <span className="leading-none">{d}</span>
              <span
                className={cn(
                  'mt-1 h-1 w-1 rounded-full',
                  hasRecord ? (isSelected ? 'bg-white' : 'bg-blue-500') : 'bg-transparent'
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
