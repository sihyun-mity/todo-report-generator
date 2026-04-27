'use client';

import { MouseEvent, useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useIsClient } from 'usehooks-ts';
import type { Project, ReportDate, ReportHistoryItem } from '@/types';
import {
  ImportLocalDialog,
  ImportModal,
  MobileCopyBar,
  ProjectList,
  ReportHeader,
  ReportHistory,
  ReportPreview,
  getItemDateKey,
} from '.';
import { useProjects, useReportHistory, type UseProjectsReturn } from '@/hooks';
import { confirm, useReportFormStore } from '@/stores';
import { COPY_FEEDBACK_DURATION_MS, UNDO_TOAST_DURATION_MS } from '@/constants';
import {
  areAllAttemptedProjectsValid,
  cloneProjects,
  generateReportText,
  hasProjectContent,
  mergeIncompleteTasks,
} from '@/utils';

// 오늘/내일을 제외한 기준 날짜(월/일)로 히스토리 추가 대상인지 판단
const isEarlierDate = (month: string, day: string) => {
  const importMonth = parseInt(month, 10);
  const importDay = parseInt(day, 10);
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  return importMonth < currentMonth || (importMonth === currentMonth && importDay < currentDay);
};

// 오늘 자정 기준 dateKey ('YYYY-MM-DD'). getItemDateKey와 동일한 형식이라 lexical 비교 가능.
const todayDateKey = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// 두 dateKey를 desc 비교 (Array.prototype.sort 콜백용)
const compareDateKeyDesc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

// 사용자별로 "로컬 기록 이전 안내 dialog 봤음" 플래그 키
const importPromptSeenKey = (userId: string) => `report-history-import-prompt-seen:${userId}`;

// 폼 dirty 비교용 직렬화 — 페이지 이탈 경고에 쓰는 baseline 키
const serializeReport = (date: ReportDate, today: ReadonlyArray<Project>, tomorrow: ReadonlyArray<Project>): string =>
  JSON.stringify({ d: date, t: today, n: tomorrow });

