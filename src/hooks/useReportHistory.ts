import { useCallback } from 'react';
import { useLocalStorage } from 'usehooks-ts';
import { Project, ReportHistoryItem } from '@/app/_components/types';
import { cloneProjects, generateReportText, MAX_HISTORY_ITEMS } from '@/utils/report';
import { createId } from '@/utils/id';

const STORAGE_KEY = 'report-history';

interface AddHistoryArgs {
  month: string;
  day: string;
  todayProjects: Project[];
  tomorrowProjects: Project[];
}

// localStorage 기반 보고서 히스토리 관리 훅
// - 오래된 항목은 MAX_HISTORY_ITEMS까지만 유지
// - 저장 시 프로젝트 객체는 깊은 복사하여 참조 공유를 방지
export const useReportHistory = () => {
  const [history, setHistory] = useLocalStorage<ReportHistoryItem[]>(STORAGE_KEY, []);

  const addHistory = useCallback(
    (data: AddHistoryArgs) => {
      const newItem: ReportHistoryItem = {
        id: createId(),
        month: data.month,
        day: data.day,
        content: generateReportText(data),
        todayProjects: cloneProjects(data.todayProjects),
        tomorrowProjects: cloneProjects(data.tomorrowProjects),
        timestamp: Date.now(),
      };
      setHistory((prev) => [newItem, ...prev].slice(0, MAX_HISTORY_ITEMS));
    },
    [setHistory]
  );

  const deleteHistory = useCallback(
    (id: string) => {
      setHistory((prev) => prev.filter((item) => item.id !== id));
    },
    [setHistory]
  );

  return { history, addHistory, deleteHistory };
};
