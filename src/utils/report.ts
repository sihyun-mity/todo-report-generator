import type { Project, Task, ReportTextData } from '@/types';
import { createId } from '@/utils';

// 빈 태스크/프로젝트를 만드는 팩토리 함수 (여러 곳에서 중복되던 초기화 로직 통합)
export const createEmptyTask = (): Task => ({
  id: createId(),
  content: '',
  progress: 0,
});

export const createEmptyProject = (): Project => ({
  id: createId(),
  name: '',
  tasks: [createEmptyTask()],
});

// 프로젝트 배열을 깊은 복사할 때 사용 (localStorage에 저장하거나 히스토리를 복원할 때 참조 공유 방지)
export const cloneProjects = (projects: ReadonlyArray<Project>): Array<Project> =>
  projects.map((p) => ({ ...p, tasks: p.tasks.map((t) => ({ ...t })) }));

// 프로젝트가 완전히 비어있는지 판별 (기본 초기값 상태인지 확인할 때 사용)
export const isProjectEmpty = (p: Project) => p.name.trim() === '' && p.tasks.every((t) => t.content.trim() === '');

// 프로젝트에 실제 내용이 하나라도 입력되었는지 판별
export const hasProjectContent = (p: Project) => p.name.trim() !== '' || p.tasks.some((t) => t.content.trim() !== '');

// 입력 시도된 프로젝트가 유효한지 검증
// (프로젝트명이 있으면 최소 한 개의 작업 내용이 필요; 이름 없이 작업 내용만 있는 경우는 무효)
export const isProjectValid = (p: Project) => {
  if (p.name.trim() === '') return false;
  return p.tasks.some((t) => t.content.trim() !== '');
};

// 빈 프로젝트는 통과시키고, 입력이 시작된 프로젝트만 검증
export const areAllAttemptedProjectsValid = (projects: ReadonlyArray<Project>) =>
  projects.every((p) => isProjectEmpty(p) || isProjectValid(p));

// 금일 프로젝트에서 미완료(진행률 100% 미만) 태스크만 모아 익일 프로젝트 목록에 병합
// - 이미 동일한 프로젝트명이 존재하면 태스크만 추가
// - 동일한 프로젝트 내 동일한 작업 내용이 이미 있으면 중복으로 간주하여 제외
export const mergeIncompleteTasks = (
  todayProjects: ReadonlyArray<Project>,
  tomorrowProjects: ReadonlyArray<Project>
): Array<Project> | null => {
  const incomplete: Array<Project> = todayProjects
    .map((p): Project | null => {
      const existing = tomorrowProjects.find((tp) => tp.name.trim() !== '' && tp.name.trim() === p.name.trim());

      const tasks = p.tasks
        .filter((t) => {
          if (t.content.trim() === '' || t.progress >= 100) return false;
          if (!existing) return true;
          return !existing.tasks.some((et) => et.content.trim() === t.content.trim());
        })
        .map((t) => ({ ...t, id: createId() }));

      if (tasks.length === 0) return null;
      return { ...p, id: createId(), tasks };
    })
    .filter((p): p is Project => p !== null);

  if (incomplete.length === 0) return null;

  // 익일 프로젝트가 초기값 상태라면 새 값으로 대체
  const isInitialTomorrow = tomorrowProjects.length === 1 && isProjectEmpty(tomorrowProjects[0]);
  if (isInitialTomorrow) return incomplete;

  // 기존 익일 목록에 프로젝트 단위로 병합
  const merged: Array<Project> = [...tomorrowProjects];
  incomplete.forEach((newP) => {
    const existingIdx = merged.findIndex((tp) => tp.name.trim() !== '' && tp.name.trim() === newP.name.trim());
    if (existingIdx > -1) {
      merged[existingIdx] = { ...merged[existingIdx], tasks: [...merged[existingIdx].tasks, ...newP.tasks] };
    } else {
      merged.push(newP);
    }
  });
  return merged;
};

// 보고서 본문 텍스트 생성 (미리보기 / 복사 / 히스토리 저장에서 공통 사용)
export const generateReportText = ({ month, day, todayProjects, tomorrowProjects }: ReportTextData) => {
  const renderSection = (projects: ReadonlyArray<Project>) =>
    projects
      .map((p) => {
        const header = `    * ${p.name || '프로젝트명'}`;
        const tasks = p.tasks.map((t) => `        - ${t.content || '작업 내용'} (${t.progress}%)`);
        return [header, ...tasks].join('\n');
      })
      .join('\n');

  return [
    `${month}월 ${day}일 일일 업무 보고 드립니다.`,
    '',
    '금일 업무 진행 현황',
    renderSection(todayProjects),
    '',
    '익일 업무 진행 예정',
    renderSection(tomorrowProjects),
  ].join('\n');
};
