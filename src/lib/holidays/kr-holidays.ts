import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// 공공데이터포털 — 한국천문연구원 특일 정보(getRestDeInfo).
// 공휴일(법정공휴일), 대체공휴일, 임시공휴일을 모두 isHoliday='Y' 로 반환한다.
const REST_DE_INFO_URL = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';

type RestDeItem = {
  locdate: number; // 예: 20260101
  dateName: string; // 예: '1월1일'
  isHoliday: 'Y' | 'N';
};

const locdateToDateKey = (locdate: number): string => {
  const s = String(locdate);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
};

// 응답의 items.item 은 0건이면 빈 문자열, 1건이면 객체, 여러 건이면 배열로 온다 — 정규화한다.
const normalizeItems = (raw: unknown): Array<RestDeItem> => {
  if (Array.isArray(raw)) return raw as Array<RestDeItem>;
  if (raw && typeof raw === 'object') return [raw as RestDeItem];
  return [];
};

async function fetchHolidaysForYear(year: number): Promise<Array<{ holiday_date: string; name: string }>> {
  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error('DATA_GO_KR_SERVICE_KEY 환경변수가 없습니다.');
  }

  const params = new URLSearchParams({
    serviceKey,
    solYear: String(year),
    numOfRows: '100',
    _type: 'json',
  });

  const res = await fetch(`${REST_DE_INFO_URL}?${params.toString()}`, {
    // 외부 API — 함수 내 캐시 비활성화 (결과는 DB 에 적재해 재사용)
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`특일정보 API 응답 오류: ${res.status}`);
  }

  const json = (await res.json()) as {
    response?: { body?: { items?: { item?: unknown } } };
  };

  const items = normalizeItems(json.response?.body?.items?.item);
  return items
    .filter((it) => it.isHoliday === 'Y')
    .map((it) => ({ holiday_date: locdateToDateKey(it.locdate), name: it.dateName }));
}

// 해당 연도 공휴일이 DB 에 적재돼 있지 않으면 API 에서 가져와 캐시한다.
async function ensureYearSynced(supabase: SupabaseClient, year: number): Promise<void> {
  const { data: sync } = await supabase.from('kr_holiday_sync').select('year').eq('year', year).maybeSingle();
  if (sync) return;

  const holidays = await fetchHolidaysForYear(year);
  if (holidays.length > 0) {
    const { error } = await supabase.from('kr_holidays').upsert(holidays, { onConflict: 'holiday_date' });
    if (error) throw error;
  }
  // 공휴일이 0건이어도 "이 연도는 조회 완료"로 기록해 매번 API 를 때리지 않는다.
  const { error: syncError } = await supabase.from('kr_holiday_sync').upsert({ year }, { onConflict: 'year' });
  if (syncError) throw syncError;
}

/**
 * 주어진 dateKey('YYYY-MM-DD')가 대한민국 공휴일(임시·대체공휴일 포함)인지 판정한다.
 * 미적재 연도는 즉시 API 에서 가져와 캐시한 뒤 판정한다.
 */
export async function isKoreanHoliday(supabase: SupabaseClient, dateKey: string): Promise<boolean> {
  const year = Number(dateKey.slice(0, 4));
  await ensureYearSynced(supabase, year);

  const { data } = await supabase.from('kr_holidays').select('holiday_date').eq('holiday_date', dateKey).maybeSingle();
  return Boolean(data);
}

export type KoreanHoliday = { date: string; name: string };

/**
 * 주어진 연도의 대한민국 공휴일(임시·대체공휴일 포함) 전체를 반환한다.
 * 미적재 연도는 즉시 API 에서 가져와 캐시한 뒤 조회한다. (캘린더 표시용)
 */
export async function getKoreanHolidaysForYear(supabase: SupabaseClient, year: number): Promise<Array<KoreanHoliday>> {
  await ensureYearSynced(supabase, year);

  const { data } = await supabase
    .from('kr_holidays')
    .select('holiday_date, name')
    .gte('holiday_date', `${year}-01-01`)
    .lte('holiday_date', `${year}-12-31`)
    .order('holiday_date', { ascending: true })
    .returns<Array<{ holiday_date: string; name: string }>>();

  return (data ?? []).map((row) => ({ date: row.holiday_date, name: row.name }));
}
