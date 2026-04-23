import { useCallback, useState } from 'react';
import type { Project, Task } from '@/types';
import { createEmptyProject, createEmptyTask } from '@/utils';

// 하나의 프로젝트 목록(today 또는 tomorrow)을 다루는 상태 훅
// - report-form에서 today/tomorrow 각각에 대해 중복되던 add/remove/update 로직을 일원화
export const useProjects = (initial?: ReadonlyArray<Project>) => {
  const [projects, setProjects] = useState<Array<Project>>(() => (initial ? [...initial] : [createEmptyProject()]));

  const addProject = useCallback((id?: string) => {
    // id가 전달되면 해당 id로 새 프로젝트를 만들어 상위에서 autoFocus 추적이 가능하도록 한다
    const newProject: Project = id ? { ...createEmptyProject(), id } : createEmptyProject();
    setProjects((prev) => [...prev, newProject]);
  }, []);

  const removeProject = useCallback((projectId: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  }, []);

  const updateProjectName = useCallback((projectId: string, name: string) => {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, name } : p)));
  }, []);

  const addTask = useCallback((projectId: string, id?: string) => {
    const newTask: Task = id ? { ...createEmptyTask(), id } : createEmptyTask();
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, tasks: [...p.tasks, newTask] } : p)));
  }, []);

  const removeTask = useCallback((projectId: string, taskId: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        // 프로젝트당 최소 한 개의 태스크는 유지
        if (p.tasks.length <= 1) return p;
        return { ...p, tasks: p.tasks.filter((t) => t.id !== taskId) };
      })
    );
  }, []);

  const updateTask = useCallback((projectId: string, taskId: string, updates: Partial<Task>) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return { ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)) };
      })
    );
  }, []);

  return {
    projects,
    setProjects,
    addProject,
    removeProject,
    updateProjectName,
    addTask,
    removeTask,
    updateTask,
  };
};

export type UseProjectsReturn = ReturnType<typeof useProjects>;
