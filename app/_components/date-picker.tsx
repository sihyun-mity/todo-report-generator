'use client';

import { useMemo, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReportDate } from '@/types';
import { cn } from '@/utils';
import { useDismissLayer, useResetOnHide } from '@/hooks';
import { useDismissOnBack } from '@/components';

type DatePickerProps = {
  value: ReportDate;
  // 고른 날짜의 연도도 함께 넘긴다. 연도를 쓰지 않는 호출자는 두 번째 인자를 무시하면 된다.
  onChange: (date: ReportDate, year: number) => void;
  // 지정하면 연도까지 고르는 모드 — 버튼 라벨에 연도를 표시하고, 선택 강조도 연도까지 일치할 때만 한다.
  year?: number;
  // popover 위치. 스크롤 영역 하단이나 우측 끝에 놓일 때 잘리지 않도록 방향을 바꾼다.
  side?: 'top' | 'bottom';
  align?: 'start' | 'end';
};

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const buildCells = (year: number, month: number): ReadonlyArray<number | null> => {
  const first = new Date(year, month - 1, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const result: Array<number | null> = [];
  for (let i = 0; i < startDow; i++) result.push(null);
  for (let d = 1; d <= daysInMonth; d++) result.push(d);
  // 달마다 주 수(4~6)가 달라도 popover 높이가 변하지 않게 항상 6주로 채운다.
  // 위로 여는 popover(side="top")는 높이가 바뀌면 월 이동 버튼 위치가 움직여 연속 클릭이 바깥 클릭이 된다.
  while (result.length < 42) result.push(null);
  return result;
};

// 보고서 날짜 입력용 popover 캘린더
// - ReportDate({month, day})는 연도를 갖지 않으므로 popover는 현재 연도를 시작점으로 표시
// - 사용자는 월 네비게이션으로 어느 달이든 선택 가능 (연도가 바뀌어도 commit은 month/day만)
// - `year`를 주면 연도까지 고르는 모드로 동작한다 (텍스트 가져오기처럼 연도가 저장 대상에 영향을 줄 때)
export const DatePicker = ({ value, onChange, year, side = 'bottom', align = 'start' }: Readonly<DatePickerProps>) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 홈이 Activity 로 오래 보존돼 자정을 넘길 수 있으므로 popover 를 열 때마다 "오늘"을 다시 잡는다.
  const [today, setToday] = useState(() => new Date());
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();

  const valueMonth = parseInt(value.month, 10);
  const valueDay = parseInt(value.day, 10);
  const hasValidValue = !Number.isNaN(valueMonth) && !Number.isNaN(valueDay);

  const [viewYear, setViewYear] = useState(year ?? currentYear);
  const [viewMonth, setViewMonth] = useState(hasValidValue ? valueMonth : currentMonth);

  // popover를 열 때마다 view를 현재 선택값(없으면 오늘) 기준으로 재설정
  const openPicker = () => {
    const now = new Date();
    setToday(now);
    setViewYear(hasValidValue && year !== undefined ? year : now.getFullYear());
    setViewMonth(hasValidValue ? valueMonth : now.getMonth() + 1);
    setIsOpen(true);
  };

  const togglePicker = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    openPicker();
  };

  useDismissLayer(containerRef, () => setIsOpen(false), { enabled: isOpen });

  // 열린 채 다른 화면으로 이동하면 닫아 둔다 — 복귀 시 열린 popover 가 BackStack 에 재등록되며 history 가 꼬이는 것을 막는다.
  useResetOnHide(() => setIsOpen(false));

  // 브라우저 back(안드 하드웨어 back 포함)으로도 popover 가 닫히도록 BackStack 에 등록한다.
  useDismissOnBack(isOpen, () => setIsOpen(false));

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
    onChange({ month: String(viewMonth), day: String(day) }, viewYear);
    setIsOpen(false);
  };

  const handlePickToday = () => {
    setViewYear(currentYear);
    setViewMonth(currentMonth);
    onChange({ month: String(currentMonth), day: String(currentDay) }, currentYear);
    setIsOpen(false);
  };

  const buttonLabel = hasValidValue
    ? `${year !== undefined ? `${year}년 ` : ''}${valueMonth}월 ${valueDay}일`
    : '날짜 선택';

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
          className={cn(
            'absolute z-30 w-72 rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-800 dark:bg-zinc-900',
            side === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2',
            align === 'start' ? 'left-0' : 'right-0'
          )}
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
              const isSelected =
                hasValidValue &&
                (year === undefined || year === viewYear) &&
                valueMonth === viewMonth &&
                valueDay === d;
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
