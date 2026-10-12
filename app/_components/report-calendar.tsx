'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import {
  CALENDAR_HOLIDAY_COLOR,
  CALENDAR_SATURDAY_COLOR,
  CALENDAR_SUNDAY_COLOR,
  CALENDAR_WEEKDAY_COLOR,
  type CalendarDayColor,
} from '@/constants';
import { useKrHolidays, useServerNow } from '@/hooks';
import type { ReportHistoryItem } from '@/types';
import { cn } from '@/utils';

type Props = {
  // 'YYYY-MM-DD' 도트 표시용 — 페이지네이션 미적재 월의 항목도 포함되어야 한다
  dateKeys: ReadonlyArray<string>;
  selectedDateKey: string | null;
  // 서버(page.tsx)가 내려준 KST 오늘 날짜 키('YYYY-MM-DD'). 오늘 강조의 결정적 첫 페인트 기준값.
  todayDateKey: string;
  viewYear: number;
  viewMonth: number;
  // false면 헤더 라벨 자리에 스켈레톤을 보여주고 월 이동 버튼을 비활성화한다 (SSR/초기 placeholder 단계 대응)
  isReady: boolean;
  onChangeMonth: (year: number, month: number) => void;
  onSelectDate: (dateKey: string | null) => void;
};

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

// 요일·공휴일에 따른 날짜 텍스트 색상. 공휴일이 요일보다 우선한다 (토요일 공휴일도 빨강).
function getDayColor(dow: number, isHoliday: boolean): CalendarDayColor {
  if (isHoliday) return CALENDAR_HOLIDAY_COLOR;
  if (dow === 0) return CALENDAR_SUNDAY_COLOR;
  if (dow === 6) return CALENDAR_SATURDAY_COLOR;
  return CALENDAR_WEEKDAY_COLOR;
}

export const toDateKey = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export const getItemDateKey = (item: ReportHistoryItem) => {
  const year = new Date(item.timestamp).getFullYear();
  return toDateKey(year, parseInt(item.month, 10), parseInt(item.day, 10));
};

export function ReportCalendar({
  dateKeys,
  selectedDateKey,
  todayDateKey,
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

  // 오늘 강조 기준 날짜.
  // 첫 페인트(SSR/하이드레이션)에서는 서버가 내려준 todayDateKey(KST)를 그대로 써서 결정적으로 칠하고,
  // 마운트 후 useServerNow(서버 시간)가 도착하면 그 값으로 자기보정한다 (세션이 자정을 넘는 경우 등).
  const { now } = useServerNow({ autoUpdate: false });
  const todayKey = useMemo(() => {
    if (now === undefined) return todayDateKey;
    const today = new Date(now);
    return toDateKey(today.getFullYear(), today.getMonth() + 1, today.getDate());
  }, [now, todayDateKey]);

  // 보이는 월(연도)의 대한민국 공휴일 — dateKey('YYYY-MM-DD') → 공휴일명
  const { holidayMap } = useKrHolidays(viewYear);

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
            className={cn(
              'py-1 font-medium',
              idx === 0 && CALENDAR_SUNDAY_COLOR.strong,
              idx === 6 && CALENDAR_SATURDAY_COLOR.strong
            )}
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
          const dow = idx % 7;
          const holidayName = holidayMap.get(key);
          const dayColor = getDayColor(dow, holidayName !== undefined);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(isSelected ? null : key)}
              disabled={!hasRecord}
              className={cn(
                'relative flex aspect-square flex-col items-center justify-center rounded-md text-[11px] transition-colors',
                isSelected && 'bg-blue-500 text-white',
                !isSelected && (hasRecord ? dayColor.strong : dayColor.muted),
                !isSelected && hasRecord && 'cursor-pointer hover:bg-white dark:hover:bg-zinc-800',
                !isSelected && !hasRecord && 'cursor-default',
                isToday && !isSelected && 'ring-1 ring-blue-300 dark:ring-blue-700'
              )}
              title={
                holidayName
                  ? hasRecord
                    ? `${holidayName} · ${viewMonth}월 ${d}일 보고서 보기`
                    : holidayName
                  : hasRecord
                    ? `${viewMonth}월 ${d}일 보고서 보기`
                    : undefined
              }
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
