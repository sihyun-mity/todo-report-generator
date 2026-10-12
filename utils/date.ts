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
