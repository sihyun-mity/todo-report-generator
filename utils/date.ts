import type { ReportHistoryItem } from '@/types';

/**
 * KST(Asia/Seoul) 기준 날짜 키('YYYY-MM-DD')를 반환한다.
 *
 * 클라이언트가 보고서를 저장할 때 쓰는 `report_date` 와 동일한 형식·기준이며,
 * 서버 컴포넌트/크론 등 서버 측에서 "오늘"을 결정할 때 사용한다 (서버 런타임 TZ 와 무관하게 항상 KST).
 *
 * @param date 기준 시각 (기본값: 호출 시점)
 */
export const kstDateKey = (date: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 날짜 키('YYYY-MM-DD')를 요일이 붙은 짧은 표기('10/19(월)')로 만든다.
 *
 * Nano 도구 결과에 요일을 데이터로 넣는 데 쓴다 — 없으면 모델이 요일을 지어냈다(2026-10-26 월요일을 화요일로 답했다).
 */
export const dayLabel = (date: string): string => {
  const [year, month, day] = date.split('-').map(Number);
  return `${month}/${day}(${WEEKDAY_LABELS[new Date(year, month - 1, day).getDay()]})`;
};

/** 연/월/일을 날짜 키('YYYY-MM-DD')로 만든다. */
export const toDateKey = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/**
 * 보고서 기록 항목의 날짜 키('YYYY-MM-DD').
 *
 * 연도는 항목의 `year`를 쓰고, 연도 도입 이전 게스트 기록처럼 없으면 저장 시각(timestamp)의 연도로 폴백한다.
 */
export const reportItemDateKey = (item: Pick<ReportHistoryItem, 'year' | 'month' | 'day' | 'timestamp'>): string =>
  toDateKey(item.year ?? new Date(item.timestamp).getFullYear(), parseInt(item.month, 10), parseInt(item.day, 10));

// 보고서 날짜가 기준일보다 미래일 수 있는 최대 폭. 익일 계획·연휴 직전 작성 정도만 허용한다.
const REPORT_FUTURE_WINDOW_DAYS = 31;

/**
 * 연도 없는 월/일(텍스트 템플릿의 `N월 N일`)에 맞는 연도를 추정한다.
 *
 * 보고서는 대개 지난 날짜이고 미래라도 가까운 날(익일 등)뿐이므로, 기준일 + 31일을 넘지 않는 가장 최근 날짜의 연도를 고른다.
 * 예) 1월 초에 12월 말 보고서 → 작년, 12월 말에 1월 초(익일) 보고서 → 내년, 평년에 2월 29일 → 직전 윤년.
 *
 * @returns 존재할 수 없는 월/일이면 `null`
 */
export const inferReportYear = (month: number, day: number, base: Date = new Date()): number | null => {
  const baseYear = base.getFullYear();
  const limit = new Date(baseYear, base.getMonth(), base.getDate() + REPORT_FUTURE_WINDOW_DAYS).getTime();
  // 윤년 주기(4년)를 넘겨 보면 2월 29일도 반드시 후보가 생긴다.
  for (let year = baseYear + 1; year >= baseYear - 4; year--) {
    const candidate = new Date(year, month - 1, day);
    const exists = candidate.getMonth() === month - 1 && candidate.getDate() === day;
    if (exists && candidate.getTime() <= limit) return year;
  }
  return null;
};
