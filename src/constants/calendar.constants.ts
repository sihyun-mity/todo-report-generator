// 캘린더(이전 기록)의 요일·공휴일 텍스트 색상.
// strong = 기록이 있어 강조되는 날짜, muted = 기록이 없어 옅게 보이는 날짜.
// 색상값을 바꾸려면 이 상수만 수정하면 된다.

export type CalendarDayColor = {
  /** 헤더(요일 라벨) 및 기록이 있는 날짜에 쓰는 진한 색 */
  strong: string;
  /** 기록이 없는 날짜에 쓰는 옅은 색 */
  muted: string;
};

// 일요일 — 빨강
export const CALENDAR_SUNDAY_COLOR: CalendarDayColor = {
  strong: 'text-red-500 dark:text-red-400',
  muted: 'text-red-300 dark:text-red-500/40',
};

// 토요일 — 파랑
export const CALENDAR_SATURDAY_COLOR: CalendarDayColor = {
  strong: 'text-blue-500 dark:text-blue-400',
  muted: 'text-blue-300 dark:text-blue-500/40',
};

// 공휴일(임시·대체공휴일 포함) — 빨강 (요일과 무관하게 우선 적용)
export const CALENDAR_HOLIDAY_COLOR: CalendarDayColor = {
  strong: 'text-red-500 dark:text-red-400',
  muted: 'text-red-300 dark:text-red-500/40',
};

// 평일(월~금) 기본 색
export const CALENDAR_WEEKDAY_COLOR: CalendarDayColor = {
  strong: 'text-zinc-700 dark:text-zinc-200',
  muted: 'text-zinc-400 dark:text-zinc-600',
};
