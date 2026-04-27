import { create } from 'zustand';
import type { Project, ReportFormStore, Task } from '@/types';
import { createEmptyProject, createEmptyTask } from '@/utils';

const getTodayDate = () => {
  const now = new Date();
  return { month: String(now.getMonth() + 1), day: String(now.getDate()) };
};

// 작성 중인 보고 폼 상태를 보관 — ReportForm 인스턴스가 unmount되거나 다른 (app) 페이지로 이동했다가
// 돌아와도 작성 내용·날짜·프로젝트가 유지되도록 모듈 레벨에서 관리한다.
export const useReportFormStore = create<ReportFormStore>()((set) => ({
  reportDate: getTodayDate(),
  today: [createEmptyProject()],
  tomorrow: [createEmptyProject()],
  hasHydratedFromHistory: false,

  setReportDate: (date) => set({ reportDate: date }),

  setBucket: (bucket, updater) =>
    set((state) => ({
      [bucket]:
        typeof updater === 'function' ? (updater as (prev: Array<Project>) => Array<Project>)(state[bucket]) : updater,
    })),

  addProject: (bucket, id) =>
    set((state) => {
      const newProject: Project = id ? { ...createEmptyProject(), id } : createEmptyProject();
      return { [bucket]: [...state[bucket], newProject] };
    }),

  removeProject: (bucket, projectId) => set((state) => ({ [bucket]: state[bucket].filter((p) => p.id !== projectId) })),

  updateProjectName: (bucket, projectId, name) =>
    set((state) => ({
      [bucket]: state[bucket].map((p) => (p.id === projectId ? { ...p, name } : p)),
    })),

  addTask: (bucket, projectId, id) =>
    set((state) => {
      const newTask: Task = id ? { ...createEmptyTask(), id } : createEmptyTask();
      return {
        [bucket]: state[bucket].map((p) => (p.id === projectId ? { ...p, tasks: [...p.tasks, newTask] } : p)),
      };
    }),

  removeTask: (bucket, projectId, taskId) =>
    set((state) => ({
      [bucket]: state[bucket].map((p) => {
        if (p.id !== projectId) return p;
        // 프로젝트당 최소 한 개의 태스크는 유지
        if (p.tasks.length <= 1) return p;
        return { ...p, tasks: p.tasks.filter((t) => t.id !== taskId) };
      }),
    })),

  updateTask: (bucket, projectId, taskId, updates) =>
    set((state) => ({
      [bucket]: state[bucket].map((p) => {
        if (p.id !== projectId) return p;
        return { ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)) };
      }),
    })),

  markHydratedFromHistory: () => set({ hasHydratedFromHistory: true }),

  resetForm: () =>
    set({
      reportDate: getTodayDate(),
      today: [createEmptyProject()],
      tomorrow: [createEmptyProject()],
    }),

  // 사용자 전환(로그인/로그아웃/게스트 종료) 시 호출. resetForm과 달리 hydrate 플래그도 초기화하여
  // 새 사용자의 보고서 기록에서 다시 'tomorrow → today' 가져오기가 일어나도록 한다.
  resetSession: () =>
    set({
      reportDate: getTodayDate(),
      today: [createEmptyProject()],
      tomorrow: [createEmptyProject()],
      hasHydratedFromHistory: false,
    }),
}));
