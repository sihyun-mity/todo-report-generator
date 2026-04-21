import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import toast from 'react-hot-toast';
import { Project, ReportHistoryItem } from '@/app/_components/types';
import { cloneProjects, generateReportText, MAX_HISTORY_ITEMS } from '@/utils/report';
import { createClient } from '@/lib/supabase/client';

interface AddHistoryArgs {
  month: string;
  day: string;
  todayProjects: Project[];
  tomorrowProjects: Project[];
}

interface ReportRow {
  id: string;
  report_date: string;
  created_at: string;
  updated_at: string;
  content: {
    month: string;
    day: string;
    text: string;
    todayProjects: Project[];
    tomorrowProjects: Project[];
  };
}

const LEGACY_STORAGE_KEY = 'report-history';

// useSyncExternalStore용 helpers (SSR-safe)
const subscribeNoop = () => () => {};
const getHasLocalBackupSnapshot = () => {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
};
const getHasLocalBackupServer = () => false;

// month/day + 현재 연도 조합으로 report_date(YYYY-MM-DD) 계산
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

// Supabase 기반 보고서 히스토리 관리 훅
// - 로그인 사용자의 본인 데이터만 조회 (RLS)
// - 같은 날짜 저장 시 upsert로 덮어쓰기
export const useReportHistory = () => {
  const supabaseRef = useRef(createClient());
  const [history, setHistory] = useState<ReportHistoryItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // 로컬스토리지에 이전 가능한 기록이 있는지 (SSR-safe)
  const hasLocalBackup = useSyncExternalStore(subscribeNoop, getHasLocalBackupSnapshot, getHasLocalBackupServer);

  // 초기 로드
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const supabase = supabaseRef.current;
      const { data, error } = await supabase
        .from('reports')
        .select('id, report_date, created_at, updated_at, content')
        .order('report_date', { ascending: false })
        .limit(MAX_HISTORY_ITEMS)
        .returns<ReportRow[]>();

      if (cancelled) return;

      if (error) {
        console.error('보고서 기록 불러오기 실패', error);
        toast.error('이전 기록을 불러오지 못했습니다.');
      } else {
        setHistory((data ?? []).map(rowToItem));
      }
      setIsLoaded(true);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const addHistory = useCallback(async (data: AddHistoryArgs) => {
    const supabase = supabaseRef.current;
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
    setHistory((prev) => {
      const filtered = prev.filter((item) => item.id !== newItem.id);
      return [newItem, ...filtered].slice(0, MAX_HISTORY_ITEMS);
    });
  }, []);

  const deleteHistory = useCallback(async (id: string) => {
    const supabase = supabaseRef.current;
    setHistory((prev) => prev.filter((item) => item.id !== id));
    const { error } = await supabase.from('reports').delete().eq('id', id);
    if (error) {
      console.error('보고서 삭제 실패', error);
      toast.error('삭제에 실패했습니다. 새로고침 후 다시 시도해주세요.');
    }
  }, []);

  // 로컬스토리지 → Supabase 일괄 이전
  const importFromLocalStorage = useCallback(async () => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LEGACY_STORAGE_KEY) : null;
    if (!raw) {
      toast.error('가져올 로컬 기록이 없습니다.');
      return { imported: 0 };
    }

    let parsed: ReportHistoryItem[] = [];
    try {
      parsed = JSON.parse(raw) as ReportHistoryItem[];
    } catch {
      toast.error('로컬 기록 형식이 올바르지 않습니다.');
      return { imported: 0 };
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      toast.error('가져올 로컬 기록이 없습니다.');
      return { imported: 0 };
    }

    const supabase = supabaseRef.current;
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
      .limit(MAX_HISTORY_ITEMS)
      .returns<ReportRow[]>();
    if (refreshed) setHistory(refreshed.map(rowToItem));

    // 롤백 대비 로컬 데이터는 지우지 않고 플래그만 기록
    try {
      localStorage.setItem(`${LEGACY_STORAGE_KEY}-imported`, String(Date.now()));
    } catch {
      // storage 쿼터 초과 등은 무시
    }

    return { imported: rows.length };
  }, []);

  return { history, isLoaded, hasLocalBackup, addHistory, deleteHistory, importFromLocalStorage };
};
