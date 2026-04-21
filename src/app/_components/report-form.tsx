'use client';

import { MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useIsClient } from 'usehooks-ts';
import { Project, ReportHistoryItem } from './types';
import ProjectList from './project-list';
import ReportHeader, { ReportDate } from './report-header';
import ReportPreview from './report-preview';
import ReportHistory from './report-history';
import ImportModal from './import-modal';
import ImportLocalDialog from './import-local-dialog';
import { useProjects, useReportHistory } from '@/hooks';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  areAllAttemptedProjectsValid,
  cloneProjects,
  COPY_FEEDBACK_DURATION_MS,
  createEmptyProject,
  generateReportText,
  hasProjectContent,
  mergeIncompleteTasks,
} from '@/utils/report';

// 오늘/내일을 제외한 기준 날짜(월/일)로 히스토리 추가 대상인지 판단
const isEarlierDate = (month: string, day: string) => {
  const importMonth = parseInt(month, 10);
  const importDay = parseInt(day, 10);
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  return importMonth < currentMonth || (importMonth === currentMonth && importDay < currentDay);
};

const getTodayDate = (): ReportDate => {
  const now = new Date();
  return { month: String(now.getMonth() + 1), day: String(now.getDate()) };
};

// 사용자별로 "로컬 기록 이전 안내 dialog 봤음" 플래그 키
const importPromptSeenKey = (userId: string) => `report-history-import-prompt-seen:${userId}`;

export default function ReportForm() {
  const isClient = useIsClient();
  const router = useRouter();
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [reportDate, setReportDate] = useState<ReportDate>(getTodayDate);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  const today = useProjects();
  const tomorrow = useProjects();
  const {
    history,
    isLoaded: isHistoryLoaded,
    hasLocalBackup,
    addHistory,
    deleteHistory,
    importFromLocalStorage,
  } = useReportHistory();

  // 현재 로그인 사용자 정보
  useEffect(() => {
    if (!isClient) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
      setUserId(data.user?.id ?? null);
    });
  }, [isClient]);

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

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
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

  // 초기 로드 완료 후, 직전 보고서의 '익일 예정' 내용을 금일 프로젝트로 불러온다 (1회만)
  const didHydrateFromHistoryRef = useRef(false);
  useEffect(() => {
    if (!isClient || !isHistoryLoaded || didHydrateFromHistoryRef.current) return;
    didHydrateFromHistoryRef.current = true;
    if (history.length === 0) return;
    const lastValid = history.find((item) => item.tomorrowProjects.some(hasProjectContent));
    if (lastValid) {
      today.setProjects(cloneProjects(lastValid.tomorrowProjects));
      toast.success('이전 업무의 진행 예정 내용을 가져왔습니다.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient, isHistoryLoaded]);

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteHistory = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    deleteHistory(id);
  };

  // 폼 초기화 (빈 프로젝트 한 개 상태로 되돌림)
  const handleReset = () => {
    if (!confirm('작성 중인 내용이 모두 초기화됩니다. 계속하시겠습니까?')) return;
    today.setProjects([createEmptyProject()]);
    tomorrow.setProjects([createEmptyProject()]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 텍스트 분석 결과 적용 (과거 날짜라면 히스토리에도 기록)
  const handleImportApply = (data: {
    month: string;
    day: string;
    todayProjects: Project[];
    tomorrowProjects: Project[];
  }) => {
    if (hasAnyData && !confirm('현재 작성 중인 내용이 덮어씌워집니다. 계속하시겠습니까?')) return;

    if (isEarlierDate(data.month, data.day)) {
      addHistory(data);
      toast.success(`${data.month}월 ${data.day}일 기록을 이전 기록에 추가했습니다.`);
    }

    setReportDate({ month: data.month, day: data.day });
    today.setProjects(data.todayProjects);
    tomorrow.setProjects(data.tomorrowProjects);
    toast.success('텍스트 분석 내용을 적용했습니다.');
    setIsImportModalOpen(false);
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-x-8 p-4 sm:p-6 lg:flex-row lg:p-12">
      <div className="flex-1 overflow-hidden">
        <ReportHeader
          reportDate={reportDate}
          onChangeDate={setReportDate}
          onOpenImport={() => setIsImportModalOpen(true)}
          onImportLocal={canImportLocal ? handleImportLocal : undefined}
          onLogout={handleLogout}
          userEmail={userEmail}
        />

        <ProjectList
          title="금일 업무 진행 현황"
          projects={today.projects}
          onAddProject={today.addProject}
          onRemoveProject={today.removeProject}
          onUpdateProjectName={today.updateProjectName}
          onAddTask={today.addTask}
          onUpdateTask={today.updateTask}
          onRemoveTask={today.removeTask}
        />
        <ProjectList
          title="익일 업무 진행 예정"
          projects={tomorrow.projects}
          onAddProject={tomorrow.addProject}
          onRemoveProject={tomorrow.removeProject}
          onUpdateProjectName={tomorrow.updateProjectName}
          onAddTask={tomorrow.addTask}
          onUpdateTask={tomorrow.updateTask}
          onRemoveTask={tomorrow.removeTask}
          onImportIncomplete={handleImportIncomplete}
        />
      </div>

      <div className="w-full lg:sticky lg:top-12 lg:h-fit lg:w-80">
        <ReportPreview
          text={reportText}
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
    </div>
  );
}
