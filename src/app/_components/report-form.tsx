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
} from '.';
import { useProjects, useReportHistory, type UseProjectsReturn } from '@/hooks';
import { useReportFormStore } from '@/stores';
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

const isSameAsToday = (month: string, day: string) => {
  const now = new Date();
  return parseInt(month, 10) === now.getMonth() + 1 && parseInt(day, 10) === now.getDate();
};

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
    userId,
    addHistory,
    deleteHistory,
    importFromLocalStorage,
  } = useReportHistory();

  // 페이지 이탈 경고용 baseline. 처음 준비된 보고서 직렬화 결과와 현재 상태를 비교해 dirty 여부 판정.
  // 페이지 내 SPA 탐색은 beforeunload가 발생하지 않으므로 자연스럽게 제외된다.
  const [dirtyBaseline, setDirtyBaseline] = useState<string | null>(null);

  // 외부 액션(복사·리셋·기록 불러오기·텍스트 적용) 후 store가 새 값으로 갱신된 직후 baseline을 다시 잡는다.
  // 같은 핸들러 안에서는 selector가 아직 옛 값일 수 있어 microtask로 미루고 store에서 직접 가져온다.
  const refreshBaseline = useCallback(() => {
    queueMicrotask(() => {
      const s = useReportFormStore.getState();
      setDirtyBaseline(serializeReport(s.reportDate, s.today, s.tomorrow));
    });
  }, []);

  // 조건: 로컬에는 기록이 있지만 DB 계정에는 없음
  const canImportLocal = isHistoryLoaded && history.length === 0 && hasLocalBackup;

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
    if (!confirm('브라우저에 저장된 기존 기록을 계정에 이전합니다. 같은 날짜 기록이 있으면 덮어쓰여집니다.')) return;
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
  // - 가장 최근 기록이 '오늘' 작성된 보고서라면 carry-over 없이 그대로 복원해 사용자가 이어서 편집할 수 있게 한다.
  // - 그 외에는 직전 보고서의 '익일 예정' 내용을 금일 프로젝트로 가져온다.
  // 페이지를 이동했다 돌아와도 store에 hydrate 플래그가 남아 있어 작성 중인 내용을 덮어쓰지 않는다.
  useEffect(() => {
    if (!isClient || !isHistoryLoaded || hasHydratedFromHistory) return;
    markHydratedFromHistory();
    if (history.length === 0) return;
    const latest = history[0];
    if (latest && isSameAsToday(latest.month, latest.day)) {
      setReportDate({ month: latest.month, day: latest.day });
      today.setProjects(cloneProjects(latest.todayProjects));
      tomorrow.setProjects(cloneProjects(latest.tomorrowProjects));
      return;
    }
    const lastValid = history.find((item) => item.tomorrowProjects.some(hasProjectContent));
    if (lastValid) {
      today.setProjects(cloneProjects(lastValid.tomorrowProjects));
      toast.success('이전 업무의 진행 예정 내용을 가져왔습니다.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient, isHistoryLoaded, hasHydratedFromHistory]);

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
      addHistory({ ...reportDate, todayProjects: today.projects, tomorrowProjects: tomorrow.projects });
      // 복사 후엔 히스토리에 보관됐으니 현재 상태를 새 baseline으로 갱신해 이탈 경고를 끈다.
      refreshBaseline();
      setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
    } catch (err) {
      console.error('Failed to copy: ', err);
      setCopyError('복사에 실패했습니다. 직접 선택하여 복사해주세요.');
    }
  };

  // 히스토리 항목을 폼에 복원
  const handleLoadHistory = (item: ReportHistoryItem, e: MouseEvent) => {
    e.stopPropagation();
    if (!confirm('현재 작성 중인 내용이 덮어씌워집니다. 계속하시겠습니까?')) return;
    setReportDate({ month: item.month, day: item.day });
    today.setProjects(item.todayProjects);
    tomorrow.setProjects(item.tomorrowProjects);
    refreshBaseline();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteHistory = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    deleteHistory(id);
  };

  // 폼 초기화 (빈 프로젝트 한 개 상태로 되돌림)
  const handleReset = () => {
    if (!confirm('작성 중인 내용이 모두 초기화됩니다. 계속하시겠습니까?')) return;
    resetForm();
    refreshBaseline();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 텍스트 분석 결과 적용 (과거 날짜라면 히스토리에도 기록)
  const handleImportApply = (data: {
    month: string;
    day: string;
    todayProjects: ReadonlyArray<Project>;
    tomorrowProjects: ReadonlyArray<Project>;
  }) => {
    if (hasAnyData && !confirm('현재 작성 중인 내용이 덮어씌워집니다. 계속하시겠습니까?')) return;

    if (isEarlierDate(data.month, data.day)) {
      addHistory(data);
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

        {history.length > 0 && isClient && (
          <ReportHistory
            history={history}
            loadHistoryAction={handleLoadHistory}
            deleteHistoryAction={handleDeleteHistory}
          />
        )}
      </div>

      <ImportModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} onApply={handleImportApply} />

      <ImportLocalDialog isOpen={isImportDialogOpen} onConfirm={handleDialogConfirm} onDismiss={handleDialogDismiss} />

      {hasAnyData && <MobileCopyBar copied={copied} isCopyDisabled={isCopyDisabled} onCopy={handleCopy} />}
    </div>
  );
}
