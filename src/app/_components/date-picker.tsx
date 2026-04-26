'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReportDate } from '@/types';
import { cn } from '@/utils';
import { useOnClickOutside } from '@/hooks';

type DatePickerProps = {
  value: ReportDate;
  onChange: (date: ReportDate) => void;
};

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const buildCells = (year: number, month: number): ReadonlyArray<number | null> => {
  const first = new Date(year, month - 1, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const result: Array<number | null> = [];
  for (let i = 0; i < startDow; i++) result.push(null);
  for (let d = 1; d <= daysInMonth; d++) result.push(d);
  while (result.length % 7 !== 0) result.push(null);
  return result;
};

// 보고서 날짜 입력용 popover 캘린더
// - ReportDate({month, day})는 연도를 갖지 않으므로 popover는 현재 연도를 시작점으로 표시
// - 사용자는 월 네비게이션으로 어느 달이든 선택 가능 (연도가 바뀌어도 commit은 month/day만)
export const DatePicker = ({ value, onChange }: Readonly<DatePickerProps>) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();

  const valueMonth = parseInt(value.month, 10);
  const valueDay = parseInt(value.day, 10);
  const hasValidValue = !Number.isNaN(valueMonth) && !Number.isNaN(valueDay);

  const [viewYear, setViewYear] = useState(currentYear);
  const [viewMonth, setViewMonth] = useState(hasValidValue ? valueMonth : currentMonth);

  // popover를 열 때마다 view를 현재 선택값(없으면 오늘) 기준으로 재설정
  const openPicker = () => {
    setViewYear(currentYear);
    setViewMonth(hasValidValue ? valueMonth : currentMonth);
    setIsOpen(true);
  };

  const togglePicker = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    openPicker();
  };

  useOnClickOutside(containerRef, () => setIsOpen(false));

  // ESC로 닫기
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const cells = useMemo(() => buildCells(viewYear, viewMonth), [viewYear, viewMonth]);

  const handlePrev = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
      return;
    }
    setViewMonth((m) => m - 1);
  };

  const handleNext = () => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
      return;
    }
    setViewMonth((m) => m + 1);
  };

  const handlePickDay = (day: number) => {
    onChange({ month: String(viewMonth), day: String(day) });
    setIsOpen(false);
  };

  const handlePickToday = () => {
    setViewYear(currentYear);
    setViewMonth(currentMonth);
    onChange({ month: String(currentMonth), day: String(currentDay) });
    setIsOpen(false);
  };

  const buttonLabel = hasValidValue ? `${valueMonth}월 ${valueDay}일` : '날짜 선택';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={togglePicker}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 shadow-sm transition-all hover:bg-zinc-50 dark:border-zinc-700/50 dark:bg-card dark:text-zinc-200 dark:hover:bg-[#2c2e33]"
      >
        <CalendarIcon size={14} className="text-zinc-500 dark:text-zinc-400" />
        {buttonLabel}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="날짜 선택"
          className="absolute top-full left-0 z-30 mt-2 w-72 rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={handlePrev}
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-blue-600 dark:hover:bg-zinc-800"
              aria-label="이전 달"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              {viewYear}년 {viewMonth}월
            </span>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-blue-600 dark:hover:bg-zinc-800"
              aria-label="다음 달"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-zinc-400">
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
              const isSelected = hasValidValue && valueMonth === viewMonth && valueDay === d;
              const isToday = viewYear === currentYear && viewMonth === currentMonth && d === currentDay;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => handlePickDay(d)}
                  className={cn(
                    'flex aspect-square cursor-pointer items-center justify-center rounded-md text-xs transition-colors',
                    isSelected
                      ? 'bg-blue-500 font-semibold text-white shadow'
                      : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800',
                    isToday && !isSelected && 'ring-1 ring-blue-300 dark:ring-blue-700'
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-2 dark:border-zinc-800">
            <button
              type="button"
              onClick={handlePickToday}
              className="cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
