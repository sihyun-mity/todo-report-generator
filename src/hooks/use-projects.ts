import type { Dispatch, SetStateAction } from 'react';
import type { Project, ProjectsBucket, Task } from '@/types';
import { useReportFormStore } from '@/stores';

// 보고 폼의 today/tomorrow 프로젝트 목록을 다루는 훅.
// 내부 상태는 useReportFormStore(Zustand)에 보관되므로, 페이지 이동 후에도 작성 중 내용이 유지된다.
export const useProjects = (bucket: ProjectsBucket) => {
  const projects = useReportFormStore((s) => s[bucket]);
  const setBucket = useReportFormStore((s) => s.setBucket);
  const addProjectAction = useReportFormStore((s) => s.addProject);
  const removeProjectAction = useReportFormStore((s) => s.removeProject);
  const updateProjectNameAction = useReportFormStore((s) => s.updateProjectName);
  const addTaskAction = useReportFormStore((s) => s.addTask);
  const removeTaskAction = useReportFormStore((s) => s.removeTask);
  const updateTaskAction = useReportFormStore((s) => s.updateTask);
  const addDetailAction = useReportFormStore((s) => s.addDetail);
  const removeDetailAction = useReportFormStore((s) => s.removeDetail);
  const updateDetailAction = useReportFormStore((s) => s.updateDetail);
  const reorderProjectsAction = useReportFormStore((s) => s.reorderProjects);

  const setProjects: Dispatch<SetStateAction<Array<Project>>> = (updater) => setBucket(bucket, updater);
  const addProject = (id?: string) => addProjectAction(bucket, id);
  const removeProject = (projectId: string) => removeProjectAction(bucket, projectId);
  const updateProjectName = (projectId: string, name: string) => updateProjectNameAction(bucket, projectId, name);
  const addTask = (projectId: string, id?: string) => addTaskAction(bucket, projectId, id);
  const removeTask = (projectId: string, taskId: string) => removeTaskAction(bucket, projectId, taskId);
  const updateTask = (projectId: string, taskId: string, updates: Partial<Task>) =>
    updateTaskAction(bucket, projectId, taskId, updates);
  const addDetail = (projectId: string, taskId: string, id?: string) => addDetailAction(bucket, projectId, taskId, id);
  const removeDetail = (projectId: string, taskId: string, detailId: string) =>
    removeDetailAction(bucket, projectId, taskId, detailId);
  const updateDetail = (projectId: string, taskId: string, detailId: string, content: string) =>
    updateDetailAction(bucket, projectId, taskId, detailId, content);
  const reorderProjects = (fromId: string, toId: string) => reorderProjectsAction(bucket, fromId, toId);

  return {
    projects,
    setProjects,
    addProject,
    removeProject,
    updateProjectName,
    addTask,
    removeTask,
    updateTask,
    addDetail,
    removeDetail,
    updateDetail,
    reorderProjects,
  };
};

export type UseProjectsReturn = ReturnType<typeof useProjects>;
