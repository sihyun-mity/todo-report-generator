import toast from 'react-hot-toast';
import { create } from 'zustand';
import { MAX_HISTORY_ITEMS, REPORT_HISTORY_STORAGE_KEY } from '@/constants';
import { isGuestMode } from '@/lib/guest';
import { createClient } from '@/lib/supabase/client';
import type { Project, ReportHistoryItem, ReportHistoryStore } from '@/types';
import { cloneProjects, generateReportText } from '@/utils';

type ReportRow = {
  id: string;
  report_date: string;
  created_at: string;
  updated_at: string;
  content: {
    month: string;
    day: string;
    text: string;
    todayProjects: Array<Project>;
    tomorrowProjects: Array<Project>;
  };
};

const toReportDate = (month: string, day: string) => {
  const y = new Date().getFullYear();
  const m = String(parseInt(month, 10)).padStart(2, '0');
  const d = String(parseInt(day, 10)).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

const dateKeyToMonthKey = (dateKey: string) => dateKey.slice(0, 7);

const monthRangeBounds = (year: number, month: number) => {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return { start, end };
};

// 게스트 모드 항목의 dateKey 도출 (timestamp 연도 + 월/일)
const guestItemDateKey = (item: ReportHistoryItem) => {
  const y = new Date(item.timestamp).getFullYear();
  const m = String(parseInt(item.month, 10)).padStart(2, '0');
  const d = String(parseInt(item.day, 10)).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// 게스트 모드 전용: 한 번 적재한 후 클라이언트에서 정렬한다 (전체 데이터가 메모리에 있으므로 의미 있음).
// 로그인 사용자 모드에서는 Supabase 정렬을 그대로 신뢰하므로 클라이언트 정렬을 적용하지 않는다.
const sortGuestByReportDateDesc = (items: ReadonlyArray<ReportHistoryItem>): Array<ReportHistoryItem> =>
  [...items].sort((a, b) => {
    const ka = guestItemDateKey(a);
    const kb = guestItemDateKey(b);
    if (ka !== kb) return ka < kb ? 1 : -1;
    return b.timestamp - a.timestamp;
  });

const rowToItem = (row: ReportRow): ReportHistoryItem => ({
  id: row.id,
  month: row.content.month,
  day: row.content.day,
  content: row.content.text,
  todayProjects: row.content.todayProjects,
  tomorrowProjects: row.content.tomorrowProjects,
  timestamp: new Date(row.updated_at ?? row.created_at).getTime(),
});

const loadLocalHistory = (): Array<ReportHistoryItem> => {
  try {
    const raw = localStorage.getItem(REPORT_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Array<ReportHistoryItem>;
  } catch {
    return [];
  }
};

const saveLocalHistory = (items: ReadonlyArray<ReportHistoryItem>) => {
  try {
    localStorage.setItem(REPORT_HISTORY_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage 쿼터 초과 등은 무시
  }
};

const computeHasLocalBackup = () => {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(REPORT_HISTORY_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
};

const generateLocalId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

// 한 세션에서 initialize는 단 한 번만 실제 fetch를 수행하도록 Promise를 캐싱.
// 페이지가 재마운트되거나 동일 시점에 여러 컴포넌트가 호출해도 중복 요청이 발생하지 않는다.
let initializePromise: Promise<void> | null = null;

// 동일 월에 대한 동시 요청 합치기 — 같은 month에 대해 로딩 중인 Promise를 공유.
const monthFetchPromises = new Map<string, Promise<void>>();

const getSupabase = () => createClient();

// 새 dateKey를 내림차순 정렬 유지하며 삽입 — 단일 요소 삽입만 수행 (전체 sort 회피).
const insertDateKeyDesc = (dates: ReadonlyArray<string>, dateKey: string): Array<string> => {
  const next = [...dates];
  const idx = next.findIndex((d) => d <= dateKey);
  if (idx === -1) next.push(dateKey);
  else if (next[idx] === dateKey) return next;
  else next.splice(idx, 0, dateKey);
  return next;
};

// 단일 월의 보고서 데이터 fetch (Supabase). 로딩 상태 관리는 호출자가 담당.
const fetchMonthFromSupabase = async (year: number, month: number): Promise<Array<ReportHistoryItem> | null> => {
  const { start, end } = monthRangeBounds(year, month);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('reports')
    .select('id, report_date, created_at, updated_at, content')
    .gte('report_date', start)
    .lt('report_date', end)
    .order('report_date', { ascending: false })
    .returns<Array<ReportRow>>();
  if (error) {
    console.error('월별 보고서 불러오기 실패', error);
    return null;
  }
  return (data ?? []).map(rowToItem);
};

// 보고서 기록(이전 작성 내역)을 모듈 레벨에서 캐싱.
// - 로그인 사용자: report_date 목록 + 가장 최근 월 본문을 함께 fetch한 뒤에 isLoaded를 true로 한다 (form hydration race 회피).
//   추가 월은 loadMonth(year, month)로 lazy 로드.
// - 게스트 사용자: localStorage에서 한 번에 로드.
// - 작성/삭제는 store를 직접 갱신하여 항상 최신 상태 유지.
export const useReportHistoryStore = create<ReportHistoryStore>()((set, get) => ({
  history: [],
  isLoaded: false,
  mode: 'loading',
  hasLocalBackup: false,
  userId: null,
  allReportDates: [],
  loadedMonths: new Set<string>(),
  loadingMonths: new Set<string>(),

  initialize: () => {
    if (initializePromise) return initializePromise;

    initializePromise = (async () => {
      // 게스트 쿠키가 설정된 상태라면 Supabase 호출을 생략 — stale 토큰으로 인한 refresh 오류 회피
      if (isGuestMode()) {
        const items = sortGuestByReportDateDesc(loadLocalHistory()).slice(0, MAX_HISTORY_ITEMS);
        set({
          mode: 'guest',
          history: items,
          isLoaded: true,
          hasLocalBackup: computeHasLocalBackup(),
          userId: null,
          allReportDates: items.map(guestItemDateKey),
          loadedMonths: new Set<string>(),
          loadingMonths: new Set<string>(),
        });
        return;
      }

      const supabase = getSupabase();
      let user: { id: string } | null = null;
      try {
        const result = await supabase.auth.getUser();
        user = result.data.user;
      } catch {
        user = null;
      }

      if (user) {
        // 1) 전체 report_date만 lightweight으로 fetch
        const datesQuery = await supabase
          .from('reports')
          .select('report_date')
          .order('report_date', { ascending: false })
          .returns<Array<{ report_date: string }>>();

        if (datesQuery.error) {
          console.error('보고서 날짜 목록 불러오기 실패', datesQuery.error);
          toast.error('이전 기록을 불러오지 못했습니다.');
          set({
            mode: 'user',
            history: [],
            isLoaded: true,
            hasLocalBackup: computeHasLocalBackup(),
            userId: user.id,
            allReportDates: [],
            loadedMonths: new Set<string>(),
            loadingMonths: new Set<string>(),
          });
          return;
        }

        const allDates = (datesQuery.data ?? []).map((row) => row.report_date);

        // 2) 가장 최근 기록의 월 본문도 함께 fetch — isLoaded를 true로 하기 전에 완료
        //    (form hydration이 isHistoryLoaded만 보고 빈 history로 동작하는 race 방지)
        let initialHistory: Array<ReportHistoryItem> = [];
        const initialLoadedMonths = new Set<string>();
        const latest = allDates[0];
        if (latest) {
          const [y, m] = latest.split('-').map((s) => parseInt(s, 10));
          const monthItems = await fetchMonthFromSupabase(y, m);
          if (monthItems) {
            initialHistory = monthItems;
            initialLoadedMonths.add(monthKey(y, m));
          } else {
            toast.error('이전 기록을 불러오지 못했습니다.');
          }
        }

        // 3) 단일 atomic set
        set({
          mode: 'user',
          history: initialHistory,
          isLoaded: true,
          hasLocalBackup: computeHasLocalBackup(),
          userId: user.id,
          allReportDates: allDates,
          loadedMonths: initialLoadedMonths,
          loadingMonths: new Set<string>(),
        });
        return;
      }

      // 비로그인: 게스트 모드 여부와 무관하게 로컬 기록을 사용
      const items = sortGuestByReportDateDesc(loadLocalHistory()).slice(0, MAX_HISTORY_ITEMS);
      set({
        mode: 'guest',
        history: items,
        isLoaded: true,
        hasLocalBackup: computeHasLocalBackup(),
        userId: null,
        allReportDates: items.map(guestItemDateKey),
        loadedMonths: new Set<string>(),
        loadingMonths: new Set<string>(),
      });
    })();

    return initializePromise;
  },

  loadMonth: async (year, month) => {
    const { mode, loadedMonths, allReportDates } = get();
    if (mode !== 'user') return;

    const key = monthKey(year, month);
    if (loadedMonths.has(key)) return;

    // 해당 월에 기록이 없으면 fetch 자체를 건너뛰고 loaded 처리만
    const hasAny = allReportDates.some((d) => dateKeyToMonthKey(d) === key);
    if (!hasAny) {
      set((state) => {
        const next = new Set(state.loadedMonths);
        next.add(key);
        return { loadedMonths: next };
      });
      return;
    }

    // 동시 요청 합치기
    const inflight = monthFetchPromises.get(key);
    if (inflight) return inflight;

    set((state) => {
      const next = new Set(state.loadingMonths);
      next.add(key);
      return { loadingMonths: next };
    });

    const promise = (async () => {
      const items = await fetchMonthFromSupabase(year, month);
      if (items === null) {
        toast.error('해당 월의 기록을 불러오지 못했습니다.');
        set((state) => {
          const next = new Set(state.loadingMonths);
          next.delete(key);
          return { loadingMonths: next };
        });
        return;
      }

      set((state) => {
        const idsInBatch = new Set(items.map((i) => i.id));
        const merged = [...state.history.filter((h) => !idsInBatch.has(h.id)), ...items];
        const nextLoaded = new Set(state.loadedMonths);
        nextLoaded.add(key);
        const nextLoading = new Set(state.loadingMonths);
        nextLoading.delete(key);
        return { history: merged, loadedMonths: nextLoaded, loadingMonths: nextLoading };
      });
    })();

    monthFetchPromises.set(key, promise);
    try {
      await promise;
    } finally {
      monthFetchPromises.delete(key);
    }
  },

  addHistory: async (data) => {
    const { mode, history } = get();
    if (mode === 'loading') return;

    const reportDate = toReportDate(data.month, data.day);
    const newText = generateReportText(data);

    // 같은 날짜의 기존 기록과 본문이 동일하면 I/O를 건너뛴다 (localStorage / Supabase 쓰기 생략)
    const existingForDate = history.find((item) => toReportDate(item.month, item.day) === reportDate);
    if (existingForDate && existingForDate.content === newText) return;

    if (mode === 'guest') {
      const newItem: ReportHistoryItem = {
        id: generateLocalId(),
        month: data.month,
        day: data.day,
        content: newText,
        todayProjects: cloneProjects(data.todayProjects),
        tomorrowProjects: cloneProjects(data.tomorrowProjects),
        timestamp: Date.now(),
      };

      const filtered = loadLocalHistory().filter((item) => toReportDate(item.month, item.day) !== reportDate);
      const next = sortGuestByReportDateDesc([newItem, ...filtered]).slice(0, MAX_HISTORY_ITEMS);
      saveLocalHistory(next);
      set({
        history: next,
        hasLocalBackup: next.length > 0,
        allReportDates: next.map(guestItemDateKey),
      });
      return;
    }

    const supabase = getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error('로그인이 필요합니다.');
      return;
    }

    const content = {
      month: data.month,
      day: data.day,
      text: newText,
      todayProjects: cloneProjects(data.todayProjects),
      tomorrowProjects: cloneProjects(data.tomorrowProjects),
    };

    const { data: upserted, error } = await supabase
      .from('reports')
      .upsert({ user_id: user.id, report_date: reportDate, content }, { onConflict: 'user_id,report_date' })
      .select('id, report_date, created_at, updated_at, content')
      .single<ReportRow>();

    if (error || !upserted) {
      console.error('보고서 저장 실패', error);
      toast.error('보고서 저장에 실패했습니다.');
      return;
    }

    // 영향받은 월을 직접 refetch — loadingMonths 플래그를 세우지 않아 사용자 입장에서 스켈레톤 깜빡임이 없도록
    const newDateKey = upserted.report_date;
    const [y, m] = newDateKey.split('-').map((s) => parseInt(s, 10));
    const affectedMonth = monthKey(y, m);
    const refreshed = await fetchMonthFromSupabase(y, m);
    const finalItems = refreshed ?? [rowToItem(upserted)];

    set((state) => {
      const idsInBatch = new Set(finalItems.map((i) => i.id));
      const merged = [...state.history.filter((h) => !idsInBatch.has(h.id)), ...finalItems];
      const nextLoaded = new Set(state.loadedMonths);
      nextLoaded.add(affectedMonth);
      const dates = state.allReportDates.includes(newDateKey)
        ? state.allReportDates
        : insertDateKeyDesc(state.allReportDates, newDateKey);
      return {
        history: merged,
        loadedMonths: nextLoaded,
        allReportDates: dates,
      };
    });
  },

  deleteHistory: async (id) => {
    const { mode } = get();
    if (mode === 'guest') {
      const next = loadLocalHistory().filter((item) => item.id !== id);
      saveLocalHistory(next);
      set((state) => {
        const filtered = state.history.filter((item) => item.id !== id);
        return {
          history: filtered,
          hasLocalBackup: next.length > 0,
          allReportDates: filtered.map(guestItemDateKey),
        };
      });
      return;
    }

    const supabase = getSupabase();
    const removedDateKey = (() => {
      const target = get().history.find((item) => item.id === id);
      if (!target) return null;
      const y = new Date(target.timestamp).getFullYear();
      const mm = String(parseInt(target.month, 10)).padStart(2, '0');
      const dd = String(parseInt(target.day, 10)).padStart(2, '0');
      return `${y}-${mm}-${dd}`;
    })();

    set((state) => ({
      history: state.history.filter((item) => item.id !== id),
      allReportDates: removedDateKey ? state.allReportDates.filter((d) => d !== removedDateKey) : state.allReportDates,
    }));

    const { error } = await supabase.from('reports').delete().eq('id', id);
    if (error) {
      console.error('보고서 삭제 실패', error);
      toast.error('삭제에 실패했습니다. 새로고침 후 다시 시도해주세요.');
    }
  },

  importFromLocalStorage: async () => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(REPORT_HISTORY_STORAGE_KEY) : null;
    if (!raw) {
      toast.error('가져올 로컬 기록이 없습니다.');
      return { imported: 0 };
    }

    let parsed: Array<ReportHistoryItem> = [];
    try {
      parsed = JSON.parse(raw) as Array<ReportHistoryItem>;
    } catch {
      toast.error('로컬 기록 형식이 올바르지 않습니다.');
      return { imported: 0 };
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      toast.error('가져올 로컬 기록이 없습니다.');
      return { imported: 0 };
    }

    const supabase = getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error('로그인이 필요합니다.');
      return { imported: 0 };
    }

    const rows = parsed.map((item) => ({
      user_id: user.id,
      report_date: toReportDate(item.month, item.day),
      content: {
        month: item.month,
        day: item.day,
        text: item.content,
        todayProjects: item.todayProjects,
        tomorrowProjects: item.tomorrowProjects,
      },
    }));

    const { error } = await supabase.from('reports').upsert(rows, { onConflict: 'user_id,report_date' });

    if (error) {
      console.error('로컬 기록 이전 실패', error);
      toast.error('이전 중 오류가 발생했습니다.');
      return { imported: 0 };
    }

    // 날짜 목록을 재조회한 뒤, 가장 최근 월을 직접 적재 (loadingMonths 미설정)
    const datesQuery = await supabase
      .from('reports')
      .select('report_date')
      .order('report_date', { ascending: false })
      .returns<Array<{ report_date: string }>>();

    const allDates = (datesQuery.data ?? []).map((r) => r.report_date);

    let nextHistory: Array<ReportHistoryItem> = [];
    const nextLoadedMonths = new Set<string>();
    const latest = allDates[0];
    if (latest) {
      const [y, m] = latest.split('-').map((s) => parseInt(s, 10));
      const items = await fetchMonthFromSupabase(y, m);
      if (items) {
        nextHistory = items;
        nextLoadedMonths.add(monthKey(y, m));
      }
    }

    set({
      history: nextHistory,
      allReportDates: allDates,
      loadedMonths: nextLoadedMonths,
      loadingMonths: new Set<string>(),
    });

    // 롤백 대비 로컬 데이터는 지우지 않고 플래그만 기록
    try {
      localStorage.setItem(`${REPORT_HISTORY_STORAGE_KEY}-imported`, String(Date.now()));
    } catch {
      // storage 쿼터 초과 등은 무시
    }

    return { imported: rows.length };
  },

  reset: () => {
    initializePromise = null;
    monthFetchPromises.clear();
    set({
      history: [],
      isLoaded: false,
      mode: 'loading',
      hasLocalBackup: false,
      userId: null,
      allReportDates: [],
      loadedMonths: new Set<string>(),
      loadingMonths: new Set<string>(),
    });
  },
}));
