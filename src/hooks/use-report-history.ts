import { useEffect } from 'react';
import { useReportHistoryStore } from '@/stores';

// 보고서 히스토리 진입 훅.
// - useReportHistoryStore에서 모듈 레벨로 캐시된 history/모드/유저 정보를 읽는다.
// - 마운트 시 initialize()를 호출하지만, store 내부에서 Promise를 캐싱하므로
//   여러 컴포넌트나 페이지 재마운트로 인한 중복 Supabase 호출이 발생하지 않는다.
export const useReportHistory = () => {
  const history = useReportHistoryStore((s) => s.history);
  const isLoaded = useReportHistoryStore((s) => s.isLoaded);
  const mode = useReportHistoryStore((s) => s.mode);
  const hasLocalBackup = useReportHistoryStore((s) => s.hasLocalBackup);
  const userId = useReportHistoryStore((s) => s.userId);
  const initialize = useReportHistoryStore((s) => s.initialize);
  const addHistory = useReportHistoryStore((s) => s.addHistory);
  const deleteHistory = useReportHistoryStore((s) => s.deleteHistory);
  const importFromLocalStorage = useReportHistoryStore((s) => s.importFromLocalStorage);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return { history, isLoaded, hasLocalBackup, mode, userId, addHistory, deleteHistory, importFromLocalStorage };
};
