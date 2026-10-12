import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { kstDateKey } from '@/utils';

// 공공데이터포털 — 한국천문연구원 특일 정보(getRestDeInfo).
// 공휴일(법정공휴일), 대체공휴일, 임시공휴일을 모두 isHoliday='Y' 로 반환한다.
const REST_DE_INFO_URL = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';

// 공공데이터포털 공통 응답 헤더의 정상 코드.
const RESULT_CODE_OK = '00';

// 공휴일은 임시공휴일 지정·해제로 연중 언제든 바뀐다 — 연도 캐시를 영구 고정하지 않고 TTL 로 재조회한다.
// 올해·미래 연도는 아직 확정되지 않았으므로 짧게, 지난 연도는 사실상 확정이라 길게 잡는다.
const ACTIVE_YEAR_SYNC_TTL_MS = 6 * 60 * 60 * 1000; // 6시간
const PAST_YEAR_SYNC_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일

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
    response?: {
      header?: { resultCode?: string; resultMsg?: string };
      body?: { items?: { item?: unknown } };
    };
  };

  // 이 API 는 인증키 오류·트래픽 초과 등도 HTTP 200 + 헤더 코드로 알린다 — 본문만 보면 '공휴일 0건'으로 오인한다.
  const resultCode = json.response?.header?.resultCode;
  if (resultCode !== RESULT_CODE_OK) {
    throw new Error(`특일정보 API 오류: ${resultCode ?? 'unknown'} ${json.response?.header?.resultMsg ?? ''}`.trim());
  }

  const items = normalizeItems(json.response?.body?.items?.item);
  const holidays = items
    .filter((it) => it.isHoliday === 'Y')
    .map((it) => ({ holiday_date: locdateToDateKey(it.locdate), name: it.dateName }));

  // 대한민국에 공휴일이 하나도 없는 해는 없다 — 0건은 응답 이상으로 보고 캐시하지 않는다.
  // (여기서 캐시하면 잘못된 '휴일 없음'이 TTL 동안 굳고, 기존 캐시를 통째로 지우게 된다)
  if (holidays.length === 0) {
    throw new Error(`특일정보 API 가 ${year}년 공휴일을 0건 반환했습니다.`);
  }

  return holidays;
}

// 지난 연도인지에 따라 재조회 주기를 다르게 잡는다. '올해'는 KST 기준.
function syncTtlMs(year: number): number {
  const currentYear = Number(kstDateKey().slice(0, 4));
  return year < currentYear ? PAST_YEAR_SYNC_TTL_MS : ACTIVE_YEAR_SYNC_TTL_MS;
}

type SyncState = {
  cached: boolean; // 이 연도 데이터를 한 번이라도 적재한 적이 있는가
  fresh: boolean; // TTL 이내라 재조회가 필요 없는가
};

async function readSyncState(supabase: SupabaseClient, year: number): Promise<SyncState> {
  const { data } = await supabase
    .from('kr_holiday_sync')
    .select('synced_at')
    .eq('year', year)
    .maybeSingle<{ synced_at: string }>();
  if (!data) return { cached: false, fresh: false };

  const ageMs = Date.now() - new Date(data.synced_at).getTime();
  return { cached: true, fresh: ageMs < syncTtlMs(year) };
}

// API 응답으로 해당 연도 캐시를 통째로 맞춘다 (추가·변경 upsert + 지정 해제된 날짜 삭제).
async function refreshYear(supabase: SupabaseClient, year: number): Promise<void> {
  const holidays = await fetchHolidaysForYear(year);
  const fetchedAt = new Date().toISOString();

  const { error: upsertError } = await supabase.from('kr_holidays').upsert(
    holidays.map((h) => ({ ...h, fetched_at: fetchedAt })),
    { onConflict: 'holiday_date' }
  );
  if (upsertError) throw upsertError;

  // upsert 만으로는 지정이 해제된 날짜가 캐시에 영원히 남는다 — 응답에 없는 그 해 날짜는 지운다.
  const keepList = holidays.map((h) => `"${h.holiday_date}"`).join(',');
  const { error: deleteError } = await supabase
    .from('kr_holidays')
    .delete()
    .gte('holiday_date', `${year}-01-01`)
    .lte('holiday_date', `${year}-12-31`)
    .not('holiday_date', 'in', `(${keepList})`);
  if (deleteError) throw deleteError;

  const { error: syncError } = await supabase
    .from('kr_holiday_sync')
    .upsert({ year, synced_at: fetchedAt }, { onConflict: 'year' });
  if (syncError) throw syncError;
}

/**
 * 해당 연도 공휴일 캐시를 최신 상태로 유지한다.
 *
 * TTL 이 지났으면 API 를 다시 조회해 갱신한다 — 임시공휴일 지정/해제가 연중에 일어나므로
 * 한 번 적재한 연도를 영구 고정하지 않는다.
 * 갱신에 실패해도 기존 캐시가 있으면 그대로 사용한다(도장을 갱신하지 않아 다음 호출에서 재시도).
 */
async function ensureYearSynced(supabase: SupabaseClient, year: number): Promise<void> {
  const state = await readSyncState(supabase, year);
  if (state.fresh) return;

  try {
    await refreshYear(supabase, year);
  } catch (error) {
    // 캐시가 아예 없으면 판정 자체가 불가능하므로 호출자에게 알린다.
    if (!state.cached) throw error;
    console.error(`${year}년 공휴일 갱신 실패 — 기존 캐시로 계속합니다`, error);
  }
}

/**
 * 주어진 dateKey('YYYY-MM-DD')가 대한민국 공휴일(임시·대체공휴일 포함)인지 판정한다.
 * 미적재이거나 캐시가 오래된 연도는 즉시 API 에서 가져와 갱신한 뒤 판정한다.
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
 * 미적재이거나 캐시가 오래된 연도는 즉시 API 에서 가져와 갱신한 뒤 조회한다. (캘린더 표시용)
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
