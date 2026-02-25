import { Project, Task } from '../app/_components/types';

interface ParsedReport {
  month: string;
  day: string;
  todayProjects: Project[];
  tomorrowProjects: Project[];
}

export const parseReportText = (text: string): ParsedReport | null => {
  if (!text || text.trim() === '') return null;

  const lines = text.split('\n').map((line) => line.trimEnd());

  let month = '';
  let day = '';
  const todayProjects: Project[] = [];
  const tomorrowProjects: Project[] = [];

  let currentSection: 'today' | 'tomorrow' | null = null;
  let currentProject: Project | null = null;

  // 날짜 추출 (예: 2월 24일)
  const dateRegex = /(\d+)\s*월\s*(\d+)\s*일/;
  const dateMatch = text.match(dateRegex);
  if (dateMatch) {
    month = dateMatch[1];
    day = dateMatch[2];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    if (trimmedLine.includes('금일 업무 진행 현황')) {
      currentSection = 'today';
      currentProject = null;
      continue;
    }

    if (trimmedLine.includes('익일 업무 진행 예정')) {
      currentSection = 'tomorrow';
      currentProject = null;
      continue;
    }

    if (!currentSection) continue;

    // 프로젝트 라인 (예: * 프로젝트명 또는 *프로젝트명)
    const projectMatch = line.match(/^\s*[*]\s*(.+)$/);
    if (projectMatch) {
      const projectName = projectMatch[1].trim();
      currentProject = {
        id: Math.random().toString(36).substr(2, 9),
        name: projectName,
        tasks: [],
      };

      if (currentSection === 'today') {
        todayProjects.push(currentProject);
      } else {
        tomorrowProjects.push(currentProject);
      }
      continue;
    }

    // 태스크 라인 (예: - 태스크 내용 (100%) 또는 -태스크 내용(100%))
    const taskMatch = line.match(/^\s*[-]\s*(.+?)\s*\((\d+)%\)\s*$/);
    if (taskMatch && currentProject) {
      const content = taskMatch[1].trim();
      const progress = parseInt(taskMatch[2], 10);

      const newTask: Task = {
        id: Math.random().toString(36).substr(2, 9),
        content,
        progress,
      };
      currentProject.tasks.push(newTask);
      continue;
    }

    // 진행률이 없는 태스크 라인 처리 (예: - 태스크 내용)
    const taskNoProgressMatch = line.match(/^\s*[-]\s*(.+)$/);
    if (taskNoProgressMatch && currentProject) {
      const content = taskNoProgressMatch[1].trim();
      const newTask: Task = {
        id: Math.random().toString(36).substr(2, 9),
        content,
        progress: 0,
      };
      currentProject.tasks.push(newTask);
    }
  }

  // 데이터가 하나도 없으면 실패로 간주
  if (todayProjects.length === 0 && tomorrowProjects.length === 0 && !month && !day) {
    return null;
  }

  return {
    month,
    day,
    todayProjects:
      todayProjects.length > 0
        ? todayProjects
        : [{ id: '1', name: '', tasks: [{ id: '1-1', content: '', progress: 0 }] }],
    tomorrowProjects:
      tomorrowProjects.length > 0
        ? tomorrowProjects
        : [{ id: '2', name: '', tasks: [{ id: '2-1', content: '', progress: 0 }] }],
  };
};
