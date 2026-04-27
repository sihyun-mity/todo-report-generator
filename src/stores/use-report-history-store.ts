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

const getSupabase = () => createClient();

// 보고서 기록(이전 작성 내역)을 모듈 레벨에서 캐싱.
// - 로그인 사용자: 최초 1회만 Supabase에서 fetch. 이후 페이지 이동 시 재조회 없음.
// - 게스트 사용자: localStorage에서 로드.
// - 작성/삭제는 store를 직접 갱신하여 항상 최신 상태 유지.
export const useReportHistoryStore = create<ReportHistoryStore>()((set, get) => ({
  history: [],
  isLoaded: false,
  mode: 'loading',
  hasLocalBackup: false,
  userId: null,

  initialize: () => {
    if (initializePromise) return initializePromise;

    initializePromise = (async () => {
      // 게스트 쿠키가 설정된 상태라면 Supabase 호출을 생략 — stale 토큰으로 인한 refresh 오류 회피
      if (isGuestMode()) {
        const items = loadLocalHistory()
          .slice()
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, MAX_HISTORY_ITEMS);
        set({
          mode: 'guest',
          history: items,
          isLoaded: true,
          hasLocalBackup: computeHasLocalBackup(),
          userId: null,
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
        const { data, error } = await supabase
          .from('reports')
          .select('id, report_date, created_at, updated_at, content')
          .order('report_date', { ascending: false })
          .returns<Array<ReportRow>>();

        if (error) {
          console.error('보고서 기록 불러오기 실패', error);
          toast.error('이전 기록을 불러오지 못했습니다.');
          set({
            mode: 'user',
            history: [],
            isLoaded: true,
            hasLocalBackup: computeHasLocalBackup(),
            userId: user.id,
          });
          return;
        }

        set({
          mode: 'user',
          history: (data ?? []).map(rowToItem),
          isLoaded: true,
          hasLocalBackup: computeHasLocalBackup(),
          userId: user.id,
        });
        return;
      }

      // 비로그인: 게스트 모드 여부와 무관하게 로컬 기록을 사용
      const items = loadLocalHistory()
        .slice()
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, MAX_HISTORY_ITEMS);
      set({
        mode: 'guest',
        history: items,
        isLoaded: true,
        hasLocalBackup: computeHasLocalBackup(),
        userId: null,
      });
    })();

    return initializePromise;
  },

  addHistory: async (data) => {
    const { mode } = get();
    if (mode === 'loading') return;

    if (mode === 'guest') {
      const content = {
        month: data.month,
        day: data.day,
        text: generateReportText(data),
        todayProjects: cloneProjects(data.todayProjects),
        tomorrowProjects: cloneProjects(data.tomorrowProjects),
      };

      const reportDate = toReportDate(data.month, data.day);
      const existing = loadLocalHistory();
      // 같은 날짜(reportDate) 기록은 덮어쓰기
      const filtered = existing.filter((item) => toReportDate(item.month, item.day) !== reportDate);
      const newItem: ReportHistoryItem = {
        id: generateLocalId(),
        month: content.month,
        day: content.day,
        content: content.text,
        todayProjects: content.todayProjects,
        tomorrowProjects: content.tomorrowProjects,
        timestamp: Date.now(),
      };
      const next = [newItem, ...filtered].sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_HISTORY_ITEMS);
      saveLocalHistory(next);
      set({ history: next, hasLocalBackup: next.length > 0 });
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

    const reportDate = toReportDate(data.month, data.day);
    const content = {
      month: data.month,
      day: data.day,
      text: generateReportText(data),
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

    const newItem = rowToItem(upserted);
    set((state) => ({
      history: [newItem, ...state.history.filter((item) => item.id !== newItem.id)],
    }));
  },

  deleteHistory: async (id) => {
    const { mode } = get();
    if (mode === 'guest') {
      const next = loadLocalHistory().filter((item) => item.id !== id);
      saveLocalHistory(next);
      set((state) => ({
        history: state.history.filter((item) => item.id !== id),
        hasLocalBackup: next.length > 0,
      }));
      return;
    }

    const supabase = getSupabase();
    set((state) => ({ history: state.history.filter((item) => item.id !== id) }));
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

    // 재조회하여 상태 동기화
    const { data: refreshed } = await supabase
      .from('reports')
      .select('id, report_date, created_at, updated_at, content')
      .order('report_date', { ascending: false })
      .returns<Array<ReportRow>>();
    if (refreshed) set({ history: refreshed.map(rowToItem) });

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
    set({
      history: [],
      isLoaded: false,
      mode: 'loading',
      hasLocalBackup: false,
      userId: null,
    });
  },
}));
