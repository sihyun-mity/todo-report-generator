import type { ParsedReport, Project, Task } from '@/types';
import { SECTION_TODAY, SECTION_TOMORROW } from '@/constants';
import { createEmptyProject, createId } from '.';

const DATE_REGEX = /(\d+)\s*월\s*(\d+)\s*일/;
const PROJECT_LINE = /^\s*\*\s*(.+)$/;
const TASK_LINE_WITH_PROGRESS = /^\s*-\s*(.+?)\s*\((\d+)%\)\s*$/;
const TASK_LINE_NO_PROGRESS = /^\s*-\s*(.+)$/;

type Section = 'today' | 'tomorrow' | null;

// 텍스트로 작성된 보고서를 구조화된 데이터로 파싱
// 지원 형식:
//   N월 N일 ...
//   금일 업무 진행 현황
//       * 프로젝트명
//           - 작업 내용 (NN%)
//   익일 업무 진행 예정
//       * 프로젝트명
//           - 작업 내용
export const parseReportText = (text: string): ParsedReport | null => {
  if (!text || text.trim() === '') return null;

  // 날짜 추출 (예: "2월 24일")
  const dateMatch = text.match(DATE_REGEX);
  const month = dateMatch?.[1] ?? '';
  const day = dateMatch?.[2] ?? '';

  const todayProjects: Array<Project> = [];
  const tomorrowProjects: Array<Project> = [];

  let currentSection: Section = null;
  let currentProject: Project | null = null;

  const lines = text.split('\n').map((line) => line.trimEnd());

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.includes(SECTION_TODAY)) {
      currentSection = 'today';
      currentProject = null;
      continue;
    }
    if (trimmed.includes(SECTION_TOMORROW)) {
      currentSection = 'tomorrow';
      currentProject = null;
      continue;
    }
    if (!currentSection) continue;

    // 프로젝트 라인: 새 프로젝트로 전환
    const projectMatch = line.match(PROJECT_LINE);
    if (projectMatch) {
      currentProject = { id: createId(), name: projectMatch[1].trim(), tasks: [] };
      (currentSection === 'today' ? todayProjects : tomorrowProjects).push(currentProject);
      continue;
    }

    if (!currentProject) continue;

    // 태스크 라인: 진행률이 있으면 먼저 매칭, 없으면 0%로 처리
    const progressMatch = line.match(TASK_LINE_WITH_PROGRESS);
    if (progressMatch) {
      const task: Task = {
        id: createId(),
        content: progressMatch[1].trim(),
        progress: parseInt(progressMatch[2], 10),
      };
      currentProject.tasks.push(task);
      continue;
    }

    const noProgressMatch = line.match(TASK_LINE_NO_PROGRESS);
    if (noProgressMatch) {
      const task: Task = {
        id: createId(),
        content: noProgressMatch[1].trim(),
        progress: 0,
      };
      currentProject.tasks.push(task);
    }
  }

  // 날짜와 프로젝트가 모두 비어 있으면 분석 실패로 간주
  if (!month && !day && todayProjects.length === 0 && tomorrowProjects.length === 0) {
    return null;
  }

  return {
    month,
    day,
    todayProjects: todayProjects.length > 0 ? todayProjects : [createEmptyProject()],
    tomorrowProjects: tomorrowProjects.length > 0 ? tomorrowProjects : [createEmptyProject()],
  };
};
