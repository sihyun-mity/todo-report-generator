'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, Copy, RotateCcw } from 'lucide-react';
import { useIsClient, useLocalStorage } from 'usehooks-ts';
import { cn } from '@/utils/class';
import { Project, ReportHistoryItem, TargetType, Task } from './types';
import ProjectList from './project-list';
import { ReportHistory } from '@/app/_components';

export default function ReportForm() {
  const [todayProjects, setTodayProjects] = useState<Project[]>([
    { id: '1', name: '', tasks: [{ id: '1-1', content: '', progress: 0 }] },
  ]);
  const [tomorrowProjects, setTomorrowProjects] = useState<Project[]>([
    { id: '2', name: '', tasks: [{ id: '2-1', content: '', progress: 0 }] },
  ]);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [history, setHistory] = useLocalStorage<ReportHistoryItem[]>('report-history', []);
  const isClient = useIsClient();

  useEffect(() => {
    if (isClient && history.length > 0) {
      // 익일 업무 진행 예정 데이터가 정상적으로 존재하는 마지막(최신) 데이터 찾기
      const lastValidReport = history.find((item) => {
        return item.tomorrowProjects.some((p) => p.name.trim() !== '' || p.tasks.some((t) => t.content.trim() !== ''));
      });

      if (lastValidReport) {
        setTodayProjects(JSON.parse(JSON.stringify(lastValidReport.tomorrowProjects)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient]);

  const now = new Date();
  const [reportDate, setReportDate] = useState({
    month: String(now.getMonth() + 1),
    day: String(now.getDate()),
  });

  const addProject = (target: TargetType) => {
    const newProject: Project = {
      id: Math.random().toString(36).substr(2, 9),
      name: '',
      tasks: [{ id: Math.random().toString(36).substr(2, 9), content: '', progress: 0 }],
    };
    if (target === 'today') {
      setTodayProjects([...todayProjects, newProject]);
    } else {
      setTomorrowProjects([...tomorrowProjects, newProject]);
    }
  };

  const removeProject = (target: TargetType, projectId: string) => {
    if (target === 'today') {
      setTodayProjects(todayProjects.filter((p) => p.id !== projectId));
    } else {
      setTomorrowProjects(tomorrowProjects.filter((p) => p.id !== projectId));
    }
  };

  const addTask = (target: TargetType, projectId: string) => {
    const newTask: Task = {
      id: Math.random().toString(36).substr(2, 9),
      content: '',
      progress: 0,
    };
    const setter = target === 'today' ? setTodayProjects : setTomorrowProjects;
    const projects = target === 'today' ? todayProjects : tomorrowProjects;

    setter(
      projects.map((p) => {
        if (p.id === projectId) {
          return { ...p, tasks: [...p.tasks, newTask] };
        }
        return p;
      })
    );
  };

  const removeTask = (target: TargetType, projectId: string, taskId: string) => {
    const setter = target === 'today' ? setTodayProjects : setTomorrowProjects;
    const projects = target === 'today' ? todayProjects : tomorrowProjects;

    setter(
      projects.map((p) => {
        if (p.id === projectId) {
          if (p.tasks.length <= 1) return p;
          return { ...p, tasks: p.tasks.filter((t) => t.id !== taskId) };
        }
        return p;
      })
    );
  };

  const updateProjectName = (target: TargetType, projectId: string, name: string) => {
    const setter = target === 'today' ? setTodayProjects : setTomorrowProjects;
    const projects = target === 'today' ? todayProjects : tomorrowProjects;
    setter(projects.map((p) => (p.id === projectId ? { ...p, name } : p)));
  };

  const updateTask = (target: TargetType, projectId: string, taskId: string, updates: Partial<Task>) => {
    const setter = target === 'today' ? setTodayProjects : setTomorrowProjects;
    const projects = target === 'today' ? todayProjects : tomorrowProjects;
    setter(
      projects.map((p) => {
        if (p.id === projectId) {
          return {
            ...p,
            tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
          };
        }
        return p;
      })
    );
  };

  const importIncompleteTasks = () => {
    const incompleteProjects: Project[] = todayProjects
      .map((p) => {
        // 이미 익일 업무에 해당 프로젝트명이 존재하는지 확인
        const existingProjectInTomorrow = tomorrowProjects.find(
          (tp) => tp.name.trim() !== '' && tp.name.trim() === p.name.trim()
        );

        const incompleteTasks = p.tasks
          .filter((t) => {
            const isContentNotEmpty = t.content.trim() !== '';
            const isIncomplete = t.progress < 100;

            if (!isContentNotEmpty || !isIncomplete) return false;

            // 이미 익일 업무의 해당 프로젝트 내에 동일한 내용의 작업이 있는지 확인
            if (existingProjectInTomorrow) {
              const isAlreadyImported = existingProjectInTomorrow.tasks.some(
                (tt) => tt.content.trim() === t.content.trim()
              );
              if (isAlreadyImported) return false;
            }

            return true;
          })
          .map((t) => ({
            ...t,
            id: Math.random().toString(36).substr(2, 9),
            // 기존 작업률도 같이 옮겨줌
          }));

        if (incompleteTasks.length > 0) {
          // 만약 익일 업무에 동일한 프로젝트가 이미 있다면, 해당 프로젝트에 태스크만 추가하기 위해
          // 여기서는 '새로운' 프로젝트 객체로 반환하되, 나중에 합칠 때 처리하거나
          // 일단 구조를 유지하기 위해 기존처럼 반환하되 id만 새로 생성
          return {
            ...p,
            id: Math.random().toString(36).substr(2, 9),
            tasks: incompleteTasks,
          };
        }
        return null;
      })
      .filter((p): p is Project => p !== null);

    if (incompleteProjects.length === 0) {
      alert('가져올 새로운 미완료 업무가 없거나 이미 모두 가져왔습니다.');
      return;
    }

    // 기존 익일 업무 목록이 비어있거나(기본값만 있는 경우) 덮어씌울지 확인
    const isEmptyTomorrow =
      tomorrowProjects.length === 1 &&
      tomorrowProjects[0].name.trim() === '' &&
      tomorrowProjects[0].tasks.every((t) => t.content.trim() === '');

    if (isEmptyTomorrow) {
      setTomorrowProjects(incompleteProjects);
    } else {
      // 중복 프로젝트 처리: 이미 존재하는 프로젝트면 태스크만 추가, 없으면 새 프로젝트 추가
      const updatedTomorrow = [...tomorrowProjects];

      incompleteProjects.forEach((newP) => {
        const existingIdx = updatedTomorrow.findIndex(
          (tp) => tp.name.trim() !== '' && tp.name.trim() === newP.name.trim()
        );

        if (existingIdx > -1) {
          updatedTomorrow[existingIdx] = {
            ...updatedTomorrow[existingIdx],
            tasks: [...updatedTomorrow[existingIdx].tasks, ...newP.tasks],
          };
        } else {
          updatedTomorrow.push(newP);
        }
      });

      setTomorrowProjects(updatedTomorrow);
    }
  };

  const generateReportText = () => {
    let text = `${reportDate.month}월 ${reportDate.day}일 일일 업무 보고 드립니다.\n\n`;

    text += `금일 업무 진행 현황\n`;
    todayProjects.forEach((p) => {
      text += `    * ${p.name || '프로젝트명'}\n`;
      p.tasks.forEach((t) => {
        text += `        - ${t.content || '작업 내용'} (${t.progress}%)\n`;
      });
    });

    text += `\n익일 업무 진행 예정\n`;
    tomorrowProjects.forEach((p) => {
      text += `    * ${p.name || '프로젝트명'}\n`;
      p.tasks.forEach((t) => {
        text += `        - ${t.content || '작업 내용'} (${t.progress}%)\n`;
      });
    });

    return text;
  };

  const copyToClipboard = async () => {
    setCopyError(null);
    const text = generateReportText();

    try {
      // 권한 확인 시도
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const result = await navigator.permissions.query({
            name: 'clipboard-write' as PermissionName,
          });
          if (result.state === 'denied') {
            setCopyError('클립보드 쓰기 권한이 거부되었습니다. 브라우저 설정을 확인해주세요.');
            return;
          }
        } catch {
          // 일부 브라우저에서는 clipboard-write 쿼리를 지원하지 않을 수 있음 (무시하고 진행)
        }
      }

      await navigator.clipboard.writeText(text);
      setCopied(true);

      // 로컬 스토리지에 저장
      const newHistoryItem: ReportHistoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        month: reportDate.month,
        day: reportDate.day,
        content: text,
        todayProjects: JSON.parse(JSON.stringify(todayProjects)),
        tomorrowProjects: JSON.parse(JSON.stringify(tomorrowProjects)),
        timestamp: Date.now(),
      };
      setHistory([newHistoryItem, ...history].slice(0, 50)); // 최대 50개까지 저장

      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
      setCopyError('복사에 실패했습니다. 직접 선택하여 복사해주세요.');
    }
  };

  const loadHistory = (item: ReportHistoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('현재 작성 중인 내용이 덮어씌워집니다. 계속하시겠습니까?')) {
      setReportDate({ month: item.month, day: item.day });
      setTodayProjects(item.todayProjects);
      setTomorrowProjects(item.tomorrowProjects);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const deleteHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(history.filter((item) => item.id !== id));
  };

  const resetForm = () => {
    if (confirm('작성 중인 내용이 모두 초기화됩니다. 계속하시겠습니까?')) {
      const initialToday: Project[] = [
        {
          id: Math.random().toString(36).substr(2, 9),
          name: '',
          tasks: [{ id: Math.random().toString(36).substr(2, 9), content: '', progress: 0 }],
        },
      ];
      const initialTomorrow: Project[] = [
        {
          id: Math.random().toString(36).substr(2, 9),
          name: '',
          tasks: [{ id: Math.random().toString(36).substr(2, 9), content: '', progress: 0 }],
        },
      ];
      setTodayProjects(initialToday);
      setTomorrowProjects(initialTomorrow);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const isProjectNotEmpty = (p: Project) => p.name.trim() !== '' || p.tasks.some((t) => t.content.trim() !== '');

  const isProjectValid = (p: Project) => {
    // 프로젝트명이 있으면 반드시 하나 이상의 유효한 태스크가 있어야 함
    if (p.name.trim() !== '') {
      return p.tasks.some((t) => t.content.trim() !== '');
    }
    // 프로젝트명이 없는데 태스크 내용만 있는 경우도 일단은 유효하지 않은 것으로 간주 (정책상 프로젝트당 태스크 필수)
    return false;
  };

  const hasAnyData = todayProjects.some(isProjectNotEmpty) || tomorrowProjects.some(isProjectNotEmpty);

  // 모든 '입력 시도 중인' 프로젝트가 유효한지 확인
  const allAttemptedProjectsValid =
    todayProjects.every((p) =>
      p.name.trim() === '' && p.tasks.every((t) => t.content.trim() === '') ? true : isProjectValid(p)
    ) &&
    tomorrowProjects.every((p) =>
      p.name.trim() === '' && p.tasks.every((t) => t.content.trim() === '') ? true : isProjectValid(p)
    );

  const isCopyDisabled = !hasAnyData || !allAttemptedProjectsValid;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-4 sm:p-6 lg:flex-row lg:p-12">
      <div className="flex-1 overflow-hidden">
        <header className="mb-10">
          <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
            일일 업무 보고 생성기
          </h1>
          <div className="flex items-center gap-2 text-zinc-500">
            <input
              type="text"
              value={reportDate.month}
              onChange={(e) => setReportDate({ ...reportDate, month: e.target.value })}
              onBlur={(e) => setReportDate({ ...reportDate, month: e.target.value.trim() })}
              className="w-8 bg-transparent text-right outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span>월</span>
            <input
              type="text"
              value={reportDate.day}
              onChange={(e) => setReportDate({ ...reportDate, day: e.target.value })}
              onBlur={(e) => setReportDate({ ...reportDate, day: e.target.value.trim() })}
              className="w-8 bg-transparent text-right outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span>일 보고서</span>
          </div>
        </header>

        <ProjectList
          title="금일 업무 진행 현황"
          projects={todayProjects}
          onAddProject={() => addProject('today')}
          onRemoveProject={(id) => removeProject('today', id)}
          onUpdateProjectName={(id, name) => updateProjectName('today', id, name)}
          onAddTask={(id) => addTask('today', id)}
          onUpdateTask={(pid, tid, updates) => updateTask('today', pid, tid, updates)}
          onRemoveTask={(pid, tid) => removeTask('today', pid, tid)}
        />
        <ProjectList
          title="익일 업무 진행 예정"
          projects={tomorrowProjects}
          onAddProject={() => addProject('tomorrow')}
          onRemoveProject={(id) => removeProject('tomorrow', id)}
          onUpdateProjectName={(id, name) => updateProjectName('tomorrow', id, name)}
          onAddTask={(id) => addTask('tomorrow', id)}
          onUpdateTask={(pid, tid, updates) => updateTask('tomorrow', pid, tid, updates)}
          onRemoveTask={(pid, tid) => removeTask('tomorrow', pid, tid)}
          onImportIncomplete={importIncompleteTasks}
        />
      </div>

      <div className="w-full lg:sticky lg:top-12 lg:h-fit lg:w-80">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
          <h2 className="mb-4 text-sm font-semibold tracking-wider text-zinc-500 uppercase">미리보기</h2>
          <pre className="mb-6 overflow-x-auto rounded-lg border border-zinc-100 bg-white p-4 text-sm whitespace-pre-wrap text-zinc-700 dark:border-zinc-800 dark:bg-black dark:text-zinc-300">
            {generateReportText()}
          </pre>

          <button
            onClick={copyToClipboard}
            disabled={isCopyDisabled}
            className={cn(
              'mb-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg py-3 font-semibold transition-all',
              copied
                ? 'bg-green-500 text-white'
                : isCopyDisabled
                  ? 'cursor-not-allowed bg-zinc-300 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-600'
                  : 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200'
            )}
          >
            {copied ? (
              <>
                <Check size={18} /> 복사 완료!
              </>
            ) : (
              <>
                <Copy size={18} /> 복사하기
              </>
            )}
          </button>

          <button
            onClick={resetForm}
            disabled={!hasAnyData}
            className={cn(
              'flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium transition-all',
              !hasAnyData
                ? 'cursor-not-allowed text-zinc-400 dark:text-zinc-600'
                : 'text-zinc-600 hover:bg-zinc-200/50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-red-400'
            )}
          >
            <RotateCcw size={16} /> 작성 내용 초기화
          </button>

          {copyError && (
            <div className="mt-2 flex items-start gap-2 rounded-md bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{copyError}</span>
            </div>
          )}
        </div>

        {history.length > 0 && isClient && (
          <ReportHistory history={history} loadHistoryAction={loadHistory} deleteHistoryAction={deleteHistory} />
        )}
      </div>
    </div>
  );
}