export function ReportForm() {
  const isClient = useIsClient();
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  const reportDate = useReportFormStore((s) => s.reportDate);
  const setReportDate = useReportFormStore((s) => s.setReportDate);
  const hasHydratedFromHistory = useReportFormStore((s) => s.hasHydratedFromHistory);
  const markHydratedFromHistory = useReportFormStore((s) => s.markHydratedFromHistory);
  const resetForm = useReportFormStore((s) => s.resetForm);

  const today = useProjects('today');
  const tomorrow = useProjects('tomorrow');
  const {
    history,
    isLoaded: isHistoryLoaded,
    hasLocalBackup,
    mode: historyMode,
    userId,
    allReportDates,
    loadingMonths,
    loadMonth,
    addHistory,
    deleteHistory,
    importFromLocalStorage,
  } = useReportHistory();

  // 페이지 이탈 경고용 baseline. 처음 준비된 보고서 직렬화 결과와 현재 상태를 비교해 dirty 여부 판정.
  // 페이지 내 SPA 탐색은 beforeunload가 발생하지 않으므로 자연스럽게 제외된다.
  const [dirtyBaseline, setDirtyBaseline] = useState<string | null>(null);

  // 기록 추가/실행취소 직후 ReportHistory 캘린더를 해당 월로 이동시키기 위한 요청 토큰.
  // toReportDate와 동일한 규칙으로 dateKey를 만든다 (현재 연도 + 보고서 month/day).
  const [historyFocus, setHistoryFocus] = useState<{ dateKey: string; nonce: number } | null>(null);
  const requestHistoryFocus = useCallback((month: string, day: string) => {
    const y = new Date().getFullYear();
    const mm = String(parseInt(month, 10)).padStart(2, '0');
    const dd = String(parseInt(day, 10)).padStart(2, '0');
    setHistoryFocus({ dateKey: `${y}-${mm}-${dd}`, nonce: Date.now() });
  }, []);

  // 외부 액션(복사·리셋·기록 불러오기·텍스트 적용) 후 store가 새 값으로 갱신된 직후 baseline을 다시 잡는다.
  // 같은 핸들러 안에서는 selector가 아직 옛 값일 수 있어 microtask로 미루고 store에서 직접 가져온다.
  const refreshBaseline = useCallback(() => {
    queueMicrotask(() => {
      const s = useReportFormStore.getState();
      setDirtyBaseline(serializeReport(s.reportDate, s.today, s.tomorrow));
    });
  }, []);

  // 조건: 로컬에는 기록이 있지만 DB 계정에는 없음
  // (로그인 사용자는 페이지네이션으로 history가 비어 보일 수 있어 allReportDates로 판정)
  const canImportLocal = isHistoryLoaded && allReportDates.length === 0 && hasLocalBackup;

  // 최초 접속 1회 안내 dialog: 위 조건 + 해당 유저 대상 안내를 본 적이 없을 때
  useEffect(() => {
    if (!isClient || !canImportLocal || !userId) return;
    if (localStorage.getItem(importPromptSeenKey(userId))) return;
    setIsImportDialogOpen(true);
  }, [isClient, canImportLocal, userId]);

  const markImportPromptSeen = () => {
    if (!userId) return;
    try {
      localStorage.setItem(importPromptSeenKey(userId), String(Date.now()));
    } catch {
      // storage 쿼터 초과 등은 무시
    }
  };

  const runImportLocal = async () => {
    const { imported } = await importFromLocalStorage();
    if (imported > 0) toast.success(`${imported}개 기록을 이전했습니다.`);
  };

  const handleImportLocal = async () => {
    const ok = await confirm({
      title: '로컬 기록 이전',
      description: '브라우저에 저장된 기존 기록을 계정에 이전합니다.\n같은 날짜 기록이 있으면 덮어쓰여집니다.',
      confirmText: '이전하기',
    });
    if (!ok) return;
    await runImportLocal();
  };

  const handleDialogConfirm = async () => {
    markImportPromptSeen();
    setIsImportDialogOpen(false);
    await runImportLocal();
  };

  const handleDialogDismiss = () => {
    markImportPromptSeen();
    setIsImportDialogOpen(false);
  };

  // 초기 로드 완료 후 직전 보고서를 폼에 반영한다 (세션당 1회만).
  // - 오늘 작성한 기록이 있으면 그대로 복원해 사용자가 이어서 편집할 수 있게 한다 (연도까지 일치하는 경우만).
  // - 그 외에는 가장 최근 과거 기록의 '익일 예정' 내용을 금일 프로젝트로 가져온다.
  // - 미래 날짜 기록(예: 4/28인데 5/1 기록)은 hydration 대상에서 제외 — 폼은 항상 오늘 이전 기록 기준으로 복원한다.
  // - store는 latest 월만 적재하므로 latest가 미래면 과거 월이 history에 없을 수 있다.
  //   이때 allReportDates에서 가장 최근 과거 날짜의 월을 lazy 로드한 뒤 다음 렌더에서 다시 시도한다.
  // 페이지를 이동했다 돌아와도 store에 hydrate 플래그가 남아 있어 작성 중인 내용을 덮어쓰지 않는다.
  useEffect(() => {
    if (!isClient || !isHistoryLoaded || hasHydratedFromHistory) return;
    if (history.length === 0 && allReportDates.length === 0) {
      markHydratedFromHistory();
      return;
    }

    const todayKey = todayDateKey();
    const latestPastDateKey = allReportDates.find((d) => d <= todayKey);
    if (!latestPastDateKey) {
      // 미래 기록만 존재 — carry-over 없음
      markHydratedFromHistory();
      return;
    }

    // 가장 최근 과거 기록이 속한 월이 history에 적재되어 있어야 carry-over/오늘 복원 후보를 찾을 수 있다.
    const targetMonth = latestPastDateKey.slice(0, 7);
    const isTargetMonthLoaded = history.some((item) => getItemDateKey(item).slice(0, 7) === targetMonth);
    if (!isTargetMonthLoaded) {
      const [y, m] = targetMonth.split('-').map((s) => parseInt(s, 10));
      void loadMonth(y, m);
      return; // 월 로드 후 다음 effect 사이클에서 hydration 재시도
    }

    markHydratedFromHistory();

    // 오늘 기록이 존재하면 그대로 복원 (연도까지 일치하는 경우만)
    if (latestPastDateKey === todayKey) {
      const todayItem = history.find((item) => getItemDateKey(item) === todayKey);
      if (todayItem) {
        setReportDate({ month: todayItem.month, day: todayItem.day });
        today.setProjects(cloneProjects(todayItem.todayProjects));
        tomorrow.setProjects(cloneProjects(todayItem.tomorrowProjects));
        return;
      }
    }

    // 오늘 기록이 없으면 가장 최근 과거 기록의 '익일 예정' 내용을 carry-over.
    // store의 loadMonth merge는 `[기존, ...새 데이터]`로 단순 append하므로 cross-month
    // 전역 desc 정렬이 보장되지 않는다. 명시적으로 desc 정렬한 뒤 first-with-content를 찾는다.
    const eligibleDesc = history
      .filter((item) => getItemDateKey(item) <= todayKey)
      .slice()
      .sort((a, b) => compareDateKeyDesc(getItemDateKey(a), getItemDateKey(b)));
    const lastValid = eligibleDesc.find((item) => item.tomorrowProjects.some(hasProjectContent));
    if (lastValid) {
      today.setProjects(cloneProjects(lastValid.tomorrowProjects));
      toast.success('이전 업무의 진행 예정 내용을 가져왔습니다.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient, isHistoryLoaded, hasHydratedFromHistory, history, allReportDates, loadMonth]);

  // 위 hydration이 끝나 store가 안정된 시점의 직렬화 값을 baseline으로 캡처. 한 번만 잡는다.
  const currentReportKey = useMemo(
    () => serializeReport(reportDate, today.projects, tomorrow.projects),
    [reportDate, today.projects, tomorrow.projects]
  );
  useEffect(() => {
    if (!hasHydratedFromHistory) return;
    if (dirtyBaseline !== null) return;
    setDirtyBaseline(currentReportKey);
  }, [hasHydratedFromHistory, dirtyBaseline, currentReportKey]);

  const isReportDirty = dirtyBaseline !== null && dirtyBaseline !== currentReportKey;

  // dirty 상태에서만 beforeunload 핸들러 등록 — 페이지 새로고침/탭 닫기/외부 탐색 전에 경고를 띄운다.
  // 페이지 내 SPA 탐색은 beforeunload가 발생하지 않으므로 자연 제외된다.
  useEffect(() => {
    if (!isReportDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 최신 브라우저는 사용자 정의 메시지를 무시하고 표준 다이얼로그만 표시한다.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isReportDirty]);

  const reportText = useMemo(
    () =>
      generateReportText({
        ...reportDate,
        todayProjects: today.projects,
        tomorrowProjects: tomorrow.projects,
      }),
    [reportDate, today.projects, tomorrow.projects]
  );

  const hasAnyData = today.projects.some(hasProjectContent) || tomorrow.projects.some(hasProjectContent);
  const isCopyDisabled =
    !hasAnyData || !areAllAttemptedProjectsValid(today.projects) || !areAllAttemptedProjectsValid(tomorrow.projects);

  // 프로젝트/작업 삭제 직후 "실행 취소" 버튼이 포함된 토스트를 띄운다.
  // 토스트가 유지되는 동안(UNDO_TOAST_DURATION_MS) 사용자가 원래 위치로 되돌릴 수 있다.
  const makeRemoveHandlers = (bucket: UseProjectsReturn, label: '금일' | '익일') => ({
    removeProject: (projectId: string) => {
      const index = bucket.projects.findIndex((p) => p.id === projectId);
      if (index === -1) return;
      const removed = bucket.projects[index];
      bucket.removeProject(projectId);
      const projectLabel = removed.name.trim() || '제목 없는 프로젝트';
      toast(
        (t) => (
          <span className="flex items-center gap-3 break-all">
            <span className="break-all">
              {label} 프로젝트 &quot;{projectLabel}&quot;을(를) 삭제했습니다.
            </span>
            <button
              onClick={() => {
                bucket.setProjects((prev) => {
                  const next = [...prev];
                  next.splice(Math.min(index, next.length), 0, removed);
                  return next;
                });
                toast.dismiss(t.id);
              }}
              className="shrink-0 cursor-pointer rounded-md bg-toast-border px-2 py-1 text-xs font-semibold transition-opacity hover:opacity-80"
            >
              실행 취소
            </button>
          </span>
        ),
        { duration: UNDO_TOAST_DURATION_MS }
      );
    },
    removeTask: (projectId: string, taskId: string) => {
      const project = bucket.projects.find((p) => p.id === projectId);
      if (!project) return;
      // useProjects.removeTask는 마지막 작업은 지우지 않는다 — 동일한 가드
      if (project.tasks.length <= 1) return;
      const index = project.tasks.findIndex((t) => t.id === taskId);
      if (index === -1) return;
      const removed = project.tasks[index];
      bucket.removeTask(projectId, taskId);
      const taskLabel = removed.content.trim() || '내용 없는 작업';
      toast(
        (t) => (
          <span className="flex items-center gap-3 break-all">
            <span className="break-all">작업 &quot;{taskLabel}&quot;을(를) 삭제했습니다.</span>
            <button
              onClick={() => {
                bucket.setProjects((prev) =>
                  prev.map((p) => {
                    if (p.id !== projectId) return p;
                    const nextTasks = [...p.tasks];
                    nextTasks.splice(Math.min(index, nextTasks.length), 0, removed);
                    return { ...p, tasks: nextTasks };
                  })
                );
                toast.dismiss(t.id);
              }}
              className="shrink-0 cursor-pointer rounded-md bg-toast-border px-2 py-1 text-xs font-semibold transition-opacity hover:opacity-80"
            >
              실행 취소
            </button>
          </span>
        ),
        { duration: UNDO_TOAST_DURATION_MS }
      );
    },
  });

  const todayRemove = makeRemoveHandlers(today, '금일');
  const tomorrowRemove = makeRemoveHandlers(tomorrow, '익일');

  // 금일 미완료 업무를 익일로 이동
  const handleImportIncomplete = () => {
    const merged = mergeIncompleteTasks(today.projects, tomorrow.projects);
    if (!merged) {
      toast.error('가져올 새로운 미완료 업무가 없습니다.');
      return;
    }
    tomorrow.setProjects(merged);
    toast.success('금일 미완료 업무를 모두 가져왔습니다.');
  };

  // 보고서를 클립보드에 복사 후 히스토리에 추가
  const handleCopy = async () => {
    setCopyError(null);

    // 일부 브라우저는 permissions.query를 지원하지 않을 수 있어 try/catch로 무시
    if (navigator.permissions?.query) {
      try {
        const result = await navigator.permissions.query({ name: 'clipboard-write' as PermissionName });
        if (result.state === 'denied') {
          setCopyError('클립보드 쓰기 권한이 거부되었습니다. 브라우저 설정을 확인해주세요.');
          return;
        }
      } catch {
        // 지원하지 않는 브라우저는 무시하고 진행
      }
    }

    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      toast.success('내용이 클립보드에 복사되었습니다.');
      void addHistory({ ...reportDate, todayProjects: today.projects, tomorrowProjects: tomorrow.projects });
      requestHistoryFocus(reportDate.month, reportDate.day);
      // 복사 후엔 히스토리에 보관됐으니 현재 상태를 새 baseline으로 갱신해 이탈 경고를 끈다.
      refreshBaseline();
      setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
    } catch (err) {
      console.error('Failed to copy: ', err);
      setCopyError('복사에 실패했습니다. 직접 선택하여 복사해주세요.');
    }
  };

  // 히스토리 항목을 폼에 복원
  const handleLoadHistory = async (item: ReportHistoryItem, e: MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({
      title: '기록 불러오기',
      description: '현재 작성 중인 내용이 덮어씌워집니다.\n계속하시겠습니까?',
      confirmText: '불러오기',
    });
    if (!ok) return;
    setReportDate({ month: item.month, day: item.day });
    today.setProjects(item.todayProjects);
    tomorrow.setProjects(item.tomorrowProjects);
    refreshBaseline();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteHistory = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    const removed = history.find((item) => item.id === id);
    void deleteHistory(id);
    if (!removed) return;
    toast(
      (t) => (
        <span className="flex items-center gap-3 break-all">
          <span className="break-all">
            {removed.month}월 {removed.day}일 보고서를 삭제했습니다.
          </span>
          <button
            onClick={() => {
              void addHistory({
                month: removed.month,
                day: removed.day,
                todayProjects: removed.todayProjects,
                tomorrowProjects: removed.tomorrowProjects,
              });
              requestHistoryFocus(removed.month, removed.day);
              toast.dismiss(t.id);
            }}
            className="shrink-0 cursor-pointer rounded-md bg-toast-border px-2 py-1 text-xs font-semibold transition-opacity hover:opacity-80"
          >
            실행 취소
          </button>
        </span>
      ),
      { duration: UNDO_TOAST_DURATION_MS }
    );
  };

  // 폼 초기화 (빈 프로젝트 한 개 상태로 되돌림)
  const handleReset = async () => {
    const ok = await confirm({
      title: '폼 초기화',
      description: '작성 중인 내용이 모두 초기화됩니다.\n계속하시겠습니까?',
      confirmText: '초기화',
      variant: 'danger',
    });
    if (!ok) return;
    resetForm();
    refreshBaseline();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 텍스트 분석 결과 적용 (과거 날짜라면 히스토리에도 기록)
  const handleImportApply = async (data: {
    month: string;
    day: string;
    todayProjects: ReadonlyArray<Project>;
    tomorrowProjects: ReadonlyArray<Project>;
  }) => {
    if (hasAnyData) {
      const ok = await confirm({
        title: '텍스트 적용',
        description: '현재 작성 중인 내용이 덮어씌워집니다.\n계속하시겠습니까?',
        confirmText: '적용',
      });
      if (!ok) return;
    }

    if (isEarlierDate(data.month, data.day)) {
      void addHistory(data);
      requestHistoryFocus(data.month, data.day);
      toast.success(`${data.month}월 ${data.day}일 기록을 이전 기록에 추가했습니다.`);
    }

    setReportDate({ month: data.month, day: data.day });
    today.setProjects([...data.todayProjects]);
    tomorrow.setProjects([...data.tomorrowProjects]);
    refreshBaseline();
    toast.success('텍스트 분석 내용을 적용했습니다.');
    setIsImportModalOpen(false);
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-x-8 p-4 pb-28 sm:p-6 sm:pb-28 lg:flex-row lg:p-12 lg:pb-12">
      <div className="flex-1 overflow-hidden">
        <ReportHeader
          reportDate={reportDate}
          onChangeDate={setReportDate}
          onOpenImport={() => setIsImportModalOpen(true)}
          onImportLocal={canImportLocal ? handleImportLocal : undefined}
        />

        <ProjectList
          title="금일 업무 진행 현황"
          accent="today"
          projects={today.projects}
          onAddProject={today.addProject}
          onRemoveProject={todayRemove.removeProject}
          onUpdateProjectName={today.updateProjectName}
          onAddTask={today.addTask}
          onUpdateTask={today.updateTask}
          onRemoveTask={todayRemove.removeTask}
        />
        <ProjectList
          title="익일 업무 진행 예정"
          accent="tomorrow"
          projects={tomorrow.projects}
          onAddProject={tomorrow.addProject}
          onRemoveProject={tomorrowRemove.removeProject}
          onUpdateProjectName={tomorrow.updateProjectName}
          onAddTask={tomorrow.addTask}
          onUpdateTask={tomorrow.updateTask}
          onRemoveTask={tomorrowRemove.removeTask}
          onImportIncomplete={handleImportIncomplete}
        />
      </div>

      <div className="w-full lg:sticky lg:top-12 lg:h-fit lg:w-80">
        <ReportPreview
          text={reportText}
          reportDate={reportDate}
          copied={copied}
          copyError={copyError}
          isCopyDisabled={isCopyDisabled}
          isResetDisabled={!hasAnyData}
          onCopy={handleCopy}
          onReset={handleReset}
        />

        <ReportHistory
          history={history}
          allDateKeys={allReportDates}
          mode={historyMode}
          isLoaded={isHistoryLoaded}
          loadingMonths={loadingMonths}
          focusRequest={historyFocus}
          loadMonth={loadMonth}
          loadHistoryAction={handleLoadHistory}
          deleteHistoryAction={handleDeleteHistory}
        />
      </div>

      <ImportModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} onApply={handleImportApply} />

      <ImportLocalDialog isOpen={isImportDialogOpen} onConfirm={handleDialogConfirm} onDismiss={handleDialogDismiss} />

      {hasAnyData && <MobileCopyBar copied={copied} isCopyDisabled={isCopyDisabled} onCopy={handleCopy} />}
    </div>
  );
}
